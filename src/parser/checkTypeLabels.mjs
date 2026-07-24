// ＜...＞見出しの日本語ラベル ⇔ Parser内部の分類コード（オープンな文字列）の対応表。
// docs/intermediate_json_design.md 2章の方針により、checkTypeは固定enumではなく
// Parserの分類結果（string|null）として扱う。この表は「今回確認できたラベルの対応」であり、
// 未知のラベルが出た場合はnullとして記録し、この表を拡張する形で対応する。
//
// Exporter側でCSVの「問題カテゴリー」列へ書き戻す際も同じ表を逆引きで使う（正本はここ1箇所）。

export const CHECK_TYPE_LABELS = [
  { code: "basicKnowledge", label: "基礎知識チェック" },
  { code: "comprehension", label: "理解度チェック" },
  { code: "applied", label: "応用論点チェック" },
  { code: "memorization", label: "暗記度チェック" },
];

export function labelToCode(label) {
  return CHECK_TYPE_LABELS.find((e) => e.label === label)?.code ?? null;
}

export function codeToLabel(code) {
  return CHECK_TYPE_LABELS.find((e) => e.code === code)?.label ?? null;
}
