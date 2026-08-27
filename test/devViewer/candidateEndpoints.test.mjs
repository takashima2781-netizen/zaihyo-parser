import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createServer } from "../../src/devViewer/server.mjs";

// 追加候補(要判断)のAPIは、実際のoutput/cases/を変更せず、一時ディレクトリ
// 上の架空データで検証する(教材原文を使わない、実データを勝手に確定しない)。

function fakeDefinitionCase() {
  return {
    case: "teigakuho-definition",
    structureContext: { theme: { id: "theme-架空A" } },
    block: { id: "block-架空-def", structureRef: "topic-架空A", sourceFaithful: "架空の定義式" },
    derivedKnowledgeCandidate: {
      reviewStatus: "approved",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      reviewNote: null,
      knowledge: {
        type: "DerivedKnowledge",
        id: "dk-架空",
        knowledgeKind: "calculation_formula",
        content: { rawFormula: "架空の定義式", structure: { kind: "sequence", tokens: [] } },
        sourceRefs: [{ sourceBlockId: "block-架空-def", role: "definition" }],
        contentConfidence: { level: "verified_from_source", note: "架空" },
        evidence: {
          byRole: { definition: 1 },
          distinctThemes: ["theme-架空A"],
          distinctBooks: ["book-1"],
          crossesBaseAdvanced: false,
        },
        consolidation: { state: "single_source", possibleDuplicateOf: [] },
        scopeNote: "架空",
      },
    },
  };
}

function fakeApplicationCase() {
  return {
    case: "teigakuho-application",
    definitionCaseName: "teigakuho-definition",
    structureContext: {
      themeA: { id: "theme-架空A" },
      topicA: { id: "topic-架空A" },
      themeB: { id: "theme-架空B" },
      topicB: { id: "topic-架空B" },
    },
    candidates: [
      {
        candidateId: "cand-topic-fakeB-app",
        location: { page: 1, printedPageLabel: "1", sequenceOnPage: 1 },
        structureRef: "topic-架空B",
        parentContext: { label: "例 架空設例設", note: "架空" },
        boundaryType: "none",
        sameTypePatterns: { count: 1, note: "架空" },
        abstractDefinitionCandidate: { exists: true, sourceBlockId: "block-架空-def" },
        detection: { detectorId: "termBasedFormulaDetector", matchedLine: "架空", precedingHeading: null },
        extractionRaw: { text: "架空", tool: "pymupdf", toolVersion: "1.0", invocation: "架空" },
        sourceFaithful: "架空額×（３年／７年）＝架空結果",
        diag: {
          extraction: { status: "captured_differs", artifacts: [] },
          faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" },
        },
        confirmationStatus: "candidate",
        confirmationMethod: null,
        autoConfirmEvaluation: { result: "needs_review", reason: "cross_topic" },
        reviewedAt: null,
        reviewNote: null,
        confirmedBlockId: null,
      },
    ],
  };
}

