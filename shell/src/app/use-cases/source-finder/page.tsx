"use client";
import { useState } from "react";

export default function SourceFinderPage() {
  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState<{ url: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch() {
    setLoading(true);
    setError("");
    setSources([]);
    try {
      const res = await fetch("/api/source-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSources(data.sources || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container mx-auto p-6 max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Source Finder</h1>
      <p className="text-sm text-muted-foreground">Enter a question to find web sources that may answer it.</p>
      <div className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Type your question..."
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={handleSearch}
          disabled={loading || !question.trim()}
        >
          {loading ? "Searching..." : "Find Sources"}
        </button>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <ul className="space-y-2 mt-4">
        {sources.map((s, i) => (
          <li key={i} className="border rounded p-3">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">
              {s.title}
            </a>
            <div className="text-xs text-muted-foreground break-all">{s.url}</div>
          </li>
        ))}
        {(!loading && sources.length === 0 && question) && (
          <li className="text-muted-foreground">No sources found.</li>
        )}
      </ul>
    </main>
  );
}
