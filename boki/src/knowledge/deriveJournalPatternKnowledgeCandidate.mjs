// M2拡張(第3ケース専用): 仕訳パターンのDerived Knowledge候補生成。
//
// テーマ8-11(無形固定資産)の会計処理から検出された仕訳パターン
// Source(1件)から、Derived Knowledge候補(knowledgeKind: "journal_pattern")
// を1件生成する。`deriveKnowledgeCandidate.mjs`(定額法の計算式専用)とは
// 別関数として追加する(汎用Knowledge生成器ではない、CLAUDE.md原則6)。
// ただし、evidence/consolidationの導出ロジック(`computeEvidenceAnd
// Consolidation`)は完全に汎用であることが第2ケースで確認済みのため、
// そのまま再利用する。
//
// このケースは2件の仕訳パターン(支出時/決算時)を持つが、教材上「同じ
// 資産カテゴリの2つの異なる局面での仕訳」という別々の型であり、既存の
// Knowledge粒度の前提(1つの完結した計算/仕訳の型 = 1 Knowledge、第1
// ケースの1計算式=1Knowledgeパターンをそのまま踏襲)に従い、2件とも
// 独立したKnowledge候補として扱う(1つのKnowledgeに合成しない)。この
// 粒度判断は教材の意味解釈というより、既存の「1 Source(1つの完結した
// 型)→1 Knowledge」という確立済みパターンへの機械的な当てはめである。

import { tokenizeJournalPattern, renderTokens } from "./journalPatternTokenizer.mjs";
import { computeEvidenceAndConsolidation } from "./deriveKnowledgeCandidate.mjs";

const EXPECTED_BLOCK_KIND = "journal_termbased";

// Sourceの復元確信度(diag.faithfulReconstruction.confidence)から、
// Derived Knowledge側のcontentConfidence.levelへの伝播規則。
// `deriveKnowledgeCandidate.mjs`と同じ対応表(未知の値はfail-closed)。
const CONFIDENCE_PROPAGATION = {
  high: "verified_from_source",
};

/**
 * @param {{
 *   block: object,
 *   structureContext: { theme: { id: string } },
 *   knowledgeId: string,
 *   scopeNote: string,
 * }} params
 * @returns {{ reviewStatus: "candidate", knowledge: object }}
 */
export function deriveJournalPatternKnowledgeCandidate({ block, structureContext, knowledgeId, scopeNote }) {
  if (block.blockKind !== EXPECTED_BLOCK_KIND) {
    throw new Error(`想定外のblockKindです(fail-closed): ${block.blockKind}`);
  }

  const rawFormula = block.sourceFaithful;
  if (!rawFormula) {
    throw new Error("sourceFaithfulが空のため、Derived Knowledge候補を生成できない");
  }

  const structure = tokenizeJournalPattern(rawFormula);

  const rendered = renderTokens(structure);
  if (rendered !== rawFormula) {
    throw new Error(
      `往復整合性チェックに失敗した(fail-closed、無理に構造化しない):\n` +
        `  復元結果: ${rendered}\n` +
        `  rawFormula: ${rawFormula}`,
    );
  }

  const restorationConfidence = block.diag?.faithfulReconstruction?.confidence;
  const level = CONFIDENCE_PROPAGATION[restorationConfidence];
  if (!level) {
    throw new Error(
      `diag.faithfulReconstruction.confidence="${restorationConfidence}"に対応する` +
        `contentConfidence.levelの伝播規則が未定義(fail-closed)`,
    );
  }

  const sourceRefs = [{ sourceBlockId: block.id, role: "definition" }];
  const { evidence, consolidation } = computeEvidenceAndConsolidation({
    sourceRefs,
    distinctThemes: [structureContext.theme.id],
  });

  const knowledge = {
    type: "DerivedKnowledge",
    id: knowledgeId,
    knowledgeKind: "journal_pattern",
    content: {
      rawFormula,
      structure,
    },
    sourceRefs,
    contentConfidence: {
      level,
      note: "Source原文の仕訳パターン(sourceFaithful)をそのまま転記。復元・意訳なし",
    },
    evidence,
    consolidation,
    scopeNote,
  };

  return {
    reviewStatus: "candidate",
    knowledge,
  };
}
