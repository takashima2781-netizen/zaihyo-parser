// F3(docs/exercise_view_phase3c1_review_workflow_memo.md、レビュー運用最小実装)実行CLI。
// output/exercise_view_full.json・output/book_structure_master_full.jsonを読み取り専用で参照し、
// withheldExercisesをItem単位(stableItemId単位)へ平坦化したレビューキューを生成する。
// 生成パイプライン(build-drill-csv.mjs等)には接続しない、独立した読み取り専用ツールである。
// 既存レイヤーへの影響が無いことを、実行前後のsha256スナップショット比較で確認する。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildReviewQueue, REVIEW_QUEUE_CSV_COLUMNS, toReviewQueueCsvRows } from "../review/reviewQueue.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const WATCHED_PATHS = [
  "output/exercise_view_full.json",
  "output/book_structure_master_full.json",
  "output/drill_csv_○×用.csv",
  "output/drill_csv_4択用.csv",
];

function hashFile(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function snapshotHashes(relPaths) {
  const snapshot = {};
  for (const rel of relPaths) snapshot[rel] = hashFile(path.join(ROOT, rel));
  return snapshot;
}

function diffSnapshots(before, after) {
  return Object.keys(before).filter((rel) => before[rel] !== after[rel]);
}

function escapeCsvField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvText(columns, rows) {
  const lines = [columns.map(escapeCsvField).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escapeCsvField(row[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function main() {
  const beforeHashes = snapshotHashes(WATCHED_PATHS);

  const exerciseView = JSON.parse(readFileSync(path.join(ROOT, "output/exercise_view_full.json"), "utf8"));
  const bsm = JSON.parse(readFileSync(path.join(ROOT, "output/book_structure_master_full.json"), "utf8"));

  const generatedAt = new Date().toISOString();
  const queue1 = buildReviewQueue(exerciseView, bsm, { generatedAt });
  const queue2 = buildReviewQueue(exerciseView, bsm, { generatedAt });
  const deterministic = JSON.stringify(queue1) === JSON.stringify(queue2);

  const classificationCounts = {};
  for (const item of queue1.items) {
    classificationCounts[item.recommendedClassification] = (classificationCounts[item.recommendedClassification] ?? 0) + 1;
  }
  const unitKindUnknownCount = queue1.items.filter((i) => i.unitKind === "unknown").length;
  const candidateAnswerTextPresentCount = queue1.items.filter((i) => i.candidateAnswerText !== null).length;
  const candidateAnswerTextMissingCount = queue1.itemCount - candidateAnswerTextPresentCount;

  const afterHashes = snapshotHashes(WATCHED_PATHS);
  const changedPaths = diffSnapshots(beforeHashes, afterHashes);

  const summary = {
    generatedAt,
    itemCount: queue1.itemCount,
    withheldExerciseCount: exerciseView.withheldExercises.length,
    classificationCounts,
    unitKindUnknownCount,
    candidateAnswerTextPresentCount,
    candidateAnswerTextMissingCount,
    deterministic,
    existingLayersUnchanged: changedPaths.length === 0,
    changedPaths,
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "review_queue.json"), JSON.stringify(queue1, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "review_queue.csv"),
    toCsvText(REVIEW_QUEUE_CSV_COLUMNS, toReviewQueueCsvRows(queue1.items)),
    "utf8"
  );
  console.log("wrote: output/review_queue.json");
  console.log("wrote: output/review_queue.csv");
}

main();
