import { NextRequest } from "next/server";
import { CalculateRequestSchema } from "@/features/logistics/schema";
import { calculateDurationMatrixBatched } from "@/features/logistics/service";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const parsed = CalculateRequestSchema.parse(payload);
    const enriched = await calculateDurationMatrixBatched(parsed);
    return Response.json({ rows: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 400 });
  }
}


