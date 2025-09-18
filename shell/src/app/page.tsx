"use client";

import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, FileText, Truck } from "lucide-react";

export default function Home() {
  return (
    <main className="container mx-auto p-6 max-w-6xl">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">AI Platform</h1>
        <p className="text-lg text-muted-foreground mb-4">Reusable AI-powered tools for consulting workflows</p>
        <Button asChild variant="outline">
          <Link href="/settings">Settings</Link>
        </Button>
      </header>

      <section className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            href: "/use-cases/chat",
            title: "Chat",
            description: "Talk to your Azure OpenAI model",
            icon: MessageSquare,
          },
          {
            href: "/use-cases/extractor",
            title: "Extractor",
            description: "Pull structured data from text",
            icon: FileText,
          },
          {
            href: "/use-cases/logistics",
            title: "Logistics",
            description: "Optimize routes, loads, and schedules",
            icon: Truck,
          },
        ].map((app) => {
          const IconComponent = app.icon;
          return (
            <Link key={app.href} href={app.href} className="group block" aria-label={app.title}>
              <Card className="h-full aspect-[4/3] rounded-xl transition-colors group-hover:bg-muted/50">
                <CardHeader className="text-center">
                  <div className="flex justify-center mb-3">
                    <IconComponent className="h-8 w-8 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <CardTitle className="text-lg">{app.title}</CardTitle>
                  <CardDescription>{app.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
