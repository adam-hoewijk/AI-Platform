import { Coordinate } from "@/features/logistics/schema";

const DEFAULT_OSRM_BASE = "https://router.project-osrm.org";

function toCoordString({ Longitude, Latitude }: Coordinate): string {
  // Ensure dot as decimal separator
  return `${Longitude},${Latitude}`;
}

function getOsrmBaseUrl(): string {
  return (
    process.env.OSRM_BASE_URL ||
    process.env.NEXT_PUBLIC_OSRM_BASE_URL ||
    DEFAULT_OSRM_BASE
  );
}

export async function fetchTableForSource(
  source: Coordinate,
  destinations: Coordinate[]
): Promise<{ distances: Array<number | null>; durations: Array<number | null> }> {
  if (destinations.length === 0) {
    return { distances: [], durations: [] };
  }

  const base = getOsrmBaseUrl();
  const sourceStr = toCoordString(source);
  const destStr = destinations.map(toCoordString).join(";");
  const url = `${base}/table/v1/driving/${sourceStr};${destStr}?sources=0&annotations=duration,distance`;

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OSRM error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    distances?: number[][];
    durations?: number[][];
    code?: string;
    message?: string;
  };
  const rowDistances = json.distances?.[0] ?? [];
  const rowDurations = json.durations?.[0] ?? [];
  // Remove the first element which is distance from source to itself (0)
  const distances = rowDistances.slice(1).map((v) => (Number.isFinite(v) ? v : null));
  const durations = rowDurations.slice(1).map((v) => (Number.isFinite(v) ? v : null));

  return { distances, durations };
}


