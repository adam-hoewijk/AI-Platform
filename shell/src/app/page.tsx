"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="container mx-auto p-6 max-w-6xl">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Platform</h1>
          <p className="text-sm text-muted-foreground">Reusable AI-powered tools for consulting workflows</p>
        </div>
        <nav>
          <Button asChild variant="outline">
            <Link href="/settings">Settings</Link>
          </Button>
        </nav>
      </header>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="extract">Extractor</TabsTrigger>
          <TabsTrigger value="summarize">Summarizer</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>LLM Chat</CardTitle>
              <CardDescription>Talk to your Azure OpenAI model</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">Placeholder chat. Go to <Link className="underline" href="/use-cases/chat">full chat</Link>.</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extract" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Extractor</CardTitle>
              <CardDescription>Pull structured data from text</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">Placeholder extractor. See <Link className="underline" href="/use-cases/extractor">details</Link>.</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summarize" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Summarizer</CardTitle>
              <CardDescription>Summarize documents and notes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">Placeholder summarizer. See <Link className="underline" href="/use-cases/summarizer">details</Link>.</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
