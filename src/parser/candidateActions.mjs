// [8] 候補確定フェーズ(縮小版): Source候補を確定Source(子ContentBlock)に
// する、または確定しない(除外する)。
//
// 対象は`output/cases/teigakuho-application.json`の`candidates`配列であり、
// `derivedKnowledgeCandidate`(Knowledge層)には一切触れない(この関数自体は
// Knowledgeとの同一性判定・`sourceRefs.role`の割り当てを行わない、
// `parser_design_proposal.md`4-2節、Parserは意味判断をしない)。
//
// `method`("auto" | "human_reviewed")は、この確定がどちらの経路で行われた
// かの監査記録である。F群の構造的事実のみで自動確定できる候補は
// `evaluateCandidateConfirmation.mjs`の判定を経て"auto"で確定し、それ以外は
// 人間がM4画面上で「このSourceをKnowledgeの根拠として追加してよいか」を
// 判断した結果として"human_reviewed"で確定する
// (`knowledge_integration_review_scope_design.md`4節)。

function getCandidateOrThrow(applicationCaseData, candidateId) {
  const candidate = applicationCaseData.candidates.find((c) => c.candidateId === candidateId);
  if (!candidate) {
    throw new Error(`候補が見つからない: ${candidateId}`);
  }
  return candidate;
}

function assertState(candidate, expected, action) {
  if (candidate.confirmationStatus !== expected) {
    throw new Error(
      `不正な状態遷移(fail-closed): confirmationStatus="${candidate.confirmationStatus}"に対して` +
        `"${action}"は許可されていない(許可されるのは"${expected}"からのみ)`,
    );
  }
}

function replaceCandidate(applicationCaseData, candidateId, updatedCandidate) {
  return {
    ...applicationCaseData,
    candidates: applicationCaseData.candidates.map((c) =>
      c.candidateId === candidateId ? updatedCandidate : c,
    ),
  };
}

const VALID_METHODS = new Set(["auto", "human_reviewed"]);

/**
 * candidate -> confirmed。確定Source(子ContentBlock)のIDを発行する
 * (候補IDをそのまま流用した安定的なブロックID)。
 * @param {object} applicationCaseData
 * @param {string} candidateId
 * @param {{ note?: string, method?: "auto" | "human_reviewed" }} [options]
 * @returns {object} 更新後のapplicationCaseData
 */
export function confirmCandidate(applicationCaseData, candidateId, { note, method = "human_reviewed" } = {}) {
  const candidate = getCandidateOrThrow(applicationCaseData, candidateId);
  assertState(candidate, "candidate", "confirm");
  if (!VALID_METHODS.has(method)) {
    throw new Error(`未知のconfirmationMethod(fail-closed): ${method}`);
  }

  const confirmedBlockId = `block-${candidate.candidateId}`;
  const updated = {
    ...candidate,
    confirmationStatus: "confirmed",
    confirmationMethod: method,
    reviewedAt: new Date().toISOString(),
    reviewNote: note ?? null,
    confirmedBlockId,
  };

  return replaceCandidate(applicationCaseData, candidateId, updated);
}

/**
 * candidate -> rejected(削除ではなく状態遷移。監査証跡として残す)。
 * @param {object} applicationCaseData
 * @param {string} candidateId
 * @param {{ note?: string }} [options]
 * @returns {object} 更新後のapplicationCaseData
 */
export function rejectCandidate(applicationCaseData, candidateId, { note } = {}) {
  const candidate = getCandidateOrThrow(applicationCaseData, candidateId);
  assertState(candidate, "candidate", "reject");

  const updated = {
    ...candidate,
    confirmationStatus: "rejected",
    reviewedAt: new Date().toISOString(),
    reviewNote: note ?? null,
  };

  return replaceCandidate(applicationCaseData, candidateId, updated);
}

/**
 * 確定した候補から、確定Source(ContentBlock)を組み立てる。第1ケースの
 * 確定Source(定義式)と同じ4概念モデルを持ち、`provenance`(`diag`外、
 * `parser_design_proposal.md`5-1節)で親Sourceとの関係を記録する。
 * @param {object} confirmedCandidate confirmationStatus === "confirmed" の候補
 * @returns {object} ContentBlock
 */
export function buildConfirmedSource(confirmedCandidate) {
  if (confirmedCandidate.confirmationStatus !== "confirmed") {
    throw new Error(
      `confirmationStatusが"confirmed"でない候補から確定Sourceは組み立てられない(fail-closed): ` +
        confirmedCandidate.candidateId,
    );
  }
  return {
    type: "ContentBlock",
    id: confirmedCandidate.confirmedBlockId,
    blockKind: "formula_termbased",
    structureRef: confirmedCandidate.structureRef,
    location: confirmedCandidate.location,
    extractionRaw: confirmedCandidate.extractionRaw,
    sourceFaithful: confirmedCandidate.sourceFaithful,
    diag: confirmedCandidate.diag,
    provenance: {
      parentLabel: confirmedCandidate.parentContext.label,
      relation: "extracted_from_parent",
      note:
        confirmedCandidate.confirmationMethod === "auto"
          ? "F群の構造的事実のみで自動確定された(confirmationMethod: auto)"
          : "人間がKnowledgeの根拠として追加してよいと判断し確定した(confirmationMethod: human_reviewed)",
    },
  };
}
