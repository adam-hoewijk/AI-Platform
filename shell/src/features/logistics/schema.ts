import { z } from "zod";

export const CoordinateSchema = z.object({
  Longitude: z.number(),
  Latitude: z.number(),
});

export type Coordinate = z.infer<typeof CoordinateSchema>;

export const SourceSchema = CoordinateSchema.extend({
  name: z.string().min(1),
});

export type Source = z.infer<typeof SourceSchema>;

// Allow destinations to include arbitrary extra columns; we only require coords
export const DestinationSchema = z
  .object({
    Longitude: z.number(),
    Latitude: z.number(),
  })
  .passthrough();

export type Destination = z.infer<typeof DestinationSchema> & Record<string, unknown>;

export const CalculateRequestSchema = z.object({
  sources: z.array(SourceSchema).min(1),
  destinations: z.array(DestinationSchema).min(1),
  batchSize: z.number().int().positive().max(1000).default(300),
});

export type CalculateRequest = z.infer<typeof CalculateRequestSchema>;

export const EnrichedDestinationSchema = DestinationSchema.passthrough();
export type EnrichedDestination = z.infer<typeof EnrichedDestinationSchema> &
  Record<string, unknown>;


