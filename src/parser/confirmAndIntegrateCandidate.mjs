// Source候補の確定と、Knowledgeへの統合を1つの操作として実行する。
//
// 「Sourceとして確定するか」と「Knowledgeの根拠として追加するか」を
// 別々の人間の判断として問わない、という方針
// (`knowledge_integration_review_scope_design.md`4節・6-2節)にもとづき、
// 自動確定パス(processApplicationCandidates.mjs)・人間承認パス
// (devViewer/server.mjsの`approve-as-evidence`ルート)の両方から、
// この同じ関数を呼び出す(ロジックの重複を避ける)。

import { confirmCandidate, buildConfirmedSource } from "./candidateActions.mjs";
import { integrateApplicationSource } from "../knowledge/integrateApplicationSource.mjs";

function deriveThemeId(applicationCaseData, candidate) {
  const { structureContext } = applicationCaseData;
  return candidate.structureRef === structureContext.topicA.id
    ? structureContext.themeA.id
    : structureContext.themeB.id;
}

/**
 * @param {{
 *   applicationCase: object,
 *   definitionCase: object,
 *   candidateId: string,
 *   method: "auto" | "human_reviewed",
 *   note?: string,
 * }} params
 * @returns {{ applicationCase: object, definitionCase: object }}
 */
export function confirmAndIntegrateCandidate({ applicationCase, definitionCase, candidateId, method, note }) {
  const confirmedApplicationCase = confirmCandidate(applicationCase, candidateId, { method, note });
  const confirmedCandidate = confirmedApplicationCase.candidates.find(
    (c) => c.candidateId === candidateId,
  );
  const confirmedBlock = buildConfirmedSource(confirmedCandidate);
  const themeId = deriveThemeId(confirmedApplicationCase, confirmedCandidate);
  const updatedDefinitionCase = integrateApplicationSource(definitionCase, confirmedBlock, themeId);

  return { applicationCase: confirmedApplicationCase, definitionCase: updatedDefinitionCase };
}
