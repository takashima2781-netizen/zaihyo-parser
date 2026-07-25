// Exercise View → KM互換Adapter 実行・検証CLI（Phase 3B-2）。
//
// データフロー: BSM → Exercise View(既存, 読み取り専用) → KM互換Adapter(新規) → 既存CSV Bridge(無変更) → 既存HTML(無変更)
//
// 入力（Exercise View・Intermediate JSON・既存Knowledge Master）はすべて読み取り専用。
// 既存Knowledge Master・CSV Bridge・HTMLアプリ・BSMスキーマ・解答/判定/解説モデルは一切変更しない。
// Adapterの変換対象は exercises（eligibleのみ）のうち single_blank・true_false のみ。
// multi_blank・withheldExercises全件は対象外とし、unsupportedByAdapterとして集計する
// （エラー・変換失敗としては扱わない）。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildKmCompatFromExerciseView } from "../exerciseView/kmCompatAdapter.mjs";
import { validateKnowledgeMaster } from "../knowledgeMaster/validate.mjs";
import { buildRows } from "../csvBridge/buildRows.mjs";
import { buildLearningRows, CSV3_COLUMNS } from "../csvBridge/buildRowsLearning.mjs";
import { toCsvText } from "../csvBridge/csvWriter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// reference/current_app/index.html の processCSV 内の判定条件と同一（変更しない。
// run-csv-bridge-split-export.mjsの複製。Track A/Bの独立実装方針を踏襲する）。
function isOxAnswer(ans) {
  return ans.includes("○") || ans.includes("×") || ans.includes("〇");
}
function isFourChoiceAnswer(ans) {
  return ans.length > 0 && ans !== "○" && ans !== "×" && ans !== "〇";
}

const WATCHED_FROZEN_LAYERS = [
  "src/parser",
  "src/knowledgeMaster",
  "src/csvBridge",
  "src/exporter",
  "src/bookStructureMaster",
  "reference/current_app",
  "output/csv_bridge_○×用.csv",
  "output/csv_bridge_4択用.csv",
  "output/csv_bridge_財表DB③形式.csv",
  "output/README.md",
  "output/knowledge_master_full_scan.json",
  "output/book_structure_master_full.json",
  "output/book_structure_master_full_validation.json",
  "output/book_structure_master_full_anomalies.csv",
  "output/book_structure_master_phase2a.json",
  "output/book_structure_master_phase2a_validation.json",
  "output/exercise_view_full.json",
  "output/exercise_view_full_no_override_validation.json",
  "output/exercise_view_phase3a.json",
  "docs/book_structure_master_phase2a_report.md",
  "docs/book_structure_master_phase2b_report.md",
  "docs/exercise_view_schema_draft.json",
  "docs/exercise_view_phase3a_report.md",
  "docs/exercise_view_phase3b_decision_memo.md",
  "docs/exercise_view_spec_v1.md",
  "docs/exercise_view_schema_v1.json",
  "docs/exercise_view_phase3b1_report.md",
];

function hashFile(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}
function snapshotHashes(relPaths) {
  const snapshot = {};
  for (const rel of relPaths) {
    const abs = path.join(ROOT, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      snapshot[rel] = null;
      continue;
    }
    if (st.isDirectory()) {
      const fileHashes = {};
      (function walk(dir, relDir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const abs2 = path.join(dir, entry.name);
          const rel2 = path.join(relDir, entry.name);
          if (entry.isDirectory()) walk(abs2, rel2);
          else fileHashes[rel2] = hashFile(abs2);
        }
      })(abs, "");
      snapshot[rel] = fileHashes;
    } else {
      snapshot[rel] = hashFile(abs);
    }
  }
  return snapshot;
}
function diffSnapshots(before, after) {
  const changed = [];
  for (const rel of Object.keys(before)) {
    const b = before[rel];
    const a = after[rel];
    if (typeof b === "string" || b === null) {
      if (a !== b) changed.push(rel);
    } else {
      const keys = new Set([...Object.keys(b), ...Object.keys(a ?? {})]);
      for (const k of keys) {
        if ((b ?? {})[k] !== (a ?? {})[k]) changed.push(`${rel}/${k}`);
      }
    }
  }
  return changed;
}

