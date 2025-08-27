import OpenAI from "openai";
import { isNumber, isString } from "@/lib/utils";

// Minimal zod-like runtime validation
function isArrayOfStrings(arr: unknown): arr is string[] {
    return Array.isArray(arr) && arr.every(s => typeof s === "string");
}

function getAzureClient() {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview";
    if (!apiKey || !endpoint) throw new Error("Missing Azure OpenAI environment variables");
    return new OpenAI({
        apiKey,
        baseURL: `${endpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
        defaultQuery: { "api-version": apiVersion },
        defaultHeaders: { "api-key": apiKey },
    });
}

export async function POST(req: Request) {
    try {
        const contentType = req.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
            return new Response("Expected multipart/form-data", { status: 400 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file) return new Response("Missing file", { status: 400 });

        // Use Azure Document Intelligence to extract text from the uploaded file
        const arrayBuffer = await file.arrayBuffer();
        let text = "";
        try {
            const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
            const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
            const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? "2024-11-30";
            if (!endpoint || !key) {
                console.error("[gpa] missing Azure Document Intelligence env vars");
                return new Response("Server missing Azure Document Intelligence env vars", { status: 500 });
            }

            // dynamic import of the Azure Document Intelligence SDK
            const aiMod = await import("@azure-rest/ai-document-intelligence");
            // The SDK's types are not easily expressible here; allow a narrow any for runtime interop.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const DocumentIntelligence = (aiMod as any).default ?? aiMod;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { getLongRunningPoller, isUnexpected } = aiMod as any;

            const client = DocumentIntelligence(endpoint, { key });

            const base64 = Buffer.from(arrayBuffer).toString("base64");

            const jsonBody = {
                base64Source: base64,
            };

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
                console.error("[gpa] document intelligence initial response error", initialResponse.body);
                return new Response("Document Intelligence error", { status: 500 });
            }

            const poller = getLongRunningPoller(client, initialResponse);
            const pollResult = await poller.pollUntilDone();

            // The full response is no longer logged to the console.

            const analyzeResult = pollResult?.body?.analyzeResult ?? {};

            if (analyzeResult.content && typeof analyzeResult.content === "string") {
                text = analyzeResult.content as string;
            } else if (Array.isArray(analyzeResult.pages) && analyzeResult.pages.length) {
                console.log("[gpa] Fallback to manual text extraction because analyzeResult.content was not found.");
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
                // This will now be the primary log you see from Document Intelligence.
                console.log("[gpa] Document Intelligence markdown:\n" + text);
            } catch {
                /* ignore */
            }
        } catch (e) {
            console.error("[gpa] document intelligence failed:", e);
            try {
                text = new TextDecoder("utf-8").decode(arrayBuffer);
                console.log("[gpa] Fallback decoded text:\n" + text);
            } catch (decErr) {
                console.error("[gpa] fallback decode failed:", decErr);
                text = "";
            }
        }

        if (!text.trim()) {
            return new Response(JSON.stringify({ name: null, personalIdentityNumber: null, totalHP: null, degrees: [], studyDateSpan: null, verifiableUntil: null, controlCode: null, verificationLink: null, average: null, outOf: null, raw: {} }), { headers: { "Content-Type": "application/json" } });
        }

        const client = getAzureClient();
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT as string;
        if (!deployment) throw new Error("Missing AZURE_OPENAI_DEPLOYMENT env var");

        const instruction = `Extract the student's name, Swedish Personal Identity Number (personnummer), total higher education credits (HP), and degree(s) from the transcript. Also, extract the study period as a date span (first and last date of completed courses), the date the transcript is verifiable until, and the control code used for verification. If a link for grade verification is present, extract that as well. Return strictly a JSON object with the following keys:
- "name": the full name of the student as a string, or null if not present
- "personalIdentityNumber": the 10 or 12 digit Swedish personal identity number (YYYYMMDD-XXXX or YYYYMMDDXXXX), or null if not present
- "totalHP": the total number of higher education credits (HP) earned, as a number, or null if not present
- "degrees": an array of strings containing the names of all earned degrees, or an empty array if not present
- "studyDateSpan": a string representing the study period (e.g., "YYYY-MM-DD - YYYY-MM-DD"), or null if not present
- "verifiableUntil": a string representing the date the transcript is verifiable until (e.g., "YYYY-MM-DD"), or null if not present
- "controlCode": the unique code used for verification, as a string, or null if not present
- "verificationLink": a URL for verifying the transcript, or null if not present
- "average": the calculated average GPA as a number, or null if not present
- "outOf": a number representing the maximum possible GPA scale (e.g., 5), or null if not present
If the document contains multiple students, return the name that is associated with the transcript text provided. Do not include additional keys. Use only information present in the document.`;

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: 'You are a precise extractor that outputs only valid JSON of grade point averages. if A-E grades. A=5, B=4.5, C=4, D=3.5, E=3' },
            { role: "user", content: `${instruction}\n\n--- Document Start ---\n${text}\n--- Document End ---` },
        ];

        const completion = await client.chat.completions.create({
            model: deployment,
            messages,
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "gpa_result",
                    strict: true,
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            name: { type: ["string", "null"] },
                            personalIdentityNumber: { type: ["string", "null"] },
                            totalHP: { type: ["number", "null"] },
                            degrees: { type: "array", items: { type: "string" } },
                            studyDateSpan: { type: ["string", "null"] },
                            verifiableUntil: { type: ["string", "null"] },
                            controlCode: { type: ["string", "null"] },
                            verificationLink: { type: ["string", "null"] },
                            average: { type: ["number", "null"] },
                            outOf: { type: ["number", "null"] },
                        },
                        required: ["name", "personalIdentityNumber", "totalHP", "degrees", "studyDateSpan", "verifiableUntil", "controlCode", "verificationLink", "average", "outOf"],
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

        const average = isNumber(parsed.average) ? parsed.average : null;
        const outOf = isNumber(parsed.outOf) ? parsed.outOf : null;
        const studentName = isString(parsed.name) ? parsed.name : null;
        const personalIdentityNumber = isString(parsed.personalIdentityNumber) ? parsed.personalIdentityNumber : null;
        const totalHP = isNumber(parsed.totalHP) ? parsed.totalHP : null;
        const degrees = isArrayOfStrings(parsed.degrees) ? parsed.degrees : [];
        const studyDateSpan = isString(parsed.studyDateSpan) ? parsed.studyDateSpan : null;
        const verifiableUntil = isString(parsed.verifiableUntil) ? parsed.verifiableUntil : null;
        const controlCode = isString(parsed.controlCode) ? parsed.controlCode : null;
        const verificationLink = isString(parsed.verificationLink) ? parsed.verificationLink : null;

        return new Response(JSON.stringify({ name: studentName, personalIdentityNumber, totalHP, degrees, studyDateSpan, verifiableUntil, controlCode, verificationLink, average, outOf, raw: parsed }), { headers: { "Content-Type": "application/json" } });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return new Response(message, { status: 400 });
    }
}