import { CalculateRequest, EnrichedDestination } from "./schema";
import { fetchTableForSource } from "@/server/osrm/table";

function toCoordinate(d: { Longitude: number; Latitude: number }) {
  return { Longitude: Number(d.Longitude), Latitude: Number(d.Latitude) };
}

export async function calculateDurationMatrixBatched(
  input: CalculateRequest
): Promise<EnrichedDestination[]> {
  const { sources, destinations, batchSize } = input;

  const mutable: EnrichedDestination[] = destinations.map((d) => ({ ...d }));

  for (const source of sources) {
    const name = source.name;

    for (let i = 0; i < mutable.length; i += batchSize) {
      const batch = mutable.slice(i, i + batchSize);
      const coords = batch.map((d) => toCoordinate(d));
      const { distances, durations } = await fetchTableForSource(toCoordinate(source), coords);

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j] as EnrichedDestination;
        const distanceVal = distances[j] ?? null;
        const durationVal = durations[j] ?? null;
        row[`distance_${name} (meters)`] = distanceVal;
        row[`duration_${name} (seconds)`] = durationVal;
      }
    }
  }

  return mutable;
}


