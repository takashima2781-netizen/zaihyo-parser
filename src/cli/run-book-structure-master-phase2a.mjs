// Book Structure Master Phase 2A 実行CLI。
// Intermediate JSONから、明示的に選定した4 CheckBlock（Phase 1の6パターンに対応）のみを対象に
// Book Structure Masterを自動生成し、検証する。
// Intermediate JSONは読み取り専用の入力として扱う。Parser・Intermediate JSON生成処理・
// Knowledge Master・CSV Bridge・HTMLアプリのいずれも変更しない。全1,121 Itemへの一括変換は行わない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildBookStructureMasterPhase2A } from "../bookStructureMaster/buildBookStructureMaster.mjs";
import { validateBookStructureMasterPhase2A } from "../bookStructureMaster/validator.mjs";
import { PHASE2A_TARGET_CHECKBLOCK_IDS } from "../bookStructureMaster/selectors.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function collectAllItems(groups) {
  const items = new Map();
  function walk(g) {
    for (const cb of g.checkBlocks) for (const q of cb.questions) for (const it of q.items) items.set(it.id, it);
    for (const c of g.children) walk(c);
  }
  for (const g of groups) walk(g);
  return items;
}

function main() {
  const corpusPath = path.join(ROOT, "output/intermediate_full_scan.json");
  const corpusRaw = readFileSync(corpusPath, "utf8");
  const corpus = JSON.parse(corpusRaw);

  console.log("=== Step A: 対象CheckBlockを選定しBook Structure Masterを生成 ===");
  const { bsm, targetCheckBlockIds, targetItemIds } = buildBookStructureMasterPhase2A(corpus, {
    targetCheckBlockIds: PHASE2A_TARGET_CHECKBLOCK_IDS,
  });

  console.log("対象CheckBlock:", targetCheckBlockIds);
  console.log("対象Item数:", targetItemIds.length, targetItemIds);

  console.log("=== Step B: 検証 ===");
  const allItems = collectAllItems(corpus.books[0].groups);
  const itemsById = new Map(targetItemIds.map((id) => [id, allItems.get(id)]));
  const issues = validateBookStructureMasterPhase2A(bsm, { itemsById });

  const byCheck = {};
  for (const issue of issues) byCheck[issue.check] = (byCheck[issue.check] ?? 0) + 1;

  // 元Intermediate JSONへの書き込みがないことの確認（読み取り専用であることの裏付け）
  const corpusRawAfter = readFileSync(corpusPath, "utf8");
  const sourceUnchanged = corpusRawAfter === corpusRaw;

  const summary = {
    targetCheckBlockCount: targetCheckBlockIds.length,
    targetCheckBlockIds,
    targetItemCount: targetItemIds.length,
    targetItemIds,
    issueCount: issues.length,
    issuesByCheck: byCheck,
    intermediateJsonUnchanged: sourceUnchanged,
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "book_structure_master_phase2a.json"), JSON.stringify(bsm, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "book_structure_master_phase2a_validation.json"),
    JSON.stringify({ summary, issues }, null, 2),
    "utf8"
  );
  console.log("wrote: output/book_structure_master_phase2a.json");
  console.log("wrote: output/book_structure_master_phase2a_validation.json");
}

main();
