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

// テーマ4-3(小切手の取立と手形の取立)の実データで、3ページにまたがる候補
// 検出、および借方・貸方が同一科目名になる仕訳(手形の更改)を正しく扱える
// ことを確認する(`runJournalTopicCase.integration.test.mjs`とは別の実データ
// 配置での検証)。

test(
  "runJournalTopicCase: 実PDF(テーマ4-3)から3ページにまたがる候補を検出し、借方=貸方の同一科目仕訳も扱える(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf が無いためskip" },
  async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "boki-journal-topic-multipage-test-"));
    try {
      const { cases } = await runJournalTopicCase({
        pdfPath,
        outputDir,
        themePage: 76,
        topicHeadingPage: 81,
        topicPages: [
          { page: 81, printedPageLabel: "52" },
          { page: 82, printedPageLabel: "53" },
          { page: 85, printedPageLabel: "56" },
        ],
        expectedTopicNumber: "4-3",
        outOfScopeReason: "テスト用の対象外理由",
        candidateDefinitions: [
          {
            match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "現金",
            caseName: "test-check-collection-received",
            blockId: "block-test-check-collection-received",
            sequenceOnPage: 1,
          },
          {
            match: (c) => {
              const debit = (c.debitAccountRaw ?? "").replace(/\s/g, "");
              const credit = (c.creditAccountRaw ?? "").replace(/\s/g, "");
              return debit === "支払手形" && credit === "支払手形";
            },
            caseName: "test-note-renewal-same-account",
            blockId: "block-test-note-renewal-same-account",
            sequenceOnPage: 2,
          },
        ],
      });

      assert.equal(cases.length, 2);

      const receivedPage = cases.find((c) => c.case === "test-check-collection-received");
      assert.equal(receivedPage.block.location.page, 81);

      const renewalCase = cases.find((c) => c.case === "test-note-renewal-same-account");
      assert.equal(renewalCase.block.location.page, 85);
      // 借方・貸方が同一科目名になる仕訳が正しく捉えられていること
      assert.match(renewalCase.block.sourceFaithful, /^\(借\)(.+)×××\(貸\)\1×××$/);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  },
);
