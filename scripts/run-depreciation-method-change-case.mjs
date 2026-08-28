#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ8-8 償却方法の変更): 定率法→定額法・
// 定額法→定率法、それぞれの変更後の減価償却費算定式2件を確定
// Source+Knowledge候補として生成する。このテーマには仕訳の型は無く、
// 算定式のみが学習対象となる。
//
// 2つの新しい形状(「（A－B－C）÷D＝E」除算記号を使い減算が2回現れる形、
// 「（A－B）×C＝D」減算グループの乗算相手が分数ではなく単純な項の形)を
// それぞれ新しい検出器・トークナイザーとして追加した。
//
// 使い方: node scripts/run-depreciation-method-change-case.mjs

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectSubtractGroupDivideFormulas, detectTermBasedFormulas } from "../src/parser/blockDetection.mjs";
import {
  detectThemeAndTopic,
  confirmTopLevelSegmentation,
  buildFormulaConfirmedSource,
  writeFormulaCase,
} from "../src/parser/formulaCaseHelpers.mjs";
import {
  tokenizeSubtractGroupDivideFormula,
  tokenizeSubtractGroupTimesTermFormula,
} from "../src/knowledge/formulaTokenizer.mjs";
import { deriveCalculationFormulaKnowledgeCandidate } from "../src/knowledge/deriveKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const THEME_PAGE = 150;
const TOPIC_PAGE = 177;
const TOPIC_PRINTED_PAGE = "148";

try {
  const { themeNode, topicNode, topicPageData } = await detectThemeAndTopic({
    pdfPath,
    themePage: THEME_PAGE,
    topicPage: TOPIC_PAGE,
    expectedTopicNumber: "8-8",
  });

  await mkdir(outputDir, { recursive: true });

  // 式1: 定率法→定額法変更(除算記号「÷」、減算グループに項が3つ)
  {
    const candidates = detectSubtractGroupDivideFormulas(topicPageData.text);
    if (candidates.length === 0) {
      throw new Error(
        `ページ${TOPIC_PAGE}で減算グループ÷項式候補が検出できなかった(fail-closed、設計と実データが食い違っている可能性)`,
      );
    }
    const target = candidates[0];
    const segmentation = confirmTopLevelSegmentation();
    const block = buildFormulaConfirmedSource({
      blockId: "block-depreciation-method-change-to-straight-line",
      structureRef: topicNode.id,
      page: TOPIC_PAGE,
      printedPageLabel: TOPIC_PRINTED_PAGE,
      sequenceOnPage: 1,
      extractionRawText: target.matchedLine,
      tool: topicPageData.tool,
      toolVersion: topicPageData.toolVersion,
      invocation: topicPageData.invocation,
      sourceFaithful: target.formulaRaw,
      diagExtractionStatus: "captured_matches_sourceFaithful",
      diagExtractionArtifacts: [],
      segmentation,
      detectorId: target.detectorId,
      precedingHeading: target.precedingHeading,
    });
    const derivedKnowledgeCandidate = deriveCalculationFormulaKnowledgeCandidate({
      block,
      structureContext: { theme: themeNode, topic: topicNode },
      knowledgeId: "dk-formula-depreciation-method-change-to-straight-line",
      scopeNote: "本書テーマ8-8(償却方法の変更)の定率法から定額法への変更時の算定式でのみ確認",
      tokenize: tokenizeSubtractGroupDivideFormula,
    });
    const caseOutput = await writeFormulaCase({
      outputPath: path.join(outputDir, "depreciation-method-change-to-straight-line-formula.json"),
      caseName: "depreciation-method-change-to-straight-line-formula",
      themeNode,
      topicNode,
      block,
    });
    const updated = { ...caseOutput, derivedKnowledgeCandidate };
    const casePath = path.join(outputDir, `${updated.case}.json`);
    await writeFile(casePath, JSON.stringify(updated, null, 2), "utf8");
    console.log(`OK: wrote ${casePath}`);
    console.log(`  sourceFaithful: ${updated.block.sourceFaithful}`);
  }

  // 式2: 定額法→定率法変更(先頭が減算グループ、乗算相手は単純な項)
  {
    const candidates = detectTermBasedFormulas(topicPageData.text);
    const target = candidates.find((c) => c.matchedLine.includes("定率法償却率"));
    if (!target) {
      throw new Error(
        `ページ${TOPIC_PAGE}で"定率法償却率"を含む式候補が検出できなかった(fail-closed、設計と実データが食い違っている可能性)`,
      );
    }
    const segmentation = confirmTopLevelSegmentation();
    const block = buildFormulaConfirmedSource({
      blockId: "block-depreciation-method-change-to-declining-balance",
      structureRef: topicNode.id,
      page: TOPIC_PAGE,
      printedPageLabel: TOPIC_PRINTED_PAGE,
      sequenceOnPage: 2,
      extractionRawText: target.matchedLine,
      tool: topicPageData.tool,
      toolVersion: topicPageData.toolVersion,
      invocation: topicPageData.invocation,
      sourceFaithful: target.matchedLine,
      diagExtractionStatus: "captured_matches_sourceFaithful",
      diagExtractionArtifacts: [],
      segmentation,
      detectorId: target.detectorId,
      precedingHeading: target.precedingHeading,
    });
    const derivedKnowledgeCandidate = deriveCalculationFormulaKnowledgeCandidate({
      block,
      structureContext: { theme: themeNode, topic: topicNode },
      knowledgeId: "dk-formula-depreciation-method-change-to-declining-balance",
      scopeNote: "本書テーマ8-8(償却方法の変更)の定額法から定率法への変更時の算定式でのみ確認",
      tokenize: tokenizeSubtractGroupTimesTermFormula,
    });
    const caseOutput = await writeFormulaCase({
      outputPath: path.join(outputDir, "depreciation-method-change-to-declining-balance-formula.json"),
      caseName: "depreciation-method-change-to-declining-balance-formula",
      themeNode,
      topicNode,
      block,
    });
    const updated = { ...caseOutput, derivedKnowledgeCandidate };
    const casePath = path.join(outputDir, `${updated.case}.json`);
    await writeFile(casePath, JSON.stringify(updated, null, 2), "utf8");
    console.log(`OK: wrote ${casePath}`);
    console.log(`  sourceFaithful: ${updated.block.sourceFaithful}`);
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
