// PDF全体走査CLI。
//
// 目的は「全ページの完全変換」ではなく、現在のParser（3つの承認済み一般化ルール＋
// テーマランニングヘッダー識別＋内容ベースのページ種別判定を含む）が教材全体に対して
// どこまで自動処理できるかを測定すること。走査中に見つかった未知パターンへの個別対応は行わない。
//
// 「全ページを最初に読み込む」方針に基づき、ページ範囲の事前絞り込みは行わず、
// PDF全ページ(1〜TOTAL_PAGES)を対象にclassifyPage.mjsでページ種別を判定する。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { parseDocument, toIntermediateCorpus } from "../parser/index.mjs";
import { validateCorpus } from "../validate/validateCorpus.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PDF_PATH = path.join(ROOT, "input/pdf/【財表】ポイントチェック.pdf");
const DOC_ID = "src.pdf.pointcheck";

// docs/parser_grammar.md の全文調査でpdftotext(フォームフィード区切り)により実測済みのページ数。
const TOTAL_PAGES = 328;

function walkAll(groups, visit) {
  for (const g of groups) {
    visit("group", g);
    for (const cb of g.checkBlocks) {
      visit("checkBlock", cb);
      for (const q of cb.questions) {
        visit("question", q);
        for (const it of q.items) visit("item", it);
      }
    }
    walkAll(g.children, visit);
  }
}

function collectAllItemsFlat(groups) {
  const items = [];
  walkAll(groups, (kind, node) => {
    if (kind === "item") items.push(node);
  });
  return items;
}

function itemFingerprint(item) {
  // ID自体は実行ごとに採番し直されるため比較に使えない。内容ベースの指紋で新規/消失/重複を検出する。
  const q = item.raw.question.map((r) => r.source.locator + "::" + r.text).join("|");
  const a = item.raw.answers.map((r) => r.text.source.locator + "::" + r.text.text).join("|");
  return `${q}##${a}##${item.subLabelRaw ?? ""}`;
}

