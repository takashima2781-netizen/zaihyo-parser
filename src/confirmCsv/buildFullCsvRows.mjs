// Knowledge Master v0.6 ＋ Intermediate JSON を itemId で結合し、「豊かな確認用CSV」
// （knowledge_master_full.csv）の行オブジェクト配列を生成する。
//
// 目的は既存HTMLアプリへの読み込みではなく、Item単位で「教材に何が書かれていたか／Parserが
// どう解釈したか／Knowledge Masterでどう演習化されたか」を人間が横断的に確認すること。
// 既存HTML用CSV（財表DB③形式）の列構成には一切合わせない。
//
// Parser・Knowledge Master・CSV Bridge・HTMLアプリのいずれも変更しない（読み取り専用）。
// 新しい情報の補完・推測・生成は行わない。現在存在する情報のみを列へ写像する。
//
// 列は6分類のプレフィックスを持つ（docs/knowledge_master_ij_joined_csv_design.md 7章）:
// - key_        : 識別子（結合・追跡用）
// - content_    : 教材由来の本文（KM解決済みはKMのEvidenceを正、未解決はIntermediate JSONへ
//                 フォールバック。どちらも「raw」レベルの逐語テキストであり、Parserによる
//                 クリーニング（例: trueFalseの正誤記号抽出）は適用しない）
// - provenance_ : 出典・追跡情報（Evidence ID、PDFページ/ブロックのlocator）
// - structure_  : 教材の構造情報（Parserの解釈結果。テーマ・節・重要度・カテゴリー等）
// - diag_       : Parserの診断情報（confidence・内部注記・unresolved理由。教材の内容ではない）
// - km_         : Knowledge Masterの演習化メタ情報（operation・requiredCount等）
//
// コード・表示名の分離（2026-07-19追記）: 分類フィールドのうち、内部コードとは別に
// 「既に存在する」日本語ラベルを持つものは `_code` / `_label` の2列に分ける。
// checkTypeは src/parser/checkTypeLabels.mjs の既存の対応表（codeToLabel）をそのまま使う
// （新しい日本語名称は生成しない）。他の分類項目（重要度／出題形式operation等）は、
// 対応する既存の日本語ラベル・教材原文が見当たらなかったため今回は対象外とした
// （理由はdocs/knowledge_master_full_README.mdに記載）。

import { codeToLabel } from "../parser/checkTypeLabels.mjs";

export const ARRAY_JOIN_DELIMITER = " ｜ "; // 全角縦線。教材原文中への出現0件を確認済み（README参照）

export const FULL_CSV_COLUMNS = [
  "key_item_id",
  "key_question_id",
  "key_source_id",
  "content_question",
  "content_answer",
  "content_explanation",
  "provenance_question_evidence_id",
  "provenance_question_locator",
  "provenance_answer_evidence_id",
  "provenance_answer_order",
  "provenance_answer_locator",
  "provenance_explanation_evidence_id",
  "provenance_explanation_locator",
  "structure_theme_no",
  "structure_theme_title",
  "structure_section_code",
  "structure_section_title",
  "structure_importance",
  "structure_check_type_code",
  "structure_check_type_label",
  "structure_question_label",
  "structure_sub_label",
  "diag_item_confidence",
  "diag_item_notes",
  "diag_theme_confidence",
  "diag_km_resolved",
  "diag_unresolved_reason",
  "km_operation",
  "km_required_count",
  "km_target",
  "km_purpose",
  "km_output_form",
  "km_required_depth",
  "km_canonical_question_id",
];

function collectEntriesInOrder(groups) {
  const entries = [];
  function walk(g, ancestors) {
    const nextAncestors = [...ancestors, g];
    for (const cb of g.checkBlocks) {
      for (const q of cb.questions) {
        for (const it of q.items) {
          entries.push({ item: it, ancestors: nextAncestors, checkBlock: cb, question: q });
        }
      }
    }
    for (const child of g.children) walk(child, nextAncestors);
  }
  for (const g of groups) walk(g, []);
  return entries;
}

function findAncestorByKind(ancestors, kind) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].parsed?.kind === kind) return ancestors[i];
  }
  return null;
}

function findAncestorWithImportance(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].parsed?.importance != null) return ancestors[i];
  }
  return null;
}

function indexKm(km) {
  const evidenceById = new Map(km.evidence.map((e) => [e.id, e]));
  const answerUnitById = new Map(km.answerUnits.map((a) => [a.id, a]));
  const questionByItemId = new Map(km.questions.map((q) => [q.itemId, q]));
  const explanationEvidenceByItemId = new Map();
  for (const ev of km.evidence) {
    if (ev.kind === "explanation") explanationEvidenceByItemId.set(ev.itemId, ev);
  }
  // KM側unresolvedのlocatorは "item:<id>" 形式（src/knowledgeMaster/convert.mjs参照）。
  // Intermediate JSON全体の85件・7分類のunresolvedとは意味が異なるため、ここではKM側のみを扱う
  // （docs/knowledge_master_ij_joined_csv_design.md 4章・8章参照。混同しない）。
  const unresolvedReasonByItemId = new Map();
  for (const u of km.meta.unresolved) {
    const m = u.locator.match(/^item:(.+)$/);
    if (m) unresolvedReasonByItemId.set(m[1], u.reason);
  }
  const sourceId = km.sources[0]?.id ?? "";
  return { evidenceById, answerUnitById, questionByItemId, explanationEvidenceByItemId, unresolvedReasonByItemId, sourceId };
}

