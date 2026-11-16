import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runForeignCurrencyCase } from "../../src/parser/runForeignCurrencyCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputPath = path.join(rootDir, "output", "cases", "foreign-currency-definition.test.json");

// 実PDFが存在する場合のみ実行する。教材原文をアサーションに埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。
const pdfAvailable = existsSync(pdfPath);

test(
  "runForeignCurrencyCase: 実PDFから確定Sourceを1件生成できる(構造的性質のみ検証)",
  { skip: !pdfAvailable && "input/book1.pdf が無いためskip" },
  async () => {
    const result = await runForeignCurrencyCase({ pdfPath, outputPath });

    assert.ok(result.block.sourceFaithful);
    assert.notEqual(result.block.sourceFaithful.trim(), "");

    // 括弧・分数を伴わない最も単純な「項×項＝項」の形状であること
    assert.match(result.block.sourceFaithful, /^[^×＝]+×[^×＝]+＝[^×＝]+$/);

    // 補正不要(captured_matches_sourceFaithful)であること。第1ケース
    // (fraction_split必須)とは異なる構造的性質。
    assert.equal(result.block.diag.extraction.status, "captured_matches_sourceFaithful");
    assert.deepEqual(result.block.diag.extraction.artifacts, []);

    assert.equal(result.block.blockKind, "formula_termbased");
    assert.equal(result.block.segmentationDecision.rule, "F3");
    assert.equal(result.block.segmentationDecision.confirmed, true);

    assert.equal(result.structureContext.theme.label.number, "11");
    assert.equal(result.structureContext.topic.label.number, "11-1");
    assert.equal(result.block.structureRef, "topic-11-1");

    assert.deepEqual(result.candidateReport.candidates, []);
    assert.deepEqual(result.outOfScopeDetections, []);
  },
);
