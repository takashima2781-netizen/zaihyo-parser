import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createServer } from "../../src/devViewer/server.mjs";

// M4のPOSTエンドポイントは、実際のoutput/cases/teigakuho-definition.jsonを
// 変更せず、一時ディレクトリ上の架空データで検証する
// (教材原文を使わない、実データを勝手に承認しない)。

function fakeCase(reviewStatus = "candidate") {
  return {
    case: "teigakuho-definition",
    structureContext: { theme: { id: "theme-8" } },
    block: { id: "block-teigakuho-def" },
    derivedKnowledgeCandidate: {
      reviewStatus,
      reviewedAt: null,
      reviewNote: null,
      knowledge: {
        type: "DerivedKnowledge",
        id: "dk-calc-formula-teigakuho",
        knowledgeKind: "calculation_formula",
        content: {
          rawFormula: "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額",
          structure: {
            kind: "sequence",
            tokens: [
              {
                kind: "group",
                tokens: [
                  { kind: "term", value: "架空項Ａ" },
                  { kind: "operator", value: "－" },
                  { kind: "term", value: "架空項Ｂ" },
                ],
              },
              { kind: "operator", value: "×" },
              {
                kind: "group",
                tokens: [
                  {
                    kind: "fraction",
                    numerator: [{ kind: "term", value: "１架空単位" }],
                    denominator: [{ kind: "term", value: "架空全体単位" }],
                  },
                ],
              },
              { kind: "operator", value: "＝" },
              { kind: "term", value: "架空額" },
            ],
          },
        },
        sourceRefs: [{ sourceBlockId: "block-teigakuho-def", role: "definition" }],
        contentConfidence: { level: "verified_from_source", note: "架空の根拠" },
        evidence: {
          byRole: { definition: 1 },
          distinctThemes: ["theme-8"],
          distinctBooks: ["book-1"],
          crossesBaseAdvanced: false,
        },
        consolidation: { state: "single_source", possibleDuplicateOf: [] },
        scopeNote: "架空のスコープノート",
      },
    },
  };
}

async function withTempServer(initialReviewStatus, fn) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "boki-review-endpoints-test-"));
  await mkdir(path.join(tempRoot, "output", "cases"), { recursive: true });
  await mkdir(path.join(tempRoot, "dev-viewer"), { recursive: true });
  await writeFile(path.join(tempRoot, "dev-viewer", "index.html"), "<html></html>", "utf8");
  await writeFile(
    path.join(tempRoot, "output", "cases", "teigakuho-definition.json"),
    JSON.stringify(fakeCase(initialReviewStatus)),
    "utf8",
  );

  const server = createServer({ rootDir: tempRoot });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://localhost:${port}`, tempRoot);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function post(base, action, body) {
  const res = await fetch(`${base}/api/case/teigakuho-definition/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, data: await res.json() };
}

// --- candidate -> approved ---

test("POST .../approve: candidateをapprovedにし、approved-knowledge.jsonへ反映する", async () => {
  await withTempServer("candidate", async (base, tempRoot) => {
    const { status, data } = await post(base, "approve", { note: "OK" });
    assert.equal(status, 200);
    assert.equal(data.derivedKnowledgeCandidate.reviewStatus, "approved");

    const approved = JSON.parse(
      await readFile(path.join(tempRoot, "output", "knowledge", "approved-knowledge.json"), "utf8"),
    );
    assert.equal(approved.knowledge.length, 1);
    assert.equal(approved.knowledge[0].knowledge.id, "dk-calc-formula-teigakuho");
  });
});

test("POST .../approve: candidate以外への再承認はfail-closedで拒否する(400)", async () => {
  await withTempServer("approved", async (base) => {
    const { status, data } = await post(base, "approve", {});
    assert.equal(status, 400);
    assert.match(data.error, /不正な状態遷移/);
  });
});

// --- candidate -> rejected ---

test("POST .../reject: candidateをrejectedにし、approved-knowledge.jsonには含まれない", async () => {
  await withTempServer("candidate", async (base, tempRoot) => {
    const { status, data } = await post(base, "reject", { note: "不要" });
    assert.equal(status, 200);
    assert.equal(data.derivedKnowledgeCandidate.reviewStatus, "rejected");

    const approved = JSON.parse(
      await readFile(path.join(tempRoot, "output", "knowledge", "approved-knowledge.json"), "utf8"),
    );
    assert.deepEqual(approved.knowledge, []);
  });
});

test("POST .../reject: candidate以外への再除外はfail-closedで拒否する(400)", async () => {
  await withTempServer("rejected", async (base) => {
    const { status, data } = await post(base, "reject", {});
    assert.equal(status, 400);
    assert.match(data.error, /不正な状態遷移/);
  });
});

// --- 修正 ---

test("POST .../edit: contentConfidence/scopeNoteを更新し、reviewStatusはcandidateのまま", async () => {
  await withTempServer("candidate", async (base) => {
    const { status, data } = await post(base, "edit", {
      contentConfidence: { level: "uncertain", note: "要再検討" },
      scopeNote: "更新後",
    });
    assert.equal(status, 200);
    assert.equal(data.derivedKnowledgeCandidate.reviewStatus, "candidate");
    assert.equal(data.derivedKnowledgeCandidate.knowledge.contentConfidence.level, "uncertain");
    assert.equal(data.derivedKnowledgeCandidate.knowledge.scopeNote, "更新後");
  });
});

test("POST .../edit: approved後の修正はfail-closedで拒否する(400)", async () => {
  await withTempServer("approved", async (base) => {
    const { status, data } = await post(base, "edit", { scopeNote: "x" });
    assert.equal(status, 400);
    assert.match(data.error, /不正な状態遷移/);
  });
});

// --- M5境界 ---

test("M5境界: approved-knowledge.jsonにはapprovedのみが含まれ、candidate/rejectedは含まれない", async () => {
  await withTempServer("candidate", async (base, tempRoot) => {
    await post(base, "reject", {});
    const approvedAfterReject = JSON.parse(
      await readFile(path.join(tempRoot, "output", "knowledge", "approved-knowledge.json"), "utf8"),
    );
    assert.deepEqual(approvedAfterReject.knowledge, []);
  });
});

test("未知のケース名へのPOSTは404を返す", async () => {
  await withTempServer("candidate", async (base) => {
    const res = await fetch(`${base}/api/case/not-a-real-case/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 404);
  });
});
