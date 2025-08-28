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
import { Separator } from "@/components/ui/separator";

type ResultType = {
    fileName?: string | null;
    name?: string | null;
    personalIdentityNumber?: string | null;
    totalHP?: number | null;
    degrees?: string[] | null;
    studyDateSpan?: string | null;
    verifiableUntil?: string | null;
    controlCode?: string | null;
    verificationLink?: string | null;
    average?: number | null;
    outOf?: number | null;
    raw?: LooseJson;
} | null;

export default function GpaUseCasePage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [fileNames, setFileNames] = usePersistentState<string[]>("gpa_file_names", [], { namespace: "gpa", version: 2 });
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = usePersistentState<ResultType[]>("gpa_results", [], { namespace: "gpa", version: 2 });

    async function handleFile(files: File[]) {
        if (!files || files.length === 0) return;
        setIsLoading(true);
        setFileNames(files.map(file => file.name));
        setResults([]);

        try {
            const promises = files.map(async (file) => {
                const form = new FormData();
                form.append("file", file);

                const res = await fetch("/api/gpa", {
                    method: "POST",
                    body: form,
                });

                if (!res.ok) {
                    toast.error(`Failed to process ${file.name}`);
                    return null;
                }
                const json = await res.json() as Omit<ResultType, 'fileName'>;
                return { ...json, fileName: file.name };
            });

            const settledResults = await Promise.all(promises);
            setResults(settledResults);

        } catch (err: unknown) {
            console.error(err);
            toast.error("An error occurred while processing files.");
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    function clear() {
        setFileNames([]);
        setResults([]);
    }

    return (
        <main className="container mx-auto p-6 max-w-3xl">
            <Toaster />
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">GPA Calculator</CardTitle>
                    <CardDescription className="text-base">Upload up to 10 transcript PDFs and the model will return the average and maximum possible GPA for each.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        <div>
                            <Label className="text-lg">Transcript PDFs</Label>
                            <div className="mt-2">
                                <Dropzone accept="application/pdf" onFiles={handleFile} maxFiles={10} />
                                {fileNames.length > 0 && (
                                    <div className="mt-2 text-base text-muted-foreground">
                                        Uploaded {fileNames.length} file(s).
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label className="text-lg">Results</Label>
                            <div className="border rounded-md p-6 min-h-[300px] flex flex-col items-center justify-center bg-muted/30 space-y-4">
                                {!results.length && !isLoading && <p className="text-base text-muted-foreground">No results yet. Upload PDFs to get started.</p>}

                                {isLoading && (
                                    <div className="w-full">
                                        <Skeleton className="h-12 w-1/3 mx-auto rounded-md" />
                                        <div className="h-6" />
                                        <Skeleton className="h-24 w-2/3 mx-auto rounded-md" />
                                    </div>
                                )}

                                {results.length > 0 && !isLoading && (
                                    results.map((result, index) => (
                                        result && (
                                            <Card key={index} className="w-full text-left">
                                                <CardHeader className="py-3 px-4 flex-col items-start">
                                                    {result.fileName && (
                                                        <span className="text-xs text-muted-foreground mb-1">{result.fileName}</span>
                                                    )}
                                                    <CardTitle className="text-xl font-bold">{result.name || "Untitled Document"}</CardTitle>
                                                    {result.personalIdentityNumber && (
                                                        <span className="text-sm text-muted-foreground mt-1">{result.personalIdentityNumber}</span>
                                                    )}
                                                </CardHeader>
                                                <CardContent className="py-4 px-4 space-y-4">
                                                    {/* GPA Section */}
                                                    <div className="flex items-baseline gap-2">
                                                        <div className="text-4xl font-extrabold">
                                                            {typeof result.average === "number" ? result.average.toFixed(2) : "N/A"}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">/ {typeof result.outOf === "number" ? result.outOf : "?"}</div>
                                                    </div>

                                                    <Separator />

                                                    {/* Degree & Study Section */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {result.totalHP && (
                                                            <div className="text-sm text-muted-foreground">
                                                                <span className="font-semibold">Total HP:</span> {result.totalHP}
                                                            </div>
                                                        )}
                                                        {result.studyDateSpan && (
                                                            <div className="text-sm text-muted-foreground">
                                                                <span className="font-semibold">Study Period:</span> {result.studyDateSpan}
                                                            </div>
                                                        )}
                                                        {result.degrees && result.degrees.length > 0 && (
                                                            <div className="col-span-full text-sm text-muted-foreground">
                                                                <span className="font-semibold">Degrees:</span>
                                                                <ul className="list-disc list-inside mt-1 space-y-1">
                                                                    {result.degrees.map((degree, degreeIndex) => (
                                                                        <li key={degreeIndex}>{degree}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <Separator />

                                                    {/* Verification Section */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {result.controlCode && (
                                                            <div className="text-sm text-muted-foreground">
                                                                <span className="font-semibold">Control Code:</span> {result.controlCode}
                                                            </div>
                                                        )}
                                                        {result.verifiableUntil && (
                                                            <div className="text-sm text-muted-foreground">
                                                                <span className="font-semibold">Verifiable Until:</span> {result.verifiableUntil}
                                                            </div>
                                                        )}
                                                        {result.verificationLink && (
                                                            <div className="col-span-full text-sm text-muted-foreground mt-2">
                                                                <a href={result.verificationLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-semibold">Verify Grades (Ladok)</a>
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-end gap-2">
                    <Button variant="outline" onClick={clear} disabled={isLoading}>
                        Clear All
                    </Button>
                </CardFooter>
            </Card>
        </main>
    );
}