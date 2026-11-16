import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPromissoryNoteCase } from "../../src/parser/runPromissoryNoteCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");

// 実PDFが存在する場合のみ実行する。教材原文をアサーションに埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。実データへの
// 書き込みは一時ディレクトリに限定し、実際のoutput/cases/は変更しない。
const dataAvailable = existsSync(pdfPath);

test(
  "runPromissoryNoteCase: 実PDFから約束手形の仕訳2件をSourceとして生成できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf が無いためskip" },
  async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "boki-promissory-note-test-"));
    try {
      const { cases, outOfScopeDetections } = await runPromissoryNoteCase({ pdfPath, outputDir });

      assert.equal(cases.length, 2);

      const [drawer, payee] = cases;

      // 新規テーマ(theme-4/topic-4-1)を検出していること(既存ケースの
      // テーマとは独立)。
      for (const c of cases) {
        assert.equal(c.structureContext.theme.id, "theme-4");
        assert.equal(c.structureContext.topic.label.number, "4-1");
        assert.equal(c.block.structureRef, "topic-4-1");
        assert.equal(c.block.location.page, 77);
        assert.equal(c.block.blockKind, "journal_termbased");
        assert.equal(c.block.segmentationDecision.rule, "F3");
      }

      // 仕訳パターンの形状であること
      for (const c of cases) {
        assert.match(c.block.sourceFaithful, /^\(借\).+×××\(貸\).+×××$/);
      }

      // 2件が異なるSourceであること
      assert.notEqual(drawer.case, payee.case);
      assert.notEqual(drawer.block.id, payee.block.id);

      // 同じページの為替手形(振出人/名宛人/指図人、3件)は対象外として
      // 記録され、Sourceとしては確定していないこと。
      assert.equal(outOfScopeDetections.length, 3);
      for (const c of cases) {
        assert.equal(c.outOfScopeDetections.length, 3);
      }

      // 出力ファイルが実際に書き出されていること
      for (const c of cases) {
        const written = JSON.parse(
          await readFile(path.join(outputDir, `${c.case}.json`), "utf8"),
        );
        assert.equal(written.block.id, c.block.id);
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  },
);
