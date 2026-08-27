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
// Exerciseを生成する構造を、この設計は妨げない(将来の拡張、今回は未実装)。
//
// 今回はgeneratorを1件だけ登録する。定額法1件専用だったExercise生成を、
// 承認済みKnowledgeがN件になっても安全に処理できる最小構造へ直すことが
// 目的であり、新しい出題形式の追加自体は今回のスコープではない。

import { generateFormulaOrderingExercise } from "./generateFormulaOrderingExercise.mjs";

export const exerciseGenerators = [
  {
    exerciseKind: "formula_ordering",
    supports(knowledge) {
      return knowledge.knowledgeKind === "calculation_formula";
    },
    generate: generateFormulaOrderingExercise,
  },
];
