// Item ID正式化（Phase 3D-1設計 / F2実装、docs/item_id_formalization_design_memo.md）。
// 出典位置ベースの安定Item ID（stableItemId）と、内容変更検知専用のcontentFingerprintを算出する。
//
// 設計方針:
// - 識別の主キーは出典位置＋マーカー（documentId・ページ・ブロック・subLabelRaw）とし、
//   問題文・解答等の内容は識別には使わない（誤字修正・解答修正でIDが変わらないようにするため）。
// - subLabelRawの形式は実データ全1,121件で3種類のみであることを確認済み（丸数字・括弧数字・null）。
//   未知の形式が見つかった場合は変換せず例外を投げる（推測しない、原則6）。
// - 同一(documentId,page,block,marker)が複数回出現するケース（実データで10ブロック確認済み）は、
//   文書順の出現順(occurrenceOrdinal)で機械的に一意化しつつ、collisionBlocksとして
//   別途報告し、人手確認の対象として目立たせる（生成自体は止めない）。
//
// Intermediate JSONは読み取り専用の入力として扱う。

import { createHash } from "node:crypto";

const CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

// 実データ全1,121件で確認済みの3形式のみに対応する(docs/item_id_formalization_design_memo.md §1)。
export function markerToCode(subLabelRaw) {
  if (subLabelRaw == null) return "none";
  if (subLabelRaw.length === 1) {
    const idx = CIRCLED_NUMBERS.indexOf(subLabelRaw);
    if (idx !== -1) return `c${idx + 1}`;
  }
  const parenMatch = /^\((\d+)\)$/.exec(subLabelRaw);
  if (parenMatch) return `p${parenMatch[1]}`;
  throw new Error(`markerToCode: 未知のsubLabelRaw形式のため変換できない（推測を避けるため拒否する）: "${subLabelRaw}"`);
}

function zeroPad(n, width) {
  return String(n).padStart(width, "0");
}

function parseLocator(locator) {
  const m = /page=(\d+);block=(\d+)/.exec(locator ?? "");
  if (!m) throw new Error(`parseLocator: locatorの形式が想定外のため解析できない: "${locator}"`);
  return { page: Number(m[1]), block: Number(m[2]) };
}

// stableItemId算出のための候補キー要素（衝突判定の単位）。
function candidateKeyOf(item) {
  const q = item.raw.question[0];
  if (!q) throw new Error(`candidateKeyOf: item ${item.id} にraw.question[0]が存在しない（想定外）`);
  const { page, block } = parseLocator(q.source.locator);
  const markerCode = markerToCode(item.subLabelRaw);
  return { documentId: q.source.documentId, page, block, markerCode };
}

function groupKeyOf(key) {
  return `${key.documentId}|${key.page}|${key.block}|${key.markerCode}`;
}

function normalizeForFingerprint(text) {
  return text.replace(/\s+/g, " ").trim();
}

// 内容変更検知専用（識別には使わない）。問題文＋解答原文を軽く正規化してハッシュ化する。
export function computeContentFingerprint(item) {
  const questionText = normalizeForFingerprint(item.raw.question.map((q) => q.text).join(""));
  const answerText = (item.raw.answers ?? []).map((a) => normalizeForFingerprint(a.text.text)).join("|");
  return createHash("sha256").update(`${questionText}\n${answerText}`).digest("hex");
}

// 与えられたItem配列(文書順)全体に対し、決定的にstableItemIdを割り当てる。
// 戻り値:
//   stableIdsById: Map<item.id, {stableItemId, contentFingerprint, occurrenceOrdinal, groupKey}>
//   collisionBlocks: 同一(documentId,page,block,marker)が複数Itemに割り当たったグループの一覧
//     （要人手確認。docs/item_id_formalization_design_memo.md §1・§4で確認済みの10ブロック相当）
export function assignStableItemIds(items) {
  const itemById = new Map(items.map((it) => [it.id, it]));
  const groupItemIds = new Map(); // groupKey -> item.id[]（文書順）

  for (const item of items) {
    const key = candidateKeyOf(item);
    const groupKey = groupKeyOf(key);
    if (!groupItemIds.has(groupKey)) groupItemIds.set(groupKey, []);
    groupItemIds.get(groupKey).push(item.id);
  }

  const stableIdsById = new Map();
  const collisionBlocks = [];

  for (const [groupKey, itemIds] of groupItemIds) {
    if (itemIds.length > 1) collisionBlocks.push({ groupKey, itemIds: [...itemIds] });
    itemIds.forEach((itemId, ordinal) => {
      const item = itemById.get(itemId);
      const key = candidateKeyOf(item);
      const stableItemId =
        `sitem:${key.documentId}:p${zeroPad(key.page, 3)}:b${zeroPad(key.block, 2)}:m${key.markerCode}` +
        (ordinal > 0 ? `:o${ordinal}` : "");
      stableIdsById.set(itemId, {
        stableItemId,
        contentFingerprint: computeContentFingerprint(item),
        occurrenceOrdinal: ordinal,
        groupKey,
      });
    });
  }

  return { stableIdsById, collisionBlocks };
}
