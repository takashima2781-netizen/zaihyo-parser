// M5拡張(第3ケース専用): 仕訳パターンKnowledge(knowledgeKind:
// "journal_pattern")用のExercise generator。
//
// `generateFormulaOrderingExercise.mjs`と機構的にはほぼ同一(トップレベル
// トークンを並び替え形式のExerciseにする)だが、対象とするknowledgeKindが
// 異なるため独立したファイル・独立したexerciseKind("journal_ordering")と
// して追加する(2つの形状を1つの関数に無理に統一しない、
// `formulaTokenizer.mjs`と同じ方針。第2ケースの実データ2件だけで安全な
// 汎化に留めた過去の判断とも整合する)。
//
// 責務分離は`generateFormulaOrderingExercise.mjs`と同じ:
// - 提示順序のシャッフルはここでは行わない(M6の表示時の責務)。
// - 正誤判定の実行はここでは行わない(M6の責務、契約〈grading.method〉のみ)。
// - どのKnowledgeにこのgeneratorを適用するかの判定(`supports`)は
//   `exerciseGeneratorRegistry.mjs`側の責務。この関数はknowledgeKindの
//   防御的な再検証のみ行う。

import { renderTokens } from "../knowledge/journalPatternTokenizer.mjs";

const EXPECTED_KNOWLEDGE_KIND = "journal_pattern";

// 教材由来ではない、アプリ側の固定の操作説明文。
const INSTRUCTION_TEXT = "正しい仕訳になるように並べ替えてください。";

/**
 * @param {{ approvedAt: string, sourceCase: string, knowledge: object }} approvedEntry
 * @returns {object} Exercise(`m5_exercise_generation_design.md`4節のデータモデル)
 */
export function generateJournalOrderingExercise(approvedEntry) {
  const { knowledge } = approvedEntry;

  if (knowledge.knowledgeKind !== EXPECTED_KNOWLEDGE_KIND) {
    throw new Error(`想定外のknowledgeKindです(fail-closed): ${knowledge.knowledgeKind}`);
  }

  const topLevelTokens = knowledge.content.structure.tokens;
  const correctOrder = topLevelTokens.map((token) => renderTokens(token));

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
    id: `exercise-${knowledge.id}-journal_ordering`,
    exerciseKind: "journal_ordering",
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