function joinValues(values) {
  return values.filter((v) => v != null && v !== "").join(ARRAY_JOIN_DELIMITER);
}

function buildRow({
  item,
  ancestors,
  checkBlock,
  question,
  kmQuestion,
  evidenceById,
  answerUnitById,
  explanationEvidenceByItemId,
  unresolvedReasonByItemId,
  sourceId,
}) {
  const kmResolved = Boolean(kmQuestion);

  let contentQuestion;
  let contentAnswer;
  let provQuestionEvidenceIds = [];
  let provAnswerEvidenceIds = [];
  let provAnswerOrders = [];

  if (kmResolved) {
    // KM解決済み: KMのEvidence（raw逐語、Parserによるクリーニング前）を正とする
    provQuestionEvidenceIds = kmQuestion.promptEvidenceIds;
    contentQuestion = joinValues(provQuestionEvidenceIds.map((id) => evidenceById.get(id)?.excerpt));

    const answerUnits = kmQuestion.answerUnitIds.map((auId) => answerUnitById.get(auId));
    provAnswerEvidenceIds = answerUnits.map((au) => au.evidenceId);
    provAnswerOrders = answerUnits.map((au) => String(au.order));
    contentAnswer = joinValues(answerUnits.map((au) => evidenceById.get(au.evidenceId)?.excerpt));
  } else {
    // KM未解決: Intermediate JSONのraw原文へフォールバック（raw.answersは空のため解答は空欄のまま）
    contentQuestion = joinValues(item.raw.question.map((q) => q.text));
    contentAnswer = "";
  }

  const explanationEvidence = explanationEvidenceByItemId.get(item.id) ?? null;
  const contentExplanation = kmResolved
    ? explanationEvidence?.excerpt ?? ""
    : item.raw.explanation?.text ?? ""; // 実データでは未解決29件に該当なし（確認済み）

  const provQuestionLocator = joinValues(item.raw.question.map((q) => q.source?.locator));
  const provAnswerLocator = joinValues(item.raw.answers.map((a) => a.text.source?.locator));
  const provExplanationLocator = item.raw.explanation?.source?.locator ?? "";
  const provExplanationEvidenceId = explanationEvidence?.id ?? "";

  const theme = findAncestorByKind(ancestors, "theme");
  const section = findAncestorByKind(ancestors, "section") ?? findAncestorByKind(ancestors, "topic");
  const importanceHolder = findAncestorWithImportance(ancestors);

  const unresolvedReason = unresolvedReasonByItemId.get(item.id) ?? "";
  const req = kmResolved ? kmQuestion.requirement : null;

  return {
    key_item_id: item.id,
    key_question_id: kmResolved ? kmQuestion.id : "",
    key_source_id: sourceId,
    content_question: contentQuestion,
    content_answer: contentAnswer,
    content_explanation: contentExplanation,
    provenance_question_evidence_id: joinValues(provQuestionEvidenceIds),
    provenance_question_locator: provQuestionLocator,
    provenance_answer_evidence_id: joinValues(provAnswerEvidenceIds),
    provenance_answer_order: joinValues(provAnswerOrders),
    provenance_answer_locator: provAnswerLocator,
    provenance_explanation_evidence_id: provExplanationEvidenceId,
    provenance_explanation_locator: provExplanationLocator,
    structure_theme_no: theme?.parsed?.no ?? "",
    structure_theme_title: theme?.parsed?.title ?? "",
    structure_section_code: section?.parsed?.code ?? "",
    structure_section_title: section?.parsed?.title ?? "",
    structure_importance: importanceHolder?.parsed?.importance ?? "",
    structure_check_type_code: checkBlock.parsed?.checkType ?? "",
    structure_check_type_label: checkBlock.parsed?.checkType ? codeToLabel(checkBlock.parsed.checkType) ?? "" : "",
    structure_question_label: question.raw.text,
    structure_sub_label: item.subLabelRaw ?? "",
    diag_item_confidence: item.parsed?.confidence ?? "",
    diag_item_notes: item.parsed?.notes ?? "",
    diag_theme_confidence: theme?.parsed?.confidence ?? "",
    diag_km_resolved: kmResolved ? "true" : "false",
    diag_unresolved_reason: unresolvedReason,
    km_operation: req?.operation ?? "",
    km_required_count: req?.requiredCount != null ? String(req.requiredCount) : "",
    km_target: req?.target ?? "",
    km_purpose: req?.purpose ?? "",
    km_output_form: req?.outputForm ?? "",
    km_required_depth: req?.requiredDepth ?? "",
    km_canonical_question_id: kmResolved ? kmQuestion.canonicalQuestionId ?? "" : "",
  };
}

export function buildFullCsvRows({ groups, km }) {
  const { evidenceById, answerUnitById, questionByItemId, explanationEvidenceByItemId, unresolvedReasonByItemId, sourceId } =
    indexKm(km);
  const entries = collectEntriesInOrder(groups);

  return entries.map(({ item, ancestors, checkBlock, question }) =>
    buildRow({
      item,
      ancestors,
      checkBlock,
      question,
      kmQuestion: questionByItemId.get(item.id),
      evidenceById,
      answerUnitById,
      explanationEvidenceByItemId,
      unresolvedReasonByItemId,
      sourceId,
    })
  );
}
