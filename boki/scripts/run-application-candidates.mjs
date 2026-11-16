#!/usr/bin/env node
// CLIエントリポイント: 定額法の適用例2件をSource候補として検出し、
// output/cases/teigakuho-application.jsonへ出力する。続けて、[8]候補確定
// フェーズ(縮小版)を実行し、F群の事実だけで安全に自動確定できる候補は
// 自動でSource確定+Knowledge統合まで行う。それ以外の候補は
// confirmationStatus:"candidate"のまま、判定根拠を付与して人間の判断を
// 待つ状態にする(`knowledge_integration_review_scope_design.md`)。
//
// gateChecksに違反した場合は、teigakuho-definition.jsonを一切書き換えず
// fail-closedで終了する(CLAUDE.mdのgateChecks方針)。
//
// 使い方: node scripts/run-application-candidates.mjs
//         (先に node scripts/run-teigakuho-case.mjs を実行しておくこと)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

import { runApplicationCandidates } from "../src/parser/runApplicationCandidates.mjs";
import { processApplicationCandidates } from "../src/parser/processApplicationCandidates.mjs";
import { runApplicationIntegrationGateChecks } from "../src/gateChecks/applicationIntegrationChecks.mjs";
import { rebuildApprovedKnowledge } from "../src/knowledge/approvedKnowledgeStore.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const pdfPath = path.join(rootDir, "input", "book1.pdf");
const definitionCasePath = path.join(rootDir, "output", "cases", "teigakuho-definition.json");
const applicationOutputPath = path.join(rootDir, "output", "cases", "teigakuho-application.json");

try {
  // 候補検出(Parser本体、変更なし)。confirmationStatusは全てcandidateの
  // まま書き出される。
  const applicationCase = await runApplicationCandidates({
    pdfPath,
    definitionCasePath,
    outputPath: applicationOutputPath,
  });
  const definitionCase = JSON.parse(await readFile(definitionCasePath, "utf8"));

  // [8]候補確定フェーズ(縮小版): 自動確定できる候補は即座に確定+統合する。
  const { applicationCase: processedApplicationCase, definitionCase: processedDefinitionCase } =
    processApplicationCandidates({ applicationCase, definitionCase });

  const gateResult = runApplicationIntegrationGateChecks({
    applicationCase: processedApplicationCase,
    definitionCase: processedDefinitionCase,
  });
  if (!gateResult.ok) {
    console.error("gateChecks failed(fail-closed): teigakuho-definition.jsonは更新していません");
    for (const violation of gateResult.violations) {
      console.error(`  - ${violation}`);
    }
    process.exitCode = 1;
  } else {
    await writeFile(applicationOutputPath, JSON.stringify(processedApplicationCase, null, 2), "utf8");
    await writeFile(definitionCasePath, JSON.stringify(processedDefinitionCase, null, 2), "utf8");
    await rebuildApprovedKnowledge(rootDir);

    console.log(`OK: wrote ${applicationOutputPath}`);
    console.log(`OK: wrote ${definitionCasePath}`);
    for (const c of processedApplicationCase.candidates) {
      console.log(
        `candidate: ${c.candidateId} confirmationStatus=${c.confirmationStatus} ` +
          `confirmationMethod=${c.confirmationMethod ?? "(未確定)"} ` +
          `evaluation=${c.autoConfirmEvaluation?.result ?? "(未評価)"}`,
      );
      console.log(`  sourceFaithful: ${c.sourceFaithful}`);
    }
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
