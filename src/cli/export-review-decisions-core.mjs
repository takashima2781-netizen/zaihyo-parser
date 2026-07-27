// レビューオーバーライドのSSOT分離(2026-07-28)。
//
// output/review_decisions.json(Git管理外、/output/除外規則)は、reasonCode選定の根拠や
// 教材原文の引用を含む自由記述欄(comment/suggestedCorrection)を持つ、人間のレビュー用の
// 完全な記録である。これをそのままGit管理下に置くと、.gitignoreが/output/・/docs/を通じて
// 一貫して避けてきた「教材原文由来データのコミット」を新たに行うことになる
// (86件中74件のcomment/suggestedCorrectionに「」引用が含まれることを確認済み)。
//
// 一方で、パイプラインの再現性(resolveApplicableOverrides、src/review/resolveOverrides.mjs)が
// 実際に必要とするのは、stableItemId・status・contentFingerprintAtReview・
// exerciseViewGeneratorVersionAtReview・bsmSchemaVersionAtReview等の構造化フィールドのみで、
// comment/suggestedCorrectionはロジックに一切使われない(監査用の自由記述)。
//
// そこで、教材原文を含みうる自由記述欄を除いた「core」形式をreview/review_decisions_core.json
// (Git管理対象・正式なSSOT)として分離し、そちらをビルドパイプラインの正式な入力元とする。
// output/review_decisions.json(人間のレビュー用、自由記述込み)は引き続きローカル専用の
// 参照用資料として維持し、このスクリプトで最新のcoreへ反映する(一方向: rich → core)。
//
// 【本スクリプトの位置づけ】既存rich資料からcoreへの移行・補助ツールであり、正式パイプライン
// (build-drill-csv.mjs)の一部ではない。npm scripts・他のCLIからも自動実行しない
// (review/README.md §手順のとおり、人が明示的に実行する)。実行するとreview_decisions_core.jsonを
// 無条件に上書きするため、実行後は必ず`git diff review/review_decisions_core.json`で差分を
// 人が確認してからコミットすること。output/review_decisions.json(rich)がcoreより上位の
// 正式データになることはない(coreが常に正式なSSOT)。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const SRC = path.join(ROOT, "output/review_decisions.json");
const DEST_DIR = path.join(ROOT, "review");
const DEST = path.join(DEST_DIR, "review_decisions_core.json");

// パイプライン(resolveApplicableOverrides)が実際に参照するフィールドのみを残す。
// comment・suggestedCorrectionは意図的に含めない(教材原文の引用を含みうるため)。
const CORE_FIELDS = [
  "stableItemId",
  "legacyItemIdAtReview",
  "status",
  "reasonCode",
  "reviewedBy",
  "reviewedAt",
  "contentFingerprintAtReview",
  "exerciseViewGeneratorVersionAtReview",
  "bsmSchemaVersionAtReview",
];

function toCoreRecord(record) {
  const core = {};
  for (const field of CORE_FIELDS) core[field] = record[field];
  return core;
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`見つかりません: output/review_decisions.json（レビュー記録がまだ無い場合は何もしなくてよい）`);
    process.exit(1);
  }
  const rich = JSON.parse(readFileSync(SRC, "utf8"));
  if (!rich || !Array.isArray(rich.decisions)) {
    console.error("output/review_decisions.jsonの形状が不正です（{schemaVersion, decisions[]}を期待）");
    process.exit(1);
  }

  const core = {
    schemaVersion: rich.schemaVersion,
    decisions: rich.decisions.map(toCoreRecord),
  };

  mkdirSync(DEST_DIR, { recursive: true });
  writeFileSync(DEST, JSON.stringify(core, null, 2) + "\n", "utf8");
  console.log(`wrote: review/review_decisions_core.json (${core.decisions.length}件、comment/suggestedCorrectionは除外)`);
}

main();
