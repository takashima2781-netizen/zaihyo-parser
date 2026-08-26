// M4: Derived Knowledge候補の承認・修正・除外(定額法1件専用)
//
// `planning/m4_review_workflow_design.md`(改訂版)に従う。
// reviewStatusの遷移は candidate -> approved / rejected の一方向のみ
// (取り消しは今回実装しない、fail-closed)。
//
// 修正(edit)で人間が直接編集できるのは`contentConfidence`・`scopeNote`の
// 2項目のみ(A分類)。`evidence`・`consolidation`は`sourceRefs`から機械的に
// 再計算する(B分類)。`type`/`id`/`knowledgeKind`/`content.rawFormula`/
// `content.structure`/`sourceRefs`はC分類(編集不可)であり、この実装は
// それらを一切受け取らない(そもそも書き換える経路が無い)。

import { renderTokens } from "./formulaTokenizer.mjs";
import { computeEvidenceAndConsolidation } from "./deriveKnowledgeCandidate.mjs";

/**
 * sourceRefsが実際に存在するSourceだけを参照しているかを確認する
 * (fail-closed: 存在しないSourceへの参照を許さない)。
 * @param {Array<{ sourceBlockId: string }>} sourceRefs
 * @param {{ id: string }} block
 */
function assertSourceRefsExist(sourceRefs, block) {
  for (const ref of sourceRefs) {
    if (ref.sourceBlockId !== block.id) {
      throw new Error(
        `sourceRefsが存在しないSourceを参照している(fail-closed): ${ref.sourceBlockId}`,
      );
    }
  }
}

function getCandidateOrThrow(caseData) {
  const dkc = caseData.derivedKnowledgeCandidate;
  if (!dkc) {
    throw new Error("derivedKnowledgeCandidateが存在しない");
  }
  return dkc;
}

function assertState(dkc, expected, action) {
  if (dkc.reviewStatus !== expected) {
    throw new Error(
      `不正な状態遷移(fail-closed): reviewStatus="${dkc.reviewStatus}"に対して` +
        `"${action}"は許可されていない(許可されるのは"${expected}"からのみ)`,
    );
  }
}

/**
 * candidate -> approved
 * @param {object} caseData output/cases/<name>.json の内容全体
 * @param {{ note?: string }} [options]
 * @returns {object} 更新後のcaseData
 */
export function approveCandidate(caseData, { note } = {}) {
  const dkc = getCandidateOrThrow(caseData);
  assertState(dkc, "candidate", "approve");
  assertSourceRefsExist(dkc.knowledge.sourceRefs, caseData.block);

  return {
    ...caseData,
    derivedKnowledgeCandidate: {
      ...dkc,
      reviewStatus: "approved",
      reviewedAt: new Date().toISOString(),
      reviewNote: note ?? dkc.reviewNote ?? null,
    },
  };
}

/**
 * candidate -> rejected(削除ではなく状態遷移。監査証跡として残す)
 * @param {object} caseData
 * @param {{ note?: string }} [options]
 * @returns {object} 更新後のcaseData
 */
export function rejectCandidate(caseData, { note } = {}) {
  const dkc = getCandidateOrThrow(caseData);
  assertState(dkc, "candidate", "reject");

  return {
    ...caseData,
    derivedKnowledgeCandidate: {
      ...dkc,
      reviewStatus: "rejected",
      reviewedAt: new Date().toISOString(),
      reviewNote: note ?? null,
    },
  };
}

/**
 * candidate -> candidate(内容のみ更新)。
 * A分類(contentConfidence・scopeNote)のみ受け取り、evidence/consolidationは
 * sourceRefsから再計算する。往復整合性を防御的に再検証する(fail-closed)。
 * @param {object} caseData
 * @param {{ contentConfidence?: { level: string, note?: string }, scopeNote?: string, note?: string }} edits
 * @returns {object} 更新後のcaseData
 */
export function editCandidate(caseData, edits = {}) {
  const dkc = getCandidateOrThrow(caseData);
  assertState(dkc, "candidate", "edit");

  const { knowledge } = dkc;
  const themeId = caseData.structureContext.theme.id;
  const { evidence, consolidation } = computeEvidenceAndConsolidation({
    sourceRefs: knowledge.sourceRefs,
    themeId,
  });

  const updatedKnowledge = {
    ...knowledge,
    contentConfidence: edits.contentConfidence ?? knowledge.contentConfidence,
    evidence,
    consolidation,
    scopeNote: edits.scopeNote ?? knowledge.scopeNote,
  };

  // 防御的な再検証: content.structure/rawFormulaはこの関数からは
  // 書き換えられないが(C分類、受け取ってすらいない)、将来の変更に
  // 備えて往復整合性を必ず確認する(fail-closed)。
  const rendered = renderTokens(updatedKnowledge.content.structure);
  if (rendered !== updatedKnowledge.content.rawFormula) {
    throw new Error(
      "往復整合性チェックに失敗した(fail-closed): 修正後もrawFormulaと一致しなければならない",
    );
  }

  return {
    ...caseData,
    derivedKnowledgeCandidate: {
      ...dkc,
      reviewNote: edits.note ?? dkc.reviewNote ?? null,
      knowledge: updatedKnowledge,
    },
  };
}
