// Step 1: レイアウト復元（簡略版）。
// 本実装ではbbox情報を持たないため、行単位でclassifyLineし、既知の役割を持つ行を
// 1ブロックの開始とみなす。開始直後に続く「役割不明（unknown）」な行は、空行または
// 次の既知役割行に達するまで同じブロックへ折り返し継続として統合する
// （p.53のように、1つの解答文がpdftotextの行送りで複数物理行にまたがるケースを
//  正しく1ブロックとして復元するために必要。docs/parser_grammar.mdの全文調査で確認）。
// 既知役割の行が空行なしに連続する場合（会員番号欄＋テーマ見出し等）は、
// 新しい既知役割行が来た時点で直前のブロックを確定させるため、従来どおり1行=1ブロックとなる。

import { classifyLine } from "./classify.mjs";

// ＜...＞見出しラベルと、それに続く「問N＋指示文」が、PDF原文の時点で空行を挟んだ
// 別パラグラフとして印字されているケースがある（全文調査で16件確認。ラベルと指示文の間に
// 意匠上の余白を設ける原本レイアウトを、pdftotextがそのまま空行として抽出したものと考えられる）。
// 「＜...＞」のみで構成されるブロックの直後に「問N＋内容」で始まるブロックが続く、という
// 組み合わせは通常の本文には現れないごく限定的な条件のため、この場合に限り1ブロックへ復元する。
// rawの原文（両ブロックの文字列そのまま）はtextに連結して保持し、どの出典から復元したかは
// restoredFromに記録する（buildCorpus.mjs側でCheckBlock.parsed.notesへ転記する）。
// 条件に一致しない限り自動結合はせず、既存どおりunresolvedとして残る。
function mergeBareCheckTypeHeadings(blocks) {
  const merged = [];
  for (let i = 0; i < blocks.length; i++) {
    const cur = blocks[i];
    const next = blocks[i + 1];
    const curIsBareCheckType = classifyLine(cur.text) === "checkTypeHeadingCompound" && !/問[0-9０-９]/.test(cur.text);
    const nextStartsWithQuestionLabel = next && /^問[0-9０-９]+\s*\S/.test(next.text);
    if (curIsBareCheckType && nextStartsWithQuestionLabel) {
      merged.push({
        text: cur.text + "\n" + next.text,
        source: cur.source,
        restoredFrom: [cur.source.locator, next.source.locator],
      });
      i += 1; // nextを消費済みとしてスキップ
      continue;
    }
    merged.push(cur);
  }
  return merged;
}

export function toBlocks(pageText, pageNo, documentId) {
  const lines = pageText.replace(/\r/g, "").split("\n");
  const blocks = [];
  let buffer = [];
  let blockIdx = 0;

  function makeBlock(text) {
    const b = { text, source: { documentId, locator: `pdf:page=${pageNo};block=${blockIdx}` } };
    blockIdx += 1;
    return b;
  }

  function flushBuffer() {
    if (buffer.length === 0) return;
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text) blocks.push(makeBlock(text));
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushBuffer();
      continue;
    }
    if (classifyLine(line) === "unknown") {
      buffer.push(line);
    } else {
      flushBuffer(); // 新しい既知役割行が始まったので、それまでのブロックを確定させる
      buffer.push(line); // この行からブロックを開始する（後続のunknown行が続けば折り返し継続として吸収する）
    }
  }
  flushBuffer();
  return mergeBareCheckTypeHeadings(blocks);
}

export function labelBlocks(pages, documentId) {
  return pages.flatMap(({ page, text }) =>
    toBlocks(text, page, documentId).map((b) => ({ page, role: classifyLine(b.text), ...b }))
  );
}
