// BSMのRawSpanをExercise View用のExerciseViewRawSpanRefへ変換する。
// テキスト・出典(source)はBSM側の値をそのままコピーする（要約・言い換え・推測は行わない）。
// bsmNodeIdは常に呼び出し側が明示的に渡す（このテキストが実際にどのBSMノードから読まれたかを
// 呼び出し側が把握していることを強制するため、BSMノードから自動推定はしない）。

export function toRef(rawSpan, bsmNodeId, { inherited = false } = {}) {
  if (rawSpan == null) return null;
  return {
    text: rawSpan.text,
    source: { documentId: rawSpan.source.documentId, locator: rawSpan.source.locator },
    bsmNodeId,
    inherited,
  };
}
