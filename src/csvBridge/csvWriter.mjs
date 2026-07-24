// 行オブジェクト配列 → CSVテキスト。RFC4180相当のクォーティングのみを責務とする。
// src/exporter/csvWriter.mjsと同等のロジックだが、CSV Bridgeは既存Exporterへ依存しない方針のため
// 独立実装している（Track A/Bの責務分離のため）。

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
