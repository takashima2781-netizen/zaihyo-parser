// 行オブジェクト配列 → CSVテキスト。RFC4180相当のクォーティングのみを責務とする。
// 他レイヤー（src/exporter/csvWriter.mjs、src/csvBridge/csvWriter.mjs）と同等のロジックだが、
// このツールは既存Exporter・CSV Bridgeいずれにも依存しない独立実装とする。

function escapeField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsvText(columns, rows, { bom = true } = {}) {
  const lines = [columns.map(escapeField).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(row[c])).join(","));
  }
  const body = lines.join("\r\n") + "\r\n";
  return bom ? "﻿" + body : body;
}
