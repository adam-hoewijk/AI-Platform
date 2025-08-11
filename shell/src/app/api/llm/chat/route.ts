import { NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
});

function getAzureClient() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT; // e.g. https://your-resource.openai.azure.com
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-06-01";
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

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { messages } = BodySchema.parse(json);

    const client = getAzureClient();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT as string; // your model deployment name
    if (!deployment) throw new Error("Missing AZURE_OPENAI_DEPLOYMENT env var");

    // Using Chat Completions API
    const completion = await client.chat.completions.create({
      model: deployment,
      messages,
      temperature: 0.3,
    });

    const choice = completion.choices?.[0]?.message;
    const content = choice?.content ?? "";
    return new Response(JSON.stringify({ role: "assistant", content }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 400 });
  }
}


