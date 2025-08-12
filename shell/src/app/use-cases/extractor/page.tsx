"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersistentState, LooseJson, createNamespacedStorage } from "@/lib/persist";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BaseType = "text" | "number" | "date" | "boolean";

type Attribute = {
  name: string;
  description: string;
  type: BaseType;
};

type CustomType = {
  name: string;
  description: string;
  attributes: Attribute[];
};

type Column = {
  id: string;
  name: string;
  description: string;
  type:
    | { kind: "base"; baseType: BaseType }
    | { kind: "custom"; typeName: string };
  cardinality: "one" | "many";
};

type UploadedDoc = {
  id: string;
  name: string;
  text: string;
};

type ExtractionResult = {
  documentId: string;
  data: Record<string, unknown>;
};

function randomId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function pretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
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

// Create cache key for extraction
function createExtractionCacheKey(docId: string, colId: string, docText: string, column: Column, customTypes: CustomType[]): string {
  const columnStr = JSON.stringify(column);
  const customTypesStr = JSON.stringify(customTypes);
  const inputStr = `${docId}|${colId}|${docText}|${columnStr}|${customTypesStr}`;
  return simpleHash(inputStr);
}

export default function ExtractorUseCasePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = usePersistentState<UploadedDoc[]>("documents", [], { namespace: "extractor", version: 1 });
  const [columns, setColumns] = usePersistentState<Column[]>("columns", [], { namespace: "extractor", version: 1 });
  const [customTypes, setCustomTypes] = usePersistentState<CustomType[]>("customTypes", [], { namespace: "extractor", version: 1 });
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [isDefiningType, setIsDefiningType] = useState(false);
  // resultsByDoc[documentId][columnId] => value (persisted)
  const [resultsByDoc, setResultsByDoc] = usePersistentState<Record<string, Record<string, LooseJson>>>(
    "resultsByDoc",
    {},
    { namespace: "extractor", version: 1 }
  );
  // loadingCells contains composite keys `${docId}::${colId}` while that cell is being populated
  const [loadingCells, setLoadingCells] = useState<Set<string>>(new Set());
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  
  // Client-side cache for extraction results
  const extractionCache = createNamespacedStorage("extractor-results");

  const baseTypes: BaseType[] = ["text", "number", "date", "boolean"];

  // Derived map for quick custom type lookup
  const customTypeMap = useMemo(() => {
    const map = new Map<string, CustomType>();
    for (const t of customTypes) map.set(t.name, t);
    return map;
  }, [customTypes]);

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newDocs: UploadedDoc[] = [];
    for (const f of Array.from(files)) {
      const text = await f.text(); // Simple text read; PDFs etc. would need a server OCR/ingest
      newDocs.push({ id: randomId("doc"), name: f.name, text });
    }
    setDocuments((prev) => [...prev, ...newDocs]);
    // When new documents are added, populate all existing columns for just those new rows
    if (columns.length > 0) {
      void extractForNewDocuments(newDocs, columns);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeDocument(id: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  function addColumn(col: Omit<Column, "id">) {
    // Not used directly anymore for extraction flow — see onSubmit in dialog where we need the created id synchronously
    setColumns((prev) => [...prev, { ...col, id: randomId("col") }]);
  }

  function removeColumn(id: string) {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  }

  function upsertCustomType(t: CustomType) {
    setCustomTypes((prev) => {
      const idx = prev.findIndex((x) => x.name === t.name);
      if (idx === -1) return [...prev, t];
      const copy = [...prev];
      copy[idx] = t;
      return copy;
    });
  }

  const cellKey = (docId: string, colId: string) => `${docId}::${colId}`;

  function markCellsLoading(docIds: string[], colIds: string[]) {
    setLoadingCells((prev) => {
      const next = new Set(prev);
      for (const d of docIds) {
        for (const c of colIds) next.add(cellKey(d, c));
      }
      return next;
    });
  }

  function markCellsDone(docIds: string[], colIds: string[]) {
    setLoadingCells((prev) => {
      const next = new Set(prev);
      for (const d of docIds) {
        for (const c of colIds) next.delete(cellKey(d, c));
      }
      return next;
    });
  }

  function mergeExtractionResults(newResults: ExtractionResult[]) {
    setResultsByDoc((prev) => {
      const next: Record<string, Record<string, LooseJson>> = { ...prev };
      for (const r of newResults) {
        const existingRow = next[r.documentId] ?? {};
        next[r.documentId] = { ...existingRow, ...(r.data as Record<string, LooseJson>) };
      }
      return next;
    });
  }

  function cleanupColumnState(columnId: string) {
    setResultsByDoc((prev) => {
      const next: Record<string, Record<string, unknown>> = {};
      for (const [docId, data] of Object.entries(prev)) {
        const { [columnId]: _removed, ...rest } = data;
        next[docId] = rest;
      }
      return next;
    });
    setLoadingCells((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        const parts = key.split("::");
        if (parts[1] !== columnId) next.add(key);
      }
      return next;
    });
  }

  async function extractForNewColumn(newColumn: Column) {
    if (documents.length === 0) return;
    const targetDocs = [...documents];
    const docIds = targetDocs.map((d) => d.id);
    const colIds = [newColumn.id];
    markCellsLoading(docIds, colIds);
    
    // Check cache for each document
    const cachedResults: ExtractionResult[] = [];
    const uncachedDocs: UploadedDoc[] = [];
    
    for (const doc of targetDocs) {
      const cacheKey = createExtractionCacheKey(doc.id, newColumn.id, doc.text, newColumn, customTypes);
      const cached = extractionCache.get<unknown>(cacheKey);
      if (cached) {
        cachedResults.push({ documentId: doc.id, data: cached as Record<string, unknown> });
      } else {
        uncachedDocs.push(doc);
      }
    }
    
    // Merge cached results immediately
    if (cachedResults.length > 0) {
      mergeExtractionResults(cachedResults);
    }
    
    // Only extract for uncached documents
    if (uncachedDocs.length === 0) {
      markCellsDone(docIds, colIds);
      return;
    }
    
    try {
      const res = await fetch("/api/extractor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: uncachedDocs.map((d) => ({ id: d.id, name: d.name, text: d.text })),
          columns: [newColumn],
          customTypes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { results: ExtractionResult[] };
      
      // Cache new results
      for (const result of data.results) {
        const doc = uncachedDocs.find(d => d.id === result.documentId);
        if (doc) {
          const cacheKey = createExtractionCacheKey(doc.id, newColumn.id, doc.text, newColumn, customTypes);
          extractionCache.set(cacheKey, result.data);
        }
      }
      
      mergeExtractionResults(data.results);
    } catch (err) {
      console.error(err);
      alert(`Extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      markCellsDone(docIds, colIds);
    }
  }

  async function extractForNewDocuments(newDocs: UploadedDoc[], targetColumns: Column[]) {
    if (newDocs.length === 0 || targetColumns.length === 0) return;
    const docIds = newDocs.map((d) => d.id);
    const colIds = targetColumns.map((c) => c.id);
    markCellsLoading(docIds, colIds);
    
    // Check cache for each document-column combination
    const cachedResults: ExtractionResult[] = [];
    const uncachedRequests: { doc: UploadedDoc; columns: Column[] }[] = [];
    
    for (const doc of newDocs) {
      const docCachedColumns: Column[] = [];
      const docUncachedColumns: Column[] = [];
      
      for (const col of targetColumns) {
        const cacheKey = createExtractionCacheKey(doc.id, col.id, doc.text, col, customTypes);
        const cached = extractionCache.get<unknown>(cacheKey);
        if (cached) {
          cachedResults.push({ documentId: doc.id, data: cached as Record<string, unknown> });
          docCachedColumns.push(col);
        } else {
          docUncachedColumns.push(col);
        }
      }
      
      if (docUncachedColumns.length > 0) {
        uncachedRequests.push({ doc, columns: docUncachedColumns });
      }
    }
    
    // Merge cached results immediately
    if (cachedResults.length > 0) {
      mergeExtractionResults(cachedResults);
    }
    
    // Only extract for uncached combinations
    if (uncachedRequests.length === 0) {
      markCellsDone(docIds, colIds);
      return;
    }
    
    try {
      const allUncachedDocs = uncachedRequests.map(r => r.doc);
      const allUncachedColumns = Array.from(new Set(uncachedRequests.flatMap(r => r.columns)));
      
      const res = await fetch("/api/extractor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: allUncachedDocs.map((d) => ({ id: d.id, name: d.name, text: d.text })),
          columns: allUncachedColumns,
          customTypes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { results: ExtractionResult[] };
      
      // Cache new results
      for (const result of data.results) {
        const doc = allUncachedDocs.find(d => d.id === result.documentId);
        if (doc) {
          // Find which columns were extracted for this document
          const request = uncachedRequests.find(r => r.doc.id === doc.id);
          if (request) {
            for (const col of request.columns) {
              const cacheKey = createExtractionCacheKey(doc.id, col.id, doc.text, col, customTypes);
              if (result.data[col.id] !== undefined) {
                extractionCache.set(cacheKey, { [col.id]: result.data[col.id] });
              }
            }
          }
        }
      }
      
      mergeExtractionResults(data.results);
    } catch (err) {
      console.error(err);
      alert(`Extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      markCellsDone(docIds, colIds);
    }
  }

  return (
    <main className="container mx-auto p-6 max-w-5xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Extractor</h1>
          <p className="text-sm text-muted-foreground">
            One table. Add documents (rows) and columns (attributes). Each new row/column populates quickly, preserving existing data.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              extractionCache.clear();
              alert("Cache cleared");
            }}
          >
            Clear cache
          </Button>
          <Dialog open={isDefiningType} onOpenChange={setIsDefiningType}>
            <DialogTrigger asChild>
              <Button variant="secondary">Define custom type</Button>
            </DialogTrigger>
            <DefineTypeDialog
              baseTypes={baseTypes}
              onSubmit={(t) => {
                upsertCustomType(t);
                setIsDefiningType(false);
              }}
            />
          </Dialog>

          <Dialog open={isAddingColumn} onOpenChange={setIsAddingColumn}>
            <DialogTrigger asChild>
              <Button>Add column</Button>
            </DialogTrigger>
            <AddColumnDialog
              baseTypes={baseTypes}
              customTypes={customTypes}
              onSubmit={(c) => {
                // Create the column with an id synchronously so we can extract immediately
                const created: Column = { ...c, id: randomId("col") } as Column;
                setColumns((prev) => [...prev, created]);
                setIsAddingColumn(false);
                void extractForNewColumn(created);
              }}
            />
          </Dialog>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Input ref={fileInputRef} type="file" multiple onChange={(e) => handleFilesSelected(e.target.files)} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>Browse</Button>
        </div>

        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-3">File</th>
                {columns.map((c) => (
                  <th key={c.id} className="text-left p-3 align-top">
                    <button
                      className="font-medium underline decoration-dotted hover:no-underline"
                      onClick={() => setOpenColumnId(c.id)}
                    >
                      {c.name}
                    </button>
                  </th>
                ))}
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={Math.max(2, 2 + columns.length)}>
                    No files uploaded yet.
                  </td>
                </tr>
              ) : (
                documents.map((d) => (
                  <tr key={d.id} className="border-t align-top">
                    <td className="p-3 font-medium">{d.name}</td>
                    {columns.map((c) => {
                      const key = cellKey(d.id, c.id);
                      const value = resultsByDoc[d.id]?.[c.id];
                      const isLoading = loadingCells.has(key);
                      const isMany = c.cardinality === "many";
                      const count = Array.isArray(value) ? value.length : 0;

                      function renderInlinePreview() {
                        if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
                        if (!isMany) {
                          if (c.type.kind === "base") {
                            if (typeof value === "string") return <span>{truncate(value)}</span>;
                            if (typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;
                            if (isPlainObject(value)) {
                              const entries = Object.entries(value).filter(([, v]) => v != null).slice(0, 3);
                              return (
                                <span className="text-xs text-muted-foreground">
                                  {entries.map(([k, v], i) => (
                                    <span key={k}>
                                      {k}: {String(v)}{i < entries.length - 1 ? ", " : ""}
                                    </span>
                                  ))}
                                </span>
                              );
                            }
                            return <span className="text-xs text-muted-foreground">{truncate(pretty(value))}</span>;
                          } else {
                            // custom type single object preview
                            if (isPlainObject(value)) {
                              const entries = Object.entries(value).filter(([, v]) => v != null).slice(0, 3);
                              if (entries.length === 0) return <span className="text-xs text-muted-foreground">(empty)</span>;
                              return (
                                <span className="text-xs text-muted-foreground">
                                  {entries.map(([k, v], i) => (
                                    <span key={k}>
                                      {k}: {String(v)}{i < entries.length - 1 ? ", " : ""}
                                    </span>
                                  ))}
                                </span>
                              );
                            }
                            return <span className="text-xs text-muted-foreground">{truncate(pretty(value))}</span>;
                          }
                        } else {
                          // many
                          if (c.type.kind === "base") {
                            const arr = Array.isArray(value) ? value : [];
                            const preview = arr.slice(0, 3).map((v) => (typeof v === "string" ? v : pretty(v))).join(", ");
                            return (
                              <span>
                                {count} item{count === 1 ? "" : "s"}
                                {count > 0 && (
                                  <span className="text-xs text-muted-foreground"> — {truncate(preview)}</span>
                                )}
                              </span>
                            );
                          } else {
                            // custom type list: show count and first item summary
                            const arr = Array.isArray(value) ? value : [];
                            const first = arr[0];
                            let summary: string | null = null;
                            if (isPlainObject(first)) {
                              const entries = Object.entries(first).filter(([, v]) => v != null).slice(0, 3);
                              summary = entries.map(([k, v]) => `${k}: ${String(v)}`).join(", ");
                            }
                            return (
                              <span>
                                {count} item{count === 1 ? "" : "s"}
                                {summary && (
                                  <span className="text-xs text-muted-foreground"> — {truncate(summary)}</span>
                                )}
                              </span>
                            );
                          }
                        }
                      }

                      function renderDialogValue() {
                        // Rich rendering in dialog
                        if (!isMany) {
                          if (c.type.kind === "base") {
                            if (typeof value === "string") return <div className="text-sm whitespace-pre-wrap break-words">{value}</div>;
                            if (typeof value === "number" || typeof value === "boolean") return <div className="text-sm">{String(value)}</div>;
                            return <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs">{pretty(value)}</pre>;
                          } else {
                            // custom type object as definition list
                            if (isPlainObject(value)) {
                              const entries = Object.entries(value);
                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {entries.map(([k, v]) => (
                                    <div key={k} className="rounded border p-2">
                                      <div className="text-xs font-medium text-muted-foreground">{k}</div>
                                      <div className="text-sm break-words">{String(v ?? "")}</div>
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs">{pretty(value)}</pre>;
                          }
                        } else {
                          if (c.type.kind === "base") {
                            const arr = (Array.isArray(value) ? value : []) as unknown[];
                            return (
                              <ul className="list-disc pl-6 space-y-1 max-h-[60vh] overflow-auto">
                                {arr.map((v, i) => (
                                  <li key={i} className="text-sm break-words">{typeof v === "string" ? v : pretty(v)}</li>
                                ))}
                              </ul>
                            );
                          } else {
                            const arr = (Array.isArray(value) ? value : []) as Array<Record<string, unknown>>;
                            return (
                              <div className="space-y-3 max-h-[60vh] overflow-auto">
                                {arr.map((obj, idx) => (
                                  <div key={idx} className="rounded-md border p-3">
                                    <div className="mb-2 text-xs text-muted-foreground">Item {idx + 1}</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {Object.entries(obj).map(([k, v]) => (
                                        <div key={k} className="rounded border p-2">
                                          <div className="text-xs font-medium text-muted-foreground">{k}</div>
                                          <div className="text-sm break-words">{String(v ?? "")}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                        }
                      }
                      return (
                        <td key={c.id} className="p-3">
                          {isLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-xs">Extracting…</span>
                            </div>
                          ) : value === undefined ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="block w-full text-left">
                                  <div className="text-sm break-words">
                                    {renderInlinePreview()}
                                  </div>
                                </button>
                              </DialogTrigger>
                              <DialogContent className="max-w-3xl">
                                <DialogHeader>
                                  <DialogTitle>{c.name}</DialogTitle>
                                  <DialogDescription>{c.description}</DialogDescription>
                                </DialogHeader>
                                {renderDialogValue()}
                              </DialogContent>
                            </Dialog>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-3">
                      <Button size="sm" variant="ghost" onClick={() => {
                        // remove associated results and loading states
                        setResultsByDoc((prev) => {
                          const next: Record<string, Record<string, LooseJson>> = { ...prev };
                          delete next[d.id];
                          return next;
                        });
                        setLoadingCells((prev) => {
                          const next = new Set(Array.from(prev));
                          for (const c of columns) next.delete(cellKey(d.id, c.id));
                          return next;
                        });
                        removeDocument(d.id);
                      }}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Column details dialog */}
      <ColumnDetailsDialog
        column={columns.find((c) => c.id === openColumnId) ?? null}
        customTypes={customTypes}
        onClose={() => setOpenColumnId(null)}
        onRemove={(colId) => {
          cleanupColumnState(colId);
          removeColumn(colId);
          setOpenColumnId(null);
        }}
        onReextract={(updated) => {
          // Update column definition (e.g., name/description), then re-extract this column only
          setColumns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          setOpenColumnId(null);
          void extractForNewColumn(updated);
        }}
      />
    </main>
  );
}

function AddColumnDialog({
  baseTypes,
  customTypes,
  onSubmit,
}: {
  baseTypes: BaseType[];
  customTypes: CustomType[];
  onSubmit: (col: Omit<Column, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cardinality, setCardinality] = useState<"one" | "many">("one");
  const [mode, setMode] = useState<"base" | "custom">("base");
  const [baseType, setBaseType] = useState<BaseType>("text");
  const [typeName, setTypeName] = useState<string>("");

  function submit() {
    if (!name || !description) return;
    if (mode === "base") {
      onSubmit({ name, description, cardinality, type: { kind: "base", baseType } });
    } else {
      if (!typeName) return;
      onSubmit({ name, description, cardinality, type: { kind: "custom", typeName } });
    }
    setName("");
    setDescription("");
    setCardinality("one");
    setMode("base");
    setBaseType("text");
    setTypeName("");
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add column</DialogTitle>
        <DialogDescription>
          Name it, describe it, choose a type, and whether it returns one or many results.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="col-name">Name</Label>
          <Input id="col-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="col-desc">Description</Label>
          <Textarea id="col-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Kind</Label>
            <div className="flex gap-2">
              <Button variant={mode === "base" ? "default" : "outline"} onClick={() => setMode("base")}>
                Base
              </Button>
              <Button variant={mode === "custom" ? "default" : "outline"} onClick={() => setMode("custom")}>
                Custom
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Cardinality</Label>
            <div className="flex gap-2">
              <Button variant={cardinality === "one" ? "default" : "outline"} onClick={() => setCardinality("one")}>
                One
              </Button>
              <Button variant={cardinality === "many" ? "default" : "outline"} onClick={() => setCardinality("many")}>
                Many
              </Button>
            </div>
          </div>
        </div>

        {mode === "base" ? (
          <div className="grid gap-2">
            <Label>Base type</Label>
            <Select value={baseType} onValueChange={(v) => setBaseType(v as BaseType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Types</SelectLabel>
                  {baseTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label>Custom type</Label>
            <Select value={typeName} onValueChange={(v) => setTypeName(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select custom type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Custom types</SelectLabel>
                  {customTypes.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No custom types yet</div>
                  )}
                  {customTypes.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={submit}>Extract</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DefineTypeDialog({
  baseTypes,
  onSubmit,
}: {
  baseTypes: BaseType[];
  onSubmit: (t: CustomType) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  function addAttribute() {
    setAttributes((prev) => [...prev, { name: "", description: "", type: "text" }]);
  }
  function removeAttribute(index: number) {
    setAttributes((prev) => prev.filter((_, i) => i !== index));
  }
  function updateAttribute<K extends keyof Attribute>(index: number, key: K, value: Attribute[K]) {
    setAttributes((prev) => prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)));
  }

  function submit() {
    if (!name || !description || attributes.length === 0) return;
    onSubmit({ name, description, attributes });
    setName("");
    setDescription("");
    setAttributes([]);
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Define custom type</DialogTitle>
        <DialogDescription>
          Provide a name, description, and attributes that define this type.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="t-name">Name</Label>
          <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="t-desc">Description</Label>
          <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-3">Attribute</th>
                <th className="text-left p-3">Description</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {attributes.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={4}>
                    No attributes yet.
                  </td>
                </tr>
              )}
              {attributes.map((a, i) => (
                <tr key={i} className="border-t">
                  <td className="p-3">
                    <Input
                      placeholder="name"
                      value={a.name}
                      onChange={(e) => updateAttribute(i, "name", e.target.value)}
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      placeholder="description"
                      value={a.description}
                      onChange={(e) => updateAttribute(i, "description", e.target.value)}
                    />
                  </td>
                  <td className="p-3">
                    <Select
                      value={a.type}
                      onValueChange={(v) => updateAttribute(i, "type", v as BaseType)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Types</SelectLabel>
                          {baseTypes.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" onClick={() => removeAttribute(i)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <Button variant="outline" onClick={addAttribute}>
            Add attribute
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit}>Save type</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ColumnDetailsDialog({
  column,
  customTypes,
  onClose,
  onRemove,
  onReextract,
}: {
  column: Column | null;
  customTypes: CustomType[];
  onClose: () => void;
  onRemove: (columnId: string) => void;
  onReextract: (updated: Column) => void;
}) {
  const [name, setName] = useState(column?.name ?? "");
  const [description, setDescription] = useState(column?.description ?? "");
  const [cardinality, setCardinality] = useState<"one" | "many">(column?.cardinality ?? "one");

  // Keep inputs in sync when dialog opens for a different column
  useEffect(() => {
    setName(column?.name ?? "");
    setDescription(column?.description ?? "");
    setCardinality(column?.cardinality ?? "one");
  }, [column]);

  if (!column) return null;

  let typeSummary: string;
  if (column.type.kind === "base") {
    typeSummary = column.type.baseType;
  } else {
    typeSummary = `custom: ${column.type.typeName}`;
  }
  const customTypeName = column.type.kind === "custom" ? column.type.typeName : null;

  const canSave = Boolean(name && description);

  return (
    <Dialog open={Boolean(column)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Column details</DialogTitle>
          <DialogDescription>View or modify the column, remove it, or re-extract this column only.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1">
              <Label>Type</Label>
              <Input value={typeSummary} readOnly />
              {customTypeName && (
                <div className="text-xs text-muted-foreground">
                  Attributes: {customTypes.find((t) => t.name === customTypeName)?.attributes.length ?? 0}
                </div>
              )}
            </div>
            <div className="grid gap-1">
              <Label>Cardinality</Label>
              <div className="flex gap-2">
                <Button
                  variant={cardinality === "one" ? "default" : "outline"}
                  onClick={() => setCardinality("one")}
                >
                  One
                </Button>
                <Button
                  variant={cardinality === "many" ? "default" : "outline"}
                  onClick={() => setCardinality("many")}
                >
                  Many
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="justify-between sm:justify-between gap-2">
          <Button variant="destructive" onClick={() => onRemove(column.id)}>
            Remove column
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={() =>
                onReextract({ ...column, name, description, cardinality })
              }
              disabled={!canSave}
            >
              Re-extract
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



