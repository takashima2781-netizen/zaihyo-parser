// eligibility.mjs（演習化の可否判定）とvalidator.mjs（検証9・10）の両方から参照する、
// BSM異常カテゴリの分類方針。2箇所で定義がずれないよう、この1ファイルへ集約する。

// 自動演習化を禁止するカテゴリ（ユーザー指示）
export const INELIGIBLE_CATEGORIES_FOR_REPORT = new Set([
  "missing_answer",
  "unresolved_item",
  "unsupported_table_structure",
  "schema_validation_error",
  "builder_error",
  // 教材データ品質調査(2026-07-28)で追加。本文の一部が別ブロックへ孤立し(分類できなかった断片)、
  // かつその断片が破損・切断されているか、本文中の複数箇所へ分割挿入する必要があるなど、
  // 機械的・決定的に本文を復元できないことを個別に確認した既知のcheckblockのみを対象とする
  // （anomalyDetector.mjs 2d参照、locator完全一致の個別補正であり一般ルールではない）。
  "body_fragment_incomplete",
]);

// 自動演習化を停止し、レビュー待ちとして生成対象外にするカテゴリ
export const REVIEW_REQUIRED_CATEGORIES_FOR_REPORT = new Set(["possible_marker_misclassification"]);
