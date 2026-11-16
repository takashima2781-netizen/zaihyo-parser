// 理論ドクターを抽出して教材構造を作り、output/ に書き出す。
// 使い方: node src/cli/run-doctor.mjs   （input/pdf/theory-doctor.pdf を読む）

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDocument } from "../extract/extract.mjs";
import { buildDoctor } from "../doctor/buildDoctor.mjs";
import { runGateChecks } from "../gateChecks/gateChecks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const bookId = "theory-doctor";
const pdf = path.join(root, "input", "pdf", `${bookId}.pdf`);
if (!existsSync(pdf)) {
  console.error(`見つかりません: ${pdf}`);
  process.exit(1);
}
const doc = await extractDocument(pdf, "all", bookId);
const structure = buildDoctor({ bookId, doc });
const gate = runGateChecks(structure);
if (!gate.ok) {
  console.error("検査に失敗したため書き出しません:");
  for (const v of gate.violations.slice(0, 20)) console.error(" -", v);
  process.exit(1);
}
const byChapter = {};
const labels = {};
for (const p of structure.children) {
  byChapter[p.parsed.chapter] = (byChapter[p.parsed.chapter] ?? 0) + 1;
  if (p.parsed.labelRaw) labels[p.parsed.labelRaw] = (labels[p.parsed.labelRaw] ?? 0) + 1;
}
const reasons = {};
for (const u of structure.unresolved) reasons[u.reason] = (reasons[u.reason] ?? 0) + 1;
const summary = {
  bookId,
  problems: structure.children.length,
  byChapter,
  labels,
  withoutAnswer: structure.children.filter((p) => p.answer.length === 0).length,
  withExplanation: structure.children.filter((p) => p.explanation.length > 0).length,
  themeUnknown: structure.children.filter((p) => p.parsed.chapter === 1 && p.parsed.themeNo === "unknown").length,
  unplacedLineCount: structure.unplacedLineCount,
  unresolvedByReason: reasons,
  watermarkLinesRemoved: doc.diag.watermarkLinesRemoved,
};
mkdirSync(path.join(root, "output"), { recursive: true });
writeFileSync(path.join(root, "output", `${bookId}.structure.json`), JSON.stringify(structure, null, 2));
writeFileSync(path.join(root, "output", `${bookId}.summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
