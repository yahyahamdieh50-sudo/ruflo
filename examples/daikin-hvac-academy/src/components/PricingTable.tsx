"use client";
import { useState } from "react";
import Link from "next/link";
import { checkoutAction } from "@/app/actions/billing";

interface PlanView { code: "basic" | "pro"; interval: "month" | "year"; cents: number }
interface Props {
  plans: PlanView[]; aedRate: number; stripeReady: boolean; loggedIn: boolean; hasSubscription: boolean; current: "free" | "basic" | "pro";
  features: Record<"free" | "basic" | "pro", string[]>;
  labels: Record<string, string>;
}

const fmtUsd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
const fmtAed = (c: number, r: number) => `AED ${((c / 100) * r).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PricingTable({ plans, aedRate, stripeReady, loggedIn, hasSubscription, current, features, labels: L }: Props) {
  const hasYear = plans.some((p) => p.interval === "year");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [cur, setCur] = useState<"USD" | "AED">("USD");
  const price = (code: "basic" | "pro") => plans.find((p) => p.code === code && p.interval === interval);

  const Card = ({ code }: { code: "free" | "basic" | "pro" }) => {
    const p = code === "free" ? null : price(code);
    const isCur = current === code;
    return (
      <div className={`card flex flex-col p-6 ${code === "pro" ? "border-accent ring-2 ring-accent" : ""}`}>
        {code === "pro" && <span className="tag mb-2 w-fit bg-accent text-white">{L.popular}</span>}
        <h3 className="text-xl font-extrabold text-navy-900">{L[code]}</h3>
        <p className="mt-3 text-4xl font-extrabold text-navy-900">{code === "free" ? (cur === "USD" ? "$0" : "AED 0") : p ? (cur === "USD" ? fmtUsd(p.cents) : fmtAed(p.cents, aedRate)) : "—"}
          {p && <span className="text-sm font-semibold text-steel-500"> / {interval === "year" ? L.year : L.month}</span>}</p>
        {p && cur === "AED" && <p className="text-xs text-steel-500">{fmtUsd(p.cents)} {L.billed_usd}</p>}
        <ul className="mt-5 flex-1 space-y-2 text-sm text-steel-700">{features[code].map((f) => <li key={f}>✓ {f}</li>)}</ul>
        <div className="mt-6">
          {code === "free" ? (loggedIn ? <span className="btn-outline w-full cursor-default">{isCur ? L.current : L.included}</span> : <Link href="/signup" className="btn-outline w-full">{L.signup}</Link>)
            : isCur ? <span className="btn-outline w-full cursor-default">{L.current}</span>
            : !p ? <span className="btn-outline w-full opacity-50">{L.unavailable}</span>
            : hasSubscription ? <Link href="/dashboard/billing" className="btn-navy w-full">{L.manage}</Link>
            : (
              <form action={checkoutAction} className="space-y-2">
                <input type="hidden" name="plan" value={code} /><input type="hidden" name="interval" value={interval} />
                <input name="promo" className="input" placeholder={L.promo} maxLength={32} aria-label={L.promo} autoComplete="off" />
                <button className={code === "pro" ? "btn-primary w-full" : "btn-navy w-full"} disabled={!stripeReady}>{L.subscribe}</button>
                {!stripeReady && <p className="text-xs text-amber-700">{L.stripe_off}</p>}
              </form>)}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
        {hasYear && <div role="group" aria-label={L.billing} className="inline-flex overflow-hidden rounded border border-steel-300 bg-white text-sm font-bold">
          {(["month", "year"] as const).map((i) => <button key={i} onClick={() => setInterval(i)} aria-pressed={interval === i} className={`px-4 py-2 ${interval === i ? "bg-navy-800 text-white" : "text-navy-800"}`}>{i === "month" ? L.monthly : L.yearly}</button>)}</div>}
        <div role="group" aria-label="Currency" className="inline-flex overflow-hidden rounded border border-steel-300 bg-white text-sm font-bold">
          {(["USD", "AED"] as const).map((c) => <button key={c} onClick={() => setCur(c)} aria-pressed={cur === c} className={`px-4 py-2 ${cur === c ? "bg-navy-800 text-white" : "text-navy-800"}`}>{c}</button>)}</div>
      </div>
      <div className="grid gap-6 md:grid-cols-3"><Card code="free" /><Card code="basic" /><Card code="pro" /></div>
      <p className="mt-6 text-center text-xs text-steel-500">{L.aed_note}</p>
    </div>
  );
}
