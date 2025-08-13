import { NextRequest } from "next/server";
import JSZip from "jszip";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import OpenAI from "openai";

function getAzureClient() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
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

type SlideTexts = {
  path: string;
  obj: any;
  texts: { path: (string | number)[]; value: string }[];
};

function collectATextNodes(obj: unknown, path: (string | number)[] = [], out: { path: (string | number)[]; value: string }[] = []) {
  if (obj == null) return out;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) collectATextNodes(obj[i], [...path, i], out);
    return out;
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const val = rec[key];
      if (key === "a:t" && typeof val === "string") {
        out.push({ path: [...path, key], value: val });
      } else {
        collectATextNodes(val, [...path, key], out);
      }
    }
  }
  return out;
}

function setValueAtPath(root: unknown, path: (string | number)[], newValue: string) {
  if (path.length === 0) return;
  let node: any = root;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i] as any];
  node[path[path.length - 1] as any] = newValue;
}

function preserveWhitespace(original: string, translated: string) {
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated.trim()}${trailing}`;
}

async function translateStrings(strings: string[], targetLang: string) {
  if (strings.length === 0) return {} as Record<string, string>;
  const client = getAzureClient();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT as string;
  if (!deployment) throw new Error("Missing AZURE_OPENAI_DEPLOYMENT env var");

  const unique = Array.from(new Set(strings));
  const maxPerBatch = 250; // conservative to avoid token overflows
  const result: Record<string, string> = {};

  for (let i = 0; i < unique.length; i += maxPerBatch) {
    const batch = unique.slice(i, i + maxPerBatch);
    const ids = batch.map((_, idx) => `k_${i + idx}`);
    const payload = Object.fromEntries(ids.map((id, idx) => [id, batch[idx]]));

    const system = [
      `Translate the provided values to ${targetLang}. Return JSON mapping keys to translated strings only.`,
      "Preserve meaning and tone. Do not translate names or proper nouns (people, brands, organizations, product names).",
      "Preserve emails, URLs, hashtags, @mentions, numbers, codes, and acronyms as-is.",
      "Keep placeholders and variables intact (e.g., {name}, {{var}}, %s).",
      "Keep line breaks and basic punctuation.",
      "For Swedish translations, use proper Swedish grammar and vocabulary.",
    ].join("\n");

    const responseFormat = {
      type: "json_schema" as const,
      json_schema: {
        name: "translations",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: Object.fromEntries(ids.map((id) => [id, { type: "string" }])),
          required: ids,
        },
      },
    };

    const completion = await client.chat.completions.create({
      model: deployment,
      response_format: responseFormat,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });
    const content = completion.choices?.[0]?.message?.content ?? "{}";
    let data: Record<string, string> = {};
    try {
      data = JSON.parse(content) as Record<string, string>;
    } catch {
      data = {} as Record<string, string>;
    }
    for (let j = 0; j < ids.length; j++) {
      const id = ids[j];
      const orig = payload[id];
      const tr = data[id];
      if (typeof tr === "string" && typeof orig === "string") result[orig] = tr;
    }
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const targetLang = String(formData.get("targetLang") || "").trim();
    const file = formData.get("file");
    if (!targetLang) return new Response("Missing targetLang", { status: 400 });
    if (!(file instanceof Blob)) return new Response("Missing file", { status: 400 });

    // Validate target language
    const supportedLanguages = [
      "English", "Dutch", "German", "French", "Spanish", "Italian", 
      "Portuguese", "Swedish", "Japanese", "Korean", "Chinese (Simplified)"
    ];
    
    if (!supportedLanguages.includes(targetLang)) {
      return new Response(`Unsupported language: ${targetLang}`, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const targets = zip
      .filter((relativePath) => (
        (
          /^ppt\/slides\/slide\d+\.xml$/.test(relativePath) ||
          /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(relativePath) ||
          /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(relativePath) ||
          /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(relativePath)
        ) && !zip.files[relativePath].dir
      ))
      .map((f) => f.name);

    const parser = new XMLParser({ ignoreAttributes: false });
    const builder = new XMLBuilder({ ignoreAttributes: false });

    const slides: SlideTexts[] = [];
    for (const p of targets) {
      const xml = await zip.file(p)!.async("text");
      const obj = parser.parse(xml);
      const texts = collectATextNodes(obj);
      slides.push({ path: p, obj, texts });
    }

    const allTexts = slides.flatMap((s) => s.texts.map((t) => t.value)).filter((t) => typeof t === "string" && t.trim() !== "");
    const translations = await translateStrings(allTexts, targetLang);

    for (const s of slides) {
      const obj = s.obj;
      for (const t of s.texts) {
        const original = t.value;
        const translated = translations[original];
        if (translated && translated !== original) {
          const newText = preserveWhitespace(original, translated);
          setValueAtPath(obj, t.path, newText);
        }
      }
      const newXml = builder.build(obj);
      zip.file(s.path, newXml);
    }

    const outBuf = await zip.generateAsync({ type: "nodebuffer" });
    const fileName = (typeof (file as any).name === "string" ? (file as any).name : "presentation.pptx").replace(/\.pptx$/i, "");
    const outName = `${fileName}.${targetLang}.pptx`;
    return new Response(outBuf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${outName}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 400 });
  }
}

export const runtime = "nodejs";


