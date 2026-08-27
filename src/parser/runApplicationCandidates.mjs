// M1拡張(第2ケース専用): 定額法の適用例2件をSource候補として検出する。
//
// `planning/case2_readiness_and_generalization_analysis.md`に従う。
// 第1ケース(F3で即時確定)とは異なり、この2件はより大きな視覚単位(設例)の
// 内部にネストしているため、候補化して[8]候補確定フェーズへ引き渡す
// (Parserは独立参照の要否を判断しない、`parser_design_proposal.md`3-6節)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { extractPages, extractBlocks } from "./extract.mjs";
import { detectThemeHeading, detectTopicHeading } from "./structureRecognition.mjs";
import { detectTermBasedFormulas, findNestedParentLabel } from "./blockDetection.mjs";
import { restoreFractionByPosition } from "./faithfulRestoration.mjs";

const THEME_B_PAGE = 190;
const TOPIC_B_PAGE = 191;
const CANDIDATE_A_PAGE = 158;
const CANDIDATE_A_PRINTED_PAGE = "129";
const CANDIDATE_B_PAGE = 193;
const CANDIDATE_B_PRINTED_PAGE = "164";

export function splitFormulaGap(matchedLine) {
  const match = matchedLine.match(/([０-９0-9,，]+×)\s+(＝[０-９0-9,，]+)/);
  if (!match) {
    throw new Error(`ギャップパターンに一致しない(fail-closed): ${matchedLine}`);
  }
  return { beforeGap: match[1], afterGap: match[2] };
}

async function buildCandidate({ pdfPath, page, printedPageLabel, structureRef }) {
  const [pageText] = await extractPages(pdfPath, [page]);
  const candidates = detectTermBasedFormulas(pageText.text);
  if (candidates.length === 0) {
    throw new Error(`ページ${page}で候補が検出できなかった(fail-closed)`);
  }
  // このケースでは最初の出現(occurrenceIndex=0)のみを対象とする
  // (`case2_readiness_and_generalization_analysis.md`1-2節、最小スコープ)。
  const target = candidates[0];

  const nestedUnder = findNestedParentLabel(pageText.text, target.lineIndex);
  if (!nestedUnder) {
    throw new Error(
      `ページ${page}の候補について、親Sourceのラベル(設例)が見つからなかった(fail-closed)`,
    );
  }

  const { beforeGap, afterGap } = splitFormulaGap(target.matchedLine);
  const [blocksResult] = await extractBlocks(pdfPath, [page]);
  const { numerator, denominator } = restoreFractionByPosition(
    blocksResult.blocks,
    beforeGap,
    afterGap,
    0,
  );

  const sourceFaithful = `${beforeGap}（${numerator}／${denominator}）${afterGap}`;

  return {
    candidateId: `cand-${structureRef}-app`,
    location: { page, printedPageLabel, sequenceOnPage: 1 },
    structureRef,
    // F群の事実のみを記録する。独立参照必要性・sourceRefs.role・Knowledgeとの
    // 同一性判定は一切含めない(`parser_design_proposal.md`3-8節)。
    parentContext: {
      label: nestedUnder.label,
      note: "教材明示の境界記号(※番号等)は無く、設例ラベルの内部に位置する(F2)",
    },
    boundaryType: "none",
    sameTypePatterns: {
      count: candidates.length,
      note: `同一ページ内に${candidates.length}件の同型候補を検出した(F7)`,
    },
    abstractDefinitionCandidate: {
      exists: true,
      sourceBlockId: "block-teigakuho-def",
      note: "論点8-2に、この候補と同型の抽象定義式(確定Source)が既に存在する(F8)",
    },
    detection: {
      detectorId: target.detectorId,
      matchedLine: target.matchedLine,
      precedingHeading: target.precedingHeading,
    },
    extractionRaw: {
      text: [...target.contextBefore, target.matchedLine, ...target.contextAfter].join("\n"),
      tool: pageText.tool,
      toolVersion: pageText.toolVersion,
      invocation: pageText.invocation,
    },
    sourceFaithful,
    diag: {
      extraction: {
        status: "captured_differs",
        artifacts: [
          {
            kind: "fraction_split",
            stage: "extraction",
            resolved: true,
            note: "座標ベースの位置対応付け(blocks)により人間確認済みの補正を適用した",
          },
        ],
      },
      faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" },
    },
    // [8]候補確定フェーズの状態。M4のKnowledge側reviewStatusとは別軸・別工程
    // であることをフィールド名からも明確にする
    // (`case2_readiness_and_generalization_analysis.md`3-2節)。
    confirmationStatus: "candidate",
    reviewedAt: null,
    reviewNote: null,
    confirmedBlockId: null,
  };
}

/**
 * @param {{ pdfPath: string, definitionCasePath: string, outputPath: string }} options
 */
export async function runApplicationCandidates({ pdfPath, definitionCasePath, outputPath }) {
  // テーマ8・論点8-2は第1ケースで既に確定済みのため再利用する(再検出しない)。
  const definitionCase = JSON.parse(await readFile(definitionCasePath, "utf8"));
  const { theme: themeA, topic: topicA } = definitionCase.structureContext;

  // テーマ9・論点9-1は新規検出(第2ケースで初めて必要になる)。
  const [theme9Page] = await extractPages(pdfPath, [THEME_B_PAGE]);
  const theme9 = detectThemeHeading(theme9Page.text);
  if (!theme9) {
    throw new Error(`テーマ9見出しが検出できなかった(fail-closed、ページ${THEME_B_PAGE})`);
  }
  const [topic91Page] = await extractPages(pdfPath, [TOPIC_B_PAGE]);
  const topic91 = detectTopicHeading(topic91Page.text);
  if (!topic91) {
    throw new Error(`論点9-1見出しが検出できなかった(fail-closed、ページ${TOPIC_B_PAGE})`);
  }

  const themeB = {
    type: "StructureNode",
    nodeKind: "theme",
    id: `theme-${theme9.number}`,
    label: { number: theme9.number, titleRaw: theme9.titleRaw },
    location: { page: THEME_B_PAGE },
  };
  const topicB = {
    type: "StructureNode",
    nodeKind: "topic",
    id: `topic-${topic91.number}`,
    label: { number: topic91.number, titleRaw: topic91.titleRaw },
    location: { page: TOPIC_B_PAGE },
    parentId: themeB.id,
  };

  const candidateA = await buildCandidate({
    pdfPath,
    page: CANDIDATE_A_PAGE,
    printedPageLabel: CANDIDATE_A_PRINTED_PAGE,
    structureRef: topicA.id,
  });
  const candidateB = await buildCandidate({
    pdfPath,
    page: CANDIDATE_B_PAGE,
    printedPageLabel: CANDIDATE_B_PRINTED_PAGE,
    structureRef: topicB.id,
  });

  const output = {
    case: "teigakuho-application",
    generatedAt: new Date().toISOString(),
    // どの定義ケース(Knowledgeの正本)へ統合すべきかを、適用例ケース自身に
    // 持たせる(第5ケースでdevViewer/server.mjsのcaseNameハードコードを
    // 除去した際に追加。既存フィールドへの追記のみで後方互換)。
    definitionCaseName: "teigakuho-definition",
    structureContext: { themeA, topicA, themeB, topicB },
    candidates: [candidateA, candidateB],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  return output;
}
