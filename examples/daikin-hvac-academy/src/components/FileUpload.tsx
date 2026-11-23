"use client";
import { useState } from "react";
import { attachAssetAction } from "@/app/actions/admin";

type Purpose = "lesson_video" | "trailer" | "subtitle" | "resource";

/** Uploads straight to storage via a server-issued target, then records the key server-side. */
export function FileUpload({ purpose, ownerId, courseId, lang, accept, label, done }: {
  purpose: Purpose; ownerId: string; courseId?: string; lang?: "en" | "ar"; accept: string; label: string; done: string;
}) {
  const [state, setState] = useState<"idle" | "up" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setState("up"); setMsg(`${f.name} …`);
    try {
      const t = await fetch("/api/admin/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purpose, filename: f.name, ownerId }) });
      if (!t.ok) throw new Error(await t.text());
      const target = (await t.json()) as { url: string; method: "PUT"; headers: Record<string, string>; key: string };
      const up = await fetch(target.url, { method: target.method, headers: target.headers, body: f });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      const r = await attachAssetAction({ purpose, ownerId, key: target.key, courseId, lang });
      if (!r.ok) throw new Error("Could not attach file");
      setState("ok"); setMsg(done);
    } catch (x) { setState("err"); setMsg((x as Error).message.slice(0, 160)); }
  }
  return (
    <div className="text-sm"><label className="label">{label}</label>
      <input type="file" accept={accept} onChange={onFile} disabled={state === "up"} className="block w-full text-xs file:me-3 file:rounded file:border-0 file:bg-navy-800 file:px-3 file:py-2 file:text-white" />
      {msg && <p role="status" className={`mt-1 text-xs ${state === "err" ? "text-red-700" : state === "ok" ? "text-emerald-700" : "text-steel-500"}`}>{msg}</p>}</div>
  );
}
