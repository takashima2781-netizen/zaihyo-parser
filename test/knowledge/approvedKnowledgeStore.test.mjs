import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { rebuildApprovedKnowledge } from "../../src/knowledge/approvedKnowledgeStore.mjs";

// 架空のケースファイルを一時ディレクトリに用意してテストする
// (実際のoutput/cases/には触れない、教材原文も使わない)。
async function withTempRoot(caseFiles, fn) {
  const rootDir = await mkdtemp(path.join(tmpdir(), "boki-approved-knowledge-test-"));
  const casesDir = path.join(rootDir, "output", "cases");
  await mkdir(casesDir, { recursive: true });
  for (const [fileName, content] of Object.entries(caseFiles)) {
    await writeFile(path.join(casesDir, fileName), JSON.stringify(content), "utf8");
  }
  try {
    await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function fakeKnowledge(id) {
  return { type: "DerivedKnowledge", id, knowledgeKind: "calculation_formula" };
}

test("rebuildApprovedKnowledge: approvedのみを含める(candidate/rejectedは含めない)", async () => {
  await withTempRoot(
    {
      "case-a.json": {
        case: "case-a",
        derivedKnowledgeCandidate: {
          reviewStatus: "approved",
          reviewedAt: "2026-01-01T00:00:00.000Z",
          knowledge: fakeKnowledge("dk-a"),
        },
      },
      "case-b.json": {
        case: "case-b",
        derivedKnowledgeCandidate: { reviewStatus: "candidate", knowledge: fakeKnowledge("dk-b") },
      },
      "case-c.json": {
        case: "case-c",
        derivedKnowledgeCandidate: { reviewStatus: "rejected", knowledge: fakeKnowledge("dk-c") },
      },
    },
    async (rootDir) => {
      const result = await rebuildApprovedKnowledge(rootDir);
      assert.equal(result.knowledge.length, 1);
      assert.equal(result.knowledge[0].knowledge.id, "dk-a");
      assert.equal(result.knowledge[0].sourceCase, "case-a");
      assert.equal(result.knowledge[0].approvedAt, "2026-01-01T00:00:00.000Z");
    },
  );
});

test("rebuildApprovedKnowledge: 承認済みが1件も無ければ空配列になる", async () => {
  await withTempRoot(
    {
      "case-a.json": {
        case: "case-a",
        derivedKnowledgeCandidate: { reviewStatus: "candidate", knowledge: fakeKnowledge("dk-a") },
      },
    },
    async (rootDir) => {
      const result = await rebuildApprovedKnowledge(rootDir);
      assert.deepEqual(result.knowledge, []);
    },
  );
});

test("rebuildApprovedKnowledge: 実際にoutput/knowledge/approved-knowledge.jsonへ書き出す", async () => {
  await withTempRoot(
    {
      "case-a.json": {
        case: "case-a",
        derivedKnowledgeCandidate: {
          reviewStatus: "approved",
          reviewedAt: "2026-01-01T00:00:00.000Z",
          knowledge: fakeKnowledge("dk-a"),
        },
      },
    },
    async (rootDir) => {
      await rebuildApprovedKnowledge(rootDir);
      const written = JSON.parse(
        await readFile(path.join(rootDir, "output", "knowledge", "approved-knowledge.json"), "utf8"),
      );
      assert.equal(written.knowledge.length, 1);
    },
  );
});

test("rebuildApprovedKnowledge: ケースファイルが無い(output/cases/が無い)場合も空配列で正常終了する", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "boki-approved-knowledge-empty-"));
  try {
    const result = await rebuildApprovedKnowledge(rootDir);
    assert.deepEqual(result.knowledge, []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// 再生成のたびに全件書き換えることを確認する(古いapproved-knowledge.jsonが
// 残らない=個別追記ではないことの確認、`m4_review_workflow_design.md`6-2節)。
test("rebuildApprovedKnowledge: 呼び出しごとに全件書き換える(個別追記ではない)", async () => {
  await withTempRoot(
    {
      "case-a.json": {
        case: "case-a",
        derivedKnowledgeCandidate: {
          reviewStatus: "approved",
          reviewedAt: "2026-01-01T00:00:00.000Z",
          knowledge: fakeKnowledge("dk-a"),
        },
      },
    },
    async (rootDir) => {
      await rebuildApprovedKnowledge(rootDir);
      // ケースaがrejectedに変わった状態を再現する
      await writeFile(
        path.join(rootDir, "output", "cases", "case-a.json"),
        JSON.stringify({
          case: "case-a",
          derivedKnowledgeCandidate: {
            reviewStatus: "rejected",
            reviewedAt: "2026-01-02T00:00:00.000Z",
            knowledge: fakeKnowledge("dk-a"),
          },
        }),
        "utf8",
      );
      const result = await rebuildApprovedKnowledge(rootDir);
      assert.deepEqual(result.knowledge, []);
    },
  );
});
