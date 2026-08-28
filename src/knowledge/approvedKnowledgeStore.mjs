// M4: 承認済みKnowledgeの派生ビュー(output/knowledge/approved-knowledge.json)
//
// `planning/m4_review_workflow_design.md`6-2節のとおり、正本は
// `output/cases/*.json`側の`derivedKnowledgeCandidate.reviewStatus`であり、
// このファイルは常に**全件再生成**する派生ビューである。承認時に個別追記は
// しない(二重管理によるドリフトを構造的に防ぐため)。
//
// M5(Exercise生成)は、このファイルだけを入力として読む想定であり、
// `output/cases/`配下(candidate/rejectedを含む生データ)には触れない。

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { checkIdUniqueness } from "../gateChecks/idUniquenessChecks.mjs";

/**
 * @param {string} rootDir
 * @returns {Promise<{ knowledge: Array<{ approvedAt: string, sourceCase: string, knowledge: object }> }>}
 */
export async function rebuildApprovedKnowledge(rootDir) {
  const casesDir = path.join(rootDir, "output", "cases");
  const outputPath = path.join(rootDir, "output", "knowledge", "approved-knowledge.json");

  let fileNames = [];
  try {
    fileNames = await readdir(casesDir);
  } catch {
    fileNames = [];
  }

  // `.test.json`(統合テストが書き出す一時ファイル)は対象外とする。実
  // ケースと同じ`case`/ID値を持つため、含めると下記のID一意性検証が
  // 常に(テスト実行環境では)失敗してしまう。
  const caseFileNames = fileNames
    .filter((name) => name.endsWith(".json") && !name.endsWith(".test.json"))
    .sort();

  const allCaseData = [];
  const approved = [];
  for (const fileName of caseFileNames) {
    const caseData = JSON.parse(
      await readFile(path.join(casesDir, fileName), "utf8"),
    );
    allCaseData.push(caseData);
    const dkc = caseData.derivedKnowledgeCandidate;
    if (dkc && dkc.reviewStatus === "approved") {
      approved.push({
        approvedAt: dkc.reviewedAt,
        sourceCase: caseData.case,
        knowledge: dkc.knowledge,
      });
    }
  }

  // fail-closed: 確定Source ID・Knowledge IDがケース横断で重複していないか
  // を、書き出す前に検証する(`planning/phase_c_readiness_assessment.md`
  // 4節)。教材投入量が増えるほど、命名衝突が静かにデータを壊すリスクが
  // 増すため、承認済みビューを再生成するこのタイミングで毎回確認する。
  const idCheck = checkIdUniqueness(allCaseData);
  if (!idCheck.ok) {
    throw new Error(`ID一意性検証に失敗した(fail-closed): ${idCheck.violations.join("; ")}`);
  }

  const result = { knowledge: approved };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  return result;
}
