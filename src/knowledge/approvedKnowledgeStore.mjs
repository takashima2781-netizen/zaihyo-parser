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

  const approved = [];
  for (const fileName of fileNames.filter((name) => name.endsWith(".json")).sort()) {
    const caseData = JSON.parse(
      await readFile(path.join(casesDir, fileName), "utf8"),
    );
    const dkc = caseData.derivedKnowledgeCandidate;
    if (dkc && dkc.reviewStatus === "approved") {
      approved.push({
        approvedAt: dkc.reviewedAt,
        sourceCase: caseData.case,
        knowledge: dkc.knowledge,
      });
    }
  }

  const result = { knowledge: approved };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  return result;
}
