// M1拡張(第5ケース専用): 外貨建取引の換算方法(定義式)について、適用例2件を
// Source候補として検出する。
//
// `planning/case2_readiness_and_generalization_analysis.md`の候補提示方針
// (Parserは独立参照の要否を判断しない)を踏襲する。第2ケース(定額法)と
// 同じく、1件は定義と同じ論点内(同一topic、自動確定が期待される)、もう
// 1件はテーマ内の別の論点(論点11-2、決算時の処理。テーマ横断ではなく
// 論点横断だが、`evaluateAutoConfirmation`が見るのは
// `candidate.structureRef`とdefinitionの`structureRef`の一致有無であり、
// テーマ内/テーマ横断を区別しないため、同じ「cross_topic」判定経路を通る)
// から検出する。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { extractPages } from "./extract.mjs";
import { detectThemeHeading, detectTopicHeading } from "./structureRecognition.mjs";
import { detectPlainTermFormulas, findNestedParentLabel } from "./blockDetection.mjs";
import { normalizeCjkLetterSpacing } from "./faithfulRestoration.mjs";

const TOPIC_B_PAGE = 205;
const CANDIDATE_A_PAGE = 203;
const CANDIDATE_A_PRINTED_PAGE = "174";
const CANDIDATE_B_PAGE = 206;
const CANDIDATE_B_PRINTED_PAGE = "177";

function buildCandidateFromTarget({ target, page, printedPageLabel, structureRef, parentContext }) {
  const restored = normalizeCjkLetterSpacing(target.formulaRaw);
  const sourceFaithful = restored.normalized;

  return {
    candidateId: `cand-${structureRef}-app`,
    location: { page, printedPageLabel, sequenceOnPage: 1 },
    structureRef,
    // F群の事実のみを記録する(`runApplicationCandidates.mjs`と同じ方針)。
    parentContext,
    boundaryType: "none",
    sameTypePatterns: {
      count: 0, // 呼び出し側で埋める(ページ単位の検出件数のため)
      note: "",
    },
    abstractDefinitionCandidate: {
      exists: true,
      sourceBlockId: "block-foreign-currency-def",
      note: "論点11-1に、この候補と同型の抽象定義式(確定Source)が既に存在する(F8)",
    },
    detection: {
      detectorId: target.detectorId,
      matchedLine: target.matchedLine,
      inlineLabelRaw: target.inlineLabelRaw,
    },
    extractionRaw: {
      text: target.matchedLine,
      tool: null, // 呼び出し側で埋める
      toolVersion: null,
      invocation: null,
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
                  note: `字間調整用の空白(${restored.removedCount}箇所)を機械的に除去した`,
                },
              ]
            : [],
      },
      faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" },
    },
    confirmationStatus: "candidate",
    reviewedAt: null,
    reviewNote: null,
    confirmedBlockId: null,
  };
}

/**
 * @param {{ pdfPath: string, definitionCasePath: string, outputPath: string }} options
 */
