import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runExchangeBillCase } from "../../src/parser/runExchangeBillCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");

// 実PDFが存在する場合のみ実行する。教材原文をアサーションに埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。実データへの
// 書き込みは一時ディレクトリに限定し、実際のoutput/cases/は変更しない。
const dataAvailable = existsSync(pdfPath);

test(
  "runExchangeBillCase: 実PDFから為替手形の仕訳2件をSourceとして生成できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf が無いためskip" },
  async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "boki-exchange-bill-test-"));
    try {
      const { cases, outOfScopeDetections } = await runExchangeBillCase({ pdfPath, outputDir });

      assert.equal(cases.length, 2);

      const [payee, remittee] = cases;

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
      assert.notEqual(payee.case, remittee.case);
      assert.notEqual(payee.block.id, remittee.block.id);

      // 名宛人・指図人は、それぞれ片側だけが固定科目(支払手形/受取手形)で
      // あること(振出人〈両側プレースホルダー〉とは異なる構造的性質)。
      assert.match(payee.block.sourceFaithful, /支払手形/);
      assert.match(remittee.block.sourceFaithful, /受取手形/);

      // 振出人(両側プレースホルダー)は対象外として記録され、Sourceとしては
      // 確定していないこと。
      assert.equal(outOfScopeDetections.length, 1);
      assert.match(outOfScopeDetections[0].precedingHeading, /振出人/);
      for (const c of cases) {
        assert.equal(c.outOfScopeDetections.length, 1);
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
