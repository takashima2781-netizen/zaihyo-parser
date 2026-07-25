// Exercise View JSON の読み込み・最小限の構造検証。
// 「教材原文の生成・要約はしない」という原則に合わせ、ここでは検証と警告のみを行い、
// データの内容そのものは一切変換・加工しない。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

// Exercise View本体側は2026-07-24時点でv1.6.0（bodySegments追加、Phase 2C）。
EVv2.EXPECTED_SCHEMA_VERSION = "exercise-view-schema-v1.6.0";

// jsonText を Exercise View として解釈する。
// 戻り値: { data, schemaWarning }。schemaWarning は想定外バージョンの場合のみ文字列、それ以外はnull。
// 構造が最低限を満たさない場合は例外を投げる（呼び出し側でエラー表示する）。
EVv2.parseExerciseView = function parseExerciseView(jsonText) {
  const data = JSON.parse(jsonText);

  if (!data || typeof data !== "object") {
    throw new Error("Exercise View JSONの形式が不正です（トップレベルがオブジェクトではありません）");
  }
  if (!data.meta || typeof data.meta !== "object") {
    throw new Error("meta が見つかりません");
  }
  if (!Array.isArray(data.exercises)) {
    throw new Error("exercises 配列が見つかりません");
  }
  if (!Array.isArray(data.withheldExercises)) {
    throw new Error("withheldExercises 配列が見つかりません");
  }

  const schemaWarning =
    data.meta.schemaVersion !== EVv2.EXPECTED_SCHEMA_VERSION
      ? "schemaVersionが想定と異なります（想定: " + EVv2.EXPECTED_SCHEMA_VERSION +
        " / 実際: " + data.meta.schemaVersion + "）。読み込みは継続しますが、表示内容が仕様と一致しない可能性があります。"
      : null;

  return { data: data, schemaWarning: schemaWarning };
};
