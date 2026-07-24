// Intermediate JSONの各ノード（Group／CheckBlock／Question／Item）を、
// docs/book_structure_master_schema_draft.json のBook Structure Master型へ変換する
// 純粋なマッピング関数群。すべて読み取り専用の入力（Intermediate JSON）から導出し、
// 教材原文を改変しない。Parser・Intermediate JSON・Knowledge Master・CSV Bridgeは変更しない。
//
// Phase 2A固有の保守的な方針（docs/book_structure_master_principles.md準拠）:
// - promptRaw は常にnull（設問文の「指示文」と「地の文」の分割は、Intermediate JSONの
//   sharedPromptRawTextフィールド単体からは機械的に導出できないため、Phase 1同様に人手の
//   判断が必要な部分として自動化しない。共有テキストは常にbodyRawへ格納する）。
// - explanationRole.code は常にnull（訂正文か一般解説かを機械的に断定するルールが未確立のため）。
// - 「記号が空欄か列挙記号か」は判定しない。presentations[].type と confidence/notes から
//   機械的に導けるunitKindのみを付与し、それ以外は"unknown"のまま保持する。

import { codeToLabel } from "../parser/checkTypeLabels.mjs";

function borrowSource(item) {
  // subLabelRaw等、Intermediate JSON側で独立したSourceを持たないプレーンな値のために、
  // 同じItem内の最も近いraw原文のSourceを代表として借用する（新しい出典を捏造しない）。
  return item.raw.question[0]?.source ?? item.raw.answers[0]?.text.source ?? null;
}

function joinRawQuestionText(item) {
  return item.raw.question.map((q) => q.text).join("");
}

export function mapDiag(parsedMeta, extraNote = null) {
  const notes = [parsedMeta?.notes ?? null, extraNote].filter(Boolean).join(" / ") || null;
  return {
    parserVersion: parsedMeta?.parserVersion ?? null,
    confidence: parsedMeta?.confidence ?? null,
    notes,
  };
}

export function mapGroupToStructureNode(group) {
  return {
    id: `sn-${group.id}`,
    raw: { text: group.raw.text, source: group.raw.source },
    parsed: group.parsed
      ? {
          diag: mapDiag(group.parsed),
          kind: { code: group.parsed.kind ?? null, labelRaw: null }, // kindの確立済み日本語ラベル表は存在しないためnull
          no: group.parsed.no ?? null,
          code: group.parsed.code ?? null,
          titleRaw: group.parsed.title ?? null,
          importanceRaw: group.parsed.importance ?? null,
        }
      : null,
    children: [], // 呼び出し側（buildBookStructureMaster.mjs）が木構造として組み立てる
    checkSections: [],
  };
}

export function mapCheckBlockToCheckSection(checkBlock, questionUnits) {
  const checkType = checkBlock.parsed?.checkType ?? null;
  return {
    id: `cs-${checkBlock.id}`,
    raw: { text: checkBlock.raw.text, source: checkBlock.raw.source },
    parsed: checkBlock.parsed
      ? {
          diag: mapDiag(checkBlock.parsed),
          checkType: { code: checkType, labelRaw: checkType ? codeToLabel(checkType) ?? null : null },
        }
      : null,
    questionUnits,
  };
}

// presentations[].typeとconfidence/notesから、機械的に導ける範囲でunitKindを決める。
// 「本文中の記号が空欄か列挙記号か」は判定しない（推測しない、5章・6章参照）。
function determineUnitKind(item) {
  const presentationType = item.presentations?.[0]?.type ?? null;
  const confidence = item.parsed?.confidence ?? null;
  const notes = item.parsed?.notes ?? "";
  const looksUncertainDecomposition = confidence === "low" && /マーカー/.test(notes);
  if (looksUncertainDecomposition) return "unknown";
  if (presentationType === "fillBlank") return "blank";
  if (presentationType === "trueFalse") return "subQuestion";
  if (presentationType === "freeText") return "subQuestion";
  return "unknown";
}

export function buildAnswerContent(item) {
  if (!item.raw.answers || item.raw.answers.length === 0) return null; // 未解決（解答なし）はanswer自体を持たない
  // Phase 2Aは単一AnswerUnitのケースのみを対象とする（複数AnswerUnit/列挙型はPhase 2B以降）。
  const rawAnswer = item.raw.answers[0];
  const presentationType = item.presentations?.[0]?.type ?? null;

  let judgmentSymbolRaw = null;
  if (presentationType === "trueFalse" && item.parsed?.answers?.[0]) {
    // 判定記号はParserが既に抽出済みの値（item.parsed.answers[0].text）を、
    // 元の解答原文と同じSourceと組み合わせて保持する（新規抽出ではなく既存値の再パッケージ）。
    judgmentSymbolRaw = { text: item.parsed.answers[0].text, source: rawAnswer.text.source };
  }

  const explanationRaw = item.raw.explanation
    ? { text: item.raw.explanation.text, source: item.raw.explanation.source }
    : null;

  return {
    judgmentSymbolRaw,
    answerBodyRaw: { text: rawAnswer.text.text, source: rawAnswer.text.source },
    explanationRaw,
    explanationRole: { code: null, labelRaw: null }, // Phase 2Aでは自動判定しない（訂正文/一般解説の区別は未確立）
    footnoteRefs: item.parsed?.answers?.[0]?.footnoteRefs ?? [],
  };
}

