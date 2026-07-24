// ページ単位の種別判定（question / answer / other / unknown）。
//
// 従来「偶数ページ=質問ページ／奇数ページ=解答ページ」という前提で固定していたが、
// テーマ26のページ（p.276-284、pdftotextの文字化けにより見出し行が破損）を調査した結果、
// ページ偶奇そのものはズレていなかった一方で、ページ内容だけから質問/解答を判定できる
// 十分な手がかりがすでにclassify.mjsのrole判定に存在することが分かった。
// そこで、ページ偶奇を判定の主根拠にせず、ページ内に現れたrole構成から種別を判定する方式に変更する。
// 偶奇は判定結果と付き合わせるための補助情報としてのみ残す。

import { labelToCode } from "./checkTypeLabels.mjs";

const OTHER_PAGE_MARKERS = [
  /^＜メ モ＞/,
  /^＜本書の利用方法＞/,
  /^はじめに/,
  /^目次/,
  /^注記文例集/,
  /^会社計算規則における注記事項/,
  /^財務諸表等規則における注記事項/,
];

function isKnownCheckTypeHeading(text) {
  const m = text.match(/^＜(.+?)＞/);
  return m ? labelToCode(m[1]) != null : false;
}

// pageBlocks: 特定の1ページ分の labelBlocks() 出力（{role, text, source, page}[]）
export function classifyPage(pageBlocks) {
  const qBlocks = pageBlocks.filter((b) => b.role === "checkTypeHeadingCompound" && isKnownCheckTypeHeading(b.text));
  const aBlocks = pageBlocks.filter((b) => b.role === "answerBlock");

  if (qBlocks.length > 0 && aBlocks.length === 0) {
    return { type: "question", confidence: "high", basis: `checkTypeHeadingCompound ${qBlocks.length}件` };
  }
  if (aBlocks.length > 0 && qBlocks.length === 0) {
    return { type: "answer", confidence: "high", basis: `answerBlock ${aBlocks.length}件` };
  }
  if (qBlocks.length > 0 && aBlocks.length > 0) {
    // 質問シグナルと解答シグナルが同一ページに混在するのは異常系。questionとして扱うが要確認とする。
    return {
      type: "question",
      confidence: "low",
      basis: `question/answer両方のシグナルが混在(checkTypeHeadingCompound=${qBlocks.length}件, answerBlock=${aBlocks.length}件)`,
    };
  }

  const otherMarkerHit = pageBlocks.find((b) => OTHER_PAGE_MARKERS.some((re) => re.test(b.text)));
  if (otherMarkerHit) {
    return { type: "other", confidence: "high", basis: `既知の非Q&Aマーカーに一致: "${otherMarkerHit.text.slice(0, 20)}"` };
  }

  const hasAnyContent = pageBlocks.some((b) => b.role !== "pageFurniture" && b.text.trim().length > 0);
  if (!hasAnyContent) {
    return { type: "other", confidence: "high", basis: "furniture以外に内容がない（白紙ページ）" };
  }

  return {
    type: "unknown",
    confidence: "low",
    basis: "question/answerいずれのシグナルも既知の非Q&Aマーカーも検出できなかった",
  };
}

export function classifyAllPages(labeled) {
  const byPage = new Map();
  for (const b of labeled) {
    if (!byPage.has(b.page)) byPage.set(b.page, []);
    byPage.get(b.page).push(b);
  }
  const results = [];
  for (const [page, blocks] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const c = classifyPage(blocks);
    results.push({ page, parityGuess: page % 2 === 0 ? "question" : "answer", ...c });
  }
  return results;
}
