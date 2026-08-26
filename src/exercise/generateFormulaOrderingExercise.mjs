// M5: Exercise生成(定額法1件専用、汎用問題生成エンジンではない)
//
// `planning/m5_exercise_generation_design.md`(改訂版)に従う。
// 承認済みKnowledge(dk-calc-formula-teigakuho)1件から、並び替え形式の
// Exercise1件を生成する。
//
// 責務分離(4-3節・7-1節):
// - 提示順序のシャッフルはここでは行わない(M6の表示時の責務)。
// - 正誤判定の実行(ユーザー回答との比較)もここでは行わない
//   (M6の責務。ここで用意するのは`answer.grading.method`という契約のみ)。

import { renderTokens } from "../knowledge/formulaTokenizer.mjs";

const EXPECTED_KNOWLEDGE_ID = "dk-calc-formula-teigakuho";
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

  if (knowledge.id !== EXPECTED_KNOWLEDGE_ID) {
    throw new Error(
      `このM5実装は${EXPECTED_KNOWLEDGE_ID}専用です。対象外のKnowledgeです: ${knowledge.id}`,
    );
  }
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
    id: "exercise-teigakuho-formula-ordering",
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