async function withTempServer(fn) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "boki-candidate-endpoints-test-"));
  await mkdir(path.join(tempRoot, "output", "cases"), { recursive: true });
  await mkdir(path.join(tempRoot, "dev-viewer"), { recursive: true });
  await mkdir(path.join(tempRoot, "learning-ui"), { recursive: true });
  await writeFile(path.join(tempRoot, "dev-viewer", "index.html"), "<html></html>", "utf8");
  await writeFile(path.join(tempRoot, "learning-ui", "index.html"), "<html></html>", "utf8");
  await writeFile(
    path.join(tempRoot, "output", "cases", "teigakuho-definition.json"),
    JSON.stringify(fakeDefinitionCase()),
    "utf8",
  );
  await writeFile(
    path.join(tempRoot, "output", "cases", "teigakuho-application.json"),
    JSON.stringify(fakeApplicationCase()),
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

async function post(base, urlPath, body) {
  const res = await fetch(`${base}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, data: await res.json() };
}

test("POST .../candidates/:id/approve-as-evidence: 候補を確定し、Knowledgeの根拠として統合する", async () => {
  await withTempServer(async (base, tempRoot) => {
    const { status, data } = await post(
      base,
      "/api/case/teigakuho-application/candidates/cand-topic-fakeB-app/approve-as-evidence",
      { note: "テーマ横断だが妥当と判断" },
    );
    assert.equal(status, 200);

    const candidate = data.applicationCase.candidates[0];
    assert.equal(candidate.confirmationStatus, "confirmed");
    assert.equal(candidate.confirmationMethod, "human_reviewed");
    assert.equal(candidate.confirmedBlockId, "block-cand-topic-fakeB-app");

    const { knowledge } = data.definitionCase.derivedKnowledgeCandidate;
    assert.equal(knowledge.sourceRefs.length, 2);
    assert.deepEqual(knowledge.sourceRefs[1], {
      sourceBlockId: "block-cand-topic-fakeB-app",
      role: "application",
    });
    assert.deepEqual(knowledge.evidence.distinctThemes, ["theme-架空A", "theme-架空B"]);
    // reviewStatus(M4の承認状態)は変更されない
    assert.equal(data.definitionCase.derivedKnowledgeCandidate.reviewStatus, "approved");

    // approved-knowledge.jsonも更新された内容で再生成されていること
    const approved = JSON.parse(
      await readFile(path.join(tempRoot, "output", "knowledge", "approved-knowledge.json"), "utf8"),
    );
    assert.equal(approved.knowledge[0].knowledge.sourceRefs.length, 2);
  });
});

test("POST .../candidates/:id/reject: 候補をrejectedにし、Knowledgeへは統合しない", async () => {
  await withTempServer(async (base) => {
    const { status, data } = await post(
      base,
      "/api/case/teigakuho-application/candidates/cand-topic-fakeB-app/reject",
      { note: "不採用" },
    );
    assert.equal(status, 200);
    assert.equal(data.candidates[0].confirmationStatus, "rejected");
  });
});

test("POST .../approve-as-evidence: candidate以外への再承認はfail-closedで拒否する(400)", async () => {
  await withTempServer(async (base) => {
    await post(base, "/api/case/teigakuho-application/candidates/cand-topic-fakeB-app/approve-as-evidence", {});
    const { status, data } = await post(
      base,
      "/api/case/teigakuho-application/candidates/cand-topic-fakeB-app/approve-as-evidence",
      {},
    );
    assert.equal(status, 400);
    assert.match(data.error, /不正な状態遷移/);
  });
});

test("POST .../approve-as-evidence: gateChecks違反時はfail-closedで拒否し、ファイルを書き換えない", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "boki-candidate-endpoints-test-"));
  await mkdir(path.join(tempRoot, "output", "cases"), { recursive: true });
  await mkdir(path.join(tempRoot, "dev-viewer"), { recursive: true });
  await mkdir(path.join(tempRoot, "learning-ui"), { recursive: true });
  await writeFile(path.join(tempRoot, "dev-viewer", "index.html"), "<html></html>", "utf8");
  await writeFile(path.join(tempRoot, "learning-ui", "index.html"), "<html></html>", "utf8");

  // 定義SourceのsourceFaithfulと、Knowledge.content.rawFormulaが既に
  // 一致していない(壊れた)状態を人為的に作る。confirmAndIntegrateCandidate
  // 自体はcontentに触れないため成功してしまうが、gateChecksの
  // content不変性チェックがこの既存の不整合を検出し、書き込みを止めるはず。
  const brokenDefinitionCase = fakeDefinitionCase();
  brokenDefinitionCase.block.sourceFaithful = "壊れたsourceFaithful(rawFormulaと不一致)";
  const brokenDefinitionRaw = JSON.stringify(brokenDefinitionCase);
  await writeFile(
    path.join(tempRoot, "output", "cases", "teigakuho-definition.json"),
    brokenDefinitionRaw,
    "utf8",
  );
  await writeFile(
    path.join(tempRoot, "output", "cases", "teigakuho-application.json"),
    JSON.stringify(fakeApplicationCase()),
    "utf8",
  );

  const server = createServer({ rootDir: tempRoot });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const base = `http://localhost:${port}`;
    const { status, data } = await post(
      base,
      "/api/case/teigakuho-application/candidates/cand-topic-fakeB-app/approve-as-evidence",
      {},
    );
    assert.equal(status, 400);
    assert.match(data.error, /gateChecks failed/);

    // ファイルが書き換わっていないこと(candidateのまま、statusRefsも未統合)
    const applicationOnDisk = JSON.parse(
      await readFile(path.join(tempRoot, "output", "cases", "teigakuho-application.json"), "utf8"),
    );
    assert.equal(applicationOnDisk.candidates[0].confirmationStatus, "candidate");
    const definitionOnDisk = await readFile(
      path.join(tempRoot, "output", "cases", "teigakuho-definition.json"),
      "utf8",
    );
    assert.equal(definitionOnDisk, brokenDefinitionRaw);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }
});

