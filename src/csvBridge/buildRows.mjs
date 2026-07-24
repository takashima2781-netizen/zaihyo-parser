// Knowledge Master v0.6 ＋ Intermediate JSON → 既存互換CSV（財表DB③形式）の行オブジェクト配列を生成する
// 本番用CSV Bridge。
//
// **既存Exporter（src/exporter/）には依存しない**。構造列（テーマ／項目／重要度／問題カテゴリー／
// 問題番号／小問／マスターNo./No.）の算出ロジック（findAncestorByKind等）はここで独立実装する
// （src/exporter/toRows.mjsと同等の規則だが、コードは共有しない。Track A/Bの責務分離のため）。
// Parser（src/parser/の共通ユーティリティ toHalfWidthAscii / codeToLabel のみ再利用。これらは
// Exporter固有のロジックではなくParser側の汎用ユーティリティであり、依存禁止の対象外とする）・
// Knowledge Masterのconverter/validator/schema・HTMLアプリは一切変更しない。
//
// 列ごとの出典（ユーザー承認済み方針）:
// - テーマ／項目／重要度／問題カテゴリー／問題番号／小問／マスターNo./No. : Intermediate JSON
// - 問題文                                                          : Knowledge Master (Evidence kind="question")
// - 解答（trueFalse型）                                              : Intermediate JSON (parsed.answers[].text、正誤記号抽出済み)
// - 解答（fillBlank/freeText型）                                     : Knowledge Master (AnswerUnit → Evidence kind="answer")
// - 備考（互換モード。現時点で唯一のモード）                              : Intermediate JSON (parsed.notes)
// - KM未解決Item（answer-linkage未解決）                              : 行は欠落させず、問題文はIJへフォールバック、解答は空文字列
//
// subLabelRaw===null（本文からマーカーを検出できなかったItem、57件相当）は、CSV上「空文字列」へ
// 投影する。これはCSV Bridge独自の仕様であり、既存Exporter側の同種の不具合修正（Track B、
// src/exporter/toRows.mjsの改修として別途提案・実装する）とはコードを共有しない別実装である。

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
// subLabelRaw===nullは空文字列へ投影する（CSV Bridge独自の仕様。上記ヘッダコメント参照）。
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
  return { evidenceById, answerUnitById, questionByItemId };
}

function resolveQuestionText({ item, kmQuestion, evidenceById }) {
  if (kmQuestion) {
    return kmQuestion.promptEvidenceIds.map((id) => evidenceById.get(id).excerpt).join("");
  }
  return item.parsed?.questionText ?? ""; // KM未解決時のIJフォールバック
}

function resolveAnswerText({ item, kmQuestion, evidenceById, answerUnitById }) {
  if (!kmQuestion) return ""; // KM未解決: 既存Exporterと同じ空文字列
  if (kmQuestion.requirement.operation === "trueFalse") {
    // trueFalse型はIntermediate JSONの整形済み値（正誤記号抽出済み）を正とする
    return (item.parsed?.answers ?? []).map((a) => a.text).join("／");
  }
  // fillBlank/freeText型はKM（Evidence）を正とする
  return kmQuestion.answerUnitIds
    .map((auId) => evidenceById.get(answerUnitById.get(auId).evidenceId).excerpt)
    .join("／");
}

function buildRow({ ordinal, item, ancestors, checkBlock, question, kmQuestion, evidenceById, answerUnitById }) {
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
    "備考": item.parsed?.notes ?? "",
  };
}

export function buildRows({ groups, km }) {
  const { evidenceById, answerUnitById, questionByItemId } = indexKm(km);
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
      row: buildRow({ ordinal, item, ancestors, checkBlock, question, kmQuestion, evidenceById, answerUnitById }),
    });
  }
  return { rows, fallbackItemIds };
}
