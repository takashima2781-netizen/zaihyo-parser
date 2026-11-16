#!/usr/bin/env node
// CLIエントリポイント: 外貨建取引の適用例2件をSource候補として検出し、
// output/cases/foreign-currency-application.jsonへ出力する。続けて、
// [8]候補確定フェーズ(縮小版、`processApplicationCandidates.mjs`、第2
// ケースで実装したロジックをそのまま再利用)を実行する。
//
// 使い方: node scripts/run-foreign-currency-application-candidates.mjs
//         (先に run-foreign-currency-case.mjs / run-foreign-currency-
//          knowledge-candidate.mjs を実行しておくこと)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

import { runForeignCurrencyApplicationCandidates } from "../src/parser/runForeignCurrencyApplicationCandidates.mjs";
import { processApplicationCandidates } from "../src/parser/processApplicationCandidates.mjs";
import { runApplicationIntegrationGateChecks } from "../src/gateChecks/applicationIntegrationChecks.mjs";
import { rebuildApprovedKnowledge } from "../src/knowledge/approvedKnowledgeStore.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const pdfPath = path.join(rootDir, "input", "book1.pdf");
const definitionCasePath = path.join(rootDir, "output", "cases", "foreign-currency-definition.json");
const applicationOutputPath = path.join(rootDir, "output", "cases", "foreign-currency-application.json");

try {
  const applicationCase = await runForeignCurrencyApplicationCandidates({
    pdfPath,
    definitionCasePath,
    outputPath: applicationOutputPath,
  });
  const definitionCase = JSON.parse(await readFile(definitionCasePath, "utf8"));

  const { applicationCase: processedApplicationCase, definitionCase: processedDefinitionCase } =
    processApplicationCandidates({ applicationCase, definitionCase });

  const gateResult = runApplicationIntegrationGateChecks({
    applicationCase: processedApplicationCase,
    definitionCase: processedDefinitionCase,
  });
  if (!gateResult.ok) {
    console.error("gateChecks failed(fail-closed): foreign-currency-definition.jsonは更新していません");
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
