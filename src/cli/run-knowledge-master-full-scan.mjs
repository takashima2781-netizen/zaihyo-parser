// Knowledge Master v0.5.0-draft を全328ページ（1,121 Item）へ適用し、データ分布を調査するCLI。
// src/knowledgeMaster/convert.mjs・validate.mjs・docs/knowledge_master_design.mdは一切変更しない
// （テーマ4プロトタイプで確定したベースラインをそのまま全件に適用するだけ）。
// 本ファイルは「生成結果の集計・分析」のみを責務とし、purpose/target/outputForm/requiredDepthの
// 推測ロジックは一切追加しない。Parser本体・CSV Exporter・HTMLアプリには接続しない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { convertBookToKnowledgeMaster } from "../knowledgeMaster/convert.mjs";
import { validateKnowledgeMaster } from "../knowledgeMaster/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function collectItemsFlat(groups) {
  const items = [];
  function walk(gs) {
    for (const g of gs) {
      for (const cb of g.checkBlocks) {
        for (const q of cb.questions) {
          for (const it of q.items) items.push(it);
        }
      }
      walk(g.children);
    }
  }
  walk(groups);
  return items;
}

function countGroupsCheckBlocksQuestions(groups) {
  let groupCount = 0,
    checkBlockCount = 0,
    questionCount = 0; // Intermediate JSON側の「問N」単位
  function walk(gs) {
    for (const g of gs) {
      groupCount++;
      for (const cb of g.checkBlocks) {
        checkBlockCount++;
        questionCount += cb.questions.length;
      }
      walk(g.children);
    }
  }
  walk(groups);
  return { groupCount, checkBlockCount, questionCount };
}

function distributionOf(counts) {
  // counts: number[]。度数分布（キー=値, 値=件数）を昇順キーで返す。
  const dist = {};
  for (const n of counts) dist[n] = (dist[n] ?? 0) + 1;
  return Object.fromEntries(Object.entries(dist).sort((a, b) => Number(a[0]) - Number(b[0])));
}

