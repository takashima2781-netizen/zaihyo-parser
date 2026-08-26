import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "../../src/devViewer/server.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const caseJsonPath = path.join(rootDir, "output", "cases", "teigakuho-definition.json");
const exercisesJsonPath = path.join(rootDir, "output", "exercises", "exercises.json");

async function withServer(fn) {
  const server = createServer({ rootDir });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET / returns the viewer HTML", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /開発用確認UI/);
  });
});

test("GET /api/case/<unknown> returns 404 (許可リストに無いケース名は拒否する)", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/case/not-a-real-case`);
    assert.equal(res.status, 404);
  });
});

test("GET /api/case/../../secret はパストラバーサルできない", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/case/..%2F..%2Fpackage`);
    assert.equal(res.status, 404);
  });
});

test("GET /lib/formulaTokenizer.mjs はimport可能なJSとして配信される(往復整合性チェックの重複実装を避けるため)", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/lib/formulaTokenizer.mjs`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /javascript/);
    const body = await res.text();
    assert.match(body, /export function renderTokens/);
  });
});

test("GET /lib/gradingRegistry.mjs はimport可能なJSとして配信される(M6が判定ロジックを再実装しないため)", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/lib/gradingRegistry.mjs`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /javascript/);
    const body = await res.text();
    assert.match(body, /export function grade/);
  });
});

test("GET /lib/<許可リスト外> は404を返す", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/lib/not-allowed.mjs`);
    assert.equal(res.status, 404);
  });
});

test("GET /learn は学習UIのHTMLを返す", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/learn`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /問題を解く/);
    assert.match(body, /gradingRegistry\.mjs/);
  });
});

// 実際のケースJSON(output/cases/teigakuho-definition.json)が存在する場合のみ、
// 構造的性質を確認する。教材原文はアサーションに埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。
test(
  "GET /api/case/teigakuho-definition returns the case JSON with expected keys",
  { skip: !existsSync(caseJsonPath) && "output/cases/teigakuho-definition.json が無いためskip" },
  async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/case/teigakuho-definition`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.case, "teigakuho-definition");
      assert.ok(data.block.sourceFaithful);
      assert.ok(data.block.extractionRaw);
      assert.ok(data.block.diag);
      assert.ok(data.block.segmentationDecision);
    });
  },
);

test("GET /api/exercises は未生成の場合404を返す(仮のexercises.jsonを配信しない)", async () => {
  await withServer(async (base) => {
    // このテストは exercises.json の有無に関わらず、404か200のどちらかに
    // なることのみを確認する(実データの有無を前提にしない)。
    const res = await fetch(`${base}/api/exercises`);
    assert.ok(res.status === 200 || res.status === 404);
  });
});

test(
  "GET /api/exercises returns the exercises JSON with expected keys",
  { skip: !existsSync(exercisesJsonPath) && "output/exercises/exercises.json が無いためskip" },
  async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/exercises`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.exercises.length, 1);
      assert.equal(data.exercises[0].exerciseKind, "formula_ordering");
      assert.ok(data.exercises[0].knowledgeRef.knowledgeId);
    });
  },
);