// 実KM由来行とAdapter-KM由来行を突き合わせ、差分を3分類する。
// - intentional: multi_blank/withheldExercises対象外という仕様上想定済みの差（解答/問題文が空になる）
// - ev_introduced: Exercise View導入に伴う表現上の違い（例: operationラベルの推定値化）だが実害なし
// - possible_bug: 上記のいずれでも説明できない差分
function classifyRowDiff({ itemId, real, adapter }) {
  const realAns = (real.row["解答"] || "").trim();
  const adapterAns = (adapter.row["解答"] || "").trim();
  const realQ = (real.row["問題文"] || "").trim();
  const adapterQ = (adapter.row["問題文"] || "").trim();
  const realExp = (real.row["備考"] || "").trim();
  const adapterExp = (adapter.row["備考"] || "").trim();

  if (realAns === adapterAns && realQ === adapterQ && realExp === adapterExp) return null; // 差分なし

  // Adapter側がwithheldExercises(review_required/ineligible)またはmulti_blankのみでconvert対象外
  // だったため解答が空になっているケース。問題文はresolveQuestionText()のIJフォールバック
  // (item.parsed.questionText)により、多くの場合そのまま一致する（BSMのbodyRawは元々
  // item.raw.question[].textと逐語一致しており、parsed.questionTextも同じ原文を保持しているため）。
  if (real.kmResolved && !adapter.kmResolved && adapterAns === "") {
    if (realQ === adapterQ) {
      return {
        category: "intentional",
        detail: "review_required/ineligible、またはmulti_blankのみのためAdapter変換対象外。問題文はIJフォールバックで一致し、解答のみ意図的に空欄",
      };
    }
    return {
      category: "ev_introduced",
      detail: "Adapter対象外のため問題文はIJのparsed.questionTextフォールバックを使用しており、実KMのEvidence由来文言と表現が異なる",
    };
  }
  if (!real.kmResolved && !adapter.kmResolved) {
    return { category: "intentional", detail: "実KM・Adapterともに未解決Item（既知の29件仕様・空Question等）" };
  }
  // 両方とも解決している場合の内容差
  if (real.kmResolved && adapter.kmResolved) {
    if (realQ === adapterQ && realAns !== adapterAns) {
      return { category: "possible_bug", detail: `解答テキストが不一致(real="${realAns}" / adapter="${adapterAns}")` };
    }
    if (realQ !== adapterQ) {
      return { category: "possible_bug", detail: `問題文が不一致(real="${realQ.slice(0, 40)}..." / adapter="${adapterQ.slice(0, 40)}...")` };
    }
    if (realExp !== adapterExp) {
      return { category: "ev_introduced", detail: "備考(教材解説)の有無・内容が異なる" };
    }
  }
  return { category: "possible_bug", detail: "分類できない差分" };
}

