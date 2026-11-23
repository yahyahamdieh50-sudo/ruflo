"use client";
import { useState } from "react";

interface Cite { n: number; title: string; ref: string; excerpt: string }
interface Ans { mode: string; answer: string; citations: Cite[]; warnings: string[] }

export function AssistantChat({ L }: { L: Record<string, string> }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Ans | null>(null); const [err, setErr] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setA(null);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
      if (!r.ok) throw new Error(r.status === 401 ? L.signin : r.status === 429 ? L.rate : L.error);
      setA(await r.json());
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <div>
      <form onSubmit={ask} className="flex flex-col gap-3 sm:flex-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input" minLength={3} maxLength={500} required placeholder={L.placeholder} aria-label={L.placeholder} />
        <button className="btn-primary sm:w-40" disabled={busy}>{busy ? "…" : L.ask}</button>
      </form>
      {err && <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm font-semibold text-red-700">{err}</p>}
      {a && (
        <div className="mt-6 space-y-4" aria-live="polite">
          <div className="card p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-steel-500">{a.mode === "generated" ? L.mode_generated : a.mode === "extractive" ? L.mode_extractive : ""}</p>
            {a.mode === "no_match" ? <p className="mt-2 font-semibold text-amber-800">{L.no_match}</p> : <p className="mt-2 whitespace-pre-line text-steel-800">{a.answer}</p>}
          </div>
          {a.warnings.filter((w) => w !== "no_match").map((w) => (
            <p key={w} className={`rounded border p-3 text-sm ${w === "ai_disclaimer" ? "border-steel-200 bg-steel-50 text-steel-600" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{w === "model_specific" ? "⚠ " : w === "hazard" ? "⛑ " : ""}{L[`w_${w}`]}</p>))}
          {a.citations.length > 0 && <div className="card p-5"><h3 className="font-bold text-navy-900">{L.sources}</h3>
            <ol className="mt-3 space-y-3 text-sm">{a.citations.map((c) => <li key={c.n}><b>[{c.n}] {c.title}</b> <span className="text-steel-500">— {c.ref}</span><p className="mt-1 text-steel-600">{c.excerpt}</p></li>)}</ol></div>}
        </div>)}
    </div>
  );
}