// 末端QuestionUnit（Itemに対応）を構築する。bodyRawをこのユニット自身に持たせるかどうかは
// 呼び出し側（共有設問文があるかどうか）で決める。
// stableIdsById（Phase 3D-1/F2、src/bookStructureMaster/stableItemId.mjs::assignStableItemIds()の
// 戻り値）が渡された場合、末端Itemの正式provenance（legacyItemId/stableItemId/contentFingerprint）を
// 付与する。省略された場合はprovenance: nullのまま（既存呼び出し元との後方互換のため）。
export function buildLeafQuestionUnitFromItem(item, { ownBody, stableIdsById } = {}) {
  const unitKind = determineUnitKind(item);
  const answer = buildAnswerContent(item);
  const extraNote = answer?.explanationRaw
    ? "BSM Builder: explanationRoleは自動判定していない（訂正文か一般解説か未確定のためnullのまま保持、docs/book_structure_master_phase2a_report.md参照）"
    : null;

  const labelSource = borrowSource(item);
  const stableInfo = stableIdsById?.get(item.id) ?? null;
  return {
    id: `qu-${item.id}`,
    labelRaw:
      item.subLabelRaw != null && labelSource
        ? { text: item.subLabelRaw, source: labelSource }
        : null,
    promptRaw: null,
    bodyRaw: ownBody ? { text: joinRawQuestionText(item), source: item.raw.question[0]?.source ?? null } : null,
    parsed: {
      diag: mapDiag(item.parsed, extraNote),
      unitKind: { code: unitKind, labelRaw: null },
      // shared_body_blanks向け(docs/phase2c_blank_position_schema_design.md): Parserが確定済みの
      // 空欄位置をそのままコピーする(値の変更・再計算は一切行わない)。
      sharedBodyBlankPosition: item.parsed?.sharedBodyBlankPosition ?? null,
    },
    children: [],
    answer,
    provenance: stableInfo
      ? {
          legacyItemId: item.id,
          stableItemId: stableInfo.stableItemId,
          contentFingerprint: stableInfo.contentFingerprint,
        }
      : null,
    _sourceItemId: item.id,
  };
}

// Question（問N）とその配下のItem群から、大問QuestionUnitの木を構築する。
// - sharedPromptRawTextが存在し、全Itemのraw.question結合値と一致する場合のみ、
//   親のbodyRawへ一本化する（一致しない場合は自動統合せず、diagへ記録してItem単位のbodyRawへ
//   フォールバックする）。
// - sharedPromptRawTextが存在しない場合（1 Item、または各Itemが個別の地の文を持つ場合）は、
//   各Itemが自身のbodyRawを持つ子として並ぶ。
// - Item数が1件かつsubLabelRawがnullの場合は、大問QuestionUnit自体を末端として扱う
//   （中間ノードを作らない。docs/book_structure_master_phase1_review.md item-06相当）。
export function buildQuestionUnitTree(question, items, stableIdsById) {
  if (items.length === 1 && items[0].subLabelRaw == null) {
    const leaf = buildLeafQuestionUnitFromItem(items[0], { ownBody: true, stableIdsById });
    return {
      ...leaf,
      id: `qu-${question.id}`,
      labelRaw: { text: question.raw.text, source: question.raw.source },
    };
  }

  const shared = question.sharedPromptRawText;
  let bodyRaw = null;
  let extraDiagNote = null;
  let children;

  if (shared != null) {
    const allMatch = items.every((it) => joinRawQuestionText(it) === shared);
    if (allMatch) {
      const source = items[0]?.raw.question[0]?.source ?? null;
      bodyRaw = { text: shared, source };
      extraDiagNote =
        "BSM Builder: sharedPromptRawTextと全Item(" +
        items.length +
        "件)のraw.questionが一致したため、親QuestionUnitへ一本化した。sharedPromptRawText自体はIntermediate JSON上で独立したSourceを持たないため、出典は先頭Itemのraw.question[0].sourceを代表として借用した";
      children = items.map((it) => buildLeafQuestionUnitFromItem(it, { ownBody: false, stableIdsById }));
    } else {
      extraDiagNote =
        "BSM Builder: sharedPromptRawTextと一部Itemのraw.questionが不一致のため自動統合しなかった。各Itemが個別にbodyRawを保持する";
      children = items.map((it) => buildLeafQuestionUnitFromItem(it, { ownBody: true, stableIdsById }));
    }
  } else {
    children = items.map((it) => buildLeafQuestionUnitFromItem(it, { ownBody: true, stableIdsById }));
  }

  return {
    id: `qu-${question.id}`,
    labelRaw: { text: question.raw.text, source: question.raw.source },
    promptRaw: null,
    bodyRaw,
    parsed: {
      diag: mapDiag(null, extraDiagNote),
      unitKind: { code: "majorQuestion", labelRaw: null },
    },
    provenance: null, // 中間ノード(大問)はItemに対応しないため常にnull(v0.2.0/F2)
    children,
    answer: null,
  };
}
