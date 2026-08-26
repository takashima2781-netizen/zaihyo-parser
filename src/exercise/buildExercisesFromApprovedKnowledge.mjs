// M5: approved-knowledge.json(M4の派生ビュー)からExercise配列を組み立てる。
//
// このM5実装が対象とするKnowledgeは`dk-calc-formula-teigakuho`1件のみ。
// `output/cases/`(candidate/rejectedを含む生データ)は一切参照しない
// (呼び出し側がapproved-knowledge.jsonの内容だけを渡す設計そのものが、
// この境界を機構として保証する)。

import { generateFormulaOrderingExercise } from "./generateFormulaOrderingExercise.mjs";

const TARGET_KNOWLEDGE_ID = "dk-calc-formula-teigakuho";

/**
 * @param {{ knowledge: Array<{ knowledge: { id: string } }> }} approvedKnowledgeData
 *   output/knowledge/approved-knowledge.json の内容
 * @returns {{ exercises: object[] }}
 */
export function buildExercisesFromApprovedKnowledge(approvedKnowledgeData) {
  const entry = approvedKnowledgeData.knowledge.find(
    (k) => k.knowledge.id === TARGET_KNOWLEDGE_ID,
  );
  if (!entry) {
    throw new Error(
      `${TARGET_KNOWLEDGE_ID} が approved-knowledge.json に見つからない` +
        `(承認されていない、または候補として存在しない)。` +
        `M4でこのKnowledgeを承認済みか確認してください。`,
    );
  }
  return { exercises: [generateFormulaOrderingExercise(entry)] };
}
