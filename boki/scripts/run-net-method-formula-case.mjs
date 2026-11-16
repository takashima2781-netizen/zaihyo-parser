#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ7-2 総記法): 決算時の商品販売益算定式
// (「売上高－（期首商品＋当期仕入高－期末商品）＝商品販売益」)1件を確定
// Source+Knowledge候補として生成する。
//
// 新しい検出器(`detectSubtractGroupFormulas`)・トークナイザー
// (`tokenizeSubtractGroupFormula`)を追加した(先頭が減算グループを伴わず、
// 括弧グループの中に加算と減算が混在する形状は既存のいずれの検出器・
// トークナイザーにも一致しないため)。教材上、「又は、」で始まる代替表現の
// 式(前T/B商品残高を起点とする式)も存在するが、形状が異なる別表現であり、
// 今回は主形状(1つ目の式)のみを対象とする(原則6)。
//
// 使い方: node scripts/run-net-method-formula-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectSubtractGroupFormulas } from "../src/parser/blockDetection.mjs";
import {
  detectThemeAndTopic,
  confirmTopLevelSegmentation,
  buildFormulaConfirmedSource,
  writeFormulaCase,
} from "../src/parser/formulaCaseHelpers.mjs";
import { tokenizeSubtractGroupFormula } from "../src/knowledge/formulaTokenizer.mjs";
import { deriveCalculationFormulaKnowledgeCandidate } from "../src/knowledge/deriveKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const THEME_PAGE = 112;
const TOPIC_PAGE = 123;
const TOPIC_PRINTED_PAGE = "94";
const CASE_NAME = "net-method-sales-profit-formula";
const KNOWLEDGE_ID = "dk-formula-net-method-sales-profit";
const BLOCK_ID = "block-net-method-sales-profit";

try {
  const { themeNode, topicNode, topicPageData } = await detectThemeAndTopic({
    pdfPath,
    themePage: THEME_PAGE,
    topicPage: TOPIC_PAGE,
    expectedTopicNumber: "7-2",
  });

  const candidates = detectSubtractGroupFormulas(topicPageData.text);
  if (candidates.length === 0) {
    throw new Error(
      `ページ${TOPIC_PAGE}で減算グループ式候補が検出できなかった(fail-closed、設計と実データが食い違っている可能性)`,
    );
  }
  const target = candidates[0];
  const outOfScopeCandidates = candidates.slice(1).map((c) => ({
    precedingHeading: c.precedingHeading ?? null,
    reason: "このケースの対象(主形状の商品販売益算定式)以外の候補。対象外とした",
  }));

  const segmentation = confirmTopLevelSegmentation();

  const extractionRawText = target.matchedLine;
  const sourceFaithful = target.formulaRaw;

  const block = buildFormulaConfirmedSource({
    blockId: BLOCK_ID,
    structureRef: topicNode.id,
    page: TOPIC_PAGE,
    printedPageLabel: TOPIC_PRINTED_PAGE,
    extractionRawText,
    tool: topicPageData.tool,
    toolVersion: topicPageData.toolVersion,
    invocation: topicPageData.invocation,
    sourceFaithful,
    diagExtractionStatus: "captured_matches_sourceFaithful",
    diagExtractionArtifacts: [],
    segmentation,
    detectorId: target.detectorId,
    precedingHeading: target.inlineLabelRaw,
  });

  const derivedKnowledgeCandidate = deriveCalculationFormulaKnowledgeCandidate({
    block,
    structureContext: { theme: themeNode, topic: topicNode },
    knowledgeId: KNOWLEDGE_ID,
    scopeNote: "本書テーマ7-2(総記法)の決算時の商品販売益算定式でのみ確認",
    tokenize: tokenizeSubtractGroupFormula,
  });

  const caseOutput = await writeFormulaCase({
    outputPath: path.join(outputDir, `${CASE_NAME}.json`),
    caseName: CASE_NAME,
    themeNode,
    topicNode,
    block,
    outOfScopeDetections: outOfScopeCandidates,
  });
  const updated = { ...caseOutput, derivedKnowledgeCandidate };
  const casePath = path.join(outputDir, `${CASE_NAME}.json`);
  await writeFile(casePath, JSON.stringify(updated, null, 2), "utf8");
  console.log(`OK: wrote ${casePath}`);
  console.log(`  sourceFaithful: ${updated.block.sourceFaithful}`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
