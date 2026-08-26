import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "../../src/devViewer/server.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const caseJsonPath = path.join(rootDir, "output", "cases", "teigakuho-definition.json");

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
