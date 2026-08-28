// M1オーケストレータ(定額法1ケース専用)
//
// PDF → [1]Extraction → [2]Structure Recognition → [3]Block Detection →
// [4]Source Segmentation → [5]Faithful Restoration → 確定Source(JSON)
//
// テーマ/論点見出し検出・F3確定・ContentBlock組み立て・書き出しという
// 共通の骨格は`formulaCaseHelpers.mjs`(Phase C着手前のアーキテクチャ確認で
// 本ケース・第5・第6ケースの3件から抽出、`planning/phase_c_readiness_
// assessment.md`2節)を使う。検出器・候補選別・Faithful Restorationは、
// このケース固有のロジックとして引き続きここに書く(CLAUDE.md原則5・6)。

import { readFile } from "node:fs/promises";

import { detectTermBasedFormulas } from "./blockDetection.mjs";
import { applyKnownCorrection } from "./faithfulRestoration.mjs";
import {
  detectThemeAndTopic,
  confirmTopLevelSegmentation,
  buildFormulaConfirmedSource,
  writeFormulaCase,
} from "./formulaCaseHelpers.mjs";

const THEME_PAGE = 150;
const TOPIC_PAGE = 155;
const TOPIC_PRINTED_PAGE = "126";

/**
 * @param {{ pdfPath: string, correctionPath: string, outputPath: string }} options
 */
export async function runTeigakuhoCase({ pdfPath, correctionPath, outputPath }) {
  const { themeNode, topicNode, topicPageData } = await detectThemeAndTopic({
    pdfPath,
    themePage: THEME_PAGE,
    topicPage: TOPIC_PAGE,
    expectedTopicNumber: "8-2",
  });

  // [3] Block Detection(用語ベース計算式パターン検出器)
  const candidates = detectTermBasedFormulas(topicPageData.text);
  if (candidates.length === 0) {
    throw new Error(
      `No term-based formula candidates detected on page ${TOPIC_PAGE}. 設計と実データが食い違っている可能性があるため停止する。`,
    );
  }

  // このM1ケースの対象は「定額法」のみ。他の検出(定率法・級数法等)は
  // 意図的にスコープ外とし、除外した事実を記録する(原則6: 無かったことにしない)。
  const target = candidates.find((c) =>
    (c.precedingHeading ?? "").includes("定額法"),
  );
  if (!target) {
    throw new Error(
      '"定額法"を含む候補が見つからなかった。設計と実データが食い違っている可能性があるため停止する。',
    );
  }
  const outOfScopeCandidates = candidates
    .filter((c) => c !== target)
    .map((c) => ({
      precedingHeading: c.precedingHeading,
      reason: "このM1ケース(定額法)の対象外。次フェーズ以降の別ケースとして扱う",
    }));

  const segmentation = confirmTopLevelSegmentation();

  // extractionRaw(候補行+前後1行。分数の分子/分母が別行に分離している場合の
  // 文脈を保持するため)
  const extractionRawText = [
    ...target.contextBefore,
    target.matchedLine,
    ...target.contextAfter,
  ].join("\n");

  // [5] Faithful Restoration(このケース1件のfraction_split補正、fail-closed)
  const correction = JSON.parse(await readFile(correctionPath, "utf8"));
  if (correction.blockId !== "block-teigakuho-def") {
    throw new Error(
      `Unexpected correction data blockId: ${correction.blockId}`,
    );
  }
  const restored = applyKnownCorrection(extractionRawText, correction);

  const block = buildFormulaConfirmedSource({
    blockId: correction.blockId,
    structureRef: topicNode.id,
    page: TOPIC_PAGE,
    printedPageLabel: TOPIC_PRINTED_PAGE,
    extractionRawText,
    tool: topicPageData.tool,
    toolVersion: topicPageData.toolVersion,
    invocation: topicPageData.invocation,
    sourceFaithful: restored.sourceFaithful,
    diagExtractionStatus: "captured_differs",
    diagExtractionArtifacts: [restored.artifact],
    segmentation,
    detectorId: target.detectorId,
    precedingHeading: target.precedingHeading,
  });

  return writeFormulaCase({
    outputPath,
    caseName: "teigakuho-definition",
    themeNode,
    topicNode,
    block,
    outOfScopeDetections: outOfScopeCandidates,
  });
}
