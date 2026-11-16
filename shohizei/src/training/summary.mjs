// トレーニングの教材構造の集計（原文は含めない。件数と理由の名前だけ）。

export function summarizeTraining(structure) {
  const problems = structure.children.flatMap((s) => s.children);
  const count = (pred) => problems.filter(pred).length;
  const forms = {};
  for (const p of problems) {
    for (const f of p.question?.formCandidates ?? [{ form: "no-question" }]) forms[f.form] = (forms[f.form] ?? 0) + 1;
  }
  const reasons = {};
  const addReason = (r) => (reasons[r] = (reasons[r] ?? 0) + 1);
  for (const u of structure.unresolved) addReason(u.reason);
  for (const p of problems) for (const u of p.unresolved) addReason(u.reason);

  let fractionsRestored = 0;
  let judgements = 0;
  let blanks = 0;
  for (const p of problems) {
    for (const l of [...(p.answer?.lines ?? []), ...(p.guidance?.lines ?? []), ...(p.question?.lines ?? [])]) {
      fractionsRestored += (l.segments ?? []).filter((s) => s.kind === "fraction").length;
      if (l.judgement) judgements += 1;
      if (l.blanks) blanks += l.blanks.length;
    }
  }
  return {
    bookId: structure.meta.bookId,
    sessions: structure.children.length,
    problems: problems.length,
    withQuestion: count((p) => p.question),
    withAnswer: count((p) => p.answer),
    withGuidance: count((p) => p.guidance),
    withSheet: count((p) => p.sheetRef),
    levelUnknown: count((p) => p.parsed.levelRaw === "unknown"),
    timeUnknown: count((p) => p.parsed.timeRaw === "unknown"),
    questionFormCandidates: forms,
    fractionsRestored,
    judgementLines: judgements,
    blanks,
    unresolvedByReason: reasons,
    watermarkLinesRemoved: Object.fromEntries(structure.meta.documents.map((d) => [d.docId, d.diag.watermarkLinesRemoved])),
  };
}
