// M3: 開発用確認UI(閲覧のみ)のサーバ本体。
//
// `scripts/serve-dev-viewer.mjs`から呼ばれる薄いモジュール。テストから
// `createServer()`を直接呼べるように、`.listen()`の呼び出しは行わない
// (呼び出し側の責務とする)。

import { createServer as createHttpServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { approveCandidate, rejectCandidate, editCandidate } from "../knowledge/reviewActions.mjs";
import { rebuildApprovedKnowledge } from "../knowledge/approvedKnowledgeStore.mjs";

// 現時点でこのUIが表示できるのは定額法1ケースのみ。
// 新しいケースを追加する際は、ここに明示的に追加する(汎用化しない)。
export const ALLOWED_CASES = new Set(["teigakuho-definition"]);

// UI側の往復整合性チェックが、生成処理(deriveKnowledgeCandidate.mjs)と
// 独立した再実装ではなく、実際に使われているのと同じロジックを使うように
// するための最小限の許可リスト(汎用的な静的ファイル配信はしない)。
const ALLOWED_LIB_FILES = new Set(["formulaTokenizer.mjs"]);

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/**
 * @param {{ rootDir: string }} options
 */
export function createServer({ rootDir }) {
  const viewerHtmlPath = path.join(rootDir, "dev-viewer", "index.html");
  const casesDir = path.join(rootDir, "output", "cases");
  const knowledgeDir = path.join(rootDir, "src", "knowledge");

  async function readCase(caseName) {
    const filePath = path.join(casesDir, `${caseName}.json`);
    return JSON.parse(await readFile(filePath, "utf8"));
  }

  async function writeCase(caseName, data) {
    const filePath = path.join(casesDir, `${caseName}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  // 承認/除外/修正のいずれも、ケースファイルへ書き戻した後に
  // 承認済みKnowledgeの派生ビュー(approved-knowledge.json)を全件再生成する
  // (`m4_review_workflow_design.md`6-2節: 個別追記ではなく毎回作り直す)。
  async function applyReviewAction(caseName, actionFn, res) {
    if (!ALLOWED_CASES.has(caseName)) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: `unknown case: ${caseName}` }));
      return;
    }
    try {
      const current = await readCase(caseName);
      const updated = actionFn(current);
      await writeCase(caseName, updated);
      await rebuildApprovedKnowledge(rootDir);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(updated));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const html = await readFile(viewerHtmlPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      const reviewMatch = req.method === "POST" &&
        url.pathname.match(/^\/api\/case\/([a-zA-Z0-9_-]+)\/(approve|reject|edit)$/);
      if (reviewMatch) {
        const [, caseName, action] = reviewMatch;
        const body = await readJsonBody(req);
        const actionFn = {
          approve: (data) => approveCandidate(data, { note: body.note }),
          reject: (data) => rejectCandidate(data, { note: body.note }),
          edit: (data) =>
            editCandidate(data, {
              contentConfidence: body.contentConfidence,
              scopeNote: body.scopeNote,
              note: body.note,
            }),
        }[action];
        await applyReviewAction(caseName, actionFn, res);
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
        const json = JSON.stringify(await readCase(caseName));
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(json);
        return;
      }

      const libMatch = url.pathname.match(/^\/lib\/([a-zA-Z0-9_-]+\.mjs)$/);
      if (libMatch) {
        const fileName = libMatch[1];
        if (!ALLOWED_LIB_FILES.has(fileName)) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }
        const js = await readFile(path.join(knowledgeDir, fileName), "utf8");
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(js);
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
