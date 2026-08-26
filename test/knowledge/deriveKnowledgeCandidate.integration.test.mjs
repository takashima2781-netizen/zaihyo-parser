import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveTeigakuhoKnowledgeCandidate } from "../../src/knowledge/deriveKnowledgeCandidate.mjs";
import { renderTokens } from "../../src/knowledge/formulaTokenizer.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const casePath = path.join(rootDir, "output", "cases", "teigakuho-definition.json");

// M1が生成した実データ(output/cases/teigakuho-definition.json)が存在する
// 場合のみ実行する。教材原文をアサーションに埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。
const caseAvailable = existsSync(casePath);

test(
  "deriveTeigakuhoKnowledgeCandidate: 実データ(M1の確定Source)からKnowledge候補を生成できる(構造的性質のみ検証)",
  { skip: !caseAvailable && "output/cases/teigakuho-definition.json が無いためskip(先にM1を実行)" },
  () => {
    const data = JSON.parse(readFileSync(casePath, "utf8"));
    const result = deriveTeigakuhoKnowledgeCandidate(data);

    // reviewStatusがknowledge本体の外側にある
    assert.equal(result.reviewStatus, "candidate");
    assert.equal("reviewStatus" in result.knowledge, false);

    // rawFormulaがsourceFaithfulと完全一致する
    assert.equal(result.knowledge.content.rawFormula, data.block.sourceFaithful);

    // 往復整合性: structureから復元した文字列がrawFormulaと一致する
    const rendered = renderTokens(result.knowledge.content.structure);
    assert.equal(rendered, result.knowledge.content.rawFormula);

    // sourceRefs.role = definition でSourceを追跡できる
    assert.deepEqual(result.knowledge.sourceRefs, [
      { sourceBlockId: data.block.id, role: "definition" },
    ]);

    // 3軸が既存設計どおりのパターン(1 Source→1 Knowledge)になっている
    assert.equal(result.knowledge.contentConfidence.level, "verified_from_source");
    assert.equal(result.knowledge.consolidation.state, "single_source");
    assert.deepEqual(result.knowledge.evidence.byRole, { definition: 1 });
  },
);
