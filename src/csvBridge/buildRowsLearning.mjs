// Knowledge Master v0.6 ＋ Intermediate JSON → 「実使用／Learning用」CSV行オブジェクト配列を生成する。
//
// **互換モード（src/csvBridge/buildRows.mjs）は一切変更しない。** 本ファイルは互換モードとは
// 完全に独立した別モジュールであり、構造列（テーマ／項目／重要度／問題カテゴリー／問題番号／
// 小問／マスターNo./No.）・問題文・解答の算出ロジックは互換モードと同一の規則を意図的に
// 重複実装している（互換モード側のコードには一切手を入れないため）。
//
// 互換モードとの唯一の違いは備考列の出典（`docs/ox_explanation_investigation.md`調査結果に基づく）:
// - trueFalse型: 備考 = Knowledge MasterのEvidence(kind:"explanation")（教材原文の解説）。
//   存在しない場合（117件）は空文字列。**推測・生成は行わない。** parsed.notes（Parser内部注記）は使用しない。
// - fillBlank/freeText型: 備考 = 常に空文字列（教材由来の解説を持つItemが存在しないため）。
//   parsed.notesは使用しない。
// - KM未解決Item: 備考 = 空文字列（教材解説の有無を判定する対象がないため）。
//
// Parser・Knowledge Masterのconverter/validator/schema・HTMLアプリ・CSV Bridgeの互換モードは
// 一切変更しない。Parser内部注記（parsed.notes）自体は元データ（Intermediate JSON）からは削除しない。

import { toHalfWidthAscii } from "../parser/textUtils.mjs";
import { codeToLabel } from "../parser/checkTypeLabels.mjs";

export const CSV3_COLUMNS = [
  "マスターNo.",
  "No.",
  "テーマ",
  "項目",
  "重要度",
  "問題カテゴリー",
  "問題番号",
  "小問",
  "問題文",
  "解答",
  "備考",
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

// PDF原文の丸数字(①②③)はそのまま、段落列挙型(1)(2)…はCSV表記「-1」「-2」へ変換する。
// subLabelRaw===nullは空文字列へ投影する（互換モードと同一の規則。CSV Bridge独自の仕様）。
function formatSubLabelForCsv(subLabelRaw) {
  if (subLabelRaw == null) return "";
  const m = subLabelRaw.match(/^\((\d+)\)$/);
  if (m) return `-${m[1]}`;
  return subLabelRaw;
}

function indexKm(km) {
  const evidenceById = new Map(km.evidence.map((e) => [e.id, e]));
  const answerUnitById = new Map(km.answerUnits.map((a) => [a.id, a]));
  const questionByItemId = new Map(km.questions.map((q) => [q.itemId, q]));
  const explanationEvidenceByItemId = new Map();
  for (const ev of km.evidence) {
    if (ev.kind === "explanation") explanationEvidenceByItemId.set(ev.itemId, ev);
  }
  return { evidenceById, answerUnitById, questionByItemId, explanationEvidenceByItemId };
}

function resolveQuestionText({ item, kmQuestion, evidenceById }) {
  if (kmQuestion) {
    return kmQuestion.promptEvidenceIds.map((id) => evidenceById.get(id).excerpt).join("");
  }
  return item.parsed?.questionText ?? ""; // KM未解決時のIJフォールバック
}

function resolveAnswerText({ item, kmQuestion, evidenceById, answerUnitById }) {
  if (!kmQuestion) return ""; // KM未解決: 互換モードと同じ空文字列
  if (kmQuestion.requirement.operation === "trueFalse") {
    // trueFalse型はIntermediate JSONの整形済み値（正誤記号抽出済み）を正とする（互換モードと同一）
    return (item.parsed?.answers ?? []).map((a) => a.text).join("／");
  }
  // fillBlank/freeText型はKM（Evidence）を正とする（互換モードと同一）
  return kmQuestion.answerUnitIds
    .map((auId) => evidenceById.get(answerUnitById.get(auId).evidenceId).excerpt)
    .join("／");
}

// 備考（実使用／Learning用のみ、互換モードとの唯一の相違点）。
function resolveLearningNotes({ item, kmQuestion, explanationEvidenceByItemId }) {
  if (!kmQuestion) return ""; // KM未解決Item: 判定対象なし
  if (kmQuestion.requirement.operation !== "trueFalse") return ""; // 4択型は常に空欄（教材解説を持つItemが存在しないため）
  const explanationEvidence = explanationEvidenceByItemId.get(item.id);
  return explanationEvidence ? explanationEvidence.excerpt : ""; // 教材解説がなければ空欄（推測・生成はしない）
}

function buildRow({
  ordinal,
  item,
  ancestors,
  checkBlock,
  question,
  kmQuestion,
  evidenceById,
  answerUnitById,
  explanationEvidenceByItemId,
}) {
  const theme = findAncestorByKind(ancestors, "theme");
  const section = findAncestorByKind(ancestors, "section") ?? findAncestorByKind(ancestors, "topic");
  const importanceHolder = findAncestorWithImportance(ancestors);

  const themeText = theme ? `テーマ${theme.parsed.no ?? ""} ${theme.parsed.title ?? ""}`.trim() : "";
  const sectionText = section ? [section.parsed.code, section.parsed.title].filter(Boolean).join(" ") : "";
  const importanceText = importanceHolder ? toHalfWidthAscii(importanceHolder.parsed.importance) : "";
  const categoryText = codeToLabel(checkBlock.parsed.checkType) ?? checkBlock.parsed.checkType ?? "";
  const questionLabelText = toHalfWidthAscii(question.raw.text);
  const subLabelText = formatSubLabelForCsv(item.subLabelRaw);

  return {
    "マスターNo.": String(ordinal),
    "No.": String(ordinal),
    "テーマ": themeText,
    "項目": sectionText,
    "重要度": importanceText,
    "問題カテゴリー": categoryText,
    "問題番号": questionLabelText,
    "小問": subLabelText,
    "問題文": resolveQuestionText({ item, kmQuestion, evidenceById }),
    "解答": resolveAnswerText({ item, kmQuestion, evidenceById, answerUnitById }),
    "備考": resolveLearningNotes({ item, kmQuestion, explanationEvidenceByItemId }),
  };
}

export function buildLearningRows({ groups, km }) {
  const { evidenceById, answerUnitById, questionByItemId, explanationEvidenceByItemId } = indexKm(km);
  const entries = collectEntriesInOrder(groups);

  const rows = [];
  const fallbackItemIds = [];
  let ordinal = 0;
  for (const { item, ancestors, checkBlock, question } of entries) {
    ordinal += 1;
    const kmQuestion = questionByItemId.get(item.id);
    if (!kmQuestion) fallbackItemIds.push(item.id);
    rows.push({
      itemId: item.id,
      kmResolved: Boolean(kmQuestion),
      row: buildRow({
        ordinal,
        item,
        ancestors,
        checkBlock,
        question,
        kmQuestion,
        evidenceById,
        answerUnitById,
        explanationEvidenceByItemId,
      }),
    });
  }
  return { rows, fallbackItemIds };
}
