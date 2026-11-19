// テキスト（読む用）を抽出して教材構造を作り、図を画像にして output/ に書き出す。
// 使い方: node src/cli/run-text.mjs [textId ...]   （省略時は src/texts.mjs の全冊のうち input/pdf にあるもの）
// 出力: output/<textId>.structure.json、output/<textId>.figures.json（図のJPEG、base64）
// shohizei/src/cli/run-text.mjs と同じ流れ（画像の大きさ・品質も同じ）。

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDocument, resolvePythonBin } from "../extract/extract.mjs";
import { buildText } from "../text/buildText.mjs";
import { runTextChecks } from "../gateChecks/gateChecks.mjs";
import { TEXTS } from "../texts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pdfDir = path.join(root, "input", "pdf");
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TEXTS).filter((id) => existsSync(path.join(pdfDir, `${id}.pdf`)));
const outDir = path.join(root, "output");
mkdirSync(outDir, { recursive: true });

// 図の画像の大きさ: 1.5倍・JPEG品質55（図の中の文字が読める大きさで、問題データが重くなりすぎない）
const SCALE = "1.5";
const QUALITY = "55";

let failed = false;
for (const bookId of ids) {
  const pdf = path.join(pdfDir, `${bookId}.pdf`);
  if (!TEXTS[bookId] || !existsSync(pdf)) {
    console.error(`見つかりません（src/texts.mjs と input/pdf を確認）: ${bookId}`);
    failed = true;
    continue;
  }
  const doc = await extractDocument(pdf, "all", bookId);
  const structure = buildText({ bookId, doc });
  const gate = runTextChecks(structure);
  if (!gate.ok) {
    console.error(`${bookId}: 検査に失敗したため書き出しません`, gate.violations.slice(0, 5));
    failed = true;
    continue;
  }
  const jobs = [];
  for (const s of structure.children) for (const t of s.children) for (const sec of t.children) for (const b of sec.blocks) if (b.kind === "figure") jobs.push({ id: b.id, page: b.page, rect: b.rect });
  const jobsPath = path.join(outDir, `${bookId}.figure-jobs.json`);
  writeFileSync(jobsPath, JSON.stringify(jobs));
  const r = spawnSync(resolvePythonBin(), ["-I", path.join(root, "src", "text", "render_regions.py"), pdf, jobsPath, SCALE, QUALITY], { maxBuffer: 1 << 30 });
  if (r.status !== 0) {
    console.error(`${bookId}: 図の画像化に失敗しました\n${r.stderr}`);
    failed = true;
    continue;
  }
  const figures = JSON.parse(r.stdout.toString("utf8"));
  writeFileSync(path.join(outDir, `${bookId}.structure.json`), JSON.stringify(structure, null, 2));
  writeFileSync(path.join(outDir, `${bookId}.figures.json`), JSON.stringify(figures));
  const sections = structure.children.flatMap((s) => s.children.flatMap((t) => t.children));
  const bytes = figures.reduce((n, f) => n + f.jpegBase64.length, 0);
  console.log(
    JSON.stringify({
      bookId,
      sessions: structure.children.length,
      themes: structure.children.reduce((n, s) => n + s.children.length, 0),
      sections: sections.length,
      untitledSections: sections.filter((s) => !s.parsed.codeRaw).length,
      figures: figures.length,
      figureMB: +(bytes / 1e6).toFixed(1),
      unplacedLines: structure.unplacedLineCount,
      watermarkLinesRemoved: doc.diag.watermarkLinesRemoved,
    }),
  );
}
if (failed) process.exitCode = 1;
