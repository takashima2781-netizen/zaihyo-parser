// [1] Extraction
//
// 指定したPDF・ページ番号群に対し、pymupdf_extract.py(Python/PyMuPDF)を
// 子プロセスとして呼び出し、ページ単位の生テキストを取得する。
// 意味解釈は一切行わない(`extractionRaw`の元になるデータをそのまま返す)。
//
// pdftotext(poppler)は実行環境によってCJKのCMapデータを欠き、日本語を
// 正しく抽出できない場合がある(このケースの実装で確認済み)。そのため、
// 抽出ツール自体は環境で動作確認できたものを使う。`tool`/`toolVersion`/
// `invocation`は実際に使ったものをそのまま記録するため、ツールの選択は
// diag側の記録内容には影響しない。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pythonの選び方(上から順に、最初に見つかったもの):
// 1. 環境変数 BOKI_PYTHON_BIN
// 2. 共通の仮想環境 ~/.venvs/study-drill/bin/python(PyMuPDF 1.28.2 入り。
//    Mac移行時に作成、2026-11-16。macOS標準のPython 3.9では1.28系を入れられないため)
// 3. "python"(PATH上のもの。従来の既定)
const SHARED_VENV_PYTHON = path.join(os.homedir(), ".venvs", "study-drill", "bin", "python");

function resolvePythonBin() {
  if (process.env.BOKI_PYTHON_BIN) return process.env.BOKI_PYTHON_BIN;
  if (existsSync(SHARED_VENV_PYTHON)) return SHARED_VENV_PYTHON;
  return "python";
}

const HELPER_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "pymupdf_extract.py",
);

/**
 * @param {string} pdfPath
 * @param {number[]} pageNumbers
 * @returns {Promise<Array<{page: number, text: string, tool: string, toolVersion: string, invocation: string}>>}
 */
export async function extractPages(pdfPath, pageNumbers) {
  return runExtractHelper([HELPER_SCRIPT, pdfPath, pageNumbers.join(",")]);
}

// [5] Faithful Restoration専用。座標付きテキストブロックを取得する
// (第2ケースの実データ検証で、`sort=True`の読み順ヒューリスティックが
// 1ページに複数の分数付き計算行がある場合に対応を誤ることが判明したため。
// `planning/case2_readiness_and_generalization_analysis.md`7-1節)。
/**
 * @param {string} pdfPath
 * @param {number[]} pageNumbers
 * @returns {Promise<Array<{page: number, blocks: Array<{x0:number,y0:number,x1:number,y1:number,text:string}>, tool: string, toolVersion: string, invocation: string}>>}
 */
export async function extractBlocks(pdfPath, pageNumbers) {
  return runExtractHelper([HELPER_SCRIPT, pdfPath, pageNumbers.join(","), "--blocks"]);
}

async function runExtractHelper(args) {
  const pythonBin = resolvePythonBin();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      reject(
        new Error(
          `Extraction helper failed to start ("${pythonBin}" not found?): ${err.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `pymupdf_extract.py exited with code ${code}\nstderr: ${stderr}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(
          new Error(
            `Failed to parse extraction output as JSON: ${err.message}\nstdout: ${stdout}`,
          ),
        );
      }
    });
  });
}
