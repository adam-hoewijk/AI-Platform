import { NextResponse } from "next/server";
import OpenAI from "openai";

// Minimal zod-like runtime validation
function isNumber(n: unknown): n is number {
  return typeof n === "number" && !Number.isNaN(n);
}

function isString(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
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
      const aiMod: any = await import("@azure-rest/ai-document-intelligence");
      const DocumentIntelligence = aiMod.default ?? aiMod;
      const { getLongRunningPoller, isUnexpected } = aiMod;

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
      } catch (logErr) {
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
      return new Response(JSON.stringify({ average: null, outOf: null, raw: {} }), { headers: { "Content-Type": "application/json" } });
    }

    const client = getAzureClient();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT as string;
    if (!deployment) throw new Error("Missing AZURE_OPENAI_DEPLOYMENT env var");

    const instruction = `Extract the student's name and Grade Point Average from the transcript. Return strictly a JSON object with three keys:\n- \"name\": the full name of the student as a string, or null if not present\n- \"average\": the calculated average GPA as a number, or null if not present\n- \"outOf\": a number representing the maximum possible GPA scale (e.g. 5), or null if not present\nIf the document contains multiple students, return the name that is associated with the transcript text provided. Do not include additional keys. Use only information present in the document.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: "You are a precise extractor that outputs only valid JSON of grade point averages." },
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
              average: { type: ["number", "null"] },
              outOf: { type: ["number", "null"] },
            },
            required: ["name", "average", "outOf"],
          },
        },
      },
    });

    const content = completion.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const average = isNumber(parsed.average) ? parsed.average : null;
    const outOf = isNumber(parsed.outOf) ? parsed.outOf : null;
    const studentName = isString(parsed.name) ? parsed.name : null;

    return new Response(JSON.stringify({ name: studentName, average, outOf, raw: parsed }), { headers: { "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 400 });
  }
}
