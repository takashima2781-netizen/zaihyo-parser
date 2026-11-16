#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ7-4 原価率): 原価率・利益率の定義式
// (「A＝B／C」、被定義項が左辺という新形状)2件を確定Source+Knowledge候補
// として生成する。
//
// この2式は視覚的な分数(分子が式行の直前、分母が直後の別行)として印字され、
// 式行自体には「項＝」しか現れないため、新しい検出器
// (`detectLabelFractionFormulas`)と新しいトークナイザー
// (`tokenizeLabelFractionFormula`)を追加した。分子/分母の復元は第1・第6
// ケースと同じ個別確認済み補正(`applyKnownCorrection`、
// `input/corrections/cost-profit-rate-definitions.json`)を使う。
//
// 使い方: node scripts/run-cost-profit-rate-case.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectLabelFractionFormulas } from "../src/parser/blockDetection.mjs";
import { applyKnownCorrection } from "../src/parser/faithfulRestoration.mjs";
import {
  detectThemeAndTopic,
  confirmTopLevelSegmentation,
  buildFormulaConfirmedSource,
  writeFormulaCase,
} from "../src/parser/formulaCaseHelpers.mjs";
import { tokenizeLabelFractionFormula } from "../src/knowledge/formulaTokenizer.mjs";
import { deriveCalculationFormulaKnowledgeCandidate } from "../src/knowledge/deriveKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");
const correctionPath = path.join(rootDir, "input", "corrections", "cost-profit-rate-definitions.json");

const THEME_PAGE = 112;
const TOPIC_PAGE = 129;
const TOPIC_PRINTED_PAGE = "100";

const TARGET_CONFIG = [
  {
    labelTerm: "原価率",
    correctionBlockId: "block-cost-rate-def",
    caseName: "cost-rate-definition",
    knowledgeId: "dk-formula-cost-rate-definition",
    scopeNote: "本書テーマ7-4(原価率)の原価率の定義式でのみ確認",
  },
  {
    labelTerm: "利益率",
    correctionBlockId: "block-profit-rate-def",
    caseName: "profit-rate-definition",
    knowledgeId: "dk-formula-profit-rate-definition",
    scopeNote: "本書テーマ7-4(原価率)の利益率の定義式でのみ確認",
  },
];

try {
  const { themeNode, topicNode, topicPageData } = await detectThemeAndTopic({
    pdfPath,
    themePage: THEME_PAGE,
    topicPage: TOPIC_PAGE,
    expectedTopicNumber: "7-4",
  });

  const candidates = detectLabelFractionFormulas(topicPageData.text);
  if (candidates.length === 0) {
    throw new Error(
      `ページ${TOPIC_PAGE}で被定義項ラベル分数式候補が検出できなかった(fail-closed、設計と実データが食い違っている可能性)`,
    );
  }

  const corrections = JSON.parse(await readFile(correctionPath, "utf8"));

  await mkdir(outputDir, { recursive: true });

  for (const config of TARGET_CONFIG) {
    const target = candidates.find((c) => c.labelTerm === config.labelTerm);
    if (!target) {
      throw new Error(
        `"${config.labelTerm}＝"を含む候補が見つからなかった(fail-closed、設計と実データが食い違っている可能性)`,
      );
    }

    const correction = corrections.find((c) => c.blockId === config.correctionBlockId);
    if (!correction) {
      throw new Error(`補正データが見つからない(fail-closed): ${config.correctionBlockId}`);
    }

    const segmentation = confirmTopLevelSegmentation();

    const extractionRawText = [
      ...target.contextBefore,
      target.matchedLine,
      ...target.contextAfter,
    ].join("\n");

    const restored = applyKnownCorrection(extractionRawText, correction);

    const block = buildFormulaConfirmedSource({
      blockId: correction.blockId,
      structureRef: topicNode.id,
      page: TOPIC_PAGE,
      printedPageLabel: TOPIC_PRINTED_PAGE,
      sequenceOnPage: TARGET_CONFIG.indexOf(config) + 1,
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

    const derivedKnowledgeCandidate = deriveCalculationFormulaKnowledgeCandidate({
      block,
      structureContext: { theme: themeNode, topic: topicNode },
      knowledgeId: config.knowledgeId,
      scopeNote: config.scopeNote,
      tokenize: tokenizeLabelFractionFormula,
    });

    const caseOutput = await writeFormulaCase({
      outputPath: path.join(outputDir, `${config.caseName}.json`),
      caseName: config.caseName,
      themeNode,
      topicNode,
      block,
    });
    const updated = { ...caseOutput, derivedKnowledgeCandidate };
    const casePath = path.join(outputDir, `${config.caseName}.json`);
    await writeFile(casePath, JSON.stringify(updated, null, 2), "utf8");
    console.log(`OK: wrote ${casePath}`);
    console.log(`  sourceFaithful: ${updated.block.sourceFaithful}`);
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
