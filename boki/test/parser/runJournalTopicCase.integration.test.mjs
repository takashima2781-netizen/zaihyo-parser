import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../../src/parser/runJournalTopicCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");

const dataAvailable = existsSync(pdfPath);

// `runJournalTopicCase`はPhase Cで複数の論点(3-1・3-2・3-4等)から再利用される
// 共通オーケストレータのため、ここでは実データ(テーマ3-1 現金、3件の仕訳型)
// を1例として構造的性質を検証する。教材原文をアサーションに埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。

test(
  "runJournalTopicCase: 実PDF(テーマ3-1 現金)から複数ページ・複数候補を正しく検出・除外できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf が無いためskip" },
  async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "boki-journal-topic-test-"));
    try {
      const { cases, outOfScopeDetections } = await runJournalTopicCase({
        pdfPath,
        outputDir,
        themePage: 58,
        topicHeadingPage: 59,
        topicPages: [
          { page: 59, printedPageLabel: "30" },
          { page: 60, printedPageLabel: "31" },
        ],
        expectedTopicNumber: "3-1",
        outOfScopeReason: "テスト用の対象外理由",
        candidateDefinitions: [
          {
            match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "").includes("受取手形"),
            caseName: "test-postdated-check-received-journal",
            blockId: "block-test-postdated-check-received",
            sequenceOnPage: 1,
          },
          {
            match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "現金",
            caseName: "test-other-check-collection-received-journal",
            blockId: "block-test-other-check-collection-received",
            sequenceOnPage: 2,
          },
        ],
      });

      // 2件の候補定義に対応する2件が生成され、うち1件はページ59・もう
      // 1件はページ60由来であること(複数ページにまたがる候補検出の確認)。
      assert.equal(cases.length, 2);
      const pages = cases.map((c) => c.block.location.page).sort();
      assert.deepEqual(pages, [59, 60]);

      for (const c of cases) {
        assert.equal(c.structureContext.topic.label.number, "3-1");
        assert.equal(c.block.blockKind, "journal_termbased");
        assert.match(c.block.sourceFaithful, /^\(借\).+×××\(貸\).+×××$/);
      }

      // マッチしなかった候補(取立依頼時等)はoutOfScopeDetectionsへ回ること。
      assert.ok(outOfScopeDetections.length > 0);
      for (const d of outOfScopeDetections) {
        assert.equal(d.reason, "テスト用の対象外理由");
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  },
);
