import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runApplicationCandidates } from "../../src/parser/runApplicationCandidates.mjs";
import { renderTokens, tokenizeBareNumberFractionFormula } from "../../src/knowledge/formulaTokenizer.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const definitionCasePath = path.join(rootDir, "output", "cases", "teigakuho-definition.json");
const outputPath = path.join(rootDir, "output", "cases", "teigakuho-application.test.json");

// 実PDF・第1ケースの確定済みケースファイルが両方存在する場合のみ実行する。
// 教材原文をアサーションに埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。
const dataAvailable = existsSync(pdfPath) && existsSync(definitionCasePath);

test(
  "runApplicationCandidates: 実PDFから適用例2件をSource候補として検出できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf またはteigakuho-definition.json が無いためskip" },
  async () => {
    const result = await runApplicationCandidates({ pdfPath, definitionCasePath, outputPath });

    assert.equal(result.candidates.length, 2);

    // テーマ9・論点9-1が新規検出されていること
    assert.equal(result.structureContext.themeB.label.number, "9");
    assert.equal(result.structureContext.topicB.label.number, "9-1");
    // テーマ8・論点8-2は第1ケースのものを再利用していること
    assert.equal(result.structureContext.themeA.id, "theme-8");
    assert.equal(result.structureContext.topicA.id, "topic-8-2");

    for (const candidate of result.candidates) {
      // candidate状態のまま(Claude側で勝手に確定させていない)
      assert.equal(candidate.confirmationStatus, "candidate");
      assert.equal(candidate.reviewedAt, null);
      assert.equal(candidate.confirmedBlockId, null);

      // F群の事実が付与されている(独立参照必要性等のG群判断は含まれない)
      assert.equal(candidate.boundaryType, "none");
      assert.ok(candidate.parentContext.label);
      assert.equal(candidate.abstractDefinitionCandidate.sourceBlockId, "block-teigakuho-def");

      // sourceFaithfulが復元されており、5トークン語彙で構造化・往復整合性も
      // 成立すること(定義式とは別形状のトークナイザーを使う)
      assert.ok(candidate.sourceFaithful);
      assert.match(candidate.sourceFaithful, /／/);
      const structure = tokenizeBareNumberFractionFormula(candidate.sourceFaithful);
      assert.equal(renderTokens(structure), candidate.sourceFaithful);
    }

    // 2つの候補が異なるstructureRef(テーマ8・テーマ9)を参照していること
    const structureRefs = result.candidates.map((c) => c.structureRef);
    assert.deepEqual(new Set(structureRefs), new Set(["topic-8-2", "topic-9-1"]));
  },
);
