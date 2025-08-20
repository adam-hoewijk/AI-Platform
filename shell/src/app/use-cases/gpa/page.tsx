"use client";

import React, { useRef, useState } from "react";
import { LooseJson } from "@/lib/persist";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { usePersistentState } from "@/lib/persist";
import { Dropzone } from "@/components/ui/dropzone";
import { Skeleton } from "@/components/ui/skeleton";

type ResultType = { name?: string | null; average?: number; outOf?: number; raw?: LooseJson } | null;

export default function GpaUseCasePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = usePersistentState<string | null>("gpa_file_name", null, { namespace: "gpa", version: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = usePersistentState<ResultType>("gpa_result", null, { namespace: "gpa", version: 1 });

  async function handleFile(files: File[]) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setFileName(file.name);
    setIsLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/gpa", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as Exclude<ResultType, null> | unknown;
  setResult(json as ResultType);
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to calculate GPA from PDF");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clear() {
    setFileName(null);
    setResult(null);
  }

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <Toaster />
      <Card>
        <CardHeader>
          <CardTitle>GPA Calculator</CardTitle>
          <CardDescription>Upload a transcript PDF and the model will return the average and maximum possible GPA.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Transcript PDF</Label>
              <div className="mt-2">
                <Dropzone accept="application/pdf" onFiles={handleFile} />
                {fileName && <div className="text-sm mt-2">Uploaded: {fileName}</div>}
              </div>
            </div>

            <div>
              <Label>Result</Label>
              <div className="border rounded-md p-6 h-48 flex items-center justify-center bg-muted/30">
                {!result && !isLoading && <p className="text-sm text-muted-foreground">No result yet. Upload a PDF to calculate GPA.</p>}

                {isLoading && (
                  <div className="w-full">
                    <Skeleton className="h-10 w-1/3 mx-auto rounded-md" />
                    <div className="h-4" />
                    <Skeleton className="h-20 w-2/3 mx-auto rounded-md" />
                  </div>
                )}

                {result && !isLoading && (
                  <div className="text-center">
                    {result.name && <div className="text-lg font-medium mb-2">{result.name}</div>}
                    <div className="inline-flex items-baseline gap-3 bg-card/60 p-6 rounded-lg shadow-sm">
                      <div className="text-4xl font-extrabold">
                        {typeof result.average === "number" ? result.average.toFixed(2) : "N/A"}
                      </div>
                      <div className="text-sm text-muted-foreground">/ {typeof result.outOf === "number" ? result.outOf : "?"}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={clear} disabled={isLoading}>
            Clear
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
