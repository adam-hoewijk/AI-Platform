"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { usePersistentState, createNamespacedStorage } from "@/lib/persist";
import { Plus, Trash2 } from "lucide-react";

type EditableSourceRow = { name: string; Longitude: string; Latitude: string };
type AnyRow = Record<string, string | number | boolean | null | undefined>;

function parseCsv(text: string): AnyRow[] {
  // Very simple CSV parser (no quotes handling). Detect delimiter and european decimals.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const delim = semiCount > commaCount ? ";" : ",";
  const header = headerLine.split(delim).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cols = line.split(delim);
    const obj: AnyRow = {};
    header.forEach((h, i) => {
      const raw = (cols[i] ?? "").trim();
      if (raw === "") {
        obj[h] = "";
        return;
      }
      // normalize european decimal comma to dot if there is no thousand separator logic
      const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(/,/g, ".") : raw;
      const maybeNum = Number(normalized);
      obj[h] = Number.isFinite(maybeNum) ? maybeNum : raw;
    });
    return obj;
  });
}



function download(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}



function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function valueToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

// Simple hash function for creating cache keys
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Create cache key from inputs
function createCacheKey(sources: EditableSourceRow[], destinations: AnyRow[], batchSize: number): string {
  const sourcesStr = JSON.stringify(sources.map(s => ({ name: s.name, Longitude: s.Longitude, Latitude: s.Latitude })));
  const destinationsStr = JSON.stringify(destinations.map(d => ({ Longitude: d.Longitude, Latitude: d.Latitude })));
  const inputStr = `${sourcesStr}|${destinationsStr}|${batchSize}`;
  return simpleHash(inputStr);
}

