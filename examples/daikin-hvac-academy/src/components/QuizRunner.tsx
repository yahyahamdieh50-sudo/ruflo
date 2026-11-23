"use client";
import { useState, useTransition } from "react";
import { submitQuizAction } from "@/app/actions/learning";
import type { QuizOutcome } from "@/lib/learning";

interface Q { id: string; prompt: string; options: string[] }
interface Labels { submit: string; retake: string; passed: string; failed: string; score: string; passmark: string; correct: string; incorrect: string; answerAll: string; why: string; cert: string; error: string }

export function QuizRunner({ quizId, questions, labels, explanations, certBase }: {
  quizId: string; questions: Q[]; labels: Labels; explanations?: undefined; certBase: string;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizOutcome | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  void explanations;

  const submit = () => {
    if (Object.keys(answers).length < questions.length) { setErr(labels.answerAll); return; }
    setErr(null);
    start(async () => {
      const r = await submitQuizAction(quizId, answers);
      if ("error" in r) setErr(labels.error); else { setResult(r); window.scrollTo({ top: 0, behavior: "smooth" }); }
    });
  };

  return (
    <div>
      {result && (
        <div role="status" className={`card mb-6 p-6 ${result.passed ? "border-emerald-400 bg-emerald-50" : "border-amber-400 bg-amber-50"}`}>
          <p className="text-2xl font-extrabold">{result.passed ? labels.passed : labels.failed}</p>
          <p className="mt-1">{labels.score}: <b>{result.scorePct}%</b> · {labels.passmark}: {result.passMark}%</p>
          {result.certificateNumber && <p className="mt-3"><a className="btn-primary btn-sm" href={`${certBase}/${result.certificateNumber}`}>{labels.cert} {result.certificateNumber}</a></p>}
          <button className="btn-outline btn-sm mt-4" onClick={() => { setResult(null); setAnswers({}); }}>{labels.retake}</button>
        </div>
      )}
      <ol className="space-y-5">
        {questions.map((q, qi) => {
          const rv = result?.review.find((r) => r.id === q.id);
          return (
            <li key={q.id} className="card p-5">
              <fieldset disabled={!!result}>
                <legend className="font-semibold text-navy-900">{qi + 1}. {q.prompt}</legend>
                <div className="mt-3 space-y-2">
                  {q.options.map((o, oi) => {
                    const chosen = answers[q.id] === oi;
                    const mark = rv ? (oi === rv.correctIndex ? "border-emerald-500 bg-emerald-50" : chosen ? "border-red-400 bg-red-50" : "") : chosen ? "border-accent bg-navy-50" : "";
                    return (
                      <label key={oi} className={`flex cursor-pointer items-start gap-3 rounded border border-steel-200 px-3 py-2.5 text-sm ${mark}`}>
                        <input type="radio" name={q.id} className="mt-0.5" checked={chosen} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />
                        <span>{o}</span>
                      </label>);
                  })}
                </div>
              </fieldset>
              {rv && <p className={`mt-3 text-sm ${rv.correct ? "text-emerald-700" : "text-red-700"}`}><b>{rv.correct ? labels.correct : labels.incorrect}</b>{rv.explanation_en ? ` — ${labels.why}: ${rv.explanation_en}` : ""}</p>}
            </li>);
        })}
      </ol>
      {!result && (<div className="mt-6">{err && <p role="alert" className="mb-3 text-sm font-semibold text-red-700">{err}</p>}<button className="btn-primary" onClick={submit} disabled={pending}>{pending ? "…" : labels.submit}</button></div>)}
    </div>
  );
}
