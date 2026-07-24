// eligibility.mjs（演習化の可否判定）とvalidator.mjs（検証9・10）の両方から参照する、
// BSM異常カテゴリの分類方針。2箇所で定義がずれないよう、この1ファイルへ集約する。

// 自動演習化を禁止するカテゴリ（ユーザー指示）
export const INELIGIBLE_CATEGORIES_FOR_REPORT = new Set([
  "missing_answer",
  "unresolved_item",
  "unsupported_table_structure",
  "schema_validation_error",
  "builder_error",
]);

// 自動演習化を停止し、レビュー待ちとして生成対象外にするカテゴリ
export const REVIEW_REQUIRED_CATEGORIES_FOR_REPORT = new Set(["possible_marker_misclassification"]);
