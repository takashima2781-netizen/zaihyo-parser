// BSMの異常検出結果（src/bookStructureMaster/anomalyDetector.mjs、既存・凍結・変更しない）を
// そのまま入力として使い、Exercise View独自の新しい異常判定ロジックは追加しない。
// 「どの異常カテゴリが演習化を止めるか／保留にするか」の方針は ./eligibilityCategories.mjs に集約する
// （validator.mjsの検証9・10も同じ定義を参照するため、ここでは再定義しない）。
import { INELIGIBLE_CATEGORIES_FOR_REPORT as INELIGIBLE_CATEGORIES, REVIEW_REQUIRED_CATEGORIES_FOR_REPORT as REVIEW_REQUIRED_CATEGORIES } from "./eligibilityCategories.mjs";

// explanation_role_unknown・shared_prompt_mismatch等、上記以外のカテゴリは
// 演習化を妨げる理由としては扱わない（explanation_role_unknownは情報的注記のまま保持する）。

export function indexAnomaliesByUnitId(anomalies) {
  const map = new Map();
  for (const a of anomalies) {
    if (!a.unit_id) continue;
    if (!map.has(a.unit_id)) map.set(a.unit_id, []);
    map.get(a.unit_id).push(a);
  }
  return map;
}

// Phase 3D-1(docs/item_id_formalization_design_memo.md §10)で発見された修正:
// 以前は「ineligibleカテゴリを検出した時点でeligibilityを確定させ、それ以降に見つかった
// review_requiredカテゴリの理由をreasonsへ追加しない」という実装になっており、
// 複合異常(例: missing_answer と possible_marker_misclassification を同時に持つ22件)の
// 理由の一部がineligibilityReasonsから握りつぶされていた。
// 判定(eligibilityの確定)と理由の収集(該当する全カテゴリを集める)を分離し、
// ループの途中でreasonsの収集を打ち切らないようにする。
export function classifyUnitEligibility(unitId, anomaliesByUnitId) {
  const anomalies = anomaliesByUnitId.get(unitId) ?? [];
  const reasons = [];
  let hasIneligible = false;
  let hasReviewRequired = false;
  for (const a of anomalies) {
    if (INELIGIBLE_CATEGORIES.has(a.category)) {
      hasIneligible = true;
      reasons.push(`${a.category}: ${a.reason}`);
    } else if (REVIEW_REQUIRED_CATEGORIES.has(a.category)) {
      hasReviewRequired = true;
      reasons.push(`${a.category}: ${a.reason}`);
    }
  }
  const eligibility = hasIneligible ? "ineligible" : hasReviewRequired ? "review_required" : "eligible";
  return { eligibility, reasons };
}

// 複数の子ユニットのeligibilityを1つのExercise（multi_blank等）へ集約する。
// 教材構造上ひとつの大問として扱うため、部分的な演習化はしない：
// 1件でもineligibleな子があれば全体をineligible、
// （ineligibleがない場合）1件でもreview_requiredな子があれば全体をreview_required、
// それ以外は全体をeligibleとする。
export function combineEligibility(results) {
  let eligibility = "eligible";
  const reasons = [];
  for (const r of results) {
    if (r.eligibility === "ineligible") eligibility = "ineligible";
    else if (r.eligibility === "review_required" && eligibility !== "ineligible") eligibility = "review_required";
    reasons.push(...r.reasons);
  }
  if (eligibility === "eligible") return { eligibility: "eligible", reasons: [] };
  // 同じ末端が大問レベル(own)と子レベル(leaf)の両方から同一理由で数えられる場合
  // （例: 大問自身がそのまま末端になっているケース）、理由文字列が完全一致するものは
  // 重複として1件にまとめる（出現順は保つ）。
  return { eligibility, reasons: Array.from(new Set(reasons)) };
}
