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

// テーマ6-1(従業員給料・賞与)の実データで、借方科目名が同一の複数候補
// (複合仕訳の1行目 vs 単純仕訳)が同一ページに存在する場合、precedingHeading
// による絞り込みが無いと誤った候補(先に出現する複合仕訳側)を拾ってしまう
// 実バグを検出した経緯があるため、正しい候補(冬期賞与支払時の単純仕訳)が
// 選ばれることを回帰テストとして固定する。

test(
  "runJournalTopicCase: 実PDF(テーマ6-1)で借方科目名が同一の複数候補からprecedingHeadingで正しい候補を選べる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf が無いためskip" },
  async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "boki-journal-topic-heading-disambig-test-"));
    try {
      const { cases } = await runJournalTopicCase({
        pdfPath,
        outputDir,
        themePage: 104,
        topicHeadingPage: 105,
        topicPages: [
          { page: 105, printedPageLabel: "76" },
          { page: 107, printedPageLabel: "78" },
        ],
        expectedTopicNumber: "6-1",
        outOfScopeReason: "テスト用の対象外理由",
        candidateDefinitions: [
          {
            match: (c) =>
              (c.debitAccountRaw ?? "").replace(/\s/g, "") === "賞与手当" &&
              (c.precedingHeading ?? "").includes("冬期賞与支払時"),
            caseName: "test-bonus-winter-payment",
            blockId: "block-test-bonus-winter-payment",
            sequenceOnPage: 1,
          },
        ],
      });

      assert.equal(cases.length, 1);
      const winterCase = cases[0];
      // 誤って複合仕訳側(1ページ目・(2)従業員賞与支払時)を拾うと
      // location.pageが105になる。正しい単純仕訳は2ページ目(107)にある。
      assert.equal(winterCase.block.location.page, 107);
      assert.equal(winterCase.block.sourceFaithful, "(借)賞与手当×××(貸)現金預金×××");
      assert.match(winterCase.block.detection.precedingHeading, /冬期賞与支払時/);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  },
);
