// F3(docs/exercise_view_phase3c1_review_workflow_memo.md §5・§7・§9、レビュー運用最小実装)。
// output/review_decisions.jsonの読み込み・検証と、「Itemごとの最新レコード」解決を担う。
// 決定ログは追記型(イベントログ)であり、上書き・削除は行わない。同一stableItemIdに対する
// 複数レコードは正常(再レビューの履歴)で、「現在の状態」はreviewedAtが最新のレコードとする。

export const VALID_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_source_fix",
  "needs_rule_change",
  "deferred",
];

const REQUIRED_FIELDS = [
  "stableItemId",
  "legacyItemIdAtReview",
  "status",
  "reasonCode",
  "comment",
  "suggestedCorrection",
  "reviewedBy",
  "reviewedAt",
  "contentFingerprintAtReview",
  "exerciseViewGeneratorVersionAtReview",
  "bsmSchemaVersionAtReview",
];

// 1レコードの形状検証(必須フィールドの有無・statusが6状態のいずれかであること)。
// stableItemIdが実在するかどうかはこの関数の責務外(呼び出し側でreview_queueと突き合わせる)。
export function validateDecisionRecordShape(record, index) {
  const issues = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      issues.push({ check: "decision-missing-field", index, field });
    }
  }
  if (typeof record.stableItemId !== "string" || record.stableItemId.length === 0) {
    issues.push({ check: "decision-invalid-stableItemId", index });
  }
  if (!VALID_STATUSES.includes(record.status)) {
    issues.push({ check: "decision-invalid-status", index, status: record.status });
  }
  if (typeof record.reviewedAt !== "string" || Number.isNaN(Date.parse(record.reviewedAt))) {
    issues.push({ check: "decision-invalid-reviewedAt", index, reviewedAt: record.reviewedAt });
  }
  return issues;
}

// 決定ログ全体(output/review_decisions.jsonの{schemaVersion, decisions}形状)の検証。
// knownStableItemIds を渡した場合、レビューキューに存在しないstableItemIdを参照する
// レコードも検出する(過去にレビューキューから消えたItemを指す可能性があるため、エラーではなく
// 別カテゴリの注意事項として報告する)。
export function validateDecisionsLog(log, { knownStableItemIds } = {}) {
  const issues = [];
  if (!log || typeof log !== "object" || !Array.isArray(log.decisions)) {
    return [{ check: "decisions-log-malformed" }];
  }
  log.decisions.forEach((record, index) => {
    issues.push(...validateDecisionRecordShape(record, index));
  });
  if (knownStableItemIds) {
    log.decisions.forEach((record, index) => {
      if (record.stableItemId && !knownStableItemIds.has(record.stableItemId)) {
        issues.push({ check: "decision-references-unknown-stableItemId", index, stableItemId: record.stableItemId });
      }
    });
  }
  return issues;
}

// stableItemIdごとにグルーピングし、reviewedAtが最新のレコードを「現在の状態」として解決する。
// reviewedAtが完全一致する複数レコードが同一stableItemId内に存在する場合は矛盾(conflict)として
// 別途報告する(どちらが正しいかを機械的に判断しない)。
export function resolveLatestDecisions(decisions) {
  const byItem = new Map();
  for (const record of decisions) {
    if (!byItem.has(record.stableItemId)) byItem.set(record.stableItemId, []);
    byItem.get(record.stableItemId).push(record);
  }

  const latestByItem = new Map();
  const conflicts = [];
  for (const [stableItemId, records] of byItem.entries()) {
    const sorted = [...records].sort((a, b) => (a.reviewedAt < b.reviewedAt ? -1 : a.reviewedAt > b.reviewedAt ? 1 : 0));
    const latest = sorted[sorted.length - 1];
    const tied = sorted.filter((r) => r.reviewedAt === latest.reviewedAt);
    if (tied.length > 1) {
      conflicts.push({
        stableItemId,
        reviewedAt: latest.reviewedAt,
        count: tied.length,
        statuses: tied.map((r) => r.status),
        reviewedBy: tied.map((r) => r.reviewedBy),
      });
    }
    latestByItem.set(stableItemId, latest);
  }
  return { latestByItem, conflicts };
}

// レビューキューの現在のcontentFingerprintと、決定ログ記録時点のcontentFingerprintAtReviewを
// 比較し、不一致(=決定後にItemの内容が変わった)ならstale:trueとする。決定ログ自体は書き換えない。
export function isStale(currentContentFingerprint, decisionRecord) {
  if (!decisionRecord) return false;
  return decisionRecord.contentFingerprintAtReview !== currentContentFingerprint;
}
