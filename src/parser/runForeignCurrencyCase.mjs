// M1拡張(第5ケース専用): テーマ11(外貨建取引等)、論点11-1(外貨建取引の
// 換算)から、換算方法の定義式1件を確定Sourceとして生成する。
//
// PDF → [1]Extraction → [2]Structure Recognition(theme-11/topic-11-1、
// 新規検出) → [3]Block Detection(`detectPlainTermFormulas`、第5ケースで
// 新規追加した「項×項＝項」検出器) → [4]Source Segmentation(F3、
// トップレベル) → [5]Faithful Restoration(CJK字間空白の除去、念のため
// 適用するが実データでは除去対象なし) → 確定Source(JSON)
//
// テーマ/論点見出し検出・F3確定・ContentBlock組み立て・書き出しという
// 共通の骨格は`formulaCaseHelpers.mjs`(Phase C着手前のアーキテクチャ確認で
// 第1・第5・第6ケースの3件から抽出、`planning/phase_c_readiness_
// assessment.md`2節)を使う。検出器・候補選別・Faithful Restorationは、
// このケース固有のロジックとして引き続きここに書く(CLAUDE.md原則5・6)。
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

import { detectPlainTermFormulas } from "./blockDetection.mjs";
import { normalizeCjkLetterSpacing } from "./faithfulRestoration.mjs";
import {
  detectThemeAndTopic,
  confirmTopLevelSegmentation,
  buildFormulaConfirmedSource,
  writeFormulaCase,
} from "./formulaCaseHelpers.mjs";

const THEME_PAGE = 200;
const TOPIC_PAGE = 201;
const TOPIC_PRINTED_PAGE = "172";

const BLOCK_ID = "block-foreign-currency-def";

/**
 * @param {{ pdfPath: string, outputPath: string }} options
 */
export async function runForeignCurrencyCase({ pdfPath, outputPath }) {
  const { themeNode, topicNode, topicPageData } = await detectThemeAndTopic({
    pdfPath,
    themePage: THEME_PAGE,
    topicPage: TOPIC_PAGE,
    expectedTopicNumber: "11-1",
  });

  const candidates = detectPlainTermFormulas(topicPageData.text);
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

  const segmentation = confirmTopLevelSegmentation();

  const restored = normalizeCjkLetterSpacing(target.formulaRaw);
  const sourceFaithful = restored.normalized;

  const block = buildFormulaConfirmedSource({
    blockId: BLOCK_ID,
    structureRef: topicNode.id,
    page: TOPIC_PAGE,
    printedPageLabel: TOPIC_PRINTED_PAGE,
    extractionRawText: target.matchedLine,
    tool: topicPageData.tool,
    toolVersion: topicPageData.toolVersion,
    invocation: topicPageData.invocation,
    sourceFaithful,
    diagExtractionStatus: restored.removedCount > 0 ? "captured_differs" : "captured_matches_sourceFaithful",
    diagExtractionArtifacts:
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
    segmentation,
    detectorId: target.detectorId,
  });

  return writeFormulaCase({
    outputPath,
    caseName: "foreign-currency-definition",
    themeNode,
    topicNode,
    block,
  });
}
