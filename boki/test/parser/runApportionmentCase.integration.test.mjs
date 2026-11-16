import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runApportionmentCase } from "../../src/parser/runApportionmentCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const correctionPath = path.join(
  rootDir,
  "input",
  "corrections",
  "apportionment-average-definition.json",
);
const outputPath = path.join(rootDir, "output", "cases", "apportionment-average-definition.test.json");

// 実PDF・補正データが両方存在する場合のみ実行する。教材原文をアサーションに
// 埋め込まない(`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。
const dataAvailable = existsSync(pdfPath) && existsSync(correctionPath);

test(
  "runApportionmentCase: 実PDFから確定Sourceを1件生成できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf または補正データが無いためskip" },
  async () => {
    const result = await runApportionmentCase({ pdfPath, correctionPath, outputPath });

    assert.ok(result.block.sourceFaithful);
    assert.notEqual(result.block.sourceFaithful.trim(), "");

    // 加算グループ+分数(分母が複数トークン)の形状であること
    assert.match(result.block.sourceFaithful, /^（[^（）]+＋[^（）]+）×（[^（）]+／（[^（）]+＋[^（）]+））＝.+$/);

    // fraction_split補正(分母を括弧で補う復元)が発生したことを診断情報が
    // 正しく記録していること
    assert.equal(result.block.diag.extraction.status, "captured_differs");
    assert.ok(
      result.block.diag.extraction.artifacts.some((a) => a.kind === "fraction_split"),
    );

    assert.equal(result.block.blockKind, "formula_termbased");
    assert.equal(result.block.segmentationDecision.rule, "F3");
    assert.equal(result.block.segmentationDecision.confirmed, true);

    assert.equal(result.structureContext.theme.label.number, "7");
    assert.equal(result.structureContext.topic.label.number, "7-10");
    assert.equal(result.block.structureRef, "topic-7-10");

    assert.deepEqual(result.candidateReport.candidates, []);
  },
);
