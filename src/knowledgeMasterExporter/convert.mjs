// Knowledge Master v0.6 ＋ 元Intermediate JSON を入力として、既存の財表DB③形式CSV行のうち
// 「問題文」「解答」「備考」列だけをKM経由（またはKM未解決時はIntermediate JSONへのフォールバック）で
// 差し替えた行オブジェクト配列を生成する。
//
// 役割分担（ユーザー承認済み方針）:
// - テーマ／項目／重要度／問題カテゴリー／問題番号／小問／マスターNo./No.
//     → 既存Exporter（src/exporter/toRows.mjs、未変更）の出力をそのまま使う（Intermediate JSONが正）。
// - 問題文／解答／備考（教材原文版）
//     → KM解決済みItem（1,092件）はKM（Evidence/AnswerUnit）から取得する。
//        Intermediate JSONから直接取得しない（KM経由生成の妥当性を検証する目的のため）。
// - KM未解決Item（29件）は、行を欠落させず、テーマ等・問題文はIntermediate JSONから補完し、
//   解答は既存Exporterと同じ空文字列とする。
// - 備考は2種類生成する。互換版（parsed.notes、Parserの内部注記）と教材原文版（Evidence(explanation)、
//   教材原文の解説）。両者は意味が異なり、互換版は常にIntermediate JSON由来（KMを経由しない）。
//
// Parser・既存Exporter（src/exporter/）・HTMLアプリ・Knowledge Masterのconverter/validator/schemaは
// 一切変更しない。既存Exporterの関数を未変更のまま呼び出すだけである。

import { toRows } from "../exporter/toRows.mjs";

// src/exporter/toRows.mjs と同一のtraversal順序（checkBlocks→children再帰）でItemを収集する。
// baselineRows（toRowsの出力）と同じ配列インデックスでItemが対応することを前提にする。
function collectItemsInOrder(groups) {
  const items = [];
  function walk(g) {
    for (const cb of g.checkBlocks) {
      for (const q of cb.questions) {
        for (const it of q.items) items.push(it);
      }
    }
    for (const child of g.children) walk(child);
  }
  for (const g of groups) walk(g);
  return items;
}

function indexKm(km) {
  const evidenceById = new Map(km.evidence.map((e) => [e.id, e]));
  const answerUnitById = new Map(km.answerUnits.map((a) => [a.id, a]));
  const questionByItemId = new Map(km.questions.map((q) => [q.itemId, q]));
  const evidenceByItemIdAndKind = new Map(); // itemId -> { question: Evidence[], answer: Evidence[], explanation: Evidence[] }
  for (const ev of km.evidence) {
    if (!evidenceByItemIdAndKind.has(ev.itemId)) {
      evidenceByItemIdAndKind.set(ev.itemId, { question: [], answer: [], explanation: [] });
    }
    evidenceByItemIdAndKind.get(ev.itemId)[ev.kind].push(ev);
  }
  return { evidenceById, answerUnitById, questionByItemId, evidenceByItemIdAndKind };
}

export function buildComparisonRows({ groups, km }) {
  const baselineRows = toRows(groups); // 既存Exporターの出力そのまま（比較の正。構造列の出典でもある）
  const items = collectItemsInOrder(groups);
  if (items.length !== baselineRows.length) {
    throw new Error(
      `traversal順序の不一致を検出しました（items=${items.length}, baselineRows=${baselineRows.length}）。` +
        "collectItemsInOrderとtoRows.mjsのtraversal順序が一致していない可能性があります。"
    );
  }

  const { evidenceById, answerUnitById, questionByItemId, evidenceByItemIdAndKind } = indexKm(km);

  const rowsA = []; // 備考 = 既存互換版（parsed.notes）
  const rowsB = []; // 備考 = 教材原文版（Evidence(explanation)）
  const fallbackItemIds = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const baseline = baselineRows[i];
    const kmQuestion = questionByItemId.get(item.id);
    const isKmResolved = Boolean(kmQuestion);

    let questionText;
    let answerText;
    if (isKmResolved) {
      // KM解決済み: 問題文・解答はKM（Evidence/AnswerUnit）から取得する。IJから直接は取得しない。
      questionText = kmQuestion.promptEvidenceIds.map((id) => evidenceById.get(id).excerpt).join("");
      answerText = kmQuestion.answerUnitIds
        .map((auId) => evidenceById.get(answerUnitById.get(auId).evidenceId).excerpt)
        .join("／");
    } else {
      // KM未解決（answer-linkage未解決、29件相当）: IJから補完し、行を欠落させない。
      fallbackItemIds.push(item.id);
      questionText = item.parsed?.questionText ?? "";
      answerText = ""; // 既存Exporterもparsed.answersが空のため同じ結果になる
    }

    const explanationEvidence = evidenceByItemIdAndKind.get(item.id)?.explanation?.[0] ?? null;
    const notesCompat = item.parsed?.notes ?? ""; // 常にIJのparsed.notes（KMを経由しない）
    const notesSourceText = isKmResolved
      ? (explanationEvidence?.excerpt ?? "")
      : (item.raw.explanation?.text ?? ""); // KM未解決時はIJのraw.explanationへフォールバック

    const rowA = { ...baseline, "問題文": questionText, "解答": answerText, "備考": notesCompat };
    const rowB = { ...baseline, "問題文": questionText, "解答": answerText, "備考": notesSourceText };
    rowsA.push({ itemId: item.id, kmResolved: isKmResolved, row: rowA });
    rowsB.push({ itemId: item.id, kmResolved: isKmResolved, row: rowB });
  }

  return { rowsA, rowsB, fallbackItemIds, baselineRows, itemIds: items.map((it) => it.id) };
}
