// M3: 開発用確認UI(閲覧のみ)のサーバ本体。
//
// `scripts/serve-dev-viewer.mjs`から呼ばれる薄いモジュール。テストから
// `createServer()`を直接呼べるように、`.listen()`の呼び出しは行わない
// (呼び出し側の責務とする)。

import { createServer as createHttpServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { approveCandidate, rejectCandidate, editCandidate } from "../knowledge/reviewActions.mjs";
import { rebuildApprovedKnowledge } from "../knowledge/approvedKnowledgeStore.mjs";
import { rejectCandidate as rejectSourceCandidate } from "../parser/candidateActions.mjs";
import { confirmAndIntegrateCandidate } from "../parser/confirmAndIntegrateCandidate.mjs";
import { runApplicationIntegrationGateChecks } from "../gateChecks/applicationIntegrationChecks.mjs";

// M3(往復整合性チェック)・M6(正誤判定)が、生成処理と独立した再実装では
// なく、実際に使われているのと同じロジックをブラウザ側でもimportできる
// ようにするための最小限の許可リスト(ファイル名 → src/配下のディレクトリ名。
// 汎用的な静的ファイル配信はしない)。
const ALLOWED_LIB_FILES = new Map([
  ["formulaTokenizer.mjs", "knowledge"],
  ["gradingRegistry.mjs", "exercise"],
]);

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
  const learningUiHtmlPath = path.join(rootDir, "learning-ui", "index.html");
  const casesDir = path.join(rootDir, "output", "cases");
  const srcDir = path.join(rootDir, "src");
  const exercisesPath = path.join(rootDir, "output", "exercises", "exercises.json");

  // ケースの存在確認は、明示的なホワイトリストではなく
  // `output/cases/`配下に対応するファイルが実在するかで動的に判定する
  // (`approvedKnowledgeStore.mjs`と同じ、ディレクトリ走査による判定方式)。
  // caseName自体は各ルートのURL正規表現(`[a-zA-Z0-9_-]+`)により、
  // パストラバーサルに使える文字を含まないことが既に保証されている。
  function caseExists(caseName) {
    return existsSync(path.join(casesDir, `${caseName}.json`));
  }

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
    if (!caseExists(caseName)) {
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

      // M6: 学習UI(実際に問題を解く画面)。開発用確認UIとは別ページとする。
      if (url.pathname === "/learn") {
        const html = await readFile(learningUiHtmlPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      // 追加候補(要判断): テーマ横断等、F群の事実だけでは自動確定できな
      // かった適用例Sourceについて、人間が「このKnowledgeの根拠として
      // 追加してよいか」を判断する。M4の「Knowledge承認」(直下の
      // reviewMatchルート)とは別のルートだが、「Sourceとして確定する
      // か」ではなく「Knowledgeへ追加してよいか」を1回の操作で行う点が、
      // 旧UIとの違いである
      // (`knowledge_integration_review_scope_design.md`6-2節)。
      const approveEvidenceMatch = req.method === "POST" &&
        url.pathname.match(
          /^\/api\/case\/(teigakuho-application)\/candidates\/([a-zA-Z0-9_-]+)\/approve-as-evidence$/,
        );
      if (approveEvidenceMatch) {
        const [, caseName, candidateId] = approveEvidenceMatch;
        const body = await readJsonBody(req);
        try {
          const applicationCase = await readCase(caseName);
          const definitionCase = await readCase("teigakuho-definition");

          const result = confirmAndIntegrateCandidate({
            applicationCase,
            definitionCase,
            candidateId,
            method: "human_reviewed",
            note: body.note,
          });

          // fail-closed: 書き込み前にgateChecksで整合性を事後検証する
          // (CLIスクリプトと同じ不変条件を、対話的な承認経路にも適用する)。
          const gateResult = runApplicationIntegrationGateChecks({
            applicationCase: result.applicationCase,
            definitionCase: result.definitionCase,
          });
          if (!gateResult.ok) {
            throw new Error(`gateChecks failed: ${gateResult.violations.join("; ")}`);
          }

          await writeCase(caseName, result.applicationCase);
          await writeCase("teigakuho-definition", result.definitionCase);
          await rebuildApprovedKnowledge(rootDir);

          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(
            JSON.stringify({
              applicationCase: result.applicationCase,
              definitionCase: result.definitionCase,
            }),
          );
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // 追加候補(要判断)の却下: Knowledgeへは一切統合せず、候補を
      // rejectedにするのみ(監査証跡として残す、削除しない)。
      const rejectCandidateMatch = req.method === "POST" &&
        url.pathname.match(
          /^\/api\/case\/(teigakuho-application)\/candidates\/([a-zA-Z0-9_-]+)\/reject$/,
        );
      if (rejectCandidateMatch) {
        const [, caseName, candidateId] = rejectCandidateMatch;
        const body = await readJsonBody(req);
        try {
          const current = await readCase(caseName);
          const updated = rejectSourceCandidate(current, candidateId, { note: body.note });
          await writeCase(caseName, updated);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(updated));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: err.message }));
        }
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
        if (!caseExists(caseName)) {
          res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: `unknown case: ${caseName}` }));
          return;
        }
        const json = JSON.stringify(await readCase(caseName));
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(json);
        return;
      }

      if (url.pathname === "/api/exercises") {
        try {
          const json = await readFile(exercisesPath, "utf8");
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(json);
        } catch {
          res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "exercises.json not generated yet" }));
        }
        return;
      }

      const libMatch = url.pathname.match(/^\/lib\/([a-zA-Z0-9_-]+\.mjs)$/);
      if (libMatch) {
        const fileName = libMatch[1];
        const subDir = ALLOWED_LIB_FILES.get(fileName);
        if (!subDir) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }
        const js = await readFile(path.join(srcDir, subDir, fileName), "utf8");
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
