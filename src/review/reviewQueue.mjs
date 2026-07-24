// F3(docs/exercise_view_phase3c1_review_workflow_memo.md、レビュー運用最小実装)。
// output/exercise_view_full.jsonのwithheldExercisesを、Exercise単位ではなくItem単位
// (stableItemId単位)へ平坦化・重複排除する。multi_blank(大問集約)レコードとその子の
// single_blank/true_falseレコードが同一Itemを重複参照するため(Phase 3C-1 §2のパターンB/C)、
// Exercise単位のままレビューキューにすると同一Itemに対する重複行が生じる。
//
// このモジュールは読み取り専用(exerciseView/bsmを受け取って集計するだけ)であり、
// build-drill-csv.mjs等の生成パイプラインには一切接続しない(Phase 3C-1 §7のC方式)。
//
// v1.1.0(86 Item実レビュー運用開始前、ユーザー承認済みの最小追加): page/marker(stableItemIdの
// 機械的分解)とcandidateAnswerText(BSM answer.answerBodyRaw.textの逐語転記、無ければnull)を
// 追加した。いずれもレビュー担当者向けの補助情報であり、正式な判断根拠(F4のoverride適用条件は
// contentFingerprint/決定ログのみ)には使わない。Exercise View・正式CSV・KM互換Adapter・
// CSV Bridge・HTML・review_decisions.jsonのスキーマには一切接続しない。

import { buildBsmIndex } from "../exerciseView/validator.mjs";

// Phase 3C-1 §3で確定した、reasonカテゴリの組み合わせ→5分類の決定的マッピング。
// 一致しない組み合わせ(3C-1分析時点では未観測だったパターンを含む)は"unknown"とし、推測しない。
const REASON_CATEGORY_PATTERN_TO_CLASSIFICATION = new Map([
  ["possible_marker_misclassification", "①原資料確認のみで承認可能"],
  ["missing_answer", "③現行仕様では出題不可"],
  ["missing_answer+unsupported_table_structure", "③現行仕様では出題不可（④将来対応の余地あり）"],
]);

function extractReasonCategories(ineligibilityReasons) {
  return ineligibilityReasons.map((r) => r.split(":")[0].trim());
}

export function recommendedClassification(ineligibilityReasons) {
  const categories = Array.from(new Set(extractReasonCategories(ineligibilityReasons))).sort();
  const key = categories.join("+");
  return REASON_CATEGORY_PATTERN_TO_CLASSIFICATION.get(key) ?? "unknown";
}

// resolveOverrides.mjs(F4)も、承認されたstableItemIdの現在のcontentFingerprintを
// 取得するためにこの関数を再利用する(BSM走査ロジックを二重実装しないため)。
export function buildStableItemIdToNode(bsm) {
  const nodesById = buildBsmIndex(bsm);
  const map = new Map();
  for (const node of nodesById.values()) {
    const stableItemId = node?.provenance?.stableItemId;
    if (stableItemId) map.set(stableItemId, node);
  }
  return map;
}

// stableItemId文字列(sitem:{documentId}:p{page}:b{block}:m{markerCode}[:o{ordinal}])から、
// page(整数)とmarkerCode(生の丸数字等ではなく、F2で正規化した機械可読コード)を機械的に抽出する。
// 新しい情報源を追加するものではなく、既にIDへ埋め込まれている値を読みやすく分解するだけ。
function parsePageAndMarker(stableItemId) {
  const m = stableItemId.match(/:p(\d+):b\d+:m([^:]+)/);
  return { page: m ? parseInt(m[1], 10) : null, marker: m ? m[2] : null };
}

// レビュー補助情報(候補解答テキスト)。BSM QuestionUnit.answer.answerBodyRaw.textをそのまま
// 転記するのみで、要約・正規化・言い換えは行わない。解答が存在しない場合はnull(推測で埋めない)。
// これは監査上の正式な判断根拠ではなく、レビュー担当者が原資料と突き合わせるための補助情報である
// (F4のreviewOverride等、正式な反映判断はcontentFingerprint/決定ログのみを根拠とし、この値は使わない)。
function candidateAnswerTextOf(node) {
  return node?.answer?.answerBodyRaw?.text ?? null;
}

// exerciseType別に、原文(prompt/body)取得の優先順位を分ける。
// single_blank/true_falseは常に1Itemに1:1対応するため、その原文をそのItemの正本として使う。
// multi_blank(大問集約)は複数Itemを束ねた表示用テキストであり、対応するsingle_blank/true_false
// レコードが存在しないItemのみの補完に留める。
function isPerItemExerciseType(exerciseType) {
  return exerciseType === "single_blank" || exerciseType === "true_false";
}

