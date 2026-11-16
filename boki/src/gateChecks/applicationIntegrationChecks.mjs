// gateChecks: Source候補確定フェーズ(縮小版)の結果に対する事後検証。
//
// CLAUDE.mdのgateChecks方針(生成・変換処理の末尾で複数の不変条件を
// まとめて検証し、違反があれば書き出さずにfail-closedで失敗させる)に
// 従う。ここでは一次判断は一切行わない――判断ロジックは
// evaluateCandidateConfirmation.mjs(自動確定条件)・
// integrateApplicationSource.mjs(統合)に既にあり、本モジュールは
// それらの結果が矛盾していないかを事後的に確認するだけである
// (`knowledge_integration_review_scope_design.md`8-1節)。

import { evaluateAutoConfirmation } from "../parser/evaluateCandidateConfirmation.mjs";

/**
 * @param {{ applicationCase: object, definitionCase: object }} input
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function runApplicationIntegrationGateChecks({ applicationCase, definitionCase }) {
  const violations = [];
  const definitionBlock = definitionCase.block;
  const definitionInfo = {
    definitionBlockId: definitionBlock.id,
    definitionBlockStructureRef: definitionBlock.structureRef,
  };
  const { sourceRefs, content } = definitionCase.derivedKnowledgeCandidate.knowledge;

  // 1. 自動確定の正当性: confirmationMethod==="auto"な候補は、記録された
  //    F群の値から再評価しても必ずauto_confirmになること(一次判断器では
  //    なく、判断結果が実際の根拠と矛盾していないかの再検証)。
  for (const candidate of applicationCase.candidates) {
    if (candidate.confirmationMethod === "auto") {
      const recomputed = evaluateAutoConfirmation(candidate, definitionInfo);
      if (recomputed.result !== "auto_confirm") {
        violations.push(
          `自動確定条件を実際には満たしていない候補が自動確定されている: ${candidate.candidateId}`,
        );
      }
    }
  }

  // 2. sourceRefsとの整合性(双方向)。
  const confirmedBlockIds = new Set(
    applicationCase.candidates
      .filter((c) => c.confirmationStatus === "confirmed")
      .map((c) => c.confirmedBlockId),
  );
  const applicationSourceRefIds = new Set(
    sourceRefs.filter((r) => r.role === "application").map((r) => r.sourceBlockId),
  );
  for (const id of confirmedBlockIds) {
    if (!applicationSourceRefIds.has(id)) {
      violations.push(`confirmedな候補のSourceがsourceRefsに存在しない: ${id}`);
    }
  }
  for (const id of applicationSourceRefIds) {
    if (!confirmedBlockIds.has(id)) {
      violations.push(`sourceRefs中のapplication roleが、confirmedな候補に対応しない: ${id}`);
    }
  }

  // 3. 未確定(candidate)の候補のSourceが、統合先に混入していないこと。
  for (const candidate of applicationCase.candidates) {
    if (candidate.confirmationStatus === "candidate") {
      const wouldBeBlockId = `block-${candidate.candidateId}`;
      if (applicationSourceRefIds.has(wouldBeBlockId)) {
        violations.push(
          `未確定(candidate)の候補のSourceが、既にsourceRefsへ統合されている(fail-closed違反): ${candidate.candidateId}`,
        );
      }
    }
  }

  // 4. content不変性: rawFormulaは常に定義SourceのsourceFaithfulと一致する
  //    (適用例Source統合はcontentに影響しないという既存方針の裏付け)。
  if (content.rawFormula !== definitionBlock.sourceFaithful) {
    violations.push(
      "content.rawFormulaが定義SourceのsourceFaithfulと一致しない(Source統合によりcontentが変化した疑いがある)",
    );
  }

  return { ok: violations.length === 0, violations };
}
