// [2] Structure Recognition(最小版)
//
// `planning/m1_minimal_parser_prototype_design.md`2節のとおり、このケースに
// 必要な最小限(テーマ見出し1件・論点見出し1件の検出)のみを対象とする。
// 全ラベル・全テーマ・➊➋➌等のサブ項目検出は対象外(次フェーズ以降)。
//
// `structurenode_recognition_survey.md`で確認済みの2つの注意点を踏まえる。
// - テーマ番号・論点番号は全角/半角、ハイフンの表記ゆれ(全角－/半角-)がある。
// - 各テーマ冒頭の目次一覧(「このテーマの学習内容」)には論点番号+タイトルが
//   並ぶため、本文の論点見出しと誤って一致させない。

const TOC_MARKER = "このテーマの学習内容";

const ZENKAKU_DIGITS = "０１２３４５６７８９";

function toHalfWidthDigits(str) {
  return str.replace(/[０-９]/g, (ch) =>
    String(ZENKAKU_DIGITS.indexOf(ch)),
  );
}

/**
 * テーマ見出し(「テーマ８」のような単独行 + 直後のタイトル行)を検出する。
 * @param {string} pageText
 * @returns {{ nodeKind: "theme", number: string, titleRaw: string } | null}
 */
export function detectThemeHeading(pageText) {
  const lines = pageText.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    // 抽出モードにより「テーマ８」と直後のタイトルが同一行/別行のどちらにも
    // なりうることを実データで確認したため、両方を許容する
    // (`m1_implementation_report.md`参照)。
    const sameLine = lines[i].match(/^テーマ([０-９0-9]+)\s+(\S.+)$/);
    if (sameLine) {
      return {
        nodeKind: "theme",
        number: toHalfWidthDigits(sameLine[1]),
        titleRaw: sameLine[2].trim(),
      };
    }
    const numberOnly = lines[i].match(/^テーマ([０-９0-9]+)\s*$/);
    if (!numberOnly) continue;
    const number = toHalfWidthDigits(numberOnly[1]);
    const titleRaw = lines
      .slice(i + 1)
      .find((l) => l.length > 0 && !/^重要度/.test(l));
    if (!titleRaw) continue;
    return { nodeKind: "theme", number, titleRaw };
  }
  return null;
}

/**
 * 論点見出し(「８-２ 減価償却」のような単独行)を検出する。
 * 目次一覧ページ(TOC_MARKERを含むページ)は対象外とする
 * (`structurenode_recognition_survey.md`の申し送りどおり)。
 * @param {string} pageText
 * @returns {{ nodeKind: "topic", number: string, titleRaw: string } | null}
 */
export function detectTopicHeading(pageText) {
  if (pageText.includes(TOC_MARKER)) {
    return null;
  }
  const lines = pageText.split("\n").map((l) => l.trim());
  for (const line of lines) {
    const match = line.match(
      /^([０-９0-9]+)[-－]([０-９0-9]+)\s+(\S.+)$/,
    );
    if (!match) continue;
    const number = `${toHalfWidthDigits(match[1])}-${toHalfWidthDigits(match[2])}`;
    return { nodeKind: "topic", number, titleRaw: match[3].trim() };
  }
  return null;
}
