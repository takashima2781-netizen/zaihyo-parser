// M1拡張(第4ケース専用): テーマ4-1(手形)の約束手形から、仕訳パターン2件
// (振出人/名宛人)をそれぞれ確定Sourceとして生成する。
//
// PDF → [1]Extraction → [2]Structure Recognition(theme-4/topic-4-1、
// 新規検出) → [3]Block Detection(仕訳パターン検出器、第4ケースの実データで
// 「(借)」直前に役割ラベルが同居する形を確認したため拡張済み) →
// [4]Source Segmentation(F3、トップレベル) → [5]Faithful Restoration
// (CJK字間空白の除去、○○○プレースホルダーも対象に含めて拡張済み) →
// 確定Source(JSON)×2件
//
// このケース専用に書く(第1〜3ケースと同じ方針)。
//
// [3] Block Detectionについて: 同じページの➋為替手形にも同型の仕訳パターン
// (振出人/名宛人/指図人、3件)が存在するが、➊約束手形の直後に置かれた
// 「➋」という見出しより前の候補だけを対象とする(教材の見出し構造上の
// 区切りを機械的に使うだけで、内容の意味判断は行わない)。➋為替手形の
// 振出人の行は、借方・貸方の両方がプレースホルダー(「〇〇〇」)であり、
// かつ教材の地の文で、振出人自身には手形上の債権・債務が生じない旨が
// 説明されている——この行が実際に成立する仕訳を示しているのか、単なる
// 対比のための構造的な例示なのかは会計的な解釈を要するため、今回は
// 対象外とし、`outOfScopeDetections`に記録するに留める(原則4、推測しない)。
//
// [4] Source Segmentationについて: 2件の仕訳パターンはいずれも、テーマ
// 4-1の説明文中の「➊約束手形」という項目の直下に位置する。教材明示の
// 境界記号(設例ラベル等)による囲みは無く、トップレベルの独立したSourceと
// して扱う(F3、第1・第3ケースと同じ判断基準)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { extractPages } from "./extract.mjs";
import { detectThemeHeading, detectTopicHeading } from "./structureRecognition.mjs";
import { detectJournalPatterns } from "./blockDetection.mjs";
import { applyF3 } from "./sourceSegmentation.mjs";
import { normalizeCjkLetterSpacing } from "./faithfulRestoration.mjs";

const THEME_PAGE = 76;
const TOPIC_PAGE = 77;
const TOPIC_PRINTED_PAGE = "48";

const SECTION_BOUNDARY_MARKER = "➋"; // これより後の候補(為替手形)は対象外

const CANDIDATE_DEFINITIONS = [
  {
    inlineLabelPrefix: "振出人",
    caseName: "promissory-note-drawer-journal",
    blockId: "block-promissory-note-drawer",
    sequenceOnPage: 1,
  },
  {
    inlineLabelPrefix: "名宛人",
    caseName: "promissory-note-payee-journal",
    blockId: "block-promissory-note-payee",
    sequenceOnPage: 2,
  },
];

function stripFootnoteMark(accountName) {
  return accountName.replace(/※+$/, "");
}

/**
 * @param {{ pdfPath: string, outputDir: string }} options
 * @returns {Promise<{ cases: object[], outOfScopeDetections: object[] }>}
 */
