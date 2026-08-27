// M1拡張(第6ケース専用): テーマ7-10(仕入諸掛)、論点「按分計算」の平均法の
// 定義式を確定Sourceとして生成する。
//
// PDF → [1]Extraction → [2]Structure Recognition(theme-7/topic-7-10、
// 新規検出) → [3]Block Detection(`detectAdditionGroupFormulas`、第6
// ケースで新規追加した「（項＋項）×...＝...」検出器) → [4]Source
// Segmentation(F3、トップレベル) → [5]Faithful Restoration
// (`input/corrections/apportionment-average-definition.json`による
// fraction_split補正、第1ケースと同じ手法) → 確定Source(JSON)
//
// このケース専用に書く(第1・第3・第4・第5ケースと同じ方針)。
//
// [3] Block Detectionについて: この定義式「（期首仕入諸掛＋当期仕入諸掛）
// ×（期末商品／（期首商品＋当期仕入高）)＝期末仕入諸掛」は、既存の
// `detectTermBasedFormulas`(先頭の括弧グループが減算であることを要求)に
// 一致しない、加算グループを伴う新しい形状であるため、新しい検出器
// (`detectAdditionGroupFormulas`)を追加した。同じページに、より単純な
// もう1つの按分計算式(先入先出法、「当期仕入諸掛×（期末商品／当期仕入高）
// ＝期末仕入諸掛」)が存在するが、今回は平均法のみを対象とする(第1ケースが
// 定額法のみを対象とし定率法・級数法を対象外としたのと同じ判断、CLAUDE.md
// 原則6)。先入先出法は次フェーズ以降の別ケースとして扱う。
//
// [5] Faithful Restorationについて: 分数の分母が単一の項ではなく「期首
// 商品＋当期仕入高」という加算式であり、線形テキストへ書き起こす際に
// 優先順位が曖昧にならないよう括弧を補う必要がある(`formulaTokenizer.mjs`
// の`tokenizeAdditionFractionFormula`のコメント参照)。これは機械的な
// 座標対応付け(`restoreFractionByPosition`、第2ケース)ではなく、第1
// ケースと同じ個別確認済み補正(`applyKnownCorrection`)として扱う
// (今回1件のみの実データであり、汎用的な複数分数の座標対応付けロジックへ
// 先回りして一般化しない、原則6)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { extractPages } from "./extract.mjs";
import { detectThemeHeading, detectTopicHeading } from "./structureRecognition.mjs";
import { detectAdditionGroupFormulas } from "./blockDetection.mjs";
import { applyF3 } from "./sourceSegmentation.mjs";
import { applyKnownCorrection } from "./faithfulRestoration.mjs";

const THEME_PAGE = 112;
const TOPIC_PAGE = 147;
const TOPIC_PRINTED_PAGE = "118";

/**
 * @param {{ pdfPath: string, correctionPath: string, outputPath: string }} options
 */
export async function runApportionmentCase({ pdfPath, correctionPath, outputPath }) {
  const [themePage] = await extractPages(pdfPath, [THEME_PAGE]);
  const theme = detectThemeHeading(themePage.text);
  if (!theme) {
    throw new Error(`テーマ7見出しが検出できなかった(fail-closed、ページ${THEME_PAGE})`);
  }
  const themeNode = {
    type: "StructureNode",
    nodeKind: "theme",
    id: `theme-${theme.number}`,
    label: { number: theme.number, titleRaw: theme.titleRaw },
    location: { page: THEME_PAGE },
  };

  const [topicPage] = await extractPages(pdfPath, [TOPIC_PAGE]);
  const topic = detectTopicHeading(topicPage.text);
  if (!topic || topic.number !== "7-10") {
    throw new Error(`topic-7-10見出しが検出できなかった(fail-closed、ページ${TOPIC_PAGE})`);
  }
  const topicNode = {
    type: "StructureNode",
    nodeKind: "topic",
    id: `topic-${topic.number}`,
    label: { number: topic.number, titleRaw: topic.titleRaw },
    location: { page: TOPIC_PAGE },
    parentId: themeNode.id,
  };

  const candidates = detectAdditionGroupFormulas(topicPage.text);
  if (candidates.length === 0) {
    throw new Error(
      `ページ${TOPIC_PAGE}で加算グループ式候補が検出できなかった(fail-closed、` +
        `設計と実データが食い違っている可能性)`,
    );
  }

  // このケースの対象は平均法のみ。先入先出法はこの検出器の形状(先頭が
  // 加算グループ)に一致しないため、そもそも候補にならない(想定どおり)。
  const target = candidates.find((c) => (c.precedingHeading ?? "").includes("平均法"));
  if (!target) {
    throw new Error(
      `"平均法"を含む候補が見つからなかった(fail-closed、設計と実データが食い違っている可能性)`,
    );
  }
  const outOfScopeCandidates = candidates
    .filter((c) => c !== target)
    .map((c) => ({
      precedingHeading: c.precedingHeading,
      reason: "このケース(按分計算・平均法)の対象外。次フェーズ以降の別ケースとして扱う",
    }));

  const segmentation = applyF3({ nestedUnder: null });
  if (!segmentation.confirmed) {
    throw new Error("F3で確定できなかった(fail-closed)");
  }

  const extractionRawText = [
    ...target.contextBefore,
    target.matchedLine,
    ...target.contextAfter,
  ].join("\n");

  const correction = JSON.parse(await readFile(correctionPath, "utf8"));
  if (correction.blockId !== "block-apportionment-average-def") {
    throw new Error(`Unexpected correction data blockId: ${correction.blockId}`);
  }
  const restored = applyKnownCorrection(extractionRawText, correction);

  const confirmedSource = {
    type: "ContentBlock",
    id: correction.blockId,
    blockKind: "formula_termbased",
    structureRef: topicNode.id,
    location: {
      page: TOPIC_PAGE,
      printedPageLabel: TOPIC_PRINTED_PAGE,
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
    case: "apportionment-average-definition",
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
