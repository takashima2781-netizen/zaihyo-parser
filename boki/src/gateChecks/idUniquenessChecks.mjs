// gateChecks: ケース横断でのID一意性検証(Phase C着手前のアーキテクチャ
// 確認で追加、`planning/phase_c_readiness_assessment.md`4節)。
//
// CLAUDE.mdのテスト方針が明示する不変条件のうち「IDが重複していないか」に
// 対応する。現状、確定Source ID・Knowledge IDはいずれも人間が手動で命名する
// 文字列であり、量産時に既存IDとの衝突が静かに発生しうる。この検証は
// 一次判断器ではなく、生成済みデータの構造・整合性契約を検証するものである
// (CLAUDE.mdのgateChecks方針、`applicationIntegrationChecks.mjs`と同じ
// 位置づけ)。

/**
 * @param {Array<object>} caseDataList `output/cases/*.json`(`.test.json`を
 *   除く)の内容の配列
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkIdUniqueness(caseDataList) {
  const violations = [];
  const blockIdOwners = new Map();
  const knowledgeIdOwners = new Map();

  function record(map, id, caseName) {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(caseName);
  }

  for (const caseData of caseDataList) {
    if (caseData.block?.id) {
      record(blockIdOwners, caseData.block.id, caseData.case);
    }
    if (Array.isArray(caseData.candidates)) {
      for (const candidate of caseData.candidates) {
        if (candidate.confirmedBlockId) {
          record(blockIdOwners, candidate.confirmedBlockId, caseData.case);
        }
      }
    }
    const knowledgeId = caseData.derivedKnowledgeCandidate?.knowledge?.id;
    if (knowledgeId) {
      record(knowledgeIdOwners, knowledgeId, caseData.case);
    }
  }

  for (const [id, owners] of blockIdOwners) {
    if (owners.length > 1) {
      violations.push(`確定Source ID "${id}" が複数のケースで重複している: ${owners.join(", ")}`);
    }
  }
  for (const [id, owners] of knowledgeIdOwners) {
    if (owners.length > 1) {
      violations.push(`Knowledge ID "${id}" が複数のケースで重複している: ${owners.join(", ")}`);
    }
  }

  return { ok: violations.length === 0, violations };
}
