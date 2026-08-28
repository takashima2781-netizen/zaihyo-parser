// 共通オーケストレータ(Phase C教材投入、`planning/phase_c_topic_inventory.md`)。
//
// 「1つの論点のページから、単式(借方1科目・貸方1科目)の仕訳パターンを
// 複数件、確定Sourceとして生成する」という形が、Phase Cで多数の論点に
// 共通することを実データで確認したため、汎用オーケストレータとして
// 抽出する。呼び出し側は、対象ページ・論点番号・「どの検出候補をどの
// ケース名/IDに対応させるか」の定義(`candidateDefinitions`)だけを渡す。
//
// 複合仕訳(借方または貸方が2科目以上にまたがるもの)は、既存の
// `detectJournalPatterns`が正しく全科目を捉えられない(1行の正規表現
// マッチのみのため、2行目以降の科目を取りこぼす)ため、このオーケストレータ
// では対象にしない。`candidateDefinitions`に含めなかった検出候補は、
// 自動的に`outOfScopeDetections`へ記録される(理由は呼び出し側が渡す)。

import { extractPages } from "./extract.mjs";
import { detectJournalPatterns } from "./blockDetection.mjs";
import { normalizeCjkLetterSpacing } from "./faithfulRestoration.mjs";
import {
  detectThemeAndTopic,
  confirmTopLevelSegmentation,
  writeFormulaCase,
} from "./formulaCaseHelpers.mjs";
import { buildJournalConfirmedSource } from "./journalCaseHelpers.mjs";

/**
 * @param {{
 *   pdfPath: string,
 *   outputDir: string,
 *   themePage: number,
 *   topicHeadingPage: number,
 *   topicPages: Array<{ page: number, printedPageLabel: string }>,
 *   expectedTopicNumber: string,
 *   outOfScopeReason: string,
 *   candidateDefinitions: Array<{
 *     match: (candidate: object) => boolean,
 *     caseName: string,
 *     blockId: string,
 *     sequenceOnPage: number,
 *   }>,
 * }} options
 * @returns {Promise<{ cases: object[], outOfScopeDetections: object[] }>}
 */
export async function runJournalTopicCase({
  pdfPath,
  outputDir,
  themePage,
  topicHeadingPage,
  topicPages,
  expectedTopicNumber,
  outOfScopeReason,
  candidateDefinitions,
}) {
  const { themeNode, topicNode } = await detectThemeAndTopic({
    pdfPath,
    themePage,
    topicPage: topicHeadingPage,
    expectedTopicNumber,
  });

  // 対象の仕訳ボックスが複数ページにまたがる場合があるため、ページごとに
  // 検出し、どのページ由来かをそれぞれの候補に持たせておく。
  const pageDataList = await extractPages(pdfPath, topicPages.map((p) => p.page));
  const allCandidates = [];
  for (const { page, printedPageLabel } of topicPages) {
    const pageData = pageDataList.find((p) => p.page === page);
    const candidates = detectJournalPatterns(pageData.text);
    for (const candidate of candidates) {
      allCandidates.push({ candidate, pageData, page, printedPageLabel });
    }
  }

  const matchedCandidates = new Set();
  const cases = [];

  for (const def of candidateDefinitions) {
    const found = allCandidates.find(
      (entry) => !matchedCandidates.has(entry) && def.match(entry.candidate),
    );
    if (!found) {
      throw new Error(
        `候補("${def.caseName}")が見つからなかった(fail-closed、設計と実データが食い違っている可能性)`,
      );
    }
    matchedCandidates.add(found);

    const segmentation = confirmTopLevelSegmentation();
    const block = buildJournalConfirmedSource({
      blockId: def.blockId,
      structureRef: topicNode.id,
      page: found.page,
      printedPageLabel: found.printedPageLabel,
      sequenceOnPage: def.sequenceOnPage,
      candidate: found.candidate,
      tool: found.pageData.tool,
      toolVersion: found.pageData.toolVersion,
      invocation: found.pageData.invocation,
      segmentation,
      normalizeCjkLetterSpacing,
    });

    cases.push({ caseName: def.caseName, block });
  }

  const outOfScopeCandidates = allCandidates
    .filter((entry) => !matchedCandidates.has(entry))
    .map(({ candidate }) => ({
      precedingHeading: candidate.inlineLabelRaw ?? candidate.precedingHeading,
      reason: outOfScopeReason,
    }));

  const results = [];
  for (const { caseName, block } of cases) {
    const outputPath = `${outputDir}/${caseName}.json`;
    const caseOutput = await writeFormulaCase({
      outputPath,
      caseName,
      themeNode,
      topicNode,
      block,
      outOfScopeDetections: outOfScopeCandidates,
    });
    results.push(caseOutput);
  }

  return { cases: results, outOfScopeDetections: outOfScopeCandidates };
}
