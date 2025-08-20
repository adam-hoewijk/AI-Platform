import { NextRequest } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response("Missing or invalid question", { status: 400 });
    }

    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview";
    if (!apiKey || !endpoint || !deployment) {
      throw new Error("Missing Azure OpenAI environment variables");
    }

    const client = new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/${deployment}`,
      defaultQuery: { "api-version": apiVersion },
      defaultHeaders: { "api-key": apiKey },
    });

    // Use the Responses API with web_search_preview tool
    let response: any;
    try {
      response = await client.responses.create({
        model: deployment,
        tools: [{ type: "web_search_preview" }],
        input: question,
      });
    } catch (e: unknown) {
      // Surface provider errors to client in a JSON payload so the UI can show a friendly message
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ sources: [], error: `OpenAI request failed: ${msg}` }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Extract URLs and titles from response output/annotations in a defensive way
    const sources: { url: string; title: string }[] = [];
    const output = Array.isArray(response.output) ? response.output : response.output_items ?? [];
    for (const item of output) {
      // messages usually contain a content array with annotations
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (Array.isArray(content.annotations)) {
            for (const ann of content.annotations) {
              if (ann?.type === "url_citation" && ann?.url) {
                sources.push({ url: ann.url, title: ann.title || ann.url });
              }
            }
          }
        }
      }
      // some responses may include a web_search_call with details elsewhere
      if (item.type === "web_search_call" && item.status === "completed" && item.id) {
        // try to find corresponding message output that contains annotations — already handled above
      }

    }

    return new Response(JSON.stringify({ sources }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 400 });
  }
}
