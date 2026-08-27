// M2拡張(第3ケース専用): 仕訳パターンのトークン化。
//
// 「(借)勘定科目×××(貸)勘定科目×××」という形の忠実な表現を、既存の
// 5トークン語彙(term/operator/fraction/group/power、
// `source_derived_knowledge_design_proposal.md`5-2節で確定済み)のうち
// termのみを使って構造化する。計算式(formulaTokenizer.mjs)とは異なる
// 形状のため、既存のtokenizeSubtractFractionFormula/
// tokenizeBareNumberFractionFormulaとは別関数として追加する(2つの形状を
// 1つの正規表現・分岐で無理に統一しない、既存の`formulaTokenizer.mjs`と
// 同じ方針)。仕訳の「借方ラベル・勘定科目・貸方ラベル・勘定科目・金額
// プレースホルダー」という並びは、演算子(×/－/＝)や分数を含まないため、
// 新しいトークン種別を追加する必要はなく、既存の"term"種別だけで表現できる。
//
// `renderTokens`(往復整合性の検証・レンダリング)は既存のformulaTokenizer.mjs
// のものをそのまま再利用する(重複実装を避ける、term/sequenceの扱いは
// ドメインに依存しない共通ロジックのため)。

import { renderTokens } from "./formulaTokenizer.mjs";

export { renderTokens };

// 実データ確認: テーマ8-11(無形固定資産)の仕訳パターン2件は、いずれも
// 半角括弧の「(借)」「(貸)」で表記されていた。全角括弧の実例は未確認の
// ため、確認できていない表記まで先回りして対応しない(原則4)。
const JOURNAL_PATTERN_FORMULA = /^(\(借\))([^()]+)×××(\(貸\))([^()]+)×××$/;

/**
 * 「(借)勘定科目×××(貸)勘定科目×××」という形の忠実な表現を、5トークン
 * 語彙(termのみ使用)で構造化する。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizeJournalPattern(rawFormula) {
  const match = rawFormula.match(JOURNAL_PATTERN_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"(借)勘定科目×××(貸)勘定科目×××"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, debitLabel, debitAccount, creditLabel, creditAccount] = match;

  return {
    kind: "sequence",
    tokens: [
      { kind: "term", value: debitLabel },
      { kind: "term", value: debitAccount },
      { kind: "term", value: "×××" },
      { kind: "term", value: creditLabel },
      { kind: "term", value: creditAccount },
      { kind: "term", value: "×××" },
    ],
  };
}
