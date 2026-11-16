// [8]候補確定フェーズ(縮小版)のオーケストレーション: 候補生成の直後に、
// F群の事実だけで安全に自動確定できる候補を判定し、自動確定+Knowledge統合
// まで一括で行う。満たさない候補は、confirmationStatus:"candidate"のまま、
// 判定根拠(autoConfirmEvaluation)だけを付与して人間の個別判断を待つ
// (`knowledge_integration_review_scope_design.md`4節・8節)。
//
// この処理自体はParser本体(runApplicationCandidates.mjs)の外側に置く
// (Parserの出力契約=F群のみ、を変更しないため、8-1節の結論)。
//
// 冪等性: 既にconfirmed/rejectedの候補、および既にKnowledgeへ統合済みの
// Sourceは再処理しない(同じデータに対して再実行しても安全)。

import { evaluateAutoConfirmation } from "./evaluateCandidateConfirmation.mjs";
import { confirmCandidate } from "./candidateActions.mjs";
import { confirmAndIntegrateCandidate } from "./confirmAndIntegrateCandidate.mjs";

function attachEvaluation(applicationCaseData, candidateId, evaluation) {
  return {
    ...applicationCaseData,
    candidates: applicationCaseData.candidates.map((c) =>
      c.candidateId === candidateId ? { ...c, autoConfirmEvaluation: evaluation } : c,
    ),
  };
}

/**
 * @param {{ applicationCase: object, definitionCase: object }} input
 * @returns {{ applicationCase: object, definitionCase: object }}
 */
export function processApplicationCandidates({ applicationCase, definitionCase }) {
  const definitionBlock = definitionCase.block;
  const definitionInfo = {
    definitionBlockId: definitionBlock.id,
    definitionBlockStructureRef: definitionBlock.structureRef,
  };

  let currentApplicationCase = applicationCase;
  let currentDefinitionCase = definitionCase;

  for (const candidate of applicationCase.candidates) {
    if (candidate.confirmationStatus !== "candidate") {
      // 既にconfirmed/rejectedの候補は評価対象外(冪等性)。
      continue;
    }

    const evaluation = evaluateAutoConfirmation(candidate, definitionInfo);

    if (evaluation.result !== "auto_confirm") {
      // needs_review: 状態は変更せず、判定根拠のみ記録する。人間の判断は
      // devViewer/server.mjsの`approve-as-evidence`ルートを経由する。
      currentApplicationCase = attachEvaluation(currentApplicationCase, candidate.candidateId, evaluation);
      continue;
    }

    const wouldBeBlockId = `block-${candidate.candidateId}`;
    const alreadyIntegrated = currentDefinitionCase.derivedKnowledgeCandidate.knowledge.sourceRefs.some(
      (ref) => ref.sourceBlockId === wouldBeBlockId,
    );

    if (alreadyIntegrated) {
      // 冪等性: 既に(過去の実行で)統合済みのSourceを再統合しようとすると
      // integrateApplicationSourceがfail-closedで例外を投げるため、事前に
      // 検知してスキップする。ただしconfirmationStatus自体は、候補生成を
      // やり直した場合の再現性のために"confirmed"へ揃える(Knowledgeへの
      // 再統合は行わない)。
      const confirmedOnly = confirmCandidate(currentApplicationCase, candidate.candidateId, {
        method: "auto",
        note: "既にKnowledgeへ統合済みのSourceのため、確定状態のみ揃えた(再統合はしていない)",
      });
      currentApplicationCase = attachEvaluation(confirmedOnly, candidate.candidateId, evaluation);
      continue;
    }

    const result = confirmAndIntegrateCandidate({
      applicationCase: currentApplicationCase,
      definitionCase: currentDefinitionCase,
      candidateId: candidate.candidateId,
      method: "auto",
      note:
        "F群の構造的事実(同一topic内の適用・定義候補が一意・Restoration解決済み・境界との矛盾なし)のみで自動確定",
    });
    currentApplicationCase = attachEvaluation(result.applicationCase, candidate.candidateId, evaluation);
    currentDefinitionCase = result.definitionCase;
  }

  return { applicationCase: currentApplicationCase, definitionCase: currentDefinitionCase };
}