// 第5ケース追加時に実際に発生した事故(`TASK.md`「第5ケース」節)の再発防止
// テスト: 適用例ケースのdefinitionCaseNameが指すファイルが、実際には
// 別のcaseフィールドを持つ(取り違え・破損等)場合、書き込み先とデータ自身の
// caseフィールドが一致しないため、fail-closedで書き込みを拒否すること。
test("POST .../approve-as-evidence: 書き込み先とデータのcaseフィールドが不一致ならfail-closedで拒否する(別ケースへの誤書き込み防止)", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "boki-candidate-endpoints-test-"));
  await mkdir(path.join(tempRoot, "output", "cases"), { recursive: true });
  await mkdir(path.join(tempRoot, "dev-viewer"), { recursive: true });
  await mkdir(path.join(tempRoot, "learning-ui"), { recursive: true });
  await writeFile(path.join(tempRoot, "dev-viewer", "index.html"), "<html></html>", "utf8");
  await writeFile(path.join(tempRoot, "learning-ui", "index.html"), "<html></html>", "utf8");

  // teigakuho-definition.jsonという名前のファイルなのに、中身のcaseフィールドは
  // 別の名前を持つ(取り違え・破損等を模した状態)。
  const mismatchedDefinitionCase = fakeDefinitionCase();
  mismatchedDefinitionCase.case = "some-other-definition";
  const mismatchedDefinitionRaw = JSON.stringify(mismatchedDefinitionCase);
  await writeFile(
    path.join(tempRoot, "output", "cases", "teigakuho-definition.json"),
    mismatchedDefinitionRaw,
    "utf8",
  );
  const applicationRaw = JSON.stringify(fakeApplicationCase());
  await writeFile(
    path.join(tempRoot, "output", "cases", "teigakuho-application.json"),
    applicationRaw,
    "utf8",
  );

  const server = createServer({ rootDir: tempRoot });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const base = `http://localhost:${port}`;
    const { status, data } = await post(
      base,
      "/api/case/teigakuho-application/candidates/cand-topic-fakeB-app/approve-as-evidence",
      {},
    );
    assert.equal(status, 400);
    assert.match(data.error, /一致しない/);

    // どちらのファイルも書き換わっていないこと(誤書き込みが実際に防止された)
    const definitionOnDisk = await readFile(
      path.join(tempRoot, "output", "cases", "teigakuho-definition.json"),
      "utf8",
    );
    assert.equal(definitionOnDisk, mismatchedDefinitionRaw);
    const applicationOnDisk = await readFile(
      path.join(tempRoot, "output", "cases", "teigakuho-application.json"),
      "utf8",
    );
    assert.equal(applicationOnDisk, applicationRaw);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("GET /api/case/teigakuho-application は候補一覧を返す", async () => {
  await withTempServer(async (base) => {
    const res = await fetch(`${base}/api/case/teigakuho-application`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.candidates.length, 1);
    assert.equal(data.candidates[0].confirmationStatus, "candidate");
  });
});
