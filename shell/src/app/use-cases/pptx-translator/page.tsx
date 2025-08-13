"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export default function PptxTranslatorPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");

  async function submit() {
    if (!file) {
      toast.error("Please upload a PPTX file");
      return;
    }
    if (!lang) {
      toast.error("Please select a target language");
      return;
    }
    try {
      setLoading(true);
      setProgress(0);
      setProgressMessage("Preparing translation...");
      
      const fd = new FormData();
      fd.set("file", file);
      fd.set("targetLang", lang);
      
      const res = await fetch("/api/pptx/translate", { method: "POST", body: fd });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      
      setProgress(50);
      setProgressMessage("Processing translation...");
      
      const blob = await res.blob();
      
      setProgress(75);
      setProgressMessage("Preparing download...");
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = file.name.replace(/\.pptx$/i, "");
      a.download = `${base}.${lang}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      
      setProgress(100);
      setProgressMessage("Translation complete!");
      
      toast.success("Translated PPTX downloaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setLoading(false);
      // Reset progress after a delay
      setTimeout(() => {
        setProgress(0);
        setProgressMessage("");
      }, 2000);
    }
  }

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>PPTX Translator</CardTitle>
          <CardDescription>Translate slides while preserving formatting and layout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3">
            <Label>Upload PPTX</Label>
            <Input ref={fileRef} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="grid gap-3">
            <Label>Target language</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="English">English</SelectItem>
                <SelectItem value="Dutch">Dutch</SelectItem>
                <SelectItem value="German">German</SelectItem>
                <SelectItem value="French">French</SelectItem>
                <SelectItem value="Spanish">Spanish</SelectItem>
                <SelectItem value="Italian">Italian</SelectItem>
                <SelectItem value="Portuguese">Portuguese</SelectItem>
                <SelectItem value="Swedish">Swedish</SelectItem>
                <SelectItem value="Japanese">Japanese</SelectItem>
                <SelectItem value="Korean">Korean</SelectItem>
                <SelectItem value="Chinese (Simplified)">Chinese (Simplified)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{progressMessage}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={submit} disabled={loading}>
            {loading ? "Translating..." : "Translate & Download"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}