export default function LogisticsUseCasePage() {
  const [sources, setSources] = usePersistentState<EditableSourceRow[]>
    ("sources", [{ name: "", Longitude: "", Latitude: "" }], { namespace: "logistics", version: 1 });
  const [destinations, setDestinations] = usePersistentState<AnyRow[]>
    ("destinations", [], { namespace: "logistics", version: 1 });
  const [destFileName, setDestFileName] = usePersistentState<string>
    ("destFileName", "default-destinations.csv", { namespace: "logistics", version: 1 });
  const [batchSize, setBatchSize] = usePersistentState<number>
    ("batchSize", 300, { namespace: "logistics", version: 1 });
  const [rows, setRows] = useState<AnyRow[]>([]);
  type SummaryRow = { source: string; avgDistance: number; avgDuration: number; tonKm: number };
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  
  // Client-side cache for results
  const resultsCacheRef = useRef(createNamespacedStorage("logistics-results"));

  useEffect(() => {
    // Load default destinations CSV from public
    async function loadDefault() {
      try {
        const res = await fetch("/default-destinations.csv", { cache: "no-store" });
        const text = await res.text();
        setDestinations(parseCsv(text));
        setDestFileName("default-destinations.csv");
      } catch {
        // ignore
      }
    }
    loadDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for cached results on component mount
  useEffect(() => {
    // Only check for cached results if we have sources and destinations loaded
    if (sources.length > 0 && destinations.length > 0) {
      const cacheKey = createCacheKey(sources, destinations, batchSize);
      const cached = resultsCacheRef.current.get<{ rows: AnyRow[]; summary: SummaryRow[] }>(cacheKey);
      if (cached) {
        setRows(cached.rows);
        setSummary(cached.summary);
        toast.success("Loaded results from cache");
      }
    }
  }, [sources, destinations, batchSize]);

  function normalizeNumberString(raw: string): string {
    const s = (raw || "").trim();
    if (s === "") return "";
    return s.includes(",") && !s.includes(".") ? s.replace(/,/g, ".") : s;
  }

  async function run() {
    const preparedSources = sources
      .map((s) => ({
        name: s.name.trim(),
        Longitude: Number(normalizeNumberString(s.Longitude)),
        Latitude: Number(normalizeNumberString(s.Latitude)),
      }))
      .filter((s) => s.name && Number.isFinite(s.Longitude) && Number.isFinite(s.Latitude));

    if (preparedSources.length === 0) {
      toast.error("Please add at least one valid source");
      return;
    }
    if (destinations.length === 0) {
      toast.error("Please provide at least one destination");
      return;
    }
    if (!("Longitude" in destinations[0]) || !("Latitude" in destinations[0])) {
      toast.error("Destinations CSV must include 'Longitude' and 'Latitude' columns");
      return;
    }
    const invalid = destinations.filter(
      (d) => !Number.isFinite(Number(d.Longitude)) || !Number.isFinite(Number(d.Latitude))
    ).length;
    if (invalid > 0) {
      toast.error(`Destinations CSV has ${invalid} rows with invalid coordinates`);
      return;
    }

    // Check cache first
    const cacheKey = createCacheKey(sources, destinations, batchSize);
    const cached = resultsCacheRef.current.get<{ rows: AnyRow[]; summary: SummaryRow[] }>(cacheKey);
    if (cached) {
      setRows(cached.rows);
      setSummary(cached.summary);
      toast.success("Loaded results from cache");
      return;
    }

    setLoading(true);
    setProgress({ done: 0, total: preparedSources.length * Math.ceil(destinations.length / batchSize) });
    try {
      const body = {
        sources: preparedSources,
        destinations: destinations.map((d) => ({ ...d, Longitude: Number(d.Longitude), Latitude: Number(d.Latitude) })),
        batchSize,
      };

      const res = await fetch("/api/logistics/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      if (!reader) throw new Error("No response body");
      let finalRows: AnyRow[] | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          const evt = JSON.parse(line) as
            | { type: "progress"; done: number; total: number; source: string; batchIndex: number }
            | { type: "result"; rows: AnyRow[] }
            | { type: "error"; message: string };
          if (evt.type === "progress") {
            setProgress({ done: evt.done, total: evt.total });
          } else if (evt.type === "result") {
            finalRows = evt.rows;
          } else if (evt.type === "error") {
            throw new Error(evt.message);
          }
        }
      }

      if (finalRows) {
        setRows(finalRows);
        const sourceNames = preparedSources.map((s) => s.name);
        const headers = Object.keys(finalRows[0] || {});
        const weightKey = headers.find((h) => h.toLowerCase() === "weight");
        const newSummary: SummaryRow[] = [];
        for (const name of sourceNames) {
          const distKey = `distance_${name} (meters)`;
          const durKey = `duration_${name} (seconds)`;
          const values = finalRows
            .map((r) => ({ d: Number(r[distKey]), t: Number(r[durKey]) }))
            .filter((v) => Number.isFinite(v.d) && Number.isFinite(v.t));
          const avgD = values.length ? values.reduce((acc, v) => acc + v.d, 0) / values.length : 0;
          const avgT = values.length ? values.reduce((acc, v) => acc + v.t, 0) / values.length : 0;

          // Ton-km sum per source: sum over destinations of (weight tons * distance km)
          const tonKm = finalRows.reduce((acc, r) => {
            const dMeters = Number(r[distKey]);
            if (!Number.isFinite(dMeters)) return acc;
            const dKm = dMeters / 1000;
            const w = weightKey ? Number(r[weightKey]) : 0;
            if (!Number.isFinite(w)) return acc;
            return acc + w * dKm;
          }, 0);

          newSummary.push({ source: name, avgDistance: avgD, avgDuration: avgT, tonKm });
        }
        setSummary(newSummary);
        
        // Cache the results
        resultsCacheRef.current.set(cacheKey, { rows: finalRows, summary: newSummary });
        toast.success("Results calculated and cached");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to calculate");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function exportCsv() {
    const csv = [
      "Sources,Average Distance (meters),Average Duration (seconds),Ton Km (sum)",
      ...summary.map((s) => `${s.source},${Math.round(s.avgDistance)},${Math.round(s.avgDuration)},${Math.round(s.tonKm)}`),
    ].join("\n");
    download("logistics_summary.csv", csv);
  }

  function exportExcel() {
    const html = (() => {
      const rows = [
        ["Sources", "Average Distance (meters)", "Average Duration (seconds)", "Ton Km (sum)"],
        ...summary.map((s) => [
          s.source,
          Math.round(s.avgDistance).toString(),
          Math.round(s.avgDuration).toString(),
          Math.round(s.tonKm).toString(),
        ]),
      ];
      const thead = `<tr>${rows[0].map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
      const tbody = rows
        .slice(1)
        .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
        .join("");
      return `<table>${thead}${tbody}</table>`;
    })();
    const excelContent = `\ufeff<html><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
    download("logistics_summary.xls", excelContent, "application/vnd.ms-excel");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const headers = useMemo(() => {
    return Array.from(
      rows.reduce<Set<string>>((acc, r) => {
        Object.keys(r).forEach((k) => acc.add(k));
        return acc;
      }, new Set())
    );
  }, [rows]);

  return (
    <main className="container mx-auto p-6 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>Logistics Calculator</CardTitle>
          <CardDescription>Compute OSRM distance and duration from multiple sources to destination list (batched).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label>Sources</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSources((s: EditableSourceRow[]) => [...s, { name: "", Longitude: "", Latitude: "" }])}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add source
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSources([{ name: "", Longitude: "", Latitude: "" }])}
                >
                  Clear
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Enter at least one valid source with name and coordinates.</p>
              <div className="overflow-auto border rounded-md h-72">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-2 border-b">Name</th>
                      <th className="text-left p-2 border-b">Longitude</th>
                      <th className="text-left p-2 border-b">Latitude</th>
                      <th className="text-left p-2 border-b w-[1%] whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s, idx) => (
                      <tr key={idx} className="odd:bg-muted/20">
                        <td className="p-2 border-b align-top w-[30%]">
                          <Input
                            placeholder="Name"
                            value={s.name}
                              onChange={(e) => {
                              const v = e.target.value;
                                setSources((prev: EditableSourceRow[]) => prev.map((row, i) => (i === idx ? { ...row, name: v } : row)));
                            }}
                          />
                        </td>
                        <td className="p-2 border-b align-top">
                          <Input
                            placeholder="Longitude"
                            value={s.Longitude}
                              onChange={(e) => {
                              const v = e.target.value;
                                setSources((prev: EditableSourceRow[]) => prev.map((row, i) => (i === idx ? { ...row, Longitude: v } : row)));
                            }}
                          />
                        </td>
                        <td className="p-2 border-b align-top">
                          <Input
                            placeholder="Latitude"
                            value={s.Latitude}
                              onChange={(e) => {
                              const v = e.target.value;
                                setSources((prev: EditableSourceRow[]) => prev.map((row, i) => (i === idx ? { ...row, Latitude: v } : row)));
                            }}
                          />
                        </td>
                        <td className="p-2 border-b align-top w-[1%] whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove source"
                            onClick={() => setSources((prev: EditableSourceRow[]) => prev.filter((_, i) => i !== idx))}
                            disabled={sources.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-3">
              <Label>Destinations</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  className="h-8"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    const rows = parseCsv(text);
                    if (rows.length && (!("Longitude" in rows[0]) || !("Latitude" in rows[0]))) {
                      toast.error("CSV must include 'Longitude' and 'Latitude' headers");
                      return;
                    }
                    setDestinations(rows);
                    setDestFileName(file.name);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await fetch("/default-destinations.csv", { cache: "no-store" });
                      const text = await res.text();
                      setDestinations(parseCsv(text));
                      setDestFileName("default-destinations.csv");
                    } catch {}
                  }}
                >
                  Reset to default
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">Current file: {destFileName} ({destinations.length} rows)</div>
              <div className="overflow-auto border rounded-md h-72">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0 z-10">
                    <tr>
                      {destinations.length > 0 &&
                        Object.keys(destinations[0]).map((h) => (
                          <th key={h} className="text-left p-2 border-b">{h}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {destinations.slice(0, 10).map((r, i) => (
                      <tr key={i} className="odd:bg-muted/20">
                        {Object.keys(destinations[0] || {}).map((h) => (
                          <td key={h} className="p-2 border-b align-top">{String(r[h] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Preview shows first 10 rows. Required columns: Longitude, Latitude. Optional: Weight (tons).</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="batch">Batch size</Label>
              <Input id="batch" type="number" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value || 0))} />
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setRows([]);
                  setSummary([]);
                }}
                disabled={loading}
              >
                Clear results
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  resultsCacheRef.current.clear();
                  toast.success("Cache cleared");
                }}
                disabled={loading}
              >
                Clear cache
              </Button>
              <Button onClick={run} disabled={loading}>
                {loading ? "Calculating..." : "Calculate"}
              </Button>
              <Button onClick={exportCsv} disabled={summary.length === 0}>
                Export CSV
              </Button>
              <Button onClick={exportExcel} disabled={summary.length === 0}>
                Export Excel
              </Button>
            </div>
          </div>

          {progress && (
            <div className="text-sm text-muted-foreground">Progress: {progress.done} / {progress.total} batches</div>
          )}

          {summary.length > 0 && (
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2 border-b">Sources</th>
                    <th className="text-left p-2 border-b">Average Distance (meters)</th>
                    <th className="text-left p-2 border-b">Average Duration (seconds)</th>
                    <th className="text-left p-2 border-b">Ton Km (sum)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.source} className="odd:bg-muted/20">
                      <td className="p-2 border-b">{s.source}</td>
                      <td className="p-2 border-b">{Math.round(s.avgDistance)}</td>
                      <td className="p-2 border-b">{Math.round(s.avgDuration)}</td>
                      <td className="p-2 border-b">{Math.round(s.tonKm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-end"></CardFooter>
      </Card>
    </main>
  );
}


