import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runIntangibleJournalCase } from "../../src/parser/runIntangibleJournalCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const definitionCasePath = path.join(rootDir, "output", "cases", "teigakuho-definition.json");

// 実PDF・第1ケースの確定済みケースファイルが両方存在する場合のみ実行する。
// 教材原文をアサーションに埋め込まない(`m1_minimal_parser_prototype_design.md`
// 8-3節と同じ方針)。実データへの書き込みは一時ディレクトリに限定し、
// 実際のoutput/cases/は変更しない。
const dataAvailable = existsSync(pdfPath) && existsSync(definitionCasePath);

test(
  "runIntangibleJournalCase: 実PDFから仕訳パターン2件をSourceとして生成できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf またはteigakuho-definition.json が無いためskip" },
  async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "boki-intangible-journal-test-"));
    try {
      const cases = await runIntangibleJournalCase({ pdfPath, definitionCasePath, outputDir });

      assert.equal(cases.length, 2);

      const [acquisition, amortization] = cases;

      // テーマ8を再利用していること(再検出せず、第1ケースのthemeそのまま)
      for (const c of cases) {
        assert.equal(c.structureContext.theme.id, "theme-8");
        assert.equal(c.structureContext.topic.label.number, "8-11");
        assert.equal(c.block.structureRef, "topic-8-11");
        assert.equal(c.block.location.page, 187);
      }

      // 仕訳パターンの形状(借方×××貸方×××)であること
      for (const c of cases) {
        assert.match(c.block.sourceFaithful, /^\(借\).+×××\(貸\).+×××$/);
      }

      // 2件が異なるSource(異なるcase名・block ID)であること
      assert.notEqual(acquisition.case, amortization.case);
      assert.notEqual(acquisition.block.id, amortization.block.id);

      // F3による確定であること(既存の1ケース・2ケースと同じ判断基準)
      for (const c of cases) {
        assert.equal(c.block.segmentationDecision.rule, "F3");
        assert.equal(c.block.segmentationDecision.confirmed, true);
        assert.equal(c.block.blockKind, "journal_termbased");
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
