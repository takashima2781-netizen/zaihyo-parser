// [3] Block Detection(最小版: 用語ベース計算式パターン検出器のみ)
//
// `pattern_detection_survey.md`で検証済みの「漢字項+演算子記号」という
// 用語ベース計算式のパターンを検出する。ラベル検出系(設例/解説/留意点等)・
// 仕訳型・方程式検出器は対象外(`m1_minimal_parser_prototype_design.md`3節)。
//
// 1行に「（...－...）×...＝...」という形、または「数値×...＝...」という
// 形(残存価額がゼロで減算部分が教材上省略される適用例。第2ケースの実データ
// 検証で判明、`planning/case2_readiness_and_generalization_analysis.md`
// 5節1項)が現れる行を候補として検出する。分数(分子/分母)がFaithful
// Restoration前の抽出結果で別行に分離している場合があるため
// (`parser_source_granularity_validation.md`ケース5)、マッチした行の前後
// 1行を`contextLines`として一緒に保持し、[5]の判定材料にする。

const FORMULA_LINE_PATTERN =
  /(?:[（(][^（）()]*[－\-][^（）()]*[）)]|[０-９0-9][０-９0-9,，]*)\s*×.*[＝=].+/;

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

// 仕訳パターン検出器(第3ケースで追加): 「(借)勘定科目×××(貸)勘定科目
// ×××」という形の行を検出する。具体的な金額の代わりに「×××」という
// プレースホルダーで一般化された仕訳の型を示す教材上の記法であり、
// 計算式検出器(用語ベース計算式)とは別のパターンとして扱う(第3ケースの
// 実データ〈テーマ8-11 無形固定資産の会計処理〉で確認済み)。ラベル検出系
// (設例/解説/留意点等)・方程式検出器は引き続き対象外
// (`m1_minimal_parser_prototype_design.md`3節の方針を維持)。
//
// 第4ケースの実データ(テーマ4-1 手形、約束手形の振出人/名宛人)で、
// 「(借)」の直前に役割ラベル(例: "振出人")が同じ行に同居しているケースを
// 確認したため、`^`固定ではなく行内のどこにあってもマッチできるよう
// 拡張した(前方の文字列は`inlineLabelRaw`として保持し、意味判断は
// 行わない)。第3ケースのように行頭が「(借)」のままの場合は
// `inlineLabelRaw`はnullになり、既存の挙動と変わらない。
const JOURNAL_PATTERN_LINE =
  /[（(]借[）)]\s*(.+?)\s*×××\s*[（(]貸[）)]\s*(.+?)\s*×××\s*$/;

/**
 * @param {string} pageText
 * @returns {Array<{
 *   matchedLine: string,
 *   lineIndex: number,
 *   debitAccountRaw: string,
 *   creditAccountRaw: string,
 *   inlineLabelRaw: string | null,
 *   precedingHeading: string | null,
 *   detectorId: "journalPatternDetector",
 * }>}
 */
export function detectJournalPatterns(pageText) {
  const rawLines = pageText.split("\n");
  const candidates = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    const match = line.match(JOURNAL_PATTERN_LINE);
    if (!match) continue;

    const journalStartIndex = line.indexOf(match[0]);
    const inlineLabelRaw = line.slice(0, journalStartIndex).trim() || null;

    // 直前の数行に「(番号) ラベル」(例: "(1) 支出時")があれば、どの局面の
    // 仕訳かを区別するための手がかりとして保持する。意味判断は行わない
    // (単なる検出根拠の記録、`termBasedFormulaDetector`と同じ考え方)。
    let precedingHeading = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const trimmed = rawLines[j].trim();
      const headingMatch = trimmed.match(/^[（(][０-９0-9]+[）)]\s*(\S+)/);
      if (headingMatch) {
        precedingHeading = trimmed;
        break;
      }
    }

    candidates.push({
      matchedLine: line,
      inlineLabelRaw,
      lineIndex: i,
      debitAccountRaw: match[1],
      creditAccountRaw: match[2],
      precedingHeading,
      detectorId: "journalPatternDetector",
    });
  }

  return candidates;
}

// 「設 例」ラベル(教材の設例見出し)を、候補行より前の範囲で探す。
// 第1ケース(トップレベル、ネストなし)では使われない、第2ケース専用の
// 最小限の追加(`case2_readiness_and_generalization_analysis.md`2-4節・
// 3-1節)。ラベル検出系全体(6ラベルすべて・PUAアイコン判定等)は引き続き
// スコープ外であり、「設例」1ラベルの見出し文字列だけを探す。
//
// 実データ確認(第2ケース、2箇所とも同一パターン): `sort=True`の読み順
// ヒューリスティックは、アイコン文字に隣接する「設」の文字を行末へ
// 追いやり、「例 ◯◯設」のような語順に入れ替えてしまう
// (`case2_readiness_and_generalization_analysis.md`7-1節と同種の、
// アイコン隣接テキストの並び替わり)。この実データで確認済みの語順に
// 合わせてパターンを定義する(「設 例」の通常語順ではなく「例...設」)。
const NESTED_LABEL_PATTERN = /例.{0,20}設\s*$/;

/**
 * @param {string} pageText
 * @param {number} candidateLineIndex
 * @param {number} [searchWindow] 何行前まで遡って探すか
 * @returns {{ label: string, lineIndex: number } | null}
 */
export function findNestedParentLabel(pageText, candidateLineIndex, searchWindow = 60) {
  const rawLines = pageText.split("\n");
  for (
    let j = candidateLineIndex - 1;
    j >= Math.max(0, candidateLineIndex - searchWindow);
    j--
  ) {
    const trimmed = rawLines[j].trim();
    if (NESTED_LABEL_PATTERN.test(trimmed)) {
      return { label: trimmed, lineIndex: j };
    }
  }
  return null;
}
