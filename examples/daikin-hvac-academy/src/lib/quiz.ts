export interface GradableQuestion { id: string; correct_index: number }

export interface GradeResult {
  scorePct: number;
  passed: boolean;
  correct: number;
  total: number;
  perQuestion: { id: string; chosen: number | null; correct: boolean }[];
}

/** answers maps question id → chosen option index. Unanswered counts as wrong. */
export function gradeQuiz(questions: GradableQuestion[], answers: Record<string, number>, passMark: number): GradeResult {
  const perQuestion = questions.map((q) => {
    const chosen = Number.isInteger(answers[q.id]) ? answers[q.id] : null;
    return { id: q.id, chosen, correct: chosen === q.correct_index };
  });
  const correct = perQuestion.filter((p) => p.correct).length;
  const total = questions.length;
  const scorePct = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { scorePct, passed: total > 0 && scorePct >= passMark, correct, total, perQuestion };
}
