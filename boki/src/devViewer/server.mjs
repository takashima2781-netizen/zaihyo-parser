// M3: 開発用確認UI(閲覧のみ)のサーバ本体。
//
// `scripts/serve-dev-viewer.mjs`から呼ばれる薄いモジュール。テストから
// `createServer()`を直接呼べるように、`.listen()`の呼び出しは行わない
// (呼び出し側の責務とする)。

import { createServer as createHttpServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile, readdir } from "node:fs/promises";
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

  // fail-closed: 書き込み先のファイル名(caseName)と、書き込もうとしている
  // データ自身が持つ`case`フィールドが一致することを必ず確認する。
  // このチェックが無いと、呼び出し側のバグ(例: 定義ケース名の取り違え)に
  // よって、あるケースのデータが別のケースのファイルへ誤って書き込まれ
  // うる(第5ケース追加時に実際に発生した事故、`TASK.md`「第5ケース」節
  // 参照)。呼び出し側の個別修正では再発防止にならないため、書き込みの
  // 最終防衛線としてここに集約する。
  async function writeCase(caseName, data) {
    if (data.case !== caseName) {
      throw new Error(
        `書き込み先("${caseName}")とデータ自身のcaseフィールド("${data.case}")が一致しない` +
          `(fail-closed、別ケースへの誤書き込みを防止した)`,
      );
    }
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
      //
      // caseNameは特定の適用例ケース(旧: teigakuho-applicationのみ)に
      // 固定せず、`/api/case/:caseName`と同じ動的な形にする(第5ケースで
      // 2件目の適用例ケース〈foreign-currency-application〉が増えたため。
      // ケース固有のハードコードを除去する、CLAUDE.md方針)。どの定義
      // ケースへ統合すべきかは、適用例ケースJSON自身が持つ
      // `definitionCaseName`フィールド(`runApplicationCandidates.mjs`等の
      // Parser出力に含まれる)から判定する。
      const approveEvidenceMatch = req.method === "POST" &&
        url.pathname.match(
          /^\/api\/case\/([a-zA-Z0-9_-]+)\/candidates\/([a-zA-Z0-9_-]+)\/approve-as-evidence$/,
        );
      if (approveEvidenceMatch) {
        const [, caseName, candidateId] = approveEvidenceMatch;
        const body = await readJsonBody(req);
        try {
          const applicationCase = await readCase(caseName);
          if (!applicationCase.definitionCaseName) {
            throw new Error(
              `適用例ケース"${caseName}"にdefinitionCaseNameが無い(fail-closed、` +
                `どの定義Knowledgeへ統合すべきか判定できない)`,
            );
          }
          const definitionCase = await readCase(applicationCase.definitionCaseName);

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

          // fail-closed: 2つの書き込み(applicationCase/definitionCase)は
          // 個々には正当でも、片方だけ書き込まれると2ファイル間の整合性が
          // 崩れる(第5ケース追加時に実際に発生した事故、`writeCase`側の
          // caseフィールド検証だけでは、1つ目の書き込みが先に成功してしまう
          // ことを防げない)。両方の書き込み先を、実際に書き込む前にまとめて
          // 検証する。
          if (result.applicationCase.case !== caseName) {
            throw new Error(
              `書き込み先("${caseName}")とapplicationCaseのcaseフィールド("${result.applicationCase.case}")` +
                `が一致しない(fail-closed、書き込み前に検出した)`,
            );
          }
          if (result.definitionCase.case !== applicationCase.definitionCaseName) {
            throw new Error(
              `書き込み先("${applicationCase.definitionCaseName}")とdefinitionCaseのcaseフィールド` +
                `("${result.definitionCase.case}")が一致しない(fail-closed、書き込み前に検出した)`,
            );
          }

          await writeCase(caseName, result.applicationCase);
          await writeCase(applicationCase.definitionCaseName, result.definitionCase);
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
      // rejectedにするのみ(監査証跡として残す、削除しない)。caseNameを
      // 動的にする理由はapproveEvidenceMatchと同じ。
      const rejectCandidateMatch = req.method === "POST" &&
        url.pathname.match(
          /^\/api\/case\/([a-zA-Z0-9_-]+)\/candidates\/([a-zA-Z0-9_-]+)\/reject$/,
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

      // ケース一覧: `output/cases/`配下の実ファイルを走査して返す
      // (`approvedKnowledgeStore.mjs`と同じ動的判定方式)。dev-viewer側の
      // 表示対象リスト(旧`DEFINITION_CASES`ハードコード配列)を、ケース
      // 追加のたびに手動編集する必要が無いようにするため追加した
      // (`planning/phase_c_readiness_assessment.md`2節)。
      // `candidates`配列を持つケース(適用例ケース)は`kind: "application"`、
      // それ以外(`block`を持つ確定Sourceケース)は`kind: "definition"`と
      // 判定する。適用例ケースは自身の`definitionCaseName`をそのまま返す。
      if (url.pathname === "/api/cases") {
        // `.test.json`(統合テストが書き出す一時ファイル)は対象外とする。
        // 中身の`case`フィールドが実ファイルと同じ名前になるため、含めると
        // 一覧が重複表示されてしまう。
        let fileNames = [];
        try {
          fileNames = (await readdir(casesDir)).filter(
            (name) => name.endsWith(".json") && !name.endsWith(".test.json"),
          );
        } catch {
          fileNames = [];
        }
        const cases = [];
        for (const fileName of fileNames.sort()) {
          const data = JSON.parse(await readFile(path.join(casesDir, fileName), "utf8"));
          cases.push({
            caseName: data.case,
            kind: Array.isArray(data.candidates) ? "application" : "definition",
            definitionCaseName: data.definitionCaseName ?? null,
          });
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ cases }));
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
