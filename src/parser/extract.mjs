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
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const pythonBin = process.env.BOKI_PYTHON_BIN || "python";
  const args = [HELPER_SCRIPT, pdfPath, pageNumbers.join(",")];

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
