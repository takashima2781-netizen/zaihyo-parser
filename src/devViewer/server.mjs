// M3: 開発用確認UI(閲覧のみ)のサーバ本体。
//
// `scripts/serve-dev-viewer.mjs`から呼ばれる薄いモジュール。テストから
// `createServer()`を直接呼べるように、`.listen()`の呼び出しは行わない
// (呼び出し側の責務とする)。

import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

// 現時点でこのUIが表示できるのは定額法1ケースのみ。
// 新しいケースを追加する際は、ここに明示的に追加する(汎用化しない)。
export const ALLOWED_CASES = new Set(["teigakuho-definition"]);

/**
 * @param {{ rootDir: string }} options
 */
export function createServer({ rootDir }) {
  const viewerHtmlPath = path.join(rootDir, "dev-viewer", "index.html");
  const casesDir = path.join(rootDir, "output", "cases");

  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const html = await readFile(viewerHtmlPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      const caseMatch = url.pathname.match(/^\/api\/case\/([a-zA-Z0-9_-]+)$/);
      if (caseMatch) {
        const caseName = caseMatch[1];
        if (!ALLOWED_CASES.has(caseName)) {
          res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: `unknown case: ${caseName}` }));
          return;
        }
        const filePath = path.join(casesDir, `${caseName}.json`);
        const json = await readFile(filePath, "utf8");
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(json);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Internal error: ${err.message}`);
    }
  });
}