function main() {
  const evPath = path.join(ROOT, "output/exercise_view_full.json");
  const corpusPath = path.join(ROOT, "output/intermediate_full_scan.json");
  const realKmPath = path.join(ROOT, "output/knowledge_master_full_scan.json");

  const before = snapshotHashes(WATCHED_FROZEN_LAYERS);

  console.log("=== Step A: 入力の読み込み(読み取り専用) ===");
  const exerciseView = JSON.parse(readFileSync(evPath, "utf8"));
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const realKm = JSON.parse(readFileSync(realKmPath, "utf8"));
  const book = corpus.books[0];
  const groups = book.groups;

  console.log("=== Step B: KM互換Adapter実行 ===");
  const adapterParams = {
    bookId: book.id,
    bookTitle: book.title,
    schemaVersion: corpus.meta.schemaVersion,
    builtBy: "exercise-view-km-compat-adapter-phase3b2-1.0.0",
  };
  const { km: kmCompat, unsupportedByAdapter, conversionFailures } = buildKmCompatFromExerciseView(exerciseView, adapterParams);
  // 決定論性検証用に再実行(EV側にタイムスタンプ以外の変化は無いため、Adapter出力は完全一致するはず)
  const { km: kmCompatRerun } = buildKmCompatFromExerciseView(exerciseView, adapterParams);
  const deterministic = JSON.stringify(kmCompat) === JSON.stringify(kmCompatRerun);

  console.log("=== Step C: 既存Knowledge Masterの検証ロジックで検証(validate.mjs、無変更のまま呼び出し) ===");
  const kmValidationIssues = validateKnowledgeMaster(book, kmCompat);
  const kmValidationByCheck = {};
  for (const issue of kmValidationIssues) kmValidationByCheck[issue.check] = (kmValidationByCheck[issue.check] ?? 0) + 1;

  console.log("=== Step D: exerciseIdの重複・Item ID取得不可の確認 ===");
  const allConvertedExercises = exerciseView.exercises.filter((e) => e.exerciseType === "single_blank" || e.exerciseType === "true_false");
  const missingItemIdCount = allConvertedExercises.filter((e) => e.sourceItemIds.length !== 1 || !e.sourceItemIds[0]).length;
  const seenQuestionItemIds = new Set();
  let duplicateItemIdCount = 0;
  for (const q of kmCompat.questions) {
    if (seenQuestionItemIds.has(q.itemId)) duplicateItemIdCount += 1;
    seenQuestionItemIds.add(q.itemId);
  }
  const seenIds = new Set();
  let duplicateIdCount = 0;
  for (const arr of [kmCompat.sources, kmCompat.evidence, kmCompat.answerUnits, kmCompat.questions]) {
    for (const x of arr) {
      if (seenIds.has(x.id)) duplicateIdCount += 1;
      seenIds.add(x.id);
    }
  }

  console.log("=== Step E: 既存CSV Bridge(無変更)へ投入し、実KMとの行を比較 ===");
  const realCompatRows = buildRows({ groups, km: realKm }).rows;
  const adapterCompatRows = buildRows({ groups, km: kmCompat }).rows;
  const realLearningRows = buildLearningRows({ groups, km: realKm }).rows;
  const adapterLearningRows = buildLearningRows({ groups, km: kmCompat }).rows;

  const diffRows = [];
  const diffCategoryCounts = { intentional: 0, ev_introduced: 0, possible_bug: 0 };
  for (let i = 0; i < realLearningRows.length; i++) {
    const real = realLearningRows[i];
    const adapter = adapterLearningRows[i];
    const diff = classifyRowDiff({ itemId: real.itemId, real, adapter });
    if (diff) {
      diffCategoryCounts[diff.category] += 1;
      diffRows.push({ itemId: real.itemId, category: diff.category, detail: diff.detail });
    }
  }

  console.log("=== Step F: 既存HTMLへ読み込ませるための試験用CSV(実使用CSVとは別ファイル)を生成 ===");
  const oxRows = [];
  const fourChoiceRows = [];
  for (const r of adapterLearningRows) {
    const ans = (r.row["解答"] || "").trim();
    if (isOxAnswer(ans)) oxRows.push(r.row);
    if (isFourChoiceAnswer(ans)) fourChoiceRows.push(r.row);
  }

  console.log("=== Step G: 既存レイヤーへの影響がないことの確認 ===");
  const after = snapshotHashes(WATCHED_FROZEN_LAYERS);
  const changedPaths = diffSnapshots(before, after);

  const summary = {
    generatedAt: new Date().toISOString(),
    singleBlankConvertedCount: kmCompat.questions.filter((q) => q.requirement.operation === "fillBlank").length,
    trueFalseConvertedCount: kmCompat.questions.filter((q) => q.requirement.operation === "trueFalse").length,
    multiBlankExcludedCount: unsupportedByAdapter.multiBlankExcluded.length,
    withheldExcludedCount: unsupportedByAdapter.withheldExcluded.length,
    conversionFailureCount: conversionFailures.length,
    missingItemIdCount,
    kmValidationIssueCount: kmValidationIssues.length,
    kmValidationByCheck,
    duplicateIdCount,
    duplicateQuestionItemIdCount: duplicateItemIdCount,
    deterministicRegeneration: deterministic,
    csvBridgeCompatRowCount: adapterCompatRows.length,
    csvBridgeLearningRowCount: adapterLearningRows.length,
    // 既存CSV Bridgeは1 Item=1行を必ず生成する(KM未解決時はフォールバックで空欄行になるだけで、
    // 例外は投げない)。行数が入力Item数・実KM由来の行数と一致していれば、無変更のCSV Bridgeへ
    // Adapter出力をそのまま投入できたことを意味する。
    csvBridgeInputSucceeded: adapterLearningRows.length === realLearningRows.length && adapterCompatRows.length === realCompatRows.length,
    diffCategoryCounts,
    diffTotalCount: diffRows.length,
    oxRowCount: oxRows.length,
    fourChoiceRowCount: fourChoiceRows.length,
    frozenLayersUnchanged: changedPaths.length === 0,
    changedPaths,
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "exercise_view_km_compat.json"), JSON.stringify(kmCompat, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "exercise_view_km_compat_validation.json"),
    JSON.stringify(
      { summary, kmValidationIssues, unsupportedByAdapter, conversionFailures, diffRows: diffRows.slice(0, 500) },
      null,
      2
    ),
    "utf8"
  );
  // 実使用CSV(output/csv_bridge_○×用.csv 等)は上書きしない。試験専用の別名で出力する。
  writeFileSync(path.join(outDir, "exercise_view_km_compat_○×用.csv"), toCsvText(CSV3_COLUMNS, oxRows), "utf8");
  writeFileSync(path.join(outDir, "exercise_view_km_compat_4択用.csv"), toCsvText(CSV3_COLUMNS, fourChoiceRows), "utf8");
  console.log("wrote: output/exercise_view_km_compat.json");
  console.log("wrote: output/exercise_view_km_compat_validation.json");
  console.log("wrote: output/exercise_view_km_compat_○×用.csv (試験専用、実使用CSVは上書きしない)");
  console.log("wrote: output/exercise_view_km_compat_4択用.csv (試験専用、実使用CSVは上書きしない)");
}

main();
