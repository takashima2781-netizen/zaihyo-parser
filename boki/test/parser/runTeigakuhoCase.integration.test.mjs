import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runTeigakuhoCase } from "../../src/parser/runTeigakuhoCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const correctionPath = path.join(
  rootDir,
  "input",
  "corrections",
  "teigakuho-definition.json",
);
const outputPath = path.join(
  rootDir,
  "output",
  "cases",
  "teigakuho-definition.test.json",
);

// 実PDF(/input/book1.pdf)が存在する場合のみ実行する。教材原本・派生データを
// Gitへコミットしないため(CLAUDE.md原則7)、CIやPDFを持たない環境ではskipする。
// アサーションは構造的性質のみに限定し、実際の教材原文を期待値に埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節)。
const pdfAvailable = existsSync(pdfPath) && existsSync(correctionPath);

test(
  "runTeigakuhoCase: 実PDFから確定Sourceを1件生成できる(構造的性質のみ検証)",
  { skip: !pdfAvailable && "input/book1.pdf または補正データが無いためskip" },
  async () => {
    const result = await runTeigakuhoCase({ pdfPath, correctionPath, outputPath });

    // sourceFaithfulが復元されていること(null/空文字ではない)
    assert.ok(result.block.sourceFaithful);
    assert.notEqual(result.block.sourceFaithful.trim(), "");

    // fraction_split補正により、分数を示す「／」を含む形に復元されていること
    // (文言そのものは検証しない、構造的性質のみ)
    assert.match(result.block.sourceFaithful, /／/);

    // extractionRawとsourceFaithfulが異なる(補正が発生した)ことを診断情報が
    // 正しく記録していること
    assert.equal(result.block.diag.extraction.status, "captured_differs");
    assert.ok(
      result.block.diag.extraction.artifacts.some(
        (a) => a.kind === "fraction_split",
      ),
    );

    // F3による確定であること
    assert.equal(result.block.segmentationDecision.rule, "F3");
    assert.equal(result.block.segmentationDecision.confirmed, true);

    // 出典追跡情報(location)が想定範囲内であること
    assert.equal(result.block.location.page, 155);
    assert.equal(result.block.structureRef, "topic-8-2");
    assert.equal(result.structureContext.topic.label.number, "8-2");
    assert.equal(result.structureContext.theme.label.number, "8");

    // Source候補一覧レポートは空(このケースは候補化されず確定した)
    assert.deepEqual(result.candidateReport.candidates, []);
  },
);