export async function runPromissoryNoteCase({ pdfPath, outputDir }) {
  const [themePage] = await extractPages(pdfPath, [THEME_PAGE]);
  const theme = detectThemeHeading(themePage.text);
  if (!theme) {
    throw new Error(`テーマ4見出しが検出できなかった(fail-closed、ページ${THEME_PAGE})`);
  }
  const themeNode = {
    type: "StructureNode",
    nodeKind: "theme",
    id: `theme-${theme.number}`,
    label: { number: theme.number, titleRaw: theme.titleRaw },
    location: { page: THEME_PAGE },
  };

  const [page] = await extractPages(pdfPath, [TOPIC_PAGE]);
  const topic = detectTopicHeading(page.text);
  if (!topic || topic.number !== "4-1") {
    throw new Error(`topic-4-1見出しが検出できなかった(fail-closed、ページ${TOPIC_PAGE})`);
  }
  const topicNode = {
    type: "StructureNode",
    nodeKind: "topic",
    id: `topic-${topic.number}`,
    label: { number: topic.number, titleRaw: topic.titleRaw },
    location: { page: TOPIC_PAGE },
    parentId: themeNode.id,
  };

  const allCandidates = detectJournalPatterns(page.text);

  // ➊約束手形の区間(➋という見出しより前)だけを対象にする。
  const rawLines = page.text.split("\n");
  const boundaryLineIndex = rawLines.findIndex((l) => l.trim().startsWith(SECTION_BOUNDARY_MARKER));
  const inScopeCandidates = allCandidates.filter(
    (c) => boundaryLineIndex === -1 || c.lineIndex < boundaryLineIndex,
  );
  const outOfScopeCandidates = allCandidates
    .filter((c) => !inScopeCandidates.includes(c))
    .map((c) => ({
      precedingHeading: c.inlineLabelRaw ?? c.precedingHeading,
      reason:
        "同じページの為替手形の仕訳。振出人の行は借方・貸方が両方プレースホルダーで" +
        "会計的な解釈を要するため、今回は対象外とした(教材内容の判断が必要、原則4)",
    }));

  if (inScopeCandidates.length !== CANDIDATE_DEFINITIONS.length) {
    throw new Error(
      `想定していた仕訳パターン候補数(${CANDIDATE_DEFINITIONS.length})と実際の検出数` +
        `(${inScopeCandidates.length})が一致しない(fail-closed、設計と実データが食い違っている可能性)`,
    );
  }

  const cases = [];

  for (const def of CANDIDATE_DEFINITIONS) {
    const candidate = inScopeCandidates.find((c) =>
      (c.inlineLabelRaw ?? "").startsWith(def.inlineLabelPrefix),
    );
    if (!candidate) {
      throw new Error(
        `inlineLabelRawが"${def.inlineLabelPrefix}"で始まる候補が見つからなかった` +
          `(fail-closed、設計と実データが食い違っている可能性)`,
      );
    }

    const segmentation = applyF3({ nestedUnder: null });
    if (!segmentation.confirmed) {
      throw new Error("F3で確定できなかった(fail-closed)");
    }

    const debitResult = normalizeCjkLetterSpacing(candidate.debitAccountRaw);
    const creditResult = normalizeCjkLetterSpacing(candidate.creditAccountRaw);
    const debitAccount = stripFootnoteMark(debitResult.normalized);
    const creditAccount = stripFootnoteMark(creditResult.normalized);
    const spacingRemoved = debitResult.removedCount + creditResult.removedCount;

    const sourceFaithful = `(借)${debitAccount}×××(貸)${creditAccount}×××`;

    const confirmedSource = {
      type: "ContentBlock",
      id: def.blockId,
      blockKind: "journal_termbased",
      structureRef: topicNode.id,
      location: {
        page: TOPIC_PAGE,
        printedPageLabel: TOPIC_PRINTED_PAGE,
        sequenceOnPage: def.sequenceOnPage,
      },
      extractionRaw: {
        text: candidate.matchedLine,
        tool: page.tool,
        toolVersion: page.toolVersion,
        invocation: page.invocation,
      },
      sourceFaithful,
      diag: {
        extraction: {
          status: spacingRemoved > 0 ? "captured_differs" : "captured_matches_sourceFaithful",
          artifacts:
            spacingRemoved > 0
              ? [
                  {
                    kind: "letter_spacing",
                    stage: "extraction",
                    resolved: true,
                    note: `勘定科目名の文字間にあった字間調整用の空白(${spacingRemoved}箇所)を機械的に除去した`,
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
        detectorId: candidate.detectorId,
        precedingHeading: candidate.inlineLabelRaw,
      },
    };

    const caseOutput = {
      case: def.caseName,
      generatedAt: new Date().toISOString(),
      structureContext: { theme: themeNode, topic: topicNode },
      block: confirmedSource,
      candidateReport: { candidates: [] },
      outOfScopeDetections: outOfScopeCandidates,
    };

    const outputPath = path.join(outputDir, `${def.caseName}.json`);
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, JSON.stringify(caseOutput, null, 2), "utf8");

    cases.push(caseOutput);
  }

  return { cases, outOfScopeDetections: outOfScopeCandidates };
}
