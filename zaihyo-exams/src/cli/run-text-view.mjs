// テキストの教材構造（output/<textId>.structure.json・.figures.json）→「読む」問題データ
// （output/zaihyo-texts-exercise-view.json）。財表の問題データへ入れるのは run-merge.mjs。
// 使い方: node src/cli/run-text-view.mjs [textId ...]   （省略時は src/texts.mjs の全冊のうち教材構造があるもの）

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReadingExercises, READING_GENERATOR } from "../exerciseView/buildReading.mjs";
import { replaceFontSymbolsDeep } from "../exerciseView/displayText.mjs";
import { SCHEMA_VERSION } from "../exerciseView/buildExerciseView.mjs";
import { runExerciseViewChecks } from "../gateChecks/gateChecks.mjs";
import { TEXTS } from "../texts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = (f) => path.join(root, "output", f);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TEXTS).filter((id) => existsSync(out(`${id}.structure.json`)));
const exercises = [];
const diagnostics = [];
const perText = {};
for (const id of ids) {
  if (!existsSync(out(`${id}.structure.json`)) || !existsSync(out(`${id}.figures.json`))) {
    console.error(`教材構造がありません（先に npm run text -- ${id}）`);
    continue;
  }
  const structure = JSON.parse(readFileSync(out(`${id}.structure.json`), "utf8"));
  const figures = JSON.parse(readFileSync(out(`${id}.figures.json`), "utf8"));
  const diag = [];
  const ex = buildReadingExercises(structure, figures, TEXTS[id].title, { diag });
  exercises.push(...ex.map(replaceFontSymbolsDeep));
  diagnostics.push(...diag.map((d) => ({ text: id, ...d })));
  perText[id] = { pages: ex.length, diagnostics: diag.length };
}
const view = {
  meta: {
    schemaVersion: SCHEMA_VERSION,
    subject: "zaihyo",
    status: "zaihyo-texts-generated-draft",
    generatedAt: new Date().toISOString(),
    generator: READING_GENERATOR,
    displayText: "alignment-spaces-removed",
    sets: ids,
    exerciseCount: exercises.length,
    withheldExerciseCount: 0,
  },
  exercises,
  withheldExercises: [],
  diagnostics,
};
const gate = runExerciseViewChecks(view);
if (!gate.ok) {
  console.error("検査に失敗したため書き出しません:");
  for (const v of gate.violations.slice(0, 20)) console.error(" -", v);
  process.exit(1);
}
const json = JSON.stringify(view);
writeFileSync(out("zaihyo-texts-exercise-view.json"), json);
console.log(JSON.stringify({ pages: exercises.length, MB: +(json.length / 1e6).toFixed(1), perText }, null, 2));
