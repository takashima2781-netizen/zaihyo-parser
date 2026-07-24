// F4(docs/exercise_view_f4_review_reflection_report.md、レビュー結果の反映機構)。
// F3の決定ログ(output/review_decisions.json)から、正式CSV生成時に安全に適用してよい
// "approved"判断だけを抽出する純粋関数。BSMと決定ログの内容のみから決定的に計算され、
// Exercise View生成より前に独立して呼び出せる(循環依存なし)。
//
// fail-closedの方針: stableItemId/contentFingerprint/generatorVersion/bsmSchemaVersionの
// いずれか1つでも一致しない、競合(conflict)がある、レコードが形状不正である場合は、
// 一切適用しない(withheldのまま)。曖昧・古い・競合した判断を正式成果物へ反映しない。

import { buildStableItemIdToNode } from "./reviewQueue.mjs";
import { validateDecisionRecordShape, resolveLatestDecisions, VALID_STATUSES } from "./reviewDecisions.mjs";

function currentContentFingerprintByStableItemId(bsm) {
  const stableIdToNode = buildStableItemIdToNode(bsm);
  const map = new Map();
  for (const [stableItemId, node] of stableIdToNode.entries()) {
    const fp = node?.provenance?.contentFingerprint;
    if (fp) map.set(stableItemId, fp);
  }
  return map;
}

// 決定ログ全体のトップレベル形状が壊れている場合は、安全側に倒して全レコードを無視する
// (CSV生成自体は止めない。override無しの状態で継続する)。
function isTopLevelShapeValid(decisionsLog) {
  return !!decisionsLog && typeof decisionsLog === "object" && Array.isArray(decisionsLog.decisions);
}

export function resolveApplicableOverrides(bsm, decisionsLog, { currentGeneratorVersion, currentBsmSchemaVersion }) {
  const statusCounts = {};
  for (const s of VALID_STATUSES) statusCounts[s] = 0;

  if (!isTopLevelShapeValid(decisionsLog)) {
    return {
      applicable: new Map(),
      blocked: [],
      invalidRecords: [{ index: null, issues: [{ check: "decisions-log-malformed" }] }],
      statusCounts,
    };
  }

  const invalidRecords = [];
  const validRecords = [];
  decisionsLog.decisions.forEach((record, index) => {
    const issues = validateDecisionRecordShape(record, index);
    if (issues.length > 0) {
      invalidRecords.push({ index, issues });
    } else {
      validRecords.push(record);
    }
  });

  const { latestByItem, conflicts } = resolveLatestDecisions(validRecords);
  const conflictingStableItemIds = new Set(conflicts.map((c) => c.stableItemId));
  const currentFingerprints = currentContentFingerprintByStableItemId(bsm);

  const applicable = new Map();
  const blocked = [];

  for (const [stableItemId, decision] of latestByItem.entries()) {
    statusCounts[decision.status] = (statusCounts[decision.status] ?? 0) + 1;

    if (conflictingStableItemIds.has(stableItemId)) {
      // reviewedAtの完全一致により「latest」が機械的に一意に決まらない。tie-break後のdecision.statusが
      // 偶然approved以外になっていても、競合グループ内にapprovedが含まれる限りは曖昧な承認とみなし、
      // 誤って見過ごさないようにblockedへ記録する(fail-closed)。
      const conflictEntry = conflicts.find((c) => c.stableItemId === stableItemId);
      if (conflictEntry?.statuses.includes("approved")) {
        blocked.push({ stableItemId, reason: "conflict" });
      }
      continue;
    }

    if (decision.status !== "approved") continue; // approved以外は元々withheldのまま、blockedでもない

    const currentFingerprint = currentFingerprints.get(stableItemId);
    if (!currentFingerprint || decision.contentFingerprintAtReview !== currentFingerprint) {
      blocked.push({ stableItemId, reason: "stale" });
      continue;
    }

    if (
      decision.exerciseViewGeneratorVersionAtReview !== currentGeneratorVersion ||
      decision.bsmSchemaVersionAtReview !== currentBsmSchemaVersion
    ) {
      blocked.push({ stableItemId, reason: "version_mismatch" });
      continue;
    }

    applicable.set(stableItemId, decision);
  }

  return { applicable, blocked, invalidRecords, statusCounts };
}
