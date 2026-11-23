import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-extrabold text-navy-900">{title}</h1>
        {sub && <p className="mt-1 text-sm text-steel-600">{sub}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-steel-100 pt-4 text-center text-sm text-steel-600">{footer}</div>}
      </div>
    </div>
  );
}
export const Field = ({ id, label, ...p }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div><label className="label" htmlFor={id}>{label}</label><input id={id} name={id} className="input" {...p} /></div>
);
export const Alert = ({ kind = "error", children }: { kind?: "error" | "ok" | "info"; children: ReactNode }) => (
  <p role={kind === "error" ? "alert" : "status"} className={`mb-4 rounded p-3 text-sm font-semibold ${kind === "error" ? "bg-red-50 text-red-700" : kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-navy-50 text-navy-800"}`}>{children}</p>
);
export { Link };
