// M1拡張(第5ケース専用): テーマ11(外貨建取引等)、論点11-1(外貨建取引の
// 換算)から、換算方法の定義式1件を確定Sourceとして生成する。
//
// PDF → [1]Extraction → [2]Structure Recognition(theme-11/topic-11-1、
// 新規検出) → [3]Block Detection(`detectPlainTermFormulas`、第5ケースで
// 新規追加した「項×項＝項」検出器) → [4]Source Segmentation(F3、
// トップレベル) → [5]Faithful Restoration(CJK字間空白の除去、念のため
// 適用するが実データでは除去対象なし) → 確定Source(JSON)
//
// このケース専用に書く(第1・第3・第4ケースと同じ方針)。
//
// [3] Block Detectionについて: 既存の`detectTermBasedFormulas`(括弧内減算
// または先頭数値のいずれかを要求)は、この定義式「外貨建取引額×為替レート
// ＝円換算額」(括弧も先頭数値も無い)に一致しない。第1〜4ケースのいずれとも
// 異なる、最も単純な「項×項＝項」という式形状であるため、新しい検出器
// (`detectPlainTermFormulas`)を追加した。
//
// [4] Source Segmentationについて: この定義式は「➊ 換算方法」という項目
// 見出しの直下に単独で置かれており、設例等のより大きな視覚単位へネストして
// いない。第1ケース(定額法定義式)と同じ構造的事実であり、トップレベルの
// 独立したSourceとして扱う(F3)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { extractPages } from "./extract.mjs";
import { detectThemeHeading, detectTopicHeading } from "./structureRecognition.mjs";
import { detectPlainTermFormulas } from "./blockDetection.mjs";
import { applyF3 } from "./sourceSegmentation.mjs";
import { normalizeCjkLetterSpacing } from "./faithfulRestoration.mjs";

const THEME_PAGE = 200;
const TOPIC_PAGE = 201;
const TOPIC_PRINTED_PAGE = "172";

const BLOCK_ID = "block-foreign-currency-def";

/**
 * @param {{ pdfPath: string, outputPath: string }} options
 */
export async function runForeignCurrencyCase({ pdfPath, outputPath }) {
  const [themePage] = await extractPages(pdfPath, [THEME_PAGE]);
  const theme = detectThemeHeading(themePage.text);
  if (!theme) {
    throw new Error(`テーマ11見出しが検出できなかった(fail-closed、ページ${THEME_PAGE})`);
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
  if (!topic || topic.number !== "11-1") {
    throw new Error(`topic-11-1見出しが検出できなかった(fail-closed、ページ${TOPIC_PAGE})`);
  }
  const topicNode = {
    type: "StructureNode",
    nodeKind: "topic",
    id: `topic-${topic.number}`,
    label: { number: topic.number, titleRaw: topic.titleRaw },
    location: { page: TOPIC_PAGE },
    parentId: themeNode.id,
  };

  const candidates = detectPlainTermFormulas(topicPage.text);
  if (candidates.length !== 1) {
    throw new Error(
      `想定していた定義式候補数(1)と実際の検出数(${candidates.length})が一致しない` +
        `(fail-closed、設計と実データが食い違っている可能性)`,
    );
  }
  const [target] = candidates;
  if (target.inlineLabelRaw) {
    throw new Error(
      `定義式にラベルが同居していた(fail-closed、想定外の形状): ${target.inlineLabelRaw}`,
    );
  }

  const segmentation = applyF3({ nestedUnder: null });
  if (!segmentation.confirmed) {
    throw new Error("F3で確定できなかった(fail-closed)");
  }

  const restored = normalizeCjkLetterSpacing(target.formulaRaw);
  const sourceFaithful = restored.normalized;

  const confirmedSource = {
    type: "ContentBlock",
    id: BLOCK_ID,
    blockKind: "formula_termbased",
    structureRef: topicNode.id,
    location: {
      page: TOPIC_PAGE,
      printedPageLabel: TOPIC_PRINTED_PAGE,
      sequenceOnPage: 1,
    },
    extractionRaw: {
      text: target.matchedLine,
      tool: topicPage.tool,
      toolVersion: topicPage.toolVersion,
      invocation: topicPage.invocation,
    },
    sourceFaithful,
    diag: {
      extraction: {
        status: restored.removedCount > 0 ? "captured_differs" : "captured_matches_sourceFaithful",
        artifacts:
          restored.removedCount > 0
            ? [
                {
                  kind: "letter_spacing",
                  stage: "extraction",
                  resolved: true,
                  note: `勘定科目名の文字間にあった字間調整用の空白(${restored.removedCount}箇所)を機械的に除去した`,
                },
              ]
            : [],
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
      precedingHeading: null,
    },
  };

  const caseOutput = {
    case: "foreign-currency-definition",
    generatedAt: new Date().toISOString(),
    structureContext: { theme: themeNode, topic: topicNode },
    block: confirmedSource,
    candidateReport: { candidates: [] },
    outOfScopeDetections: [],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(caseOutput, null, 2), "utf8");

  return caseOutput;
}
