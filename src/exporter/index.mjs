import { CSV3_COLUMNS } from "./csvSchema.mjs";
import { toRows } from "./toRows.mjs";
import { toCsvText } from "./csvWriter.mjs";

export function exportCsv3(groups) {
  const rows = toRows(groups);
  return { rows, csvText: toCsvText(CSV3_COLUMNS, rows) };
}
