// テキスト（読む用）を抽出して教材構造を作り、図を画像にして output/ に書き出す。
// 使い方: node src/cli/run-text.mjs [bookId ...]   （省略時は input/pdf/text-*.pdf すべて）
// 出力: output/<bookId>.structure.json、output/<bookId>.figures.json（図のJPEG、base64）

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDocument, resolvePythonBin } from "../extract/extract.mjs";
import { buildText } from "../text/buildText.mjs";
import { runGateChecks } from "../gateChecks/gateChecks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pdfDir = path.join(root, "input", "pdf");
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(pdfDir).filter((f) => /^text-.*\.pdf$/.test(f)).map((f) => f.replace(/\.pdf$/, "")).sort();
const outDir = path.join(root, "output");
mkdirSync(outDir, { recursive: true });

// 図の画像の大きさ: 1.5倍・JPEG品質55（図の中の文字が読める大きさで、問題データが重くなりすぎない）
const SCALE = "1.5";
const QUALITY = "55";

for (const bookId of ids) {
  const pdf = path.join(pdfDir, `${bookId}.pdf`);
  if (!existsSync(pdf)) {
    console.error(`見つかりません: ${pdf}`);
    continue;
  }
  const doc = await extractDocument(pdf, "all", bookId);
  const structure = buildText({ bookId, doc });
  const gate = runGateChecks(structure);
  if (!gate.ok) {
    console.error(`${bookId}: 検査に失敗したため書き出しません`, gate.violations.slice(0, 5));
    continue;
  }
  const jobs = [];
  for (const s of structure.children) for (const t of s.children) for (const sec of t.children) for (const b of sec.blocks) if (b.kind === "figure") jobs.push({ id: b.id, page: b.page, rect: b.rect });
  const jobsPath = path.join(outDir, `${bookId}.figure-jobs.json`);
  writeFileSync(jobsPath, JSON.stringify(jobs));
  const r = spawnSync(resolvePythonBin(), ["-I", path.join(root, "src", "text", "render_regions.py"), pdf, jobsPath, SCALE, QUALITY], { maxBuffer: 1 << 30 });
  if (r.status !== 0) {
    console.error(`${bookId}: 図の画像化に失敗しました\n${r.stderr}`);
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
      figures: figures.length,
      figureMB: +(bytes / 1e6).toFixed(1),
      unplacedLines: structure.unplacedLineCount,
      watermarkLinesRemoved: doc.diag.watermarkLinesRemoved,
    }),
  );
}
