// Phase 3Aの対象CheckBlock選定と、BSM木からのノード探索ヘルパー。
// src/bookStructureMaster/selectors.mjs のPhase 2Aと同じ「固定IDリストを明示する」パターンを踏襲する。

// Phase 1/2Aから引き続き使う代表例（docs/book_structure_master_phase2a_report.md 等で確認済み）。
// checkblock-01: 共有設問文＋複数空欄（異常なし、multi_blank/single_blankのクリーンな例）
// checkblock-03: possible_marker_misclassification（p.10、answerは存在するがマーカー未分解のまま
//                1個のQuestionUnitに保持されている。missing_answerを伴わない「純粋な」review_required例）
// checkblock-04: trueFalse型6件（うち3件が教材解説を持つ、explanation_role_unknown情報注記あり）
// checkblock-90: missing_answer 6件 かつ unsupported_table_structure 6件（同一ノード、p.94の2次元表）
// checkblock-208: possible_marker_misclassification かつ missing_answer（同一ノード、p.198）。
//                 ineligibleがreview_requiredより優先されることを示す例
export const PHASE3A_TARGET_CHECKBLOCK_IDS = ["checkblock-01", "checkblock-03", "checkblock-04", "checkblock-90", "checkblock-208"];

function bsmCheckSectionId(checkBlockId) {
  return `cs-${checkBlockId}`;
}

// BSM全体からCheckSectionをidで探す（StructureNode.children / checkSectionsを再帰的に辿る）。
export function findCheckSectionById(bsm, checkSectionId) {
  for (const book of bsm.books) {
    const stack = [...book.structure];
    while (stack.length > 0) {
      const node = stack.pop();
      for (const child of node.children ?? []) stack.push(child);
      for (const cs of node.checkSections ?? []) {
        if (cs.id === checkSectionId) return cs;
      }
    }
  }
  return null;
}

export function findTargetCheckSections(bsm) {
  return PHASE3A_TARGET_CHECKBLOCK_IDS.map((checkBlockId) => {
    const checkSection = findCheckSectionById(bsm, bsmCheckSectionId(checkBlockId));
    if (!checkSection) {
      throw new Error(`対象CheckBlockがBSM内に見つからない: ${checkBlockId} (${bsmCheckSectionId(checkBlockId)})`);
    }
    return { checkBlockId, checkSection };
  });
}

// BSM全体の全CheckSectionを、教材上の出現順（StructureNode内はcheckSections→children の順）で列挙する。
// Phase 3B-1（全件展開）向け。PHASE3A_TARGET_CHECKBLOCK_IDSのような固定リストによるフィルタは行わない。
// 出現順を保つため、findCheckSectionByIdのようなstack(pop)方式ではなく再帰で辿る
// （stack/pop方式は兄弟の順序が反転するため、決定論的な出力順としては採用しない）。
export function findAllCheckSections(bsm) {
  const results = [];
  function walk(node) {
    for (const cs of node.checkSections ?? []) {
      results.push({ checkBlockId: cs.id.replace(/^cs-/, ""), checkSection: cs });
    }
    for (const child of node.children ?? []) walk(child);
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) walk(sn);
  }
  return results;
}

// CheckSection配下の大問QuestionUnit（unitKind==="majorQuestion"、または大問が
// そのまま末端になっている場合はCheckSection直下のQuestionUnit自身）を列挙する。
export function collectMajorQuestionUnits(checkSection) {
  return checkSection.questionUnits ?? [];
}

// QuestionUnitの直接の子のうち、末端（answerを持ちうる、children===[]の空欄/小問）を集める。
// 現行データでは大問の直接の子が常に末端だが、将来より深い階層が来ても対応できるよう、
// 「children===[]のノード」を末端の定義として使う（階層の深さを固定しない）。
export function collectLeafDescendants(questionUnit) {
  const leaves = [];
  (function walk(unit) {
    if ((unit.children ?? []).length === 0) {
      leaves.push(unit);
    } else {
      for (const child of unit.children) walk(child);
    }
  })(questionUnit);
  return leaves;
}
