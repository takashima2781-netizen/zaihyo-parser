// Knowledge Master v0.4.0-draft 限定プロトタイプ実行CLI。
// 対象: output/intermediate_full_scan.json のテーマ4（資産会計）のみ。
// docs/knowledge_master_prototype_plan.md 参照。
// Parser本体（src/parser）・既存CSV Exporter（src/exporter）・HTMLアプリ（reference/current_app）には
// 一切接続しない。output/intermediate_full_scan.json を読み込むだけの独立したCLIである。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { convertBookToKnowledgeMaster } from "../knowledgeMaster/convert.mjs";
import { validateKnowledgeMaster } from "../knowledgeMaster/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function main() {
  const corpusPath = path.join(ROOT, "output/intermediate_full_scan.json");
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const book = corpus.books[0];

  const theme4 = book.groups.find((g) => g.parsed?.kind === "theme" && g.parsed?.no === 4);
  if (!theme4) {
    throw new Error("テーマ4（parsed.kind==='theme' && parsed.no===4）がbook.groups内に見つからない");
  }

  // テーマ4のみを含む一時的なBookを組み立てる。convert.mjs/validate.mjs自体はテーマに限定されない
  // 汎用実装であり、対象範囲の絞り込みはこのCLI側の責務とする（docs/knowledge_master_prototype_plan.md 1章）。
  const theme4Book = { ...book, groups: [theme4] };

  const km = convertBookToKnowledgeMaster(theme4Book, {
    schemaVersion: corpus.meta.schemaVersion,
    builtBy: "knowledge-master-converter-prototype-v0.2-theme4",
  });

  const validationIssues = validateKnowledgeMaster(theme4Book, km);
  const validationByCheck = {};
  for (const v of validationIssues) validationByCheck[v.check] = (validationByCheck[v.check] ?? 0) + 1;

  const summary = {
    themeId: theme4.id,
    themeTitle: theme4.parsed?.title ?? null,
    sourceCount: km.sources.length,
    evidenceCount: km.evidence.length,
    answerUnitCount: km.answerUnits.length,
    questionCount: km.questions.length,
    unresolvedCount: km.meta.unresolved.length,
    validationIssueCount: validationIssues.length,
    validationByCheck,
  };

  console.log("=== Knowledge Master テーマ4プロトタイプ ===");
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "knowledge_master_theme4.json"), JSON.stringify(km, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "knowledge_master_theme4_validation.json"),
    JSON.stringify({ summary, issues: validationIssues }, null, 2),
    "utf8"
  );
  console.log("wrote: output/knowledge_master_theme4.json");
  console.log("wrote: output/knowledge_master_theme4_validation.json");
}

main();
