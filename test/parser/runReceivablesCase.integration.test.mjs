import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runReceivablesCase } from "../../src/parser/runReceivablesCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputPath = path.join(rootDir, "output", "cases", "electronic-receivable-acquisition-journal.test.json");

const dataAvailable = existsSync(pdfPath);

test(
  "runReceivablesCase: 実PDFから電子記録債権(取得時)の仕訳1件をSourceとして生成できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf が無いためskip" },
  async () => {
    const result = await runReceivablesCase({ pdfPath, outputPath });

    assert.equal(result.structureContext.theme.id, "theme-2");
    assert.equal(result.structureContext.topic.label.number, "2-1");
    assert.equal(result.block.structureRef, "topic-2-1");
    assert.equal(result.block.blockKind, "journal_termbased");
    assert.match(result.block.sourceFaithful, /^\(借\).+×××\(貸\).+×××$/);
    assert.equal(result.block.segmentationDecision.rule, "F3");

    // 同じページの複合仕訳(2件)は対象外として記録されていること
    assert.equal(result.outOfScopeDetections.length, 2);
  },
);