export async function runForeignCurrencyApplicationCandidates({ pdfPath, definitionCasePath, outputPath }) {
  // テーマ11・論点11-1は第5ケースの定義Sourceで既に確定済みのため再利用する。
  const definitionCase = JSON.parse(await readFile(definitionCasePath, "utf8"));
  const { theme: themeA, topic: topicA } = definitionCase.structureContext;

  // 論点11-2(決算時の処理)は新規検出。
  const [topic112Page] = await extractPages(pdfPath, [TOPIC_B_PAGE]);
  const topic112 = detectTopicHeading(topic112Page.text);
  if (!topic112 || topic112.number !== "11-2") {
    throw new Error(`topic-11-2見出しが検出できなかった(fail-closed、ページ${TOPIC_B_PAGE})`);
  }
  const topicB = {
    type: "StructureNode",
    nodeKind: "topic",
    id: `topic-${topic112.number}`,
    label: { number: topic112.number, titleRaw: topic112.titleRaw },
    location: { page: TOPIC_B_PAGE },
    parentId: themeA.id,
  };

  // --- 候補A: ページ203(論点11-1自身の設例、仕入取引)。同一topic内。 ---
  const [pageA] = await extractPages(pdfPath, [CANDIDATE_A_PAGE]);
  const candidatesA = detectPlainTermFormulas(pageA.text);
  if (candidatesA.length === 0) {
    throw new Error(`ページ${CANDIDATE_A_PAGE}で候補が検出できなかった(fail-closed)`);
  }
  const targetA = candidatesA[0];
  const nestedUnderA = findNestedParentLabel(pageA.text, targetA.lineIndex);
  if (!nestedUnderA) {
    throw new Error(
      `ページ${CANDIDATE_A_PAGE}の候補について、親Sourceのラベル(設例)が見つからなかった(fail-closed)`,
    );
  }
  const candidateA = buildCandidateFromTarget({
    target: targetA,
    page: CANDIDATE_A_PAGE,
    printedPageLabel: CANDIDATE_A_PRINTED_PAGE,
    structureRef: topicA.id,
    parentContext: {
      label: nestedUnderA.label,
      note: "教材明示の境界記号(※番号等)は無く、設例ラベルの内部に位置する(F2)",
    },
  });
  candidateA.sameTypePatterns = {
    count: candidatesA.length,
    note: `同一ページ内に${candidatesA.length}件の同型候補を検出した(F7)`,
  };
  candidateA.extractionRaw.tool = pageA.tool;
  candidateA.extractionRaw.toolVersion = pageA.toolVersion;
  candidateA.extractionRaw.invocation = pageA.invocation;

  // --- 候補B: ページ206(論点11-2自身の設例、決算時の処理)。テーマ内の
  // 別論点(論点横断)。「設例」ラベル自体は前ページ(205)にあり、この
  // 検出対象行を含むページ(206)単体のテキストには現れない
  // (`findNestedParentLabel`はページ単位でしか検索しないため自動検出
  // できない)。ページ205に「設例」ラベル(反転表記「例設」)が存在し、
  // ページ206がその「説（単位：円）解」区間の続きであることは、実PDFの
  // 目視確認で確認済みの事実である(`runTeigakuhoCase.mjs`の`nestedUnder:
  // null`と同じ扱い、自動検出できない既知の構造的事実を明示的に記録する)。
  const [pageB] = await extractPages(pdfPath, [CANDIDATE_B_PAGE]);
  const candidatesB = detectPlainTermFormulas(pageB.text);
  if (candidatesB.length === 0) {
    throw new Error(`ページ${CANDIDATE_B_PAGE}で候補が検出できなかった(fail-closed)`);
  }
  const targetB = candidatesB[0];
  const candidateB = buildCandidateFromTarget({
    target: targetB,
    page: CANDIDATE_B_PAGE,
    printedPageLabel: CANDIDATE_B_PRINTED_PAGE,
    structureRef: topicB.id,
    parentContext: {
      label: "設例(前ページ205に位置、目視確認済み)",
      note:
        "設例ラベル自体は前ページ(205)にあり、この候補を含むページ(206)は" +
        "その「説（単位：円）解」区間の続きである。教材明示の境界記号(※番号等)は無い(F2)",
    },
  });
  candidateB.sameTypePatterns = {
    count: candidatesB.length,
    note: `同一ページ内に${candidatesB.length}件の同型候補を検出した(F7)`,
  };
  candidateB.extractionRaw.tool = pageB.tool;
  candidateB.extractionRaw.toolVersion = pageB.toolVersion;
  candidateB.extractionRaw.invocation = pageB.invocation;

  const output = {
    case: "foreign-currency-application",
    generatedAt: new Date().toISOString(),
    definitionCaseName: "foreign-currency-definition",
    structureContext: { themeA, topicA, themeB: themeA, topicB },
    candidates: [candidateA, candidateB],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  return output;
}
