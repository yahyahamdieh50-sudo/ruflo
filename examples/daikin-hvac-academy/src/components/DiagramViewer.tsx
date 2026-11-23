"use client";
import { useState } from "react";
import { ChillerSchematic } from "./EquipmentArt";

export interface DiagramProps {
  hotspots: { id: string; x: number; y: number; label: string; detail: string }[];
  caption: string; verified: boolean; title: string; badge: string; hint: string;
}

export function DiagramViewer({ hotspots, caption, verified, title, badge, hint }: DiagramProps) {
  const [active, setActive] = useState<string | null>(null);
  const cur = hotspots.find((h) => h.id === active);
  return (
    <section className="card my-6 overflow-hidden" aria-label={title}>
      <div className="flex items-center justify-between border-b border-steel-200 px-5 py-3">
        <h2 className="text-lg font-bold text-navy-900">{title}</h2>
        <span className={`tag ${verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{badge}</span>
      </div>
      <div className="grid md:grid-cols-[3fr_2fr]">
        <div className="relative aspect-[5/4] bg-steel-50">
          <ChillerSchematic />
          {hotspots.map((h) => (
            <button key={h.id} type="button" onClick={() => setActive(h.id === active ? null : h.id)} aria-pressed={h.id === active} aria-label={h.label}
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
              className={`absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${h.id === active ? "scale-125 bg-red-600" : "bg-accent hover:bg-accent-dark"}`}>
              {hotspots.indexOf(h) + 1}
            </button>
          ))}
        </div>
        <div className="p-5 text-sm">
          {cur ? <><p className="text-base font-bold text-navy-900">{cur.label}</p><p className="mt-2 text-steel-700">{cur.detail}</p></> : <p className="text-steel-500">{hint}</p>}
          <ul className="mt-4 space-y-1">{hotspots.map((h, i) => (
            <li key={h.id}><button type="button" onClick={() => setActive(h.id)} className={`w-full rounded px-2 py-1 text-start ${h.id === active ? "bg-navy-50 font-semibold" : "hover:bg-steel-100"}`}>{i + 1}. {h.label}</button></li>))}</ul>
        </div>
      </div>
      <p className="border-t border-steel-200 bg-steel-50 px-5 py-2 text-xs text-steel-600">{caption}</p>
    </section>
  );
}
