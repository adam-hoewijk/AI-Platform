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
import { Trash2 } from "lucide-react";

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

    function removeAt(targetIndex: number) {
        setResults(prev => prev.filter((_, i) => i !== targetIndex));
        setFileNames(prev => prev.filter((_, i) => i !== targetIndex));
    }

    async function handleFile(files: File[]) {
        if (!files || files.length === 0) return;
        setIsLoading(true);
        const names = files.map(file => file.name);
        setFileNames(names);
        // Seed placeholder cards immediately with filenames so users can verify selection
        const placeholders: ResultType[] = names.map(name => ({
            fileName: name,
            name: null,
            personalIdentityNumber: null,
            totalHP: null,
            degrees: [],
            studyDateSpan: null,
            verifiableUntil: null,
            controlCode: null,
            verificationLink: null,
            average: null,
            outOf: null,
            raw: {},
        }));
        setResults(placeholders);

        try {
            await Promise.all(
                files.map(async (file, index) => {
                    try {
                        const form = new FormData();
                        form.append("file", file);

                        const res = await fetch("/api/gpa", {
                            method: "POST",
                            body: form,
                        });

                        if (!res.ok) {
                            toast.error(`Failed to process ${file.name}`);
                            // Mark this card as failed but keep filename visible
                            setResults(prev => {
                                const copy = [...prev];
                                copy[index] = {
                                    ...(copy[index] ?? { fileName: file.name }),
                                    name: "Failed to parse",
                                };
                                return copy;
                            });
                            return;
                        }
                        const json = await res.json() as Omit<ResultType, 'fileName'>;
                        // Update only this file's result when it arrives
                        setResults(prev => {
                            const copy = [...prev];
                            copy[index] = { ...json, fileName: file.name };
                            return copy;
                        });
                    } catch (err) {
                        console.error(err);
                        toast.error(`An error occurred while processing ${file.name}.`);
                        setResults(prev => {
                            const copy = [...prev];
                            copy[index] = {
                                ...(copy[index] ?? { fileName: file.name }),
                                name: "Error while processing",
                            };
                            return copy;
                        });
                    }
                })
            );
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
                            <div className="border rounded-md p-6 min-h-[300px] bg-muted/30 space-y-4">
                                {results.length === 0 && !isLoading && (
                                    <p className="text-base text-muted-foreground text-center">No results yet. Upload PDFs to get started.</p>
                                )}

                                {results.length > 0 && (
                                    results.map((result, index) => (
                                        result && (
                                            <Card key={index} className="w-full text-left">
                                                <CardHeader className="py-3 px-4">
                                                    <div className="flex items-start justify-between w-full gap-4">
                                                        <div className="flex flex-col items-start">
                                                            {result.fileName && (
                                                                <span className="text-xs text-muted-foreground mb-1">{result.fileName}</span>
                                                            )}
                                                            <CardTitle className="text-xl font-bold">
                                                                {result.name ?? (isLoading ? <Skeleton className="h-6 w-1/3" /> : "Untitled Document")}
                                                            </CardTitle>
                                                            {result.personalIdentityNumber ? (
                                                                <span className="text-sm text-muted-foreground mt-1">{result.personalIdentityNumber}</span>
                                                            ) : (
                                                                isLoading && <Skeleton className="h-4 w-1/4 mt-2" />
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Remove result"
                                                            className="shrink-0"
                                                            onClick={() => removeAt(index)}
                                                            disabled={isLoading}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="py-4 px-4 space-y-4">
                                                    {/* GPA Section */}
                                                    <div className="flex items-baseline gap-2">
                                                        <div className="text-4xl font-extrabold">
                                                            {typeof result.average === "number" ? (
                                                                result.average.toFixed(2)
                                                            ) : (
                                                                isLoading ? <Skeleton className="h-10 w-24" /> : "N/A"
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            / {typeof result.outOf === "number" ? result.outOf : (isLoading ? <Skeleton className="h-4 w-6 inline-block align-middle" /> : "?")}
                                                        </div>
                                                    </div>

                                                    <Separator />

                                                    {/* Degree & Study Section */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {typeof result.totalHP === "number" ? (
                                                            <div className="text-sm text-muted-foreground">
                                                                <span className="font-semibold">Total HP:</span> {result.totalHP}
                                                            </div>
                                                        ) : (
                                                            isLoading && <Skeleton className="h-4 w-24" />
                                                        )}
                                                        {result.studyDateSpan ? (
                                                            <div className="text-sm text-muted-foreground">
                                                                <span className="font-semibold">Study Period:</span> {result.studyDateSpan}
                                                            </div>
                                                        ) : (
                                                            isLoading && <Skeleton className="h-4 w-40" />
                                                        )}
                                                        {result.degrees && result.degrees.length > 0 ? (
                                                            <div className="col-span-full text-sm text-muted-foreground">
                                                                <span className="font-semibold">Degrees:</span>
                                                                <ul className="list-disc list-inside mt-1 space-y-1">
                                                                    {result.degrees.map((degree, degreeIndex) => (
                                                                        <li key={degreeIndex}>{degree}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        ) : (
                                                            isLoading && <Skeleton className="h-4 w-2/3" />
                                                        )}
                                                    </div>

                                                    <Separator />

                                                    {/* Verification Section */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {result.controlCode ? (
                                                            <div className="text-sm text-muted-foreground">
                                                                <span className="font-semibold">Control Code:</span> {result.controlCode}
                                                            </div>
                                                        ) : (
                                                            isLoading && <Skeleton className="h-4 w-28" />
                                                        )}
                                                        {result.verifiableUntil ? (
                                                            <div className="text-sm text-muted-foreground">
                                                                <span className="font-semibold">Verifiable Until:</span> {result.verifiableUntil}
                                                            </div>
                                                        ) : (
                                                            isLoading && <Skeleton className="h-4 w-32" />
                                                        )}
                                                        {result.verificationLink ? (
                                                            <div className="col-span-full text-sm text-muted-foreground mt-2">
                                                                <a href={result.verificationLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-semibold">Verify Grades (Ladok)</a>
                                                            </div>
                                                        ) : (
                                                            isLoading && <Skeleton className="h-4 w-48" />
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