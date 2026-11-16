// 書き出し前の検査（fail-closed）。違反があれば呼び出し側は何も書き出さない。
//
// - 透かし（会員番号・氏名）が残っていない
// - id が重複していない
// - id を持つノードは出典（source）を1つ以上持つ

// 透かしは「会員番：」「氏名：」の形（コロン付き）。本文の「会員番号」「氏名又は名称」とは区別する
const WATERMARK = /会員番\s*[：:]|氏\s*名\s*[：:]/;

function walk(value, visit, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, visit, [...pathParts, i]));
    return;
  }
  if (value && typeof value === "object") {
    visit(value, pathParts);
    for (const [k, v] of Object.entries(value)) walk(v, visit, [...pathParts, k]);
  }
}

/** 問題データ（Exercise View）用の検査: 透かしが無いことと、exerciseId・学習記録のキーが重複しないこと。 */
export function runExerciseViewChecks(view) {
  const violations = [];
  if (WATERMARK.test(JSON.stringify(view))) violations.push("透かし（会員番号・氏名）の文字が出力に残っています");
  const ids = new Set();
  const keys = new Set();
  for (const e of [...view.exercises, ...view.withheldExercises]) {
    if (ids.has(e.exerciseId)) violations.push(`exerciseId が重複しています: ${e.exerciseId}`);
    ids.add(e.exerciseId);
    const key = JSON.stringify([e.stableItemIds?.[0], e.exerciseType]);
    if (keys.has(key)) violations.push(`学習記録のキーが重複しています: ${key}`);
    keys.add(key);
  }
  return { ok: violations.length === 0, violations };
}

export function runGateChecks(structure) {
  const violations = [];
  const text = JSON.stringify(structure);
  if (WATERMARK.test(text)) violations.push("透かし（会員番号・氏名）の文字が出力に残っています");

  const seen = new Map();
  walk(structure, (node, p) => {
    if (typeof node.id !== "string") return;
    if (seen.has(node.id)) violations.push(`id が重複しています: ${node.id}`);
    seen.set(node.id, p.join("."));
    if (!Array.isArray(node.source) || node.source.length === 0) {
      // 回（session）は目次に見出しが無い場合だけ出典なしになりうる。そのときは parsed.no が unknown。
      if (!(node.kind === "session" && node.parsed?.no === "unknown")) violations.push(`出典がありません: ${node.id}`);
    }
  });
  return { ok: violations.length === 0, violations };
}
