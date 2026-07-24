// Intermediate JSONから、Phase 2A対象のCheckBlockを明示的なID指定で選び出す。
// 全件自動選定は行わない（Phase 2Aの意図的な制約。全1,121 Itemへの拡張はPhase 2B以降）。
// Intermediate JSONは読み取り専用の入力として扱う（変更しない）。

// Phase 1の6パターンに対応する代表例（docs/book_structure_master_phase1_review.md 1章）。
// - checkblock-01: パターン1・2・5（item-01/02/03、共有設問文、コード+日本語ラベル）
// - checkblock-03: パターン6c（item-06、マーカー検出失敗、no-marker fallback）
// - checkblock-04: パターン4（item-07他、trueFalse型）
// - checkblock-208: パターン3・6a（p.198、大問・小問・複数空欄、既知のE.パターン）
export const PHASE2A_TARGET_CHECKBLOCK_IDS = ["checkblock-01", "checkblock-03", "checkblock-04", "checkblock-208"];

// book.groups を辿り、対象CheckBlockとその祖先Group列（テーマ→節→項目）をペアで返す。
export function selectTargetCheckBlocks(book, targetIds = PHASE2A_TARGET_CHECKBLOCK_IDS) {
  const results = [];
  const foundIds = new Set();

  function walk(g, ancestors) {
    const nextAncestors = [...ancestors, g];
    for (const cb of g.checkBlocks) {
      if (targetIds.includes(cb.id)) {
        results.push({ checkBlock: cb, ancestors: nextAncestors });
        foundIds.add(cb.id);
      }
    }
    for (const child of g.children) walk(child, nextAncestors);
  }
  for (const g of book.groups) walk(g, []);

  const missing = targetIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`対象CheckBlockが見つからない: ${missing.join(", ")}`);
  }
  return results;
}

// Phase 2B: book.groups配下の全CheckBlockとその祖先Group列を、ID指定なしですべて返す。
// walkロジック自体はselectTargetCheckBlocksと同じだが、targetIdsによる絞り込みを行わない。
export function selectAllCheckBlocks(book) {
  const results = [];

  function walk(g, ancestors) {
    const nextAncestors = [...ancestors, g];
    for (const cb of g.checkBlocks) {
      results.push({ checkBlock: cb, ancestors: nextAncestors });
    }
    for (const child of g.children) walk(child, nextAncestors);
  }
  for (const g of book.groups) walk(g, []);

  return results;
}
