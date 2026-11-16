// M2拡張(第2ケース専用): [8]候補確定フェーズで確定した適用例Sourceを、
// 既存の承認済みKnowledge(`dk-calc-formula-teigakuho`)へ統合する。
//
// `content`(rawFormula/structure)は変更しない。ユーザー承認済みの方針:
// 「definition由来のcontentをKnowledgeの正本とし、application Sourceは
// sourceRefsとして追加するのみ」——これは今回の定額法ケースで確認できた
// パターンとして実装するものであり、Derived Knowledge全般の絶対ルールへは
// 一般化しない(`case2_readiness_and_generalization_analysis.md`への
// ユーザー回答、実装時の申し送りとして本ファイルのコメントに残す)。
//
// 【設計判断・要記録】この統合によって`reviewStatus`(M4のKnowledge承認状態)
// は変更しない。理由: `reviewStatus`が承認しているのは`content`
// (rawFormula/structure、Category C)と`contentConfidence`/`scopeNote`
// (Category A)であり、この統合が変化させるのは`sourceRefs`経由で
// 再計算される`evidence`/`consolidation`(Category B)のみである
// (M4設計のフィールド分類、`knowledge_integration_review_scope_design.md`
// 2節)。Category Bはそもそも人間の承認対象として設計されておらず、
// `content`はこの統合(および他のどの既存経路)からも変更されない。
// したがって、統合のたびにKnowledge全体を再承認待ちに戻す必要はない。
// 一方、この統合を実行してよいかどうかの判断(自動確定条件を満たすか、
// または人間が個別に「Knowledgeの根拠として追加してよいか」を判断したか)
// は、この関数の呼び出し側(`confirmAndIntegrateCandidate.mjs`)が担う。

import { computeEvidenceAndConsolidation } from "./deriveKnowledgeCandidate.mjs";

/**
 * @param {object} definitionCaseData output/cases/teigakuho-definition.json の内容
 * @param {object} confirmedBlock 確定Source(ContentBlock、`candidateActions.
 *   buildConfirmedSource`が組み立てたもの)
 * @param {string} themeId この確定Sourceが属するテーマのID
 * @returns {object} 更新後のdefinitionCaseData
 */
export function integrateApplicationSource(definitionCaseData, confirmedBlock, themeId) {
  const dkc = definitionCaseData.derivedKnowledgeCandidate;
  if (!dkc) {
    throw new Error("derivedKnowledgeCandidateが存在しない(fail-closed)");
  }
  const { knowledge } = dkc;

  if (knowledge.sourceRefs.some((ref) => ref.sourceBlockId === confirmedBlock.id)) {
    throw new Error(
      `このSourceは既にsourceRefsへ統合済みです(fail-closed、重複統合を防止): ${confirmedBlock.id}`,
    );
  }

  const newSourceRefs = [...knowledge.sourceRefs, { sourceBlockId: confirmedBlock.id, role: "application" }];
  const distinctThemes = [...new Set([...knowledge.evidence.distinctThemes, themeId])];
  const { evidence, consolidation } = computeEvidenceAndConsolidation({
    sourceRefs: newSourceRefs,
    distinctThemes,
  });

  const updatedKnowledge = {
    ...knowledge,
    sourceRefs: newSourceRefs,
    evidence,
    consolidation,
  };

  return {
    ...definitionCaseData,
    derivedKnowledgeCandidate: {
      ...dkc,
      knowledge: updatedKnowledge,
    },
  };
}
