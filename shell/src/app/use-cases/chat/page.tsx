"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export default function ChatUseCasePage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSend() {
    if (!input.trim()) return;
    const userMessage = { role: "user" as const, content: input };
    setMessages((m) => [...m, userMessage]);
    setInput("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { role: "assistant"; content: string };
      setMessages((m) => [...m, data]);
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to get response from model");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <Toaster />
      <Card>
        <CardHeader>
          <CardTitle>Chat</CardTitle>
          <CardDescription>Converse with your Azure OpenAI model</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="messages">Messages</Label>
              <div id="messages" className="border rounded-md p-4 h-80 overflow-auto space-y-3 bg-muted/30">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">Start the conversation below.</p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-semibold mr-2">{m.role === "user" ? "You" : "Assistant"}:</span>
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="input">Your message</Label>
              <Textarea
                id="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask something..."
                rows={3}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => setMessages([])} disabled={isLoading}>
            Clear
          </Button>
          <Button onClick={handleSend} disabled={isLoading}>
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}


