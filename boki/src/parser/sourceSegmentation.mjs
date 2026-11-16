// [4] Source Segmentation(最小版: F3のみ)
//
// `parser_design_proposal.md`3-6節のF3(候補が既に確定済みのStructureNode/
// ContentBlockと同じ階層構造上にある〈トップレベルの独立Source〉場合、その
// まま確定Sourceとする)のみを実装する。F4〜F8を含む候補評価ロジック全体は
// このケースでは発火しないため実装しない(`m1_minimal_parser_prototype_design.md`
// 3節・4節)。
//
// このケースの用語ベース計算式候補は、論点8-2の直下(設例等の内部にネスト
// していない)で検出されているため、F3により即座に確定Sourceとする。

/**
 * @param {{ nestedUnder: string | null }} candidate
 * @returns {{ confirmed: boolean, rule: string, note: string }}
 */
export function applyF3(candidate) {
  if (candidate.nestedUnder === null) {
    return {
      confirmed: true,
      rule: "F3",
      note: "トップレベル(既に確定済みのStructureNodeの直下)のため即時確定",
    };
  }
  // このケースでは発火しない分岐。F4〜F8の評価は次フェーズ以降の課題
  // (`parser_design_proposal.md`3-9節)。
  return {
    confirmed: false,
    rule: "unresolved",
    note: "トップレベルではないため、このM1実装の範囲では確定できない(候補提示方針の対象、次フェーズ)",
  };
}
