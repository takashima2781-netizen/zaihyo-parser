// M1拡張(Phase C・テーマ2-1 債権・債務): 電子記録債権の取得時の仕訳1件を
// 確定Sourceとして生成する。
//
// [3] Block Detectionについて: 同じページ(52)には他に2件の仕訳型ボックス
// (クレジット売掛金、電子記録債権の譲渡時)があるが、いずれも実際には
// 借方または貸方が2科目にまたがる複合仕訳(例: クレジット売掛金は
// 「(借)クレジット売掛金×××(貸)売上×××」の次行に「支払手数料×××」が
// 続き、本来は3科目の複合仕訳)であることを確認した。既存の
// `detectJournalPatterns`/`tokenizeJournalPattern`は単式(借方1科目・貸方1
// 科目)の仕訳のみを対象としており、複合仕訳を検出すると2行目以降の科目を
// 取りこぼし、原文を正しく表現できない(CLAUDE.md原則2に抵触するリスク)。
// 複合仕訳への対応は新しい検出器を要するため、今回は対象外とし
// `outOfScopeDetections`に記録するに留める(原則4、推測しない)。

import { extractPages } from "./extract.mjs";
import { detectJournalPatterns } from "./blockDetection.mjs";
import { normalizeCjkLetterSpacing } from "./faithfulRestoration.mjs";
import {
  detectThemeAndTopic,
  confirmTopLevelSegmentation,
  writeFormulaCase,
} from "./formulaCaseHelpers.mjs";
import { buildJournalConfirmedSource } from "./journalCaseHelpers.mjs";

const THEME_PAGE = 50;
const TOPIC_HEADING_PAGE = 51; // 論点見出し「２-１ 債権・債務」があるページ
const TOPIC_PAGE = 52; // 対象の仕訳ボックスがあるページ(見出しページの次ページ)
const TOPIC_PRINTED_PAGE = "23";

const BLOCK_ID = "block-electronic-receivable-acquisition";
const CASE_NAME = "electronic-receivable-acquisition-journal";

/**
 * @param {{ pdfPath: string, outputPath: string }} options
 */
export async function runReceivablesCase({ pdfPath, outputPath }) {
  const { themeNode, topicNode } = await detectThemeAndTopic({
    pdfPath,
    themePage: THEME_PAGE,
    topicPage: TOPIC_HEADING_PAGE,
    expectedTopicNumber: "2-1",
  });

  const [topicPageData] = await extractPages(pdfPath, [TOPIC_PAGE]);
  const allCandidates = detectJournalPatterns(topicPageData.text);

  // 「電子記録債権の取得時」の1行のみを対象とする(単式の完結した仕訳)。
  // debitAccountRaw/creditAccountRawは字間空白除去前の生の値のため、
  // 空白を除いた上で比較する。
  const target = allCandidates.find((c) => {
    const debit = c.debitAccountRaw.replace(/\s/g, "");
    const credit = c.creditAccountRaw.replace(/\s/g, "");
    return debit.includes("電子記録債権") && credit === "○○○";
  });
  if (!target) {
    throw new Error(
      `電子記録債権の取得時の候補が見つからなかった(fail-closed、設計と実データが食い違っている可能性)`,
    );
  }

  const outOfScopeCandidates = allCandidates
    .filter((c) => c !== target)
    .map((c) => ({
      precedingHeading: c.precedingHeading,
      reason:
        "同じページの複合仕訳(借方または貸方が2科目以上にまたがる)。既存の検出器は単式" +
        "(借方1科目・貸方1科目)の仕訳のみに対応しており、複合仕訳を検出すると科目を" +
        "取りこぼす恐れがあるため、今回は対象外とした(新しい検出器が必要、原則4)",
    }));

  const segmentation = confirmTopLevelSegmentation();

  const block = buildJournalConfirmedSource({
    blockId: BLOCK_ID,
    structureRef: topicNode.id,
    page: TOPIC_PAGE,
    printedPageLabel: TOPIC_PRINTED_PAGE,
    candidate: target,
    tool: topicPageData.tool,
    toolVersion: topicPageData.toolVersion,
    invocation: topicPageData.invocation,
    segmentation,
    normalizeCjkLetterSpacing,
  });

  return writeFormulaCase({
    outputPath,
    caseName: CASE_NAME,
    themeNode,
    topicNode,
    block,
    outOfScopeDetections: outOfScopeCandidates,
  });
}
