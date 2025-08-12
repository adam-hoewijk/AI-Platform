"use client";

import Link from "next/link";
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

      <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            href: "/use-cases/chat",
            title: "Chat",
            description: "Talk to your Azure OpenAI model",
          },
          {
            href: "/use-cases/extractor",
            title: "Extractor",
            description: "Pull structured data from text",
          },
          {
            href: "/use-cases/logistics",
            title: "Logistics",
            description: "Optimize routes, loads, and schedules",
          },
        ].map((app) => (
          <Link key={app.href} href={app.href} className="group block" aria-label={app.title}>
            <Card className="h-full aspect-square rounded-xl transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">{app.title}</CardTitle>
                <CardDescription>{app.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}
