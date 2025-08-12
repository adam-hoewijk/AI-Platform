import { NextRequest } from "next/server";
import { CalculateRequestSchema } from "@/features/logistics/schema";
import { fetchTableForSource } from "@/server/osrm/table";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const payload = await req.json();
    const parsed = CalculateRequestSchema.parse(payload);

    const { sources, destinations, batchSize } = parsed;
    const mutable = destinations.map((d) => ({ ...d }));
    const totalBatches = sources.length * Math.ceil(mutable.length / batchSize);

    let done = 0;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const source of sources) {
            const name = source.name;
            for (let i = 0; i < mutable.length; i += batchSize) {
              const batch = mutable.slice(i, i + batchSize);
              const coords = batch.map((d) => ({ Longitude: Number(d.Longitude), Latitude: Number(d.Latitude) }));
              const { distances, durations } = await fetchTableForSource(
                { Longitude: Number(source.Longitude), Latitude: Number(source.Latitude) },
                coords
              );

              for (let j = 0; j < batch.length; j++) {
                const row = batch[j] as Record<string, unknown>;
                row[`distance_${name} (meters)`] = distances[j] ?? null;
                row[`duration_${name} (seconds)`] = durations[j] ?? null;
              }

              done += 1;
              const progress = { type: "progress", done, total: totalBatches, source: name, batchIndex: Math.floor(i / batchSize) };
              controller.enqueue(encoder.encode(JSON.stringify(progress) + "\n"));
            }
          }

          controller.enqueue(encoder.encode(JSON.stringify({ type: "result", rows: mutable }) + "\n"));
          controller.close();
        } catch (err: unknown) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Unknown error" }) + "\n")
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 400 });
  }
}


