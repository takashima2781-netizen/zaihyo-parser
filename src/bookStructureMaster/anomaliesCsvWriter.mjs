// 異常一覧（anomalies）行オブジェクト配列 → CSVテキスト。RFC4180相当のクォーティングのみを責務とする。
// 他レイヤー（src/exporter/csvWriter.mjs、src/csvBridge/csvWriter.mjs、src/confirmCsv/csvWriter.mjs）と
// 同等のロジックだが、このツールはいずれにも依存しない独立実装とする。

function escapeField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const ANOMALY_COLUMNS = [
  "anomaly_id",
  "severity",
  "category",
  "source_page",
  "checkblock_id",
  "question_id",
  "item_id",
  "unit_id",
  "raw_excerpt",
  "reason",
  "recommended_action",
];

export function toAnomaliesCsvText(anomalies, { bom = true } = {}) {
  const lines = [ANOMALY_COLUMNS.map(escapeField).join(",")];
  for (const row of anomalies) {
    lines.push(ANOMALY_COLUMNS.map((c) => escapeField(row[c])).join(","));
  }
  const body = lines.join("\r\n") + "\r\n";
  return bom ? "﻿" + body : body;
}
