// 共通ヘルパー(Phase C教材投入で追加、`planning/phase_c_topic_inventory.md`)。
//
// 「仕訳パターン(journal_pattern)の確定Sourceを1件作る」という骨格が、
// 第3・第4ケース(`runIntangibleJournalCase.mjs`・`runPromissoryNoteCase.mjs`・
// `runExchangeBillCase.mjs`)の3件で確認できた形とほぼ同一である
// (`detectJournalPatterns`で候補検出→CJK字間空白除去+脚注記号除去→
// sourceFaithful組み立て→ContentBlock組み立て)ことを踏まえ、Phase C本体で
// 論点を連続投入する際の共通部分を抽出する。テーマ/論点見出し検出・F3確定・
// 書き出しは`formulaCaseHelpers.mjs`のものをそのまま再利用する(重複実装
// しない)。
//
// 候補の検出(`detectJournalPatterns`の呼び出し)・候補の選別(どの候補を
// どのケース名に対応させるか)は、教材ごとに実際に異なるため、引き続き
// 呼び出し側(各run*Case.mjs)が書く。

const FOOTNOTE_MARK_PATTERN = /※+$/;

function stripFootnoteMark(accountName) {
  return accountName.replace(FOOTNOTE_MARK_PATTERN, "");
}

/**
 * `detectJournalPatterns`が返す1候補から、仕訳パターン用の確定Source
 * (ContentBlock)を組み立てる。CJK字間空白の除去・脚注記号(※)の除去を
 * 行う(第3・第4ケースで確認済みの補正、`normalizeCjkLetterSpacing`)。
 * @param {object} params
 * @returns {object} ContentBlock
 */
export function buildJournalConfirmedSource({
  blockId,
  structureRef,
  page,
  printedPageLabel,
  sequenceOnPage = 1,
  candidate,
  tool,
  toolVersion,
  invocation,
  segmentation,
  normalizeCjkLetterSpacing,
}) {
  const debitResult = normalizeCjkLetterSpacing(candidate.debitAccountRaw);
  const creditResult = normalizeCjkLetterSpacing(candidate.creditAccountRaw);
  const debitAccount = stripFootnoteMark(debitResult.normalized);
  const creditAccount = stripFootnoteMark(creditResult.normalized);
  const spacingRemoved = debitResult.removedCount + creditResult.removedCount;

  const sourceFaithful = `(借)${debitAccount}×××(貸)${creditAccount}×××`;

  return {
    type: "ContentBlock",
    id: blockId,
    blockKind: "journal_termbased",
    structureRef,
    location: { page, printedPageLabel, sequenceOnPage },
    extractionRaw: {
      text: candidate.matchedLine,
      tool,
      toolVersion,
      invocation,
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
      precedingHeading: candidate.inlineLabelRaw ?? candidate.precedingHeading ?? null,
    },
  };
}
