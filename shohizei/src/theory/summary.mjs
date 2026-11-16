// 理論マスターの教材構造の集計（原文は含めない。件数・理由の名前・番号だけ）。

function walk(node, visit) {
  visit(node);
  for (const c of node.children ?? []) walk(c, visit);
}

export function summarizeTheory(structure) {
  const theme = structure.children[0];
  const counts = { theory: 0, heading: 0, supplement: 0, clause: 0, lines: 0 };
  const segRoles = {};
  const frames = { dashed: 0, none: 0 };
  const rankUnknown = [];
  const importanceUnknown = [];
  const theories = [];
  walk(theme, (n) => {
    if (n.kind in counts) counts[n.kind] += 1;
    if (n.kind === "theory") {
      theories.push(n.parsed.code);
      if (n.parsed.rankRaw === "unknown") rankUnknown.push(n.parsed.code);
    }
    if (n.kind === "heading" && n.parsed.importanceRaw === "unknown") importanceUnknown.push(n.id);
    for (const l of n.lines ?? []) {
      counts.lines += 1;
      frames[l.visual.frame] += 1;
      for (const s of l.segments) {
        const k = s.style === "small" ? `small:${s.role}` : "body";
        segRoles[k] = (segRoles[k] ?? 0) + 1;
      }
    }
  });
  const reasons = {};
  for (const u of structure.unresolved) reasons[u.reason] = (reasons[u.reason] ?? 0) + 1;
  return {
    bookId: structure.meta.bookId,
    themeNo: structure.meta.themeNo,
    pages: [structure.meta.pages[0], structure.meta.pages[structure.meta.pages.length - 1]],
    theories,
    counts,
    contentsLines: theme.contents.length,
    rankUnknown,
    headingsWithUnknownImportance: importanceUnknown.length,
    segmentsByStyleRole: segRoles,
    linesByFrame: frames,
    unresolvedByReason: reasons,
    watermarkLinesRemoved: structure.meta.documents[0].diag.watermarkLinesRemoved,
  };
}
