// Parserのオーケストレーション（Step0〜7）。
//
// ページ種別（質問／解答）は、かつては偶数=質問／奇数=解答という固定の前提で判定していたが、
// テーマ26のページ（pdftotextの文字化けにより見出し行が破損）を調査した結果、
// ページ偶奇そのものはズレていない一方で、内容ベースでも十分に判定できることが分かった。
// そのため、全ページを読み込んだうえでclassifyPage.mjsによる内容ベースの判定を主とし、
// ページ偶奇は使わない設計にした（詳細はdocs/parser_fullscan_report.md追補2）。

import { extractPages } from "./extractText.mjs";
import { applyKnownTextNoiseCorrections } from "./knownTextCorrections.mjs";
import { labelBlocks } from "./blockize.mjs";
import { classifyAllPages } from "./classifyPage.mjs";
import { buildCorpus } from "./buildCorpus.mjs";
import { makeIdFactory, toHalfWidthDigits } from "./textUtils.mjs";

// Parser v1.0.0（2026-07-19付でベースライン固定。docs/parser_v1_release_notes.md参照）。
// 「min-parser-0.x」系の暫定バージョン表記は本リリースをもって終了し、以降はsemverで管理する。
export const PARSER_VERSION = "parser-v1.0.0";

// テーマ見出し行が（文字化け等で）読み取れなかった場合に備え、文書内の他ページで
// クリーンに読み取れたテーマ番号→タイトルの対応を集めておく。目次ページ（1ページに
// テーマ見出しが複数並ぶ）はタイトルが目次の体裁（ドットリーダー等）を含むため除外する。
function buildThemeTitleByNo(labeled) {
  const perPageCount = new Map();
  for (const b of labeled) {
    if (b.role !== "themeHeading") continue;
    perPageCount.set(b.page, (perPageCount.get(b.page) ?? 0) + 1);
  }
  const map = new Map();
  for (const b of labeled) {
    if (b.role !== "themeHeading") continue;
    if ((perPageCount.get(b.page) ?? 0) > 1) continue; // 目次ページを除外
    const m = b.text.match(/^テーマ([0-9０-９]+)\s*(.*)$/);
    if (!m) continue;
    const no = Number(toHalfWidthDigits(m[1]));
    const title = m[2]?.trim();
    if (title && !map.has(no)) map.set(no, title);
  }
  return map;
}

export function parseDocument({ pdfPath, firstPage, lastPage, documentId }) {
  const unresolved = [];
  const flagUnresolved = (locator, reason) => unresolved.push({ locator, reason });
  const nextId = makeIdFactory();

  // Step 0
  const rawPages = extractPages(pdfPath, firstPage, lastPage);
  // Parser入力直後（構造解釈より前）に、個別確認済みのテキストノイズのみを補正する
  // （src/parser/knownTextCorrections.mjs参照。fail-closed、一般的な数字/記号除去は行わない）。
  const { pages, auditLog: textNoiseCorrectionLog } = applyKnownTextNoiseCorrections(rawPages);

  // Step 1 + 2
  const labeled = labelBlocks(pages, documentId);

  // ページ種別判定（question/answer/other/unknown）。全ページを対象に行う。
  const pageClassifications = classifyAllPages(labeled);
  const pageTypeByNumber = new Map(pageClassifications.map((c) => [c.page, c.type]));

  const themeTitleByNo = buildThemeTitleByNo(labeled);

  const questionBlocks = labeled.filter((b) => pageTypeByNumber.get(b.page) === "question");
  const answerBlocksByPage = new Map();
  // answerPageBlocksByPage: answerBlock役割だけでなくtopicHeading等も含む解答ページの全ブロック。
  // buildCorpus.mjsが「同一ページ内の複数Topicによる問N番号衝突」を解消するために、
  // 解答ページ内のTopic見出しでのセグメント分割に使う（Group生成には使わない、対応付け専用）。
  const answerPageBlocksByPage = new Map();
  for (const b of labeled) {
    if (pageTypeByNumber.get(b.page) === "answer") {
      if (!answerPageBlocksByPage.has(b.page)) answerPageBlocksByPage.set(b.page, []);
      answerPageBlocksByPage.get(b.page).push(b);
      if (b.role === "answerBlock") {
        if (!answerBlocksByPage.has(b.page)) answerBlocksByPage.set(b.page, []);
        answerBlocksByPage.get(b.page).push(b);
      }
    }
  }

  // 判定不能(unknown)ページは黙って除外せずunresolvedへ記録する。
  for (const c of pageClassifications) {
    if (c.type === "unknown") {
      flagUnresolved(`pdf:page=${c.page}`, `ページ種別を判定できなかった（${c.basis}）`);
    }
  }

  // Step 3〜6
  const groups = buildCorpus({
    questionBlocks,
    answerBlocksByPage,
    answerPageBlocksByPage,
    themeTitleByNo,
    parserVersion: PARSER_VERSION,
    nextId,
    flagUnresolved,
  });

  return {
    groups,
    unresolved,
    parserVersion: PARSER_VERSION,
    pageClassifications,
    textNoiseCorrectionLog,
  };
}

export function toIntermediateCorpus({
  groups,
  unresolved,
  pdfPath,
  documentId,
  firstPage,
  lastPage,
  scopeNote,
  textNoiseCorrectionLog,
}) {
  return {
    meta: {
      schemaVersion: "0.3.1-draft",
      status: "provisional",
      scopeNote,
      sourceDocuments: [
        {
          id: documentId,
          path: pdfPath,
          kind: "pdf",
          description: `TAC 財務諸表論 ポイントチェック。今回はp.${firstPage}-${lastPage}を対象。`,
        },
      ],
      unresolved,
      // Parser入力直後に適用した個別確認済みテキストノイズ補正の監査ログ
      // （src/parser/knownTextCorrections.mjs参照）。
      knownTextNoiseCorrections: textNoiseCorrectionLog ?? [],
    },
    books: [
      {
        id: "book.pointcheck",
        title: "財務諸表論 ポイントチェック",
        sourceDocumentIds: [documentId],
        groups,
        looseItems: [],
      },
    ],
  };
}
