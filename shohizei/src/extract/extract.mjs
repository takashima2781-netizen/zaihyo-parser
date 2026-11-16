// 第0層（抽出）。pymupdf_layout.py を子プロセスで呼び、ページごとの行・文字のかたまり・図形を受け取る。
//
// ここでの解釈は「ページの透かし（会員番号・氏名）を取り除く」ことだけ。透かしは個人情報なので、
// どの中間データにも残さない（取り除いた行の数だけを記録する）。それ以外は手を加えない。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), "pymupdf_layout.py");

// Python の選び方（boki/src/parser/extract.mjs と同じ順）:
// 環境変数 SHOHIZEI_PYTHON_BIN → 共通の仮想環境 ~/.venvs/study-drill（PyMuPDF 1.28.2）→ "python"
const SHARED_VENV_PYTHON = path.join(os.homedir(), ".venvs", "study-drill", "bin", "python");

export function resolvePythonBin() {
  if (process.env.SHOHIZEI_PYTHON_BIN) return process.env.SHOHIZEI_PYTHON_BIN;
  if (existsSync(SHARED_VENV_PYTHON)) return SHARED_VENV_PYTHON;
  return "python";
}

// 透かしの行: 「会員番」「氏名：」を含む行。透かしは1つのかたまり（block）にまとまって出るので、
// その行を含む block ごと取り除く（番号だけが別の行に出ても残らないようにする）。
// 透かしは「会員番：」「氏名：」の形（コロン付き）。本文の「会員番号」「氏名又は名称」とは区別する
const WATERMARK_PATTERN = /会員番\s*[：:]|氏\s*名\s*[：:]/;

export function lineText(line) {
  return line.spans.map((s) => s.text).join("");
}

export function removeWatermark(page) {
  const watermarkBlocks = new Set();
  for (const line of page.lines) {
    if (WATERMARK_PATTERN.test(lineText(line))) watermarkBlocks.add(line.block);
  }
  const kept = page.lines.filter((l) => !watermarkBlocks.has(l.block));
  return { page: { ...page, lines: kept }, removedLineCount: page.lines.length - kept.length };
}

function runHelper(args) {
  const pythonBin = resolvePythonBin();
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, ["-I", HELPER, ...args]);
    const out = [];
    let stderr = "";
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", (err) =>
      reject(new Error(`抽出の補助スクリプトを起動できません（"${pythonBin}"）: ${err.message}`)),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pymupdf_layout.py が終了コード ${code} で止まりました\n${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(out).toString("utf8")));
      } catch (err) {
        reject(new Error(`抽出結果を JSON として読めません: ${err.message}`));
      }
    });
  });
}

/**
 * @param {string} pdfPath
 * @param {string} pages "all" または "1,2,5-9"
 * @param {string} docId 中間データでの文書名（例: "training-basic-1-problem"）
 */
export async function extractDocument(pdfPath, pages, docId) {
  const raw = await runHelper([pdfPath, pages]);
  let removed = 0;
  const cleanPages = raw.pages.map((p) => {
    const r = removeWatermark(p);
    removed += r.removedLineCount;
    return r.page;
  });
  return {
    docId,
    file: path.basename(pdfPath),
    tool: raw.tool,
    toolVersion: raw.toolVersion,
    invocation: raw.invocation,
    pageCount: raw.pageCount,
    pages: cleanPages,
    diag: { watermarkLinesRemoved: removed },
  };
}