export function buildReviewQueueRows(exerciseView, bsm) {
  const stableIdToNode = buildStableItemIdToNode(bsm);
  const rowsById = new Map();

  function getOrCreateRow(stableItemId, legacyItemId, contentFingerprint, ex) {
    if (!rowsById.has(stableItemId)) {
      const checkSectionId = ex.sourceBookStructureIds[0] ?? "";
      rowsById.set(stableItemId, {
        stableItemId,
        legacyItemId,
        contentFingerprint,
        checkSectionId,
        checkBlockId: checkSectionId.replace(/^cs-/, ""),
        majorUnitId: ex.sourceBookStructureIds[1] ?? "",
        unitKind: stableIdToNode.get(stableItemId)?.parsed?.unitKind?.code ?? "unknown",
        exerciseRefs: [],
        reasonSet: new Set(),
        promptText: "",
        bodyText: "",
        hasPerItemText: false,
      });
    }
    return rowsById.get(stableItemId);
  }

  function accumulate(ex, isPerItemSource) {
    ex.stableItemIds.forEach((stableItemId, i) => {
      const row = getOrCreateRow(stableItemId, ex.sourceItemIds[i] ?? "", ex.contentFingerprints[i] ?? "", ex);
      row.exerciseRefs.push({ exerciseId: ex.exerciseId, exerciseType: ex.exerciseType, eligibility: ex.eligibility });
      for (const r of ex.ineligibilityReasons) row.reasonSet.add(r);
      if (isPerItemSource || !row.hasPerItemText) {
        row.promptText = ex.prompt?.text ?? "";
        row.bodyText = ex.body?.text ?? "";
        if (isPerItemSource) row.hasPerItemText = true;
      }
    });
  }

  for (const ex of exerciseView.withheldExercises) {
    if (isPerItemExerciseType(ex.exerciseType)) accumulate(ex, true);
  }
  for (const ex of exerciseView.withheldExercises) {
    if (!isPerItemExerciseType(ex.exerciseType)) accumulate(ex, false);
  }

  const rows = [];
  for (const row of rowsById.values()) {
    const reasons = Array.from(row.reasonSet);
    const { page, marker } = parsePageAndMarker(row.stableItemId);
    rows.push({
      stableItemId: row.stableItemId,
      legacyItemId: row.legacyItemId,
      contentFingerprint: row.contentFingerprint,
      page,
      marker,
      checkSectionId: row.checkSectionId,
      checkBlockId: row.checkBlockId,
      majorUnitId: row.majorUnitId,
      unitKind: row.unitKind,
      exerciseRefs: row.exerciseRefs,
      reasons,
      recommendedClassification: recommendedClassification(reasons),
      promptText: row.promptText,
      bodyText: row.bodyText,
      candidateAnswerText: candidateAnswerTextOf(stableIdToNode.get(row.stableItemId)),
    });
  }
  rows.sort((a, b) => (a.stableItemId < b.stableItemId ? -1 : a.stableItemId > b.stableItemId ? 1 : 0));
  return rows;
}

export function buildReviewQueue(exerciseView, bsm, { generatedAt } = {}) {
  const rows = buildReviewQueueRows(exerciseView, bsm);
  const anyExercise = exerciseView.withheldExercises[0] ?? exerciseView.exercises[0];
  return {
    schemaVersion: "review-queue-v1.1.0",
    generatedAt: generatedAt ?? new Date().toISOString(),
    sourceExerciseViewGeneratorVersion: anyExercise?.provenance?.generatorVersion ?? null,
    sourceBsmSchemaVersion: bsm.meta?.schemaVersion ?? null,
    itemCount: rows.length,
    items: rows,
  };
}

export const REVIEW_QUEUE_CSV_COLUMNS = [
  "stableItemId",
  "legacyItemId",
  "contentFingerprint",
  "page",
  "marker",
  "checkSectionId",
  "checkBlockId",
  "majorUnitId",
  "unitKind",
  "exerciseIds",
  "reasons",
  "recommendedClassification",
  "promptText",
  "bodyText",
  "candidateAnswerText",
];

export function toReviewQueueCsvRows(rows) {
  return rows.map((r) => ({
    ...r,
    exerciseIds: r.exerciseRefs.map((e) => e.exerciseId).join(";"),
    reasons: r.reasons.join(" | "),
  }));
}
