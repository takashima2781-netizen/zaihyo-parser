// M2: Derived Knowledge候補生成(定額法1ケース専用、汎用Knowledge生成器ではない)
//
// `planning/m2_derived_knowledge_candidate_design.md`に従い、確定Source
// (`block-teigakuho-def`)1件からDerived Knowledge候補1件を生成する。
//
// reviewStatus(候補/承認済み等)は、Derived Knowledge本体の外側で管理する
// (ユーザー承認済みの方針。`m2_derived_knowledge_candidate_design.md`10節案A)。
// 3軸(contentConfidence/evidence/consolidation)はKnowledgeそのものの
// 内容・確信度を表す軸であり、レビュー工程上の状態(reviewStatus)とは
// 意味が異なるため、混同しない。

import { tokenizeSubtractFractionFormula, renderTokens } from "./formulaTokenizer.mjs";

const EXPECTED_BLOCK_ID = "block-teigakuho-def";
const EXPECTED_BLOCK_KIND = "formula_termbased";

// Sourceの復元確信度(diag.faithfulReconstruction.confidence)から、
// Derived Knowledge側のcontentConfidence.levelへの伝播規則。
// 未知の値は無理に対応させず例外を投げる(fail-closed、原則4)。
const CONFIDENCE_PROPAGATION = {
  high: "verified_from_source",
};

// evidence/consolidationは、sourceRefsから機械的に導出する
// (M4設計3-1節でB分類〈システムが再計算〉としたフィールド)。
// M2(初回生成)・M4(修正保存時の再計算)・第2ケースの複数Source統合の
// いずれからも同じロジックを使う。第2ケースの実データ検証で、
// `byRole`のrole別集計ロジック自体は複数件にそのまま一般化できることを
// 確認した(`case2_readiness_and_generalization_analysis.md`5節5項)。
// 一方、`distinctThemes`はSourceごとに異なりうるため呼び出し側から明示的に
// 渡す(この関数はSourceからテーマを逆引きする責務を持たない)。
/**
 * @param {{ sourceRefs: Array<{ role: string }>, distinctThemes: string[] }} params
 * @returns {{ evidence: object, consolidation: object }}
 */
export function computeEvidenceAndConsolidation({ sourceRefs, distinctThemes }) {
  if (sourceRefs.length < 1) {
    throw new Error("sourceRefsが空です(fail-closed)");
  }
  const byRole = {};
  for (const ref of sourceRefs) {
    byRole[ref.role] = (byRole[ref.role] ?? 0) + 1;
  }
  return {
    evidence: {
      byRole,
      distinctThemes,
      distinctBooks: ["book-1"],
      crossesBaseAdvanced: false,
    },
    consolidation: {
      // 2件以上のSourceを同一知識として統合してよいと判断された結果として
      // merged_confirmedになる(出現回数による機械的な閾値判定ではない、
      // CLAUDE.md原則4)。この統合判断自体は、[8]候補確定フェーズ側で
      // 「この候補は既存Knowledgeの適用例である」と人間が確認した時点で
      // 行われる(Parser側へは逆流させない、
      // `case2_readiness_and_generalization_analysis.md`4-2節)。
      state: sourceRefs.length === 1 ? "single_source" : "merged_confirmed",
      possibleDuplicateOf: [],
    },
  };
}

/**
 * @param {{ block: object, structureContext: { theme: { id: string } } }} confirmedCase
 * @returns {{ reviewStatus: "candidate", knowledge: object }}
 */
export function deriveTeigakuhoKnowledgeCandidate({ block, structureContext }) {
  if (block.id !== EXPECTED_BLOCK_ID) {
    throw new Error(
      `このM2実装は${EXPECTED_BLOCK_ID}専用です。対象外のブロックです: ${block.id}`,
    );
  }
  if (block.blockKind !== EXPECTED_BLOCK_KIND) {
    throw new Error(
      `想定外のblockKindです(fail-closed): ${block.blockKind}`,
    );
  }

  const rawFormula = block.sourceFaithful;
  if (!rawFormula) {
    throw new Error("sourceFaithfulが空のため、Derived Knowledge候補を生成できない");
  }

  // content.structure: rawFormulaを5トークン語彙で構造化する。
  const structure = tokenizeSubtractFractionFormula(rawFormula);

  // 往復整合性(round-trip): 構造化結果がrawFormulaを忠実に表現しているかを
  // 機械的に検証する。一致しなければ候補を生成しない(fail-closed)。
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
    id: "dk-calc-formula-teigakuho",
    knowledgeKind: "calculation_formula",
    content: {
      rawFormula,
      structure,
    },
    sourceRefs,
    contentConfidence: {
      level,
      note: "Source原文の用語ベース式(sourceFaithful)をそのまま転記。復元・意訳なし",
    },
    evidence,
    consolidation,
    scopeNote:
      "本書テーマ8-2でのみ確認。テーマ8/9への数値適用は本ケースでは未収録(第2ケースで扱う予定)",
  };

  // reviewStatus: Derived Knowledge本体(knowledge)の外側で管理する。
  // 今回のM2で生成される候補は常に"candidate"のみ。承認/除外等の値は
  // M4(候補確定フェーズ)の実装時に追加する(先回りして定義しない)。
  return {
    reviewStatus: "candidate",
    knowledge,
  };
}
