// M1拡張(第4ケースの追加分): テーマ4-1(手形)の為替手形から、仕訳パターン
// 2件(名宛人/指図人)をそれぞれ確定Sourceとして生成する。
//
// 第4ケース(`runPromissoryNoteCase.mjs`)は、同じページの為替手形3件
// (振出人/名宛人/指図人)について、振出人の行が教材の地の文と一見矛盾する
// (「振出人には手形上の債権・債務は一切生じない」と書かれているにも
// かかわらず、借方・貸方ともプレースホルダーの仕訳が示されている)ため、
// 会計的な解釈が必要と判断し3件とも対象外としていた。
//
// ユーザー確認の結果(`planning/exchange_bill_drawer_journal_material_
// inquiry.md`への回答)、地の文と仕訳は矛盾しておらず(振出人の仕訳は
// 手形の勘定科目を使わず、手形とは別の既存の債権・債務の消滅を記録して
// いるだけ)、為替手形も学習対象として扱ってよいことが確認された。
//
// 一方、振出人の仕訳だけは、借方・貸方とも固定された勘定科目を持たない
// (取引関係によって消滅する既存債権・債務の科目が変わりうる)ため、今回は
// 名宛人/指図人(既存の約束手形と同型、片側が固定科目)の2件のみを追加し、
// 振出人は改めて対象外とする(理由は下記[3]参照、今回は会計的な判断では
// なくExercise生成上の理由による)。
//
// PDF → [1]Extraction → [2]Structure Recognition(theme-4/topic-4-1、
// 第4ケースで確定済みのため再検出はしない) → [3]Block Detection
// (`detectJournalPatterns`、第4ケースと完全に同じ検出器、変更なし) →
// [4]Source Segmentation(F3、トップレベル) → [5]Faithful Restoration
// (CJK字間空白の除去、第4ケースと同じ) → 確定Source(JSON)×2件
//
// [3] Block Detectionについて: ➋為替手形の区間(➌が無いため、ページ末尾
// まで)の候補のうち、振出人以外の2件を対象とする。検出器・トークナイザー
// (`tokenizeJournalPattern`)はいずれも第4ケースから無変更で再利用できる
// (借方・貸方の一方が固定科目〈支払手形/受取手形〉、他方がプレース
// ホルダーという、名宛人・指図人の型は約束手形と全く同じ形状のため)。
//
// 振出人を対象外とする理由: `tokenizeJournalPattern`自体は「(借)〇〇〇
// ×××(貸)〇〇〇×××」という形も問題なく構造化できる(技術的には表現
// 可能)。しかし、振出人の行は借方・貸方の両方が同じプレースホルダー
// 文字列(「〇〇〇」)であり、既存の並び替えExercise(`generateJournal
// OrderingExercise`、`exact_sequence_match`は選択肢の文字列を位置ごとに
// 比較するのみで、同じ文字列を持つ複数チャンクを区別しない)にかけると、
// 「(借)/(貸)の位置に、2つある同一の「〇〇〇」チャンクのどちらを置いても
// 正解になる」という、名宛人・指図人(固定科目を正しい位置に置けるかを
// 問う)とは異なり実質的に学習内容が空になる問題が生成されてしまう。
// これは会計的な判断ではなく、現在のKnowledge/Exerciseモデル(1つの型に
// つき、区別可能なチャンクで構成される前提)が振出人の型を自然に表現
// できないことによるものであり、無理に実装せず保留する
// (ユーザー承認済みの方針)。

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

const SECTION_BOUNDARY_MARKER = "➋"; // これ以降(為替手形の区間)を対象にする

const CANDIDATE_DEFINITIONS = [
  {
    inlineLabelPrefix: "名宛人",
    caseName: "exchange-bill-payee-journal",
    blockId: "block-exchange-bill-payee",
    sequenceOnPage: 4,
  },
  {
    inlineLabelPrefix: "指図人",
    caseName: "exchange-bill-remittee-journal",
    blockId: "block-exchange-bill-remittee",
    sequenceOnPage: 5,
  },
];

const DRAWER_OUT_OF_SCOPE_REASON =
  "振出人の仕訳は借方・貸方とも同じプレースホルダー(〇〇〇)であり、固定された勘定科目を" +
  "持たない。会計的には教材の説明と矛盾しない(ユーザー確認済み)が、既存の並び替え" +
  "Exerciseの判定方式(位置ごとの文字列比較、同一文字列の複数チャンクを区別しない)では、" +
  "実質的に学習内容の無い問題になってしまうため、Exercise生成上の理由で今回は対象外とした" +
  "(会計的な判断ではない、`planning/exchange_bill_drawer_journal_material_inquiry.md`参照)";

function stripFootnoteMark(accountName) {
  return accountName.replace(/※+$/, "");
}

/**
 * @param {{ pdfPath: string, outputDir: string }} options
 * @returns {Promise<{ cases: object[], outOfScopeDetections: object[] }>}
 */
export async function runExchangeBillCase({ pdfPath, outputDir }) {
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

  // ➋為替手形の区間(➋という見出し以降)だけを対象にする。
  const rawLines = page.text.split("\n");
  const boundaryLineIndex = rawLines.findIndex((l) => l.trim().startsWith(SECTION_BOUNDARY_MARKER));
  if (boundaryLineIndex === -1) {
    throw new Error(`区切り見出し"${SECTION_BOUNDARY_MARKER}"が見つからなかった(fail-closed)`);
  }
  const exchangeBillCandidates = allCandidates.filter((c) => c.lineIndex > boundaryLineIndex);

  const drawerCandidates = exchangeBillCandidates.filter((c) =>
    (c.inlineLabelRaw ?? "").startsWith("振出人"),
  );
  const inScopeCandidates = exchangeBillCandidates.filter((c) => !drawerCandidates.includes(c));

  const outOfScopeCandidates = drawerCandidates.map((c) => ({
    precedingHeading: c.inlineLabelRaw ?? c.precedingHeading,
    reason: DRAWER_OUT_OF_SCOPE_REASON,
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