function main() {
  console.log("=== Step A: 全ページ(1-" + TOTAL_PAGES + ")を読み込み、Parserを実行 ===");
  const { groups, unresolved, parserVersion, pageClassifications, textNoiseCorrectionLog } = parseDocument({
    pdfPath: PDF_PATH,
    firstPage: 1,
    lastPage: TOTAL_PAGES,
    documentId: DOC_ID,
  });

  // --- ページ種別の集計 ---
  const pageTypeCounts = { question: 0, answer: 0, other: 0, unknown: 0 };
  for (const c of pageClassifications) pageTypeCounts[c.type] += 1;
  const parityMismatches = pageClassifications.filter(
    (c) => (c.type === "question" || c.type === "answer") && c.type !== c.parityGuess
  );

  // --- 構造件数の集計 ---
  const counts = { group: 0, checkBlock: 0, question: 0, item: 0 };
  const groupKindCounts = {};
  const presentationCounts = {};
  const confidenceCounts = { item: { high: 0, low: 0, other: 0 }, theme: { high: 0, low: 0 } };
  const checkTypeCounts = {};
  const themeDetail = [];

  walkAll(groups, (kind, node) => {
    counts[kind] += 1;
    if (kind === "group") {
      const k = node.parsed?.kind ?? "null";
      groupKindCounts[k] = (groupKindCounts[k] ?? 0) + 1;
    }
    if (kind === "checkBlock") {
      const k = node.parsed?.checkType ?? "null";
      checkTypeCounts[k] = (checkTypeCounts[k] ?? 0) + 1;
    }
    if (kind === "item") {
      for (const p of node.presentations) presentationCounts[p.type] = (presentationCounts[p.type] ?? 0) + 1;
      const c = node.parsed?.confidence;
      if (c === "high") confidenceCounts.item.high += 1;
      else if (c === "low") confidenceCounts.item.low += 1;
      else confidenceCounts.item.other += 1;
    }
  });

  function countUnder(g) {
    let cb = g.checkBlocks.length,
      q = 0,
      it = 0;
    for (const c of g.checkBlocks) {
      q += c.questions.length;
      for (const qq of c.questions) it += qq.items.length;
    }
    for (const child of g.children) {
      const r = countUnder(child);
      cb += r.cb;
      q += r.q;
      it += r.it;
    }
    return { cb, q, it };
  }
  for (const g of groups) {
    if (g.parsed.kind !== "theme") continue;
    const c = countUnder(g);
    themeDetail.push({
      no: g.parsed.no,
      title: g.parsed.title,
      confidence: g.parsed.confidence,
      runningHeaderOccurrences: g.parsed.runningHeaderOccurrences.length,
      sectionCount: g.children.length,
      checkBlockCount: c.cb,
      questionCount: c.q,
      itemCount: c.it,
    });
    if (g.parsed.confidence === "high") confidenceCounts.theme.high += 1;
    else confidenceCounts.theme.low += 1;
  }
  themeDetail.sort((a, b) => (a.no ?? 999) - (b.no ?? 999));

  const unresolvedByReasonType = {};
  for (const u of unresolved) {
    let bucket = "other";
    if (u.reason.includes("ページ種別を判定できなかった")) bucket = "page-classification-unknown";
    else if (u.reason.includes("テーマ") && u.reason.includes("節見出しから補完的に生成")) bucket = "theme-recovered-from-section";
    else if (u.reason.includes("テーマ") && u.reason.includes("開始判定の確証")) bucket = "theme-start-low-confidence";
    else if (u.reason.includes("マーカー")) bucket = "no-marker-detected";
    else if (u.reason.includes("解答ページが見つからなかった") || (u.reason.includes("解答ブロックが") && u.reason.includes("見つからなかった"))) bucket = "answer-block-not-found";
    else if (u.reason.includes("対応する解答が見つからなかった")) bucket = "answer-not-found-in-block";
    else if (u.reason.includes("注記")) bucket = "unattributed-note";
    else if (u.reason.includes("分類できなかった断片")) bucket = "orphan-fragment";
    else if (u.reason.includes("チェック区分見出し行の分割")) bucket = "checktype-heading-split-failure";
    else if (u.reason.includes("所属するGroupが特定できない")) bucket = "no-container-group";
    unresolvedByReasonType[bucket] = (unresolvedByReasonType[bucket] ?? 0) + 1;
  }

  console.log("=== Step B: 妥当性検証 ===");
  const validationIssues = validateCorpus(groups);
  const validationByCheck = {};
  for (const v of validationIssues) validationByCheck[v.check] = (validationByCheck[v.check] ?? 0) + 1;

  // --- 修正前(テーマ修正のみ・ページ分類修正前)との比較 ---
  let itemDiff = null;
  const beforePath = path.join(ROOT, "output/intermediate_full_scan_before_pagefix.json");
  if (existsSync(beforePath)) {
    const beforeCorpus = JSON.parse(readFileSync(beforePath, "utf8"));
    const beforeItems = collectAllItemsFlat(beforeCorpus.books[0].groups);
    const afterItems = collectAllItemsFlat(groups);
    const beforeFp = new Map();
    for (const it of beforeItems) {
      const fp = itemFingerprint(it);
      beforeFp.set(fp, (beforeFp.get(fp) ?? 0) + 1);
    }
    const afterFp = new Map();
    for (const it of afterItems) {
      const fp = itemFingerprint(it);
      afterFp.set(fp, (afterFp.get(fp) ?? 0) + 1);
    }
    const newItems = [];
    const lostItems = [];
    const duplicated = [];
    for (const [fp, count] of afterFp) {
      if (!beforeFp.has(fp)) newItems.push(fp);
      if (count > 1) duplicated.push({ fp, count });
    }
    for (const [fp] of beforeFp) {
      if (!afterFp.has(fp)) lostItems.push(fp);
    }
    itemDiff = {
      beforeCount: beforeItems.length,
      afterCount: afterItems.length,
      newItemCount: newItems.length,
      lostItemCount: lostItems.length,
      duplicatedFingerprintCount: duplicated.length,
      newItemSamples: newItems.slice(0, 30),
      lostItemSamples: lostItems.slice(0, 30),
    };
  }

  const stats = {
    parserVersion,
    totalPages: TOTAL_PAGES,
    pageTypeCounts,
    parityMismatchCount: parityMismatches.length,
    parityMismatches,
    counts,
    groupKindCounts,
    checkTypeCounts,
    presentationCounts,
    confidenceCounts,
    themeDetail,
    unresolvedCount: unresolved.length,
    unresolvedByReasonType,
    validationIssueCount: validationIssues.length,
    validationByCheck,
    itemDiff,
  };

  console.log(JSON.stringify({ ...stats, themeDetail: undefined, parityMismatches: undefined }, null, 2));
  console.log("themeDetail:", JSON.stringify(themeDetail, null, 2));

  const corpus = toIntermediateCorpus({
    groups,
    unresolved,
    pdfPath: "input/pdf/【財表】ポイントチェック.pdf",
    documentId: DOC_ID,
    firstPage: 1,
    lastPage: TOTAL_PAGES,
    scopeNote:
      "PDF全体走査（現在のParserがどこまで自動処理できるかを測定する目的）で生成した中間JSON。" +
      "ページ種別（question/answer/other/unknown）は内容ベースで判定しており、ページ偶奇には依存していない。" +
      "全ページ完全変換を目標にしたものではない。",
    textNoiseCorrectionLog,
  });

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "intermediate_full_scan.json"), JSON.stringify(corpus, null, 2), "utf8");
  writeFileSync(path.join(outDir, "full_scan_stats.json"), JSON.stringify(stats, null, 2), "utf8");
  writeFileSync(path.join(outDir, "full_scan_validation_issues.json"), JSON.stringify(validationIssues, null, 2), "utf8");
  writeFileSync(path.join(outDir, "full_scan_page_classifications.json"), JSON.stringify(pageClassifications, null, 2), "utf8");
  console.log("wrote: output/intermediate_full_scan.json");
  console.log("wrote: output/full_scan_stats.json");
  console.log("wrote: output/full_scan_validation_issues.json");
  console.log("wrote: output/full_scan_page_classifications.json");
}

main();
