"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useModelConfig } from "@/lib/model-config";

export default function SettingsPage() {
  const [modelConfig, setModelConfig] = useModelConfig();

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>
      
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Model Configuration</CardTitle>
            <CardDescription>
              Configure how the AI model processes and responds to your requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="reasoning-effort">Reasoning Effort</Label>
                <Select
                  value={modelConfig.reasoning.effort}
                  onValueChange={(value: "minimal" | "low" | "medium" | "high") =>
                    setModelConfig({
                      ...modelConfig,
                      reasoning: { ...modelConfig.reasoning, effort: value },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select reasoning effort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Reasoning Effort</SelectLabel>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  Controls how much computational effort the model puts into reasoning. Higher effort may provide more detailed analysis.
                </p>
              </div>



              <div className="space-y-2">
                <Label htmlFor="text-verbosity">Text Verbosity</Label>
                <Select
                  value={modelConfig.text.verbosity}
                  onValueChange={(value: "low" | "medium" | "high") =>
                    setModelConfig({
                      ...modelConfig,
                      text: { ...modelConfig.text, verbosity: value },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select verbosity level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Verbosity Level</SelectLabel>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  Controls how concise or verbose the model&apos;s text output will be.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Environment Configuration</CardTitle>
            <CardDescription>
              Configure environment variables via Azure App Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This section is a placeholder for environment-specific configurations.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}


