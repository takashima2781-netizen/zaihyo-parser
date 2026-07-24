// F3(docs/exercise_view_phase3c1_review_workflow_memo.md §7・§8、レビュー運用最小実装)実行CLI。
// レビューキュー(exercise_view_full.json/book_structure_master_full.jsonから都度再導出)と
// output/review_decisions.json(追記型の決定ログ)を突き合わせ、各Itemを
// unreviewed/pending/approved/rejected/needs_source_fix/needs_rule_change/deferredへ分類し、
// contentFingerprint不一致(stale)・reviewedAt完全一致による矛盾(conflicts)を検出する。
// 読み取り専用の集計であり、生成パイプラインには一切接続しない。決定ログ自体は書き換えない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { buildReviewQueueRows } from "../review/reviewQueue.mjs";
import { validateDecisionsLog, resolveLatestDecisions, isStale, VALID_STATUSES } from "../review/reviewDecisions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

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

function loadDecisionsLog(decisionsPath) {
  if (!existsSync(decisionsPath)) {
    return { schemaVersion: "review-decisions-v1.0.0", decisions: [] };
  }
  return JSON.parse(readFileSync(decisionsPath, "utf8"));
}

function main() {
  const exerciseView = JSON.parse(readFileSync(path.join(ROOT, "output/exercise_view_full.json"), "utf8"));
  const bsm = JSON.parse(readFileSync(path.join(ROOT, "output/book_structure_master_full.json"), "utf8"));
  const decisionsPath = path.join(ROOT, "output/review_decisions.json");
  const decisionsLog = loadDecisionsLog(decisionsPath);

  const queueRows = buildReviewQueueRows(exerciseView, bsm);
  const knownStableItemIds = new Set(queueRows.map((r) => r.stableItemId));

  const shapeIssues = validateDecisionsLog(decisionsLog, { knownStableItemIds });
  const { latestByItem, conflicts } = resolveLatestDecisions(decisionsLog.decisions);

  const statusCounts = { unreviewed: 0 };
  for (const s of VALID_STATUSES) statusCounts[s] = 0;
  let staleCount = 0;

  const items = queueRows.map((row) => {
    const latest = latestByItem.get(row.stableItemId) ?? null;
    const status = latest ? latest.status : "unreviewed";
    const stale = isStale(row.contentFingerprint, latest);
    statusCounts[status] += 1;
    if (stale) staleCount += 1;
    return {
      stableItemId: row.stableItemId,
      legacyItemId: row.legacyItemId,
      unitKind: row.unitKind,
      recommendedClassification: row.recommendedClassification,
      status,
      stale,
      reasonCode: latest?.reasonCode ?? "",
      comment: latest?.comment ?? "",
      reviewedBy: latest?.reviewedBy ?? "",
      reviewedAt: latest?.reviewedAt ?? "",
    };
  });

  const orphanedDecisionStableItemIds = Array.from(
    new Set(
      decisionsLog.decisions
        .map((d) => d.stableItemId)
        .filter((id) => id && !knownStableItemIds.has(id))
    )
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    statusCounts,
    staleCount,
    conflictCount: conflicts.length,
    shapeIssueCount: shapeIssues.length,
    orphanedDecisionCount: orphanedDecisionStableItemIds.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (shapeIssues.length > 0) console.log("shapeIssues:", JSON.stringify(shapeIssues, null, 2));
  if (conflicts.length > 0) console.log("conflicts:", JSON.stringify(conflicts, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "review_status_report.json"),
    JSON.stringify({ summary, items, conflicts, shapeIssues, orphanedDecisionStableItemIds }, null, 2),
    "utf8"
  );
  writeFileSync(
    path.join(outDir, "review_status_report.csv"),
    toCsvText(
      ["stableItemId", "legacyItemId", "unitKind", "recommendedClassification", "status", "stale", "reasonCode", "comment", "reviewedBy", "reviewedAt"],
      items
    ),
    "utf8"
  );
  console.log("wrote: output/review_status_report.json");
  console.log("wrote: output/review_status_report.csv");
}

main();
