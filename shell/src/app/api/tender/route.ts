import OpenAI from "openai";
import { isArrayOfStrings } from "@/lib/utils";
import {
    getLongRunningPoller,
    isUnexpected,
    DocumentIntelligenceClient,
} from "@azure-rest/ai-document-intelligence";
import { AzureKeyCredential } from "@azure/core-auth";

/**
 * Initializes and returns an OpenAI client configured for Azure.
 */
function getAzureClient() {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview";
    
    // Ensure required environment variables are set
    if (!apiKey || !endpoint) {
        throw new Error("Missing Azure OpenAI environment variables");
    }

    return new OpenAI({
        apiKey,
        baseURL: `${endpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
        defaultQuery: { "api-version": apiVersion },
        defaultHeaders: { "api-key": apiKey },
    });
}

/**
 * The API handler for processing uploaded tender documents.
 * It extracts text using Azure Document Intelligence and then analyzes it with Azure OpenAI.
 */
export async function POST(req: Request) {
    try {
        const contentType = req.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
            return new Response("Expected multipart/form-data", { status: 400 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const existingRequirements = formData.get("existingRequirements") as string | null;

        if (!file) {
            return new Response("Missing file", { status: 400 });
        }
        
        // Use Azure Document Intelligence to extract text from the uploaded file
        const arrayBuffer = await file.arrayBuffer();
        let text = "";
        try {
            const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
            const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
            const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? "2024-11-30";
            
            if (!endpoint || !key) {
                console.error("[tender] missing Azure Document Intelligence env vars");
                return new Response("Server missing Azure Document Intelligence env vars", { status: 500 });
            }

            // The @azure-rest SDK exports a client factory function
            const client = DocumentIntelligenceClient(endpoint, new AzureKeyCredential(key));
            
            const base64 = Buffer.from(arrayBuffer).toString("base64");
            const jsonBody = { base64Source: base64 };

            const initialResponse = await client
                .path("/documentModels/{modelId}:analyze", "prebuilt-layout")
                .post({
                    contentType: "application/json",
                    body: jsonBody,
                    queryParameters: {
                        "api-version": apiVersion,
                        "outputContentFormat": "markdown"
                    },
                });

            if (isUnexpected(initialResponse)) {
                console.error("[tender] document intelligence initial response error", initialResponse.body);
                return new Response("Document Intelligence error", { status: 500 });
            }

            // Use the correctly imported getLongRunningPoller function
            const poller = getLongRunningPoller(client, initialResponse);
            const pollResult = await poller.pollUntilDone();
            const analyzeResult = pollResult?.body?.analyzeResult ?? {};

            // Extract the content from the analysis result
            if (analyzeResult.content && typeof analyzeResult.content === "string") {
                text = analyzeResult.content;
            } else if (Array.isArray(analyzeResult.pages) && analyzeResult.pages.length) {
                const parts: string[] = [];
                for (const p of analyzeResult.pages) {
                    if (Array.isArray(p.lines)) {
                        for (const line of p.lines) {
                            if (line && typeof line.content === "string") parts.push(line.content);
                        }
                    }
                }
                text = parts.join("\n");
            }

            try {
                console.log("[tender] Document Intelligence markdown:\n" + text);
            } catch {
                /* ignore */
            }
        } catch (e) {
            console.error("[tender] document intelligence failed:", e);
            try {
                text = new TextDecoder("utf-8").decode(arrayBuffer);
                console.log("[tender] Fallback decoded text:\n" + text);
            } catch (decErr) {
                console.error("[tender] fallback decode failed:", decErr);
                text = "";
            }
        }

        if (!text.trim()) {
            return new Response(JSON.stringify({ mandatoryRequirements: [], technicalRequirements: [], desirableFeatures: [], commercialConsiderations: [], evaluationCriteria: [] }), { headers: { "Content-Type": "application/json" } });
        }

        const client = getAzureClient();
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT as string;
        if (!deployment) throw new Error("Missing AZURE_OPENAI_DEPLOYMENT env var");

        let exclusionPrompt = "";
        if (existingRequirements) {
            try {
                const parsedExisting = JSON.parse(existingRequirements);
                const allExisting = Object.values(parsedExisting).flat().filter(Boolean);
                if (allExisting.length > 0) {
                    exclusionPrompt = `Do not include any of the following requirements in your output, as they have already been extracted: \n- ${allExisting.join('\n- ')}\n\n`;
                }
            } catch (e) {
                console.error("Failed to parse existing requirements JSON:", e);
            }
        }

        const instruction = `Analyze the provided tender document and extract the key requirements for a consulting firm. Categorize them into the following five groups. For each group, provide a concise summary as a list of bullet points. The goal is to give a consulting firm a quick overview of what they need to know to decide whether to bid on this tender and what to focus on in their proposal.

${exclusionPrompt}
1.  **Mandatory Requirements (Must-Haves):** Summarize the non-negotiable requirements tied to eligibility.
2.  **Technical Requirements:** Summarize the capabilities and resources needed to deliver the project.
3.  **Desirable/Nice-to-Have Features:** Summarize the features or approaches that would add value and differentiate a proposal.
4.  **Commercial/Contractual Considerations:** Summarize key business and legal terms, such as pricing model and performance metrics.
5.  **Evaluation Criteria:** Summarize how proposals will be scored or evaluated.

Return strictly a JSON object with the following keys:
- "mandatoryRequirements": an array of strings summarizing the mandatory requirements, or an empty array if not found.
- "technicalRequirements": an array of strings summarizing the technical requirements, or an empty array if not found.
- "desirableFeatures": an array of strings summarizing the desirable features, or an empty array if not found.
- "commercialConsiderations": an array of strings summarizing the commercial/contractual considerations, or an empty array if not found.
- "evaluationCriteria": an array of strings summarizing the evaluation criteria, or an empty array if not found.

The summaries in each array should be brief, clear, and actionable. Do not include additional keys. Use only information present in the document.`;

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: 'You are a precise extractor that outputs only valid JSON of tender requirements.' },
            { role: "user", content: `${instruction}\n\n--- Document Start ---\n${text}\n--- Document End ---` },
        ];

        const completion = await client.chat.completions.create({
            model: deployment,
            messages,
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "tender_result",
                    strict: true,
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            mandatoryRequirements: { type: "array", items: { type: "string" } },
                            technicalRequirements: { type: "array", items: { type: "string" } },
                            desirableFeatures: { type: "array", items: { type: "string" } },
                            commercialConsiderations: { type: "array", items: { type: "string" } },
                            evaluationCriteria: { type: "array", items: { type: "string" } },
                        },
                        required: ["mandatoryRequirements", "technicalRequirements", "desirableFeatures", "commercialConsiderations", "evaluationCriteria"],
                    },
                },
            },
        });

        const content = completion.choices?.[0]?.message?.content ?? "{}";
        let parsed: Record<string, unknown> = {};
        try {
            parsed = JSON.parse(content);
        } catch {
            parsed = {};
        }

        const mandatoryRequirements = isArrayOfStrings(parsed.mandatoryRequirements) ? parsed.mandatoryRequirements : [];
        const technicalRequirements = isArrayOfStrings(parsed.technicalRequirements) ? parsed.technicalRequirements : [];
        const desirableFeatures = isArrayOfStrings(parsed.desirableFeatures) ? parsed.desirableFeatures : [];
        const commercialConsiderations = isArrayOfStrings(parsed.commercialConsiderations) ? parsed.commercialConsiderations : [];
        const evaluationCriteria = isArrayOfStrings(parsed.evaluationCriteria) ? parsed.evaluationCriteria : [];

        return new Response(JSON.stringify({ mandatoryRequirements, technicalRequirements, desirableFeatures, commercialConsiderations, evaluationCriteria }), { headers: { "Content-Type": "application/json" } });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return new Response(message, { status: 400 });
    }
}
