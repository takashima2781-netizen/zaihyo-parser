// M5: Exercise生成(用語ベース計算式Knowledge専用のgenerator、汎用問題生成
// エンジンではない)。
//
// `planning/m5_exercise_generation_design.md`(改訂版)に従う。
// knowledgeKind==="calculation_formula"の承認済みKnowledgeから、並び替え
// 形式のExerciseを1件生成する。特定のKnowledge ID(定額法1件)への依存は
// `exerciseGeneratorRegistry.mjs`の導入により除去した(Exercise生成層の
// 汎化、Knowledge IDのハードコードが複数Knowledgeを静かに取りこぼす不具合
// になっていたための修正)。
//
// 責務分離(4-3節・7-1節):
// - 提示順序のシャッフルはここでは行わない(M6の表示時の責務)。
// - 正誤判定の実行(ユーザー回答との比較)もここでは行わない
//   (M6の責務。ここで用意するのは`answer.grading.method`という契約のみ)。
// - どのKnowledgeにこのgeneratorを適用するかの判定(`supports`)は
//   `exerciseGeneratorRegistry.mjs`側の責務。この関数はknowledgeKindの
//   防御的な再検証のみ行う(このgeneratorが呼び出し経路を介さず直接
//   呼ばれた場合でもfail-closedを保つため)。

import { renderTokens } from "../knowledge/formulaTokenizer.mjs";

const EXPECTED_KNOWLEDGE_KIND = "calculation_formula";

// 教材由来ではない、アプリ側の固定の操作説明文(生成AIによる言い換え・
// 問題文生成は行わない、`m5_exercise_generation_design.md`4-2節)。
const INSTRUCTION_TEXT = "正しい式になるように並べ替えてください。";

/**
 * @param {{ approvedAt: string, sourceCase: string, knowledge: object }} approvedEntry
 *   output/knowledge/approved-knowledge.json の knowledge[] の1要素
 * @returns {object} Exercise(`m5_exercise_generation_design.md`4節のデータモデル)
 */
export function generateFormulaOrderingExercise(approvedEntry) {
  const { knowledge } = approvedEntry;

  if (knowledge.knowledgeKind !== EXPECTED_KNOWLEDGE_KIND) {
    throw new Error(`想定外のknowledgeKindです(fail-closed): ${knowledge.knowledgeKind}`);
  }

  const topLevelTokens = knowledge.content.structure.tokens;
  const correctOrder = topLevelTokens.map((token) => renderTokens(token));

  // 往復整合性の防御的な再検証: correctOrderを単純連結した結果が
  // rawFormulaと一致するはず(トップレベルのtoken間には元々セパレータが
  // 無いため、そのまま連結すればよい)。一致しなければ生成しない
  // (fail-closed、想定外の構造変化を見逃さない)。
  const rejoined = correctOrder.join("");
  if (rejoined !== knowledge.content.rawFormula) {
    throw new Error(
      `往復整合性チェックに失敗した(fail-closed):\n` +
        `  チャンク連結結果: ${rejoined}\n` +
        `  rawFormula: ${knowledge.content.rawFormula}`,
    );
  }

  return {
    type: "Exercise",
    // Knowledge ID+exerciseKindから決定的に導出する(同じKnowledgeを
    // 何度再生成しても同じExercise IDになる、`exerciseKind`が異なれば
    // 同一Knowledgeから複数Exerciseを生成してもID衝突しない)。
    id: `exercise-${knowledge.id}-formula_ordering`,
    exerciseKind: "formula_ordering",
    knowledgeRef: {
      knowledgeId: knowledge.id,
      approvedAt: approvedEntry.approvedAt,
    },
    prompt: {
      instruction: INSTRUCTION_TEXT,
      instructionOrigin: "app_generated",
    },
    answer: {
      correctOrder,
      grading: { method: "exact_sequence_match" },
    },
    reveal: {
      rawFormula: knowledge.content.rawFormula,
      sourceRefs: knowledge.sourceRefs,
    },
  };
}