// KM側unresolvedのlocatorは convert.mjs が一貫して "item:${item.id}" 形式で出力する。
// ここから対象Item idを抽出する（string-parseだが、convert.mjsの出力形式は固定であるため確実）。
function extractItemIdsFromKmUnresolved(unresolved) {
  const ids = new Set();
  for (const u of unresolved) {
    const m = u.locator.match(/^item:(.+)$/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

function main() {
  const corpusPath = path.join(ROOT, "output/intermediate_full_scan.json");
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const book = corpus.books[0];

  console.log("=== Step A: Intermediate JSON全体をKnowledge Masterへ変換 ===");
  const km = convertBookToKnowledgeMaster(book, {
    schemaVersion: corpus.meta.schemaVersion,
    builtBy: "knowledge-master-converter-fullscan-v1",
  });

  console.log("=== Step B: Validation ===");
  const validationIssues = validateKnowledgeMaster(book, km);
  const validationByCheck = {};
  for (const v of validationIssues) validationByCheck[v.check] = (validationByCheck[v.check] ?? 0) + 1;

  console.log("=== Step C: 分布集計 ===");
  const items = collectItemsFlat(book.groups);
  const { groupCount, checkBlockCount, questionCount } = countGroupsCheckBlocksQuestions(book.groups);

  // 1. Presentation種別 / operation分布（Parser側presentations.typeとKM側operationは
  //    convert.mjsの仕様上、常に同一値になるはずのため、両方集計してクロスチェックする）
  const presentationTypeCounts = {};
  for (const it of items) {
    for (const p of it.presentations) {
      presentationTypeCounts[p.type] = (presentationTypeCounts[p.type] ?? 0) + 1;
    }
  }
  const operationCounts = {};
  for (const q of km.questions) {
    const op = q.requirement.operation;
    operationCounts[op] = (operationCounts[op] ?? 0) + 1;
  }

  // 2. Evidence種別
  const evidenceKindCounts = {};
  for (const ev of km.evidence) evidenceKindCounts[ev.kind] = (evidenceKindCounts[ev.kind] ?? 0) + 1;

  // 3. questionsPerItem（Item.id → 生成されたQuestion数の分布）
  const questionCountByItemId = new Map();
  for (const it of items) questionCountByItemId.set(it.id, 0);
  for (const q of km.questions) {
    questionCountByItemId.set(q.itemId, (questionCountByItemId.get(q.itemId) ?? 0) + 1);
  }
  const questionsPerItemDist = distributionOf([...questionCountByItemId.values()]);

  // 4. answerUnitsPerItem（AnswerUnit→evidenceId→Evidence.itemIdを辿ってItemごとに集計）
  const evidenceById = new Map(km.evidence.map((e) => [e.id, e]));
  const answerUnitCountByItemId = new Map();
  for (const it of items) answerUnitCountByItemId.set(it.id, 0);
  for (const au of km.answerUnits) {
    const ev = evidenceById.get(au.evidenceId);
    if (!ev) continue; // validateで検出済みのはずだが念のため
    answerUnitCountByItemId.set(ev.itemId, (answerUnitCountByItemId.get(ev.itemId) ?? 0) + 1);
  }
  const answerUnitsPerItemDist = distributionOf([...answerUnitCountByItemId.values()]);

  // 5. Item.presentations.length の分布（複数Presentation実在確認、参考値）
  const presentationsLengthDist = distributionOf(items.map((it) => it.presentations.length));

  // 6. AnswerUnit共有（同一AnswerUnitを複数Questionが参照しているか）
  const questionIdsByAnswerUnitId = new Map();
  for (const q of km.questions) {
    for (const auId of q.answerUnitIds) {
      if (!questionIdsByAnswerUnitId.has(auId)) questionIdsByAnswerUnitId.set(auId, []);
      questionIdsByAnswerUnitId.get(auId).push(q.id);
    }
  }
  let sharedAnswerUnitCount = 0;
  let soleAnswerUnitCount = 0;
  const sharedAnswerUnitSamples = [];
  for (const [auId, qIds] of questionIdsByAnswerUnitId) {
    if (qIds.length > 1) {
      sharedAnswerUnitCount++;
      if (sharedAnswerUnitSamples.length < 20) sharedAnswerUnitSamples.push({ answerUnitId: auId, questionIds: qIds });
    } else {
      soleAnswerUnitCount++;
    }
  }

  // 7. unresolved比較（Parser側 vs Knowledge Master側、Item単位のみを対象とする）
  //    Parser側meta.unresolvedはページ単位・断片単位等の非Item粒度のエントリを含むため、
  //    全85件をそのままKM側と突き合わせることはしない。Item単位で機械的に判定できる
  //    「raw.answersが空」を基準としたParser側Item集合と、KM側unresolved locatorから
  //    抽出したItem集合とを比較する。
  const parserItemUnresolvedIds = new Set(items.filter((it) => !it.raw.answers || it.raw.answers.length === 0).map((it) => it.id));
  const kmItemUnresolvedIds = extractItemIdsFromKmUnresolved(km.meta.unresolved);
  const bothIds = [...parserItemUnresolvedIds].filter((id) => kmItemUnresolvedIds.has(id));
  const parserOnlyIds = [...parserItemUnresolvedIds].filter((id) => !kmItemUnresolvedIds.has(id));
  const kmOnlyIds = [...kmItemUnresolvedIds].filter((id) => !parserItemUnresolvedIds.has(id));

  const unresolvedComparison = {
    parserTotalUnresolvedEntries: corpus.meta.unresolved.length, // Parser側meta.unresolved全件（非Item粒度含む）
    parserItemLevelUnresolvedCount: parserItemUnresolvedIds.size, // うちItem単位で判定できるもの（raw.answers空）
    kmItemLevelUnresolvedCount: kmItemUnresolvedIds.size,
    bothCount: bothIds.length,
    parserOnlyCount: parserOnlyIds.length,
    parserOnlySamples: parserOnlyIds.slice(0, 20),
    kmOnlyCount: kmOnlyIds.length,
    kmOnlySamples: kmOnlyIds.slice(0, 20),
    note:
      "Parser側meta.unresolvedはページ単位・断片単位等の非Item粒度エントリを含むため、" +
      "ここではItem単位で機械的に判定できる範囲（raw.answersが空）のみをParser側の比較対象とした。",
  };

  const stats = {
    corpusCounts: { group: groupCount, checkBlock: checkBlockCount, question: questionCount, item: items.length },
    kmCounts: {
      source: km.sources.length,
      evidence: km.evidence.length,
      answerUnit: km.answerUnits.length,
      question: km.questions.length,
    },
    presentationTypeCounts,
    operationCounts,
    evidenceKindCounts,
    questionsPerItemDist,
    answerUnitsPerItemDist,
    presentationsLengthDist,
    answerUnitSharing: {
      soleAnswerUnitCount,
      sharedAnswerUnitCount,
      sharedAnswerUnitSamples,
    },
    unresolvedComparison,
    kmUnresolvedCount: km.meta.unresolved.length,
    validationIssueCount: validationIssues.length,
    validationByCheck,
  };

  console.log(JSON.stringify(stats, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "knowledge_master_full_scan.json"), JSON.stringify(km, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "knowledge_master_full_scan_validation.json"),
    JSON.stringify({ issues: validationIssues, summary: validationByCheck }, null, 2),
    "utf8"
  );
  writeFileSync(path.join(outDir, "knowledge_master_full_scan_stats.json"), JSON.stringify(stats, null, 2), "utf8");
  console.log("wrote: output/knowledge_master_full_scan.json");
  console.log("wrote: output/knowledge_master_full_scan_validation.json");
  console.log("wrote: output/knowledge_master_full_scan_stats.json");
}

main();
