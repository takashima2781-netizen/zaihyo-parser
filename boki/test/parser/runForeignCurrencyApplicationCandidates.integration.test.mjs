import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runForeignCurrencyApplicationCandidates } from "../../src/parser/runForeignCurrencyApplicationCandidates.mjs";
import { processApplicationCandidates } from "../../src/parser/processApplicationCandidates.mjs";
import { renderTokens, tokenizePlainTermFormula } from "../../src/knowledge/formulaTokenizer.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const definitionCasePath = path.join(rootDir, "output", "cases", "foreign-currency-definition.json");
const outputPath = path.join(rootDir, "output", "cases", "foreign-currency-application.test.json");

// 実PDF・第5ケースの確定済み定義ケースファイルが両方存在する場合のみ実行する
// (先に`node scripts/run-foreign-currency-case.mjs`が実行済みであること)。
const dataAvailable = existsSync(pdfPath) && existsSync(definitionCasePath);

test(
  "runForeignCurrencyApplicationCandidates: 実PDFから適用例2件をSource候補として検出できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "input/book1.pdf またはforeign-currency-definition.json が無いためskip" },
  async () => {
    const result = await runForeignCurrencyApplicationCandidates({ pdfPath, definitionCasePath, outputPath });

    assert.equal(result.candidates.length, 2);
    assert.equal(result.definitionCaseName, "foreign-currency-definition");

    // 論点11-2が新規検出されていること(テーマは11-1と同じ、論点横断)
    assert.equal(result.structureContext.topicB.label.number, "11-2");
    assert.equal(result.structureContext.themeA.id, result.structureContext.themeB.id);
    assert.equal(result.structureContext.topicA.id, "topic-11-1");

    for (const candidate of result.candidates) {
      assert.equal(candidate.confirmationStatus, "candidate");
      assert.equal(candidate.reviewedAt, null);
      assert.equal(candidate.confirmedBlockId, null);
      assert.equal(candidate.boundaryType, "none");
      assert.ok(candidate.parentContext.label);
      assert.equal(candidate.abstractDefinitionCandidate.sourceBlockId, "block-foreign-currency-def");

      // sourceFaithfulが復元されており(ラベルが除去されており)、5トークン
      // 語彙で構造化・往復整合性も成立すること
      assert.ok(candidate.sourceFaithful);
      assert.match(candidate.sourceFaithful, /^[^×＝]+×[^×＝]+＝[^×＝]+$/);
      const structure = tokenizePlainTermFormula(candidate.sourceFaithful);
      assert.equal(renderTokens(structure), candidate.sourceFaithful);
    }

    // 2つの候補が異なるstructureRef(論点11-1・論点11-2)を参照していること
    const structureRefs = result.candidates.map((c) => c.structureRef);
    assert.deepEqual(new Set(structureRefs), new Set(["topic-11-1", "topic-11-2"]));

    // [8]候補確定フェーズ(縮小版)を通した場合、同一論点内の候補は自動確定、
    // 論点横断の候補はneeds_reviewのまま残ること(第2ケースと同じ経路を
    // 論点横断という新しい実データ配置で確認)。
    const definitionCase = JSON.parse(await readFile(definitionCasePath, "utf8"));
    const { applicationCase: processed } = processApplicationCandidates({
      applicationCase: result,
      definitionCase,
    });
    const sameTopic = processed.candidates.find((c) => c.structureRef === "topic-11-1");
    const crossTopic = processed.candidates.find((c) => c.structureRef === "topic-11-2");
    assert.equal(sameTopic.autoConfirmEvaluation.result, "auto_confirm");
    assert.equal(crossTopic.autoConfirmEvaluation.result, "needs_review");
    assert.equal(crossTopic.autoConfirmEvaluation.reason, "cross_topic");
  },
);
