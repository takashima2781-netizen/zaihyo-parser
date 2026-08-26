// [3] Block Detection(最小版: 用語ベース計算式パターン検出器のみ)
//
// `pattern_detection_survey.md`で検証済みの「漢字項+演算子記号」という
// 用語ベース計算式のパターンを検出する。ラベル検出系(設例/解説/留意点等)・
// 仕訳型・方程式検出器は対象外(`m1_minimal_parser_prototype_design.md`3節)。
//
// 1行に「（...－...）×...＝...」という形が現れる行を候補として検出する。
// 分数(分子/分母)がFaithful Restoration前の抽出結果で別行に分離している
// 場合があるため(`parser_source_granularity_validation.md`ケース5)、
// マッチした行の前後1行を`contextLines`として一緒に保持し、[5]の判定材料にする。

const FORMULA_LINE_PATTERN = /[（(][^（）()]*[－\-][^（）()]*[）)]\s*×.*[＝=].+/;

/**
 * @param {string} pageText
 * @returns {Array<{
 *   matchedLine: string,
 *   lineIndex: number,
 *   contextBefore: string[],
 *   contextAfter: string[],
 *   precedingHeading: string | null,
 *   detectorId: "termBasedFormulaDetector",
 * }>}
 */
export function detectTermBasedFormulas(pageText) {
  const rawLines = pageText.split("\n");
  const candidates = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!FORMULA_LINE_PATTERN.test(line)) continue;

    const contextBefore = rawLines.slice(Math.max(0, i - 1), i).map((l) => l.trim());
    const contextAfter = rawLines.slice(i + 1, i + 2).map((l) => l.trim());

    // 直前の数行に「サブ項目番号+ラベル」(例: "１ 定額法（〇）")があれば、
    // どの技術の式かを区別するための手がかりとして保持する。
    // 意味判断(この式がどのDerived Knowledgeか等)は行わない
    // (`parser_design_proposal.md`4節)。単なる検出根拠の記録。
    let precedingHeading = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const trimmed = rawLines[j].trim();
      const headingMatch = trimmed.match(/^[０-９0-9]+\s+(\S+)/);
      if (headingMatch) {
        precedingHeading = trimmed;
        break;
      }
    }

    candidates.push({
      matchedLine: line.trim(),
      lineIndex: i,
      contextBefore,
      contextAfter,
      precedingHeading,
      detectorId: "termBasedFormulaDetector",
    });
  }

  return candidates;
}
