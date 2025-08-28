"use client";

import React, { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Toaster, toast } from "sonner";
import { Dropzone } from "@/components/ui/dropzone";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { TrashIcon } from "@radix-ui/react-icons";
import { isArrayOfStrings } from "@/lib/utils";

type TenderRequirement = {
    text: string;
    source: string;
    checked: boolean;
};

type TenderResult = {
    mandatoryRequirements: TenderRequirement[];
    technicalRequirements: TenderRequirement[];
    desirableFeatures: TenderRequirement[];
    commercialConsiderations: TenderRequirement[];
    evaluationCriteria: TenderRequirement[];
};

const initialState: TenderResult = {
    mandatoryRequirements: [],
    technicalRequirements: [],
    desirableFeatures: [],
    commercialConsiderations: [],
    evaluationCriteria: [],
};

export default function TenderAnalyzerPage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<TenderResult>(initialState);

    async function handleFile(files: File[]) {
        if (!files || files.length === 0) return;
        
        const isFirstLoad = !Object.values(results).some(arr => arr.length > 0);
        if (isFirstLoad) {
            setIsLoading(true);
        } else {
            setIsProcessing(true);
        }

        const newResults = { ...results };

        try {
            const promises = files.map(async (file) => {
                const form = new FormData();
                form.append("file", file);
                
                const existingTexts = Object.fromEntries(
                    Object.keys(results).map(key => [key, results[key as keyof TenderResult].map(req => req.text)])
                );
                form.append("existingRequirements", JSON.stringify(existingTexts));

                const res = await fetch("/api/tender", {
                    method: "POST",
                    body: form,
                });

                if (!res.ok) {
                    toast.error(`Failed to process ${file.name}`);
                    return null;
                }
                const json = await res.json();
                return { json, fileName: file.name };
            });

            const settledResults = await Promise.all(promises);

            for (const result of settledResults) {
                if (!result) continue;
                const { json, fileName } = result;
                
                const allCategories: (keyof TenderResult)[] = [
                    "mandatoryRequirements",
                    "technicalRequirements",
                    "desirableFeatures",
                    "commercialConsiderations",
                    "evaluationCriteria",
                ];

                for (const category of allCategories) {
                    if (isArrayOfStrings(json[category])) {
                        for (const text of json[category]) {
                            newResults[category].push({ text, source: fileName, checked: false });
                        }
                    }
                }
            }

            setResults(newResults);
        } catch (err) {
            console.error(err);
            toast.error("An error occurred while processing files.");
        } finally {
            setIsLoading(false);
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    function handleToggle(category: keyof TenderResult, itemIndex: number) {
        setResults(prev => {
            const newCategory = [...prev[category]];
            newCategory[itemIndex] = { ...newCategory[itemIndex], checked: !newCategory[itemIndex].checked };
            return { ...prev, [category]: newCategory };
        });
    }

    function handleDelete(category: keyof TenderResult, itemIndex: number) {
        setResults(prev => {
            const newCategory = prev[category].filter((_, i) => i !== itemIndex);
            return { ...prev, [category]: newCategory };
        });
    }

    function clear() {
        setResults(initialState);
    }
    
    const hasResults = Object.values(results).some(arr => arr.length > 0);

    return (
        <main className="container mx-auto p-6 max-w-3xl">
            <Toaster />
            <Card>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                        <CardTitle className="text-2xl">Tender Document Analyzer</CardTitle>
                        <CardDescription className="text-base">Upload tender documents (PDF, DOCX) to extract and summarize key requirements and evaluation criteria for consulting firms.</CardDescription>
                    </div>
                    <Button variant="outline" onClick={clear} disabled={isLoading || isProcessing || !hasResults}>
                        Clear All
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        <div>
                            <Label className="text-lg">Tender Documents</Label>
                            <div className="mt-2">
                                <Dropzone onFiles={handleFile} maxFiles={5} />
                            </div>
                        </div>

                        <div>
                            <Label className="text-lg">Analysis</Label>
                            <div className="border rounded-md p-6 min-h-[300px] flex flex-col justify-start bg-muted/30 space-y-4">
                                {!hasResults && !isLoading && (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-base text-muted-foreground">No analysis yet. Upload a document to get started.</p>
                                    </div>
                                )}

                                {isLoading && (
                                    <div className="w-full">
                                        <Skeleton className="h-12 w-1/3 mx-auto rounded-md" />
                                        <div className="h-6" />
                                        <Skeleton className="h-24 w-2/3 mx-auto rounded-md" />
                                    </div>
                                )}

                                {!isLoading && hasResults && (
                                    <div className="w-full text-left">
                                        {Object.entries(results).map(([category, items]) => {
                                            const categoryTitle = {
                                                mandatoryRequirements: "Mandatory Requirements",
                                                technicalRequirements: "Technical Requirements",
                                                desirableFeatures: "Desirable Features",
                                                commercialConsiderations: "Commercial Considerations",
                                                evaluationCriteria: "Evaluation Criteria",
                                            }[category];

                                            if (items.length === 0 && !isProcessing) return null;

                                            const groupedItems = items.reduce((acc, item) => {
                                                (acc[item.source] = acc[item.source] || []).push(item);
                                                return acc;
                                            }, {} as Record<string, TenderRequirement[]>);

                                            return (
                                                <div key={category} className="space-y-4 mb-6">
                                                    <h3 className="text-lg font-semibold text-muted-foreground">{categoryTitle}</h3>
                                                    {Object.entries(groupedItems).map(([source, sourceItems]) => (
                                                        <div key={source} className="space-y-2">
                                                            <h4 className="text-md font-medium text-gray-600 dark:text-gray-400">File: {source}</h4>
                                                            <ul className="list-inside space-y-2 text-sm">
                                                                {sourceItems.map((item, index) => {
                                                                    const uniqueId = `${category}-${source}-${index}`;
                                                                    const itemIndex = items.findIndex(i => i === item);

                                                                    return (
                                                                        <li key={uniqueId} className="flex items-start gap-2">
                                                                            <Checkbox
                                                                                id={uniqueId}
                                                                                checked={item.checked}
                                                                                onCheckedChange={() => handleToggle(category as keyof TenderResult, itemIndex)}
                                                                                className="mt-1"
                                                                            />
                                                                            <label htmlFor={uniqueId} className="flex-1 text-sm font-normal cursor-pointer">
                                                                                {item.text}
                                                                            </label>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                onClick={() => handleDelete(category as keyof TenderResult, itemIndex)}
                                                                                className="h-6 w-6 text-muted-foreground hover:text-red-500 transition-colors"
                                                                            >
                                                                                <TrashIcon className="h-4 w-4" />
                                                                            </Button>
                                                                        </li>
                                                                    );
                                                                })}
                                                            </ul>
                                                        </div>
                                                    ))}
                                                    {isProcessing && (
                                                        <Skeleton className="h-8 w-full rounded-md mt-2" />
                                                    )}
                                                    <Separator />
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}