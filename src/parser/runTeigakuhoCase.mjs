// M1オーケストレータ(定額法1ケース専用)
//
// PDF → [1]Extraction → [2]Structure Recognition → [3]Block Detection →
// [4]Source Segmentation → [5]Faithful Restoration → 確定Source(JSON)
//
// `m1_minimal_parser_prototype_design.md`のとおり、このケース専用に書く
// (汎用`runPipeline(caseConfig)`のような抽象化はまだ作らない)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { extractPages } from "./extract.mjs";
import { detectThemeHeading, detectTopicHeading } from "./structureRecognition.mjs";
import { detectTermBasedFormulas } from "./blockDetection.mjs";
import { applyF3 } from "./sourceSegmentation.mjs";
import { applyKnownCorrection } from "./faithfulRestoration.mjs";

const THEME_PAGE = 150;
const TOPIC_PAGE = 155;

/**
 * @param {{ pdfPath: string, correctionPath: string, outputPath: string }} options
 */
export async function runTeigakuhoCase({ pdfPath, correctionPath, outputPath }) {
  // [1] Extraction
  const pages = await extractPages(pdfPath, [THEME_PAGE, TOPIC_PAGE]);
  const themePage = pages.find((p) => p.page === THEME_PAGE);
  const topicPage = pages.find((p) => p.page === TOPIC_PAGE);
  if (!themePage || !topicPage) {
    throw new Error(
      `Extraction did not return expected pages (${THEME_PAGE}, ${TOPIC_PAGE})`,
    );
  }

  // [2] Structure Recognition(最小: テーマ1件+論点1件)
  const theme = detectThemeHeading(themePage.text);
  if (!theme) {
    throw new Error(
      `Theme heading not found on page ${THEME_PAGE}. 設計と実データが食い違っている可能性があるため停止する。`,
    );
  }
  const topic = detectTopicHeading(topicPage.text);
  if (!topic) {
    throw new Error(
      `Topic heading not found on page ${TOPIC_PAGE}. 設計と実データが食い違っている可能性があるため停止する。`,
    );
  }

  const themeNode = {
    type: "StructureNode",
    nodeKind: "theme",
    id: `theme-${theme.number}`,
    label: { number: theme.number, titleRaw: theme.titleRaw },
    location: { page: THEME_PAGE },
  };
  const topicNode = {
    type: "StructureNode",
    nodeKind: "topic",
    id: `topic-${topic.number}`,
    label: { number: topic.number, titleRaw: topic.titleRaw },
    location: { page: TOPIC_PAGE },
    parentId: themeNode.id,
  };

  // [3] Block Detection(用語ベース計算式パターン検出器)
  const candidates = detectTermBasedFormulas(topicPage.text);
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

  // [4] Source Segmentation(F3のみ)
  // このM1実装のBlock Detectionは、より大きな視覚単位(設例等)への
  // ネスト検出を実装していない(ラベル検出系はスコープ外、
  // `m1_minimal_parser_prototype_design.md`3節)。そのため`nestedUnder`は
  // 自動検出結果ではなく、既存の実データ検証
  // (`parser_source_granularity_validation.md`ケース2:
  // 「定義ブロック(テーマ8-2)自体はStage1で決着〈1行の式、単独の視覚単位〉」)
  // で確認済みの事実として与える。次のケース(定額法の複数適用等、ネストが
  // 実際に起こりうるケース)に着手する際は、Block Detection側で
  // `nestedUnder`を検出結果として持たせる必要がある(10節の未決事項)。
  const segmentation = applyF3({ nestedUnder: null });
  if (!segmentation.confirmed) {
    throw new Error(
      "F3で確定できなかった。想定していたトップレベル構造と食い違うため停止する。",
    );
  }

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

  const confirmedSource = {
    type: "ContentBlock",
    id: correction.blockId,
    blockKind: "formula_termbased",
    structureRef: topicNode.id,
    location: {
      page: TOPIC_PAGE,
      printedPageLabel: "126",
      sequenceOnPage: 1,
    },
    extractionRaw: {
      text: extractionRawText,
      tool: topicPage.tool,
      toolVersion: topicPage.toolVersion,
      invocation: topicPage.invocation,
    },
    sourceFaithful: restored.sourceFaithful,
    diag: {
      extraction: {
        status: "captured_differs",
        artifacts: [restored.artifact],
      },
      faithfulReconstruction: {
        performed: true,
        method: "human_reviewed",
        confidence: "high",
      },
    },
    segmentationDecision: segmentation,
    detection: {
      detectorId: target.detectorId,
      precedingHeading: target.precedingHeading,
    },
  };

  const caseOutput = {
    case: "teigakuho-definition",
    generatedAt: new Date().toISOString(),
    structureContext: { theme: themeNode, topic: topicNode },
    block: confirmedSource,
    candidateReport: { candidates: [] },
    outOfScopeDetections: outOfScopeCandidates,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(caseOutput, null, 2), "utf8");

  return caseOutput;
}
