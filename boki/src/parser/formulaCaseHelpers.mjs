// 共通ヘルパー(Phase C着手前のアーキテクチャ確認で抽出、
// `planning/phase_c_readiness_assessment.md`2節・6節)。
//
// 「単一の計算式定義を確定Sourceにする」というM1オーケストレータの骨格が、
// 第1・第5・第6ケース(`runTeigakuhoCase.mjs`・`runForeignCurrencyCase.mjs`・
// `runApportionmentCase.mjs`)の3件でほぼ同一(テーマ/論点見出し検出→検出器で
// 候補取得→F3確定→ContentBlock組み立て→書き出し)であることを確認できた
// ため、その共通部分だけを抽出する。
//
// **検出器の選択・候補の選別・Faithful Restorationの3点は、ケースごとに
// 実際に異なる**(検出器の種類、候補が1件のみか複数から選ぶか、個別確認済み
// 補正か機械的な正規化か等)。CLAUDE.md原則5(未知形式への拡張性)・原則6
// (実データで確認できた範囲だけ汎化する)を踏まえ、この3点は呼び出し側
// (各run*Case.mjs)が引き続き自分で書く——1つの`caseConfig`駆動関数へ
// 無理に統合しない。

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { extractPages } from "./extract.mjs";
import { detectThemeHeading, detectTopicHeading } from "./structureRecognition.mjs";
import { applyF3 } from "./sourceSegmentation.mjs";

/**
 * テーマ見出し+論点見出しを検出し、それぞれのStructureNodeを組み立てる。
 * @param {{ pdfPath: string, themePage: number, topicPage: number, expectedTopicNumber: string }} options
 * @returns {Promise<{ themeNode: object, topicNode: object, topicPageData: object }>}
 */
export async function detectThemeAndTopic({ pdfPath, themePage, topicPage, expectedTopicNumber }) {
  const [themePageData] = await extractPages(pdfPath, [themePage]);
  const theme = detectThemeHeading(themePageData.text);
  if (!theme) {
    throw new Error(`テーマ見出しが検出できなかった(fail-closed、ページ${themePage})`);
  }
  const themeNode = {
    type: "StructureNode",
    nodeKind: "theme",
    id: `theme-${theme.number}`,
    label: { number: theme.number, titleRaw: theme.titleRaw },
    location: { page: themePage },
  };

  const [topicPageData] = await extractPages(pdfPath, [topicPage]);
  const topic = detectTopicHeading(topicPageData.text);
  if (!topic || topic.number !== expectedTopicNumber) {
    throw new Error(
      `topic-${expectedTopicNumber}見出しが検出できなかった(fail-closed、ページ${topicPage})`,
    );
  }
  const topicNode = {
    type: "StructureNode",
    nodeKind: "topic",
    id: `topic-${topic.number}`,
    label: { number: topic.number, titleRaw: topic.titleRaw },
    location: { page: topicPage },
    parentId: themeNode.id,
  };

  return { themeNode, topicNode, topicPageData };
}

/**
 * F3(トップレベル即時確定)を適用し、確定できなければfail-closedで例外を
 * 投げる。
 * @returns {object} segmentationDecision
 */
export function confirmTopLevelSegmentation() {
  const segmentation = applyF3({ nestedUnder: null });
  if (!segmentation.confirmed) {
    throw new Error("F3で確定できなかった(fail-closed)");
  }
  return segmentation;
}

/**
 * 計算式用の確定Source(ContentBlock)を組み立てる。
 * @param {object} params
 * @returns {object} ContentBlock
 */
export function buildFormulaConfirmedSource({
  blockId,
  structureRef,
  page,
  printedPageLabel,
  sequenceOnPage = 1,
  extractionRawText,
  tool,
  toolVersion,
  invocation,
  sourceFaithful,
  diagExtractionStatus,
  diagExtractionArtifacts,
  segmentation,
  detectorId,
  precedingHeading = null,
}) {
  return {
    type: "ContentBlock",
    id: blockId,
    blockKind: "formula_termbased",
    structureRef,
    location: { page, printedPageLabel, sequenceOnPage },
    extractionRaw: { text: extractionRawText, tool, toolVersion, invocation },
    sourceFaithful,
    diag: {
      extraction: { status: diagExtractionStatus, artifacts: diagExtractionArtifacts },
      faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" },
    },
    segmentationDecision: segmentation,
    detection: { detectorId, precedingHeading },
  };
}

/**
 * ケース出力(確定Source1件+構造情報)を組み立て、JSONファイルへ書き出す。
 * @param {{
 *   outputPath: string,
 *   caseName: string,
 *   themeNode: object,
 *   topicNode: object,
 *   block: object,
 *   outOfScopeDetections?: object[],
 * }} params
 * @returns {Promise<object>} 書き出したcaseOutput
 */
export async function writeFormulaCase({
  outputPath,
  caseName,
  themeNode,
  topicNode,
  block,
  outOfScopeDetections = [],
}) {
  const caseOutput = {
    case: caseName,
    generatedAt: new Date().toISOString(),
    structureContext: { theme: themeNode, topic: topicNode },
    block,
    candidateReport: { candidates: [] },
    outOfScopeDetections,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(caseOutput, null, 2), "utf8");

  return caseOutput;
}
