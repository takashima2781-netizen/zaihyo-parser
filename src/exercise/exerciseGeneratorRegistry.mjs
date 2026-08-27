// Exercise生成レジストリ: どのKnowledgeから、どのExercise generatorを使って
// 問題を生成できるかを判定する(M5の責務、`m5_exercise_generation_design.md`
// 7-1節の責務分離を維持する)。
//
// 各generatorは`exerciseKind`と、`supports(knowledge)`という適用条件の述語を
// 持つ。knowledgeKindの単純な文字列一致だけでなく、将来content.structureの
// 形状等、より細かい適用条件が必要になった場合にも、呼び出し側
// (`buildExercisesFromApprovedKnowledge.mjs`)のコードを変えずにgenerator側
// だけを拡張できるようにするための設計(gradingRegistry.mjsと同じ、
// レジストリパターンの考え方)。
//
// 同じknowledgeKindに対して複数のgeneratorを登録できる。呼び出し側は
// 「supportsするgeneratorすべて」を実行するため、1つのKnowledgeから複数種類の
// Exerciseを生成する構造を、この設計は妨げない(将来の拡張)。
//
// 第3ケース(仕訳パターン、knowledgeKind: "journal_pattern")の追加により、
// 実際に2件のgeneratorが並存する状態を実データで確認した。2つのgenerator
// は機構的には類似する(トップレベルトークンの並び替え)が、対象とする
// knowledgeKind・exerciseKindが異なるため、あえて1つの関数へ統合せず
// 独立したファイルのまま登録する(`formulaTokenizer.mjs`の2形状関数と同じ
// 方針、実データで確認できた範囲を超えて先回りして共通化しない)。

import { generateFormulaOrderingExercise } from "./generateFormulaOrderingExercise.mjs";
import { generateJournalOrderingExercise } from "./generateJournalOrderingExercise.mjs";

export const exerciseGenerators = [
  {
    exerciseKind: "formula_ordering",
    supports(knowledge) {
      return knowledge.knowledgeKind === "calculation_formula";
    },
    generate: generateFormulaOrderingExercise,
  },
  {
    exerciseKind: "journal_ordering",
    supports(knowledge) {
      return knowledge.knowledgeKind === "journal_pattern";
    },
    generate: generateJournalOrderingExercise,
  },
];
