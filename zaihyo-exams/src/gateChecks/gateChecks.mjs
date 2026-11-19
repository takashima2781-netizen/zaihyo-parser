// 書き出し前の検査（fail-closed）。違反があれば呼び出し側は何も書き出さない。
//
// - 透かし（会員番号・氏名）が残っていない
// - id が重複していない
// - id を持つノードは出典（source）を1つ以上持つ

import { WATERMARK_PATTERN } from "../extract/extract.mjs";

export function runStructureChecks(structure) {
  const violations = [];
  if (WATERMARK_PATTERN.test(JSON.stringify(structure))) violations.push("透かし（会員番号・氏名）の文字が出力に残っています");
  const seen = new Set();
  for (const n of structure.nodes) {
    if (seen.has(n.id)) violations.push(`id が重複しています: ${n.id}`);
    seen.add(n.id);
    if (!Array.isArray(n.source) || n.source.length === 0) violations.push(`出典がありません: ${n.id}`);
  }
  return { ok: violations.length === 0, violations };
}

/** 問題データ（Exercise View）用: 透かしが無いことと、exerciseId・学習記録のキーが重複しないこと。 */
export function runExerciseViewChecks(view) {
  const violations = [];
  if (WATERMARK_PATTERN.test(JSON.stringify(view))) violations.push("透かし（会員番号・氏名）の文字が出力に残っています");
  const ids = new Set();
  const keys = new Set();
  for (const e of [...view.exercises, ...(view.withheldExercises ?? [])]) {
    if (ids.has(e.exerciseId)) violations.push(`exerciseId が重複しています: ${e.exerciseId}`);
    ids.add(e.exerciseId);
    if (e.stableItemIds?.length === 1) {
      const key = JSON.stringify([e.stableItemIds[0], e.exerciseType]);
      if (keys.has(key)) violations.push(`学習記録のキーが重複しています: ${key}`);
      keys.add(key);
    }
  }
  return { ok: violations.length === 0, violations };
}

/** テキスト（読む用）の教材構造: 透かしが無いことと、id が重複しないこと。 */
export function runTextChecks(structure) {
  const violations = [];
  if (WATERMARK_PATTERN.test(JSON.stringify(structure))) violations.push("透かし（会員番号・氏名）の文字が出力に残っています");
  const seen = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    if (typeof v.id === "string") {
      if (seen.has(v.id)) violations.push(`id が重複しています: ${v.id}`);
      seen.add(v.id);
    }
    for (const x of Object.values(v)) walk(x);
  };
  walk(structure.children);
  return { ok: violations.length === 0, violations };
}
