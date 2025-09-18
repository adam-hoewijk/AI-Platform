import { NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

type BaseType = "text" | "number" | "date" | "boolean";
type ColumnType =
  | { kind: "base"; baseType: BaseType }
  | { kind: "custom"; typeName: string };
type Column = {
  id: string;
  name: string;
  description: string;
  type: ColumnType;
  cardinality: "one" | "many";
};
type Attribute = { name: string; description: string; type: BaseType };
type CustomType = { name: string; description: string; attributes: Attribute[] };

const AttributeSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.union([
    z.literal("text"),
    z.literal("number"),
    z.literal("date"),
    z.literal("boolean"),
  ]),
});

const CustomTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  attributes: z.array(AttributeSchema).min(1),
});

const ColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("base"), baseType: AttributeSchema.shape.type }),
    z.object({ kind: z.literal("custom"), typeName: z.string().min(1) }),
  ]),
  cardinality: z.union([z.literal("one"), z.literal("many")]),
});

const DocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string().min(1),
});

const RequestSchema = z.object({
  documents: z.array(DocumentSchema).min(1),
  columns: z.array(ColumnSchema).min(1),
  customTypes: z.array(CustomTypeSchema).default([]),
  modelConfig: z.object({
    reasoning: z.object({
      effort: z.enum(["minimal", "low", "medium", "high"]),
    }),
    text: z.object({
      verbosity: z.enum(["low", "medium", "high"]),
    }),
  }).optional(),
});

function getAzureClient() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT; // e.g. https://your-resource.openai.azure.com
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview";
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

function baseTypeToJsonSchema(baseType: BaseType, description?: string) {
  const withDescription = (schema: Record<string, unknown>) =>
    description ? { ...schema, description } : schema;

  switch (baseType) {
    case "text":
      return withDescription({ type: ["string", "null"] });
    case "number":
      return withDescription({ type: ["number", "null"] });
    case "date":
      return withDescription({ type: ["string", "null"], format: "date" });
    case "boolean":
      return withDescription({ type: ["boolean", "null"] });
  }
}

function buildCustomTypeSchema(typeName: string, customTypes: CustomType[]) {
  const t = customTypes.find((ct) => ct.name === typeName);
  if (!t) {
    throw new Error(`Unknown custom type: ${typeName}`);
  }
  const properties: Record<string, unknown> = {};
  for (const attr of t.attributes) {
    properties[attr.name] = baseTypeToJsonSchema(attr.type, attr.description);
  }
  return {
    type: "object",
    description: t.description,
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
    // Allow attributes to be null individually, do not require any
  } as const;
}

function buildExtractionResultSchema(
  columns: Column[],
  customTypes: CustomType[]
) {
  const properties: Record<string, unknown> = {};
  for (const col of columns) {
    const key = col.id;
    const description = col.description;
    let schema: Record<string, unknown>;

    if (col.type.kind === "base") {
      schema = baseTypeToJsonSchema(col.type.baseType, description) as Record<
        string,
        unknown
      >;
    } else {
      schema = buildCustomTypeSchema(col.type.typeName, customTypes) as Record<
        string,
        unknown
      >;
    }

    if (col.cardinality === "many") {
      properties[key] = {
        type: "array",
        description,
        items: schema,
      };
    } else {
      properties[key] = schema;
    }
  }

  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  } as const;
}

