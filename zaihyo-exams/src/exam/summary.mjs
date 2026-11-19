// 教材構造の要約（件数と、小問ごとの対応付けの一覧）。教材の原文は答えの先頭だけ短く出す。

export function summarizeExam(structure) {
  const qs = structure.nodes.filter((n) => (n.kind === "shomon" || n.kind === "edamon") && n.children.length === 0);
  const count = (pred) => qs.filter(pred).length;
  const forms = {};
  for (const q of qs) {
    const k = q.formCandidates.map((c) => c.form + (c.count ? `(${c.count})` : "")).join("+") || "unknown";
    forms[k] = (forms[k] ?? 0) + 1;
  }
  const unresolved = {};
  for (const u of structure.unresolved) unresolved[u.reason] = (unresolved[u.reason] ?? 0) + 1;
  return {
    set: structure.set.id,
    documents: structure.documents.map((d) => ({ docId: d.docId, pages: d.pageCount, watermarkLinesRemoved: d.watermarkLinesRemoved })),
    counts: {
      daimon: structure.nodes.filter((n) => n.kind === "daimon").length,
      toi: structure.nodes.filter((n) => n.kind === "toi").length,
      questions: qs.length,
      withAnswer: count((q) => q.answer),
      withGuidance: count((q) => q.guidance || parentHasGuidance(structure, q)),
      slots: qs.reduce((a, q) => a + (q.answer ? q.answer.segments.filter((s) => s.type === "slot").length : 0), 0),
    },
    forms,
    unresolved,
    diag: structure.diag.length,
    questions: qs.map((q) => ({
      id: q.id,
      forms: q.formCandidates.map((c) => c.form),
      options: q.options.length,
      wordBank: q.wordBank ? q.wordBank.entries.length : 0,
      blanksInPassage: q.blankLabels.length,
      slots: q.answer ? q.answer.segments.filter((s) => s.type === "slot").map((s) => `${s.label ?? "·"}=${short(s.text)}`) : null,
      guidanceBlocks: (q.guidance ?? []).length,
      optionJudgements: (q.guidance ?? []).reduce((a, b) => a + b.optionJudgements.length, 0),
    })),
  };
}

function parentHasGuidance(structure, q) {
  const p = structure.nodes.find((n) => n.id === q.parent);
  return !!p?.guidance;
}

function short(t) {
  return t.length > 12 ? t.slice(0, 12) + "…" : t;
}
