// M1拡張(第3ケース専用): テーマ8-11(無形固定資産)の会計処理から、仕訳
// パターン2件(支出時/決算時)をそれぞれ確定Sourceとして生成する。
//
// PDF → [1]Extraction → [2]Structure Recognition(topic-8-11、themeは
// 第1ケースのtheme-8を再利用) → [3]Block Detection(仕訳パターン検出器) →
// [4]Source Segmentation(F3、トップレベル) → [5]Faithful Restoration
// (CJK字間空白の除去) → 確定Source(JSON)×2件
//
// このケース専用に書く(第1・第2ケースと同じ方針、汎用`runPipeline
// (caseConfig)`のような抽象化はまだ作らない、`runTeigakuhoCase.mjs`
// 冒頭コメント参照)。
//
// [4] Source Segmentationについて: 2件の仕訳パターンはいずれも、テーマ
// 8-11の説明文中の「➋会計処理」という項目の直下、「(1)支出時」
// 「(2)決算時」という番号付きサブ項目に位置する。第1ケース(定額法の
// 定義式、「1 定額法（〇）」という同種のサブ見出しの直下)と同様、
// 教材明示の境界記号(設例ラベル等)による囲みは無く、トップレベルの
// 独立したSourceとして扱う(F3、`m1_minimal_parser_prototype_design.md`
// と同じ判断基準)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { extractPages } from "./extract.mjs";
import { detectTopicHeading } from "./structureRecognition.mjs";
import { detectJournalPatterns } from "./blockDetection.mjs";
import { applyF3 } from "./sourceSegmentation.mjs";
import { normalizeCjkLetterSpacing } from "./faithfulRestoration.mjs";

const TOPIC_PAGE = 187;
const TOPIC_PRINTED_PAGE = "158";

const CANDIDATE_DEFINITIONS = [
  {
    precedingHeadingMatch: "(1)",
    caseName: "intangible-journal-acquisition",
    blockId: "block-intangible-journal-acquisition",
    sequenceOnPage: 1,
  },
  {
    precedingHeadingMatch: "(2)",
    caseName: "intangible-journal-amortization",
    blockId: "block-intangible-journal-amortization",
    sequenceOnPage: 2,
  },
];

// 勘定科目名についた脚注参照記号(※)は、脚注本文を扱わない今回のスコープ
// では取り除く(脚注の扱いはこのケースの対象外、第1・第2ケースでも同様に
// 注記・留意点等は対象外としてきた)。
function stripFootnoteMark(accountName) {
  return accountName.replace(/※+$/, "");
}

/**
 * @param {{ pdfPath: string, definitionCasePath: string, outputDir: string }} options
 * @returns {Promise<Array<object>>} 生成した2件のケースデータ
 */
export async function runIntangibleJournalCase({ pdfPath, definitionCasePath, outputDir }) {
  // テーマ8は第1ケースで既に確定済みのため再利用する(再検出しない、
  // `runApplicationCandidates.mjs`と同じ方針)。
  const definitionCase = JSON.parse(await readFile(definitionCasePath, "utf8"));
  const { theme } = definitionCase.structureContext;

  const [page] = await extractPages(pdfPath, [TOPIC_PAGE]);

  const topic = detectTopicHeading(page.text);
  if (!topic || topic.number !== "8-11") {
    throw new Error(
      `topic-8-11見出しが検出できなかった(fail-closed、ページ${TOPIC_PAGE})`,
    );
  }
  const topicNode = {
    type: "StructureNode",
    nodeKind: "topic",
    id: `topic-${topic.number}`,
    label: { number: topic.number, titleRaw: topic.titleRaw },
    location: { page: TOPIC_PAGE },
    parentId: theme.id,
  };

  const candidates = detectJournalPatterns(page.text);
  if (candidates.length !== CANDIDATE_DEFINITIONS.length) {
    throw new Error(
      `想定していた仕訳パターン候補数(${CANDIDATE_DEFINITIONS.length})と実際の検出数` +
        `(${candidates.length})が一致しない(fail-closed、設計と実データが食い違っている可能性)`,
    );
  }

  const results = [];

  for (const def of CANDIDATE_DEFINITIONS) {
    const candidate = candidates.find((c) =>
      (c.precedingHeading ?? "").startsWith(def.precedingHeadingMatch),
    );
    if (!candidate) {
      throw new Error(
        `precedingHeadingが"${def.precedingHeadingMatch}"で始まる候補が見つからなかった` +
          `(fail-closed、設計と実データが食い違っている可能性)`,
      );
    }

    // [4] Source Segmentation(F3のみ、ファイル冒頭コメントの判断根拠のとおり)
    const segmentation = applyF3({ nestedUnder: null });
    if (!segmentation.confirmed) {
      throw new Error("F3で確定できなかった(fail-closed)");
    }

    // [5] Faithful Restoration: CJK字間空白の除去+脚注記号の除去
    const debitAccount = stripFootnoteMark(
      normalizeCjkLetterSpacing(candidate.debitAccountRaw).normalized,
    );
    const creditAccount = stripFootnoteMark(
      normalizeCjkLetterSpacing(candidate.creditAccountRaw).normalized,
    );
    const spacingRemoved =
      normalizeCjkLetterSpacing(candidate.debitAccountRaw).removedCount +
      normalizeCjkLetterSpacing(candidate.creditAccountRaw).removedCount;

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
        precedingHeading: candidate.precedingHeading,
      },
    };

    const caseOutput = {
      case: def.caseName,
      generatedAt: new Date().toISOString(),
      structureContext: { theme, topic: topicNode },
      block: confirmedSource,
      candidateReport: { candidates: [] },
      outOfScopeDetections: [],
    };

    const outputPath = path.join(outputDir, `${def.caseName}.json`);
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, JSON.stringify(caseOutput, null, 2), "utf8");

    results.push(caseOutput);
  }

  return results;
}