function buildInstructionPrompt(
  columns: Column[],
  customTypes: CustomType[]
) {
  const lines: string[] = [];
  lines.push(
    "Extract the requested fields from the document text. Use only the information present in the text. If a field is not explicitly present, return null for that field (or an empty array when a list is requested)."
  );
  lines.push("Columns to extract (by id):");
  for (const col of columns) {
    if (col.type.kind === "base") {
      lines.push(
        `- ${col.id}: ${col.name} (${col.type.baseType}, ${col.cardinality}) — ${col.description}`
      );
    } else {
      const customTypeName = (col.type as Extract<ColumnType, { kind: "custom" }>).typeName;
      const t = customTypes.find((ct) => ct.name === customTypeName);
      lines.push(
        `- ${col.id}: ${col.name} (custom type: ${customTypeName}, ${col.cardinality}) — ${col.description}`
      );
      if (t) {
        lines.push(`  Attributes of ${t.name}:`);
        for (const attr of t.attributes) {
          lines.push(`  • ${attr.name} (${attr.type}) — ${attr.description}`);
        }
      }
    }
  }
  lines.push(
    "Respond strictly as JSON that conforms to the provided JSON schema. Do not include any extra keys or text."
  );
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // If multipart/form-data, treat this as file upload -> extract text via Azure Document Intelligence
    if (contentType.includes("multipart/form-data")) {
      // Minimal random id generator for returned documents
      function randomId(prefix = "id") {
        return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
      }

      const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
      const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
      const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? "2024-11-30";
      if (!endpoint || !key) {
        throw new Error("Missing Azure Document Intelligence environment variables");
      }

      // dynamic import so SDK is only required at runtime on the server
      const aiMod = await import("@azure-rest/ai-document-intelligence");
      // tolerate default vs named export
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DocumentIntelligence = (aiMod as any).default ?? aiMod;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { getLongRunningPoller, isUnexpected } = aiMod as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = DocumentIntelligence(endpoint, { key } as any);

      const fd = await req.formData();
      const files = Array.from(fd.getAll("file")).filter(Boolean) as File[];
      const clientIds = fd.getAll("clientId").map((v) => String(v));
      if (files.length === 0) return new Response("No files uploaded", { status: 400 });

      const documents: { id: string; name: string; text: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const providedId = clientIds[i] ?? undefined;
        try {
          const arrayBuffer = await f.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          const jsonBody = { base64Source: base64 };

          const initialResponse = await client
            .path("/documentModels/{modelId}:analyze", "prebuilt-layout")
            .post({
              contentType: "application/json",
              body: jsonBody,
              queryParameters: {
                "api-version": apiVersion,
                outputContentFormat: "markdown",
              },
            });

          if (isUnexpected(initialResponse)) {
            console.error("ADI initial response unexpected", initialResponse.body);
            // fallback to raw decode
            let fallback = "";
            try {
              fallback = new TextDecoder("utf-8").decode(arrayBuffer);
            } catch {}
            documents.push({ id: providedId ?? randomId("doc"), name: f.name, text: fallback });
            continue;
          }

          const poller = getLongRunningPoller(client, initialResponse);
          const pollResult = await poller.pollUntilDone();
          const analyzeResult = (pollResult as any)?.body?.analyzeResult ?? {};

          let text = "";
          if (analyzeResult.content && typeof analyzeResult.content === "string") {
            text = analyzeResult.content as string;
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

          if (!text) {
            try {
              text = new TextDecoder("utf-8").decode(arrayBuffer);
            } catch {
              text = "";
            }
          }

          documents.push({ id: providedId ?? randomId("doc"), name: f.name, text });
        } catch (err) {
          console.error("Failed to process file", err);
          documents.push({ id: providedId ?? randomId("doc"), name: f.name, text: "" });
        }
      }

      return new Response(JSON.stringify({ documents }), { headers: { "Content-Type": "application/json" } });
    }

    const json = await req.json();
    const { documents, columns, customTypes, modelConfig } = RequestSchema.parse(json);

    const client = getAzureClient();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT as string;
    if (!deployment) throw new Error("Missing AZURE_OPENAI_DEPLOYMENT env var");

    const schema = buildExtractionResultSchema(columns, customTypes);
    const instruction = buildInstructionPrompt(columns, customTypes);

    const results = await Promise.all(
      documents.map(async (doc) => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content:
              "You are an advanced information extraction engine. You precisely extract data and output only valid JSON that matches the provided JSON schema.",
          },
          {
            role: "user",
            content: `${instruction}\n\n--- Document Start ---\n${doc.text}\n--- Document End ---`,
          },
        ];

        const completion = await client.chat.completions.create({
          model: deployment,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "extraction_result",
              strict: true,
              schema,
            },
          },
          messages,
          ...(modelConfig && {
            reasoning_effort: modelConfig.reasoning.effort,
            verbosity: modelConfig.text.verbosity,
          }),
        });

        const content = completion.choices?.[0]?.message?.content ?? "{}";
        let data: unknown = {};
        try {
          data = JSON.parse(content);
        } catch {
          // If strict schema failed and model returned non-JSON, fallback to empty object
          data = {};
        }
        return { documentId: doc.id, data };
      })
    );

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 400 });
  }
}


