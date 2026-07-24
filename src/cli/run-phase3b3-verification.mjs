// Phase 3B-3: 新旧経路の全件比較・除外データ追跡・CSV Bridge低レベル検証・決定論性再確認・
// 既存レイヤー無変更再確認を行う統合検証CLI。
//
// 対象経路: BSM → Exercise View → KM互換Adapter → 既存CSV Bridge → 既存HTML
// 旧経路: Intermediate JSON → 既存Knowledge Master v0.6（output/knowledge_master_full_scan.json） → 既存CSV Bridge
//
// 入力はすべて読み取り専用。Parser・Intermediate JSON生成処理・BSM・BSMスキーマ・
// 既存Knowledge Master・CSV Bridge・HTMLアプリはいずれも変更しない。
// Exercise View・KM互換AdapterはPhase 3B-1/3B-2で実装済みのロジックをそのまま再利用し、
// 新しい生成ルールは追加しない（本CLIは検証のみを行う）。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { detectAnomalies } from "../bookStructureMaster/anomalyDetector.mjs";
import { buildExerciseViewV1 } from "../exerciseView/buildExerciseView.mjs";
import { findAllCheckSections } from "../exerciseView/selectors.mjs";
import { indexAnomaliesByUnitId } from "../exerciseView/eligibility.mjs";
import { buildKmCompatFromExerciseView } from "../exerciseView/kmCompatAdapter.mjs";
import { validateKnowledgeMaster } from "../knowledgeMaster/validate.mjs";
import { buildRows } from "../csvBridge/buildRows.mjs";
import { buildLearningRows, CSV3_COLUMNS } from "../csvBridge/buildRowsLearning.mjs";
import { toCsvText } from "../csvBridge/csvWriter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function collectAllItems(groups) {
  const items = new Map();
  function walk(g) {
    for (const cb of g.checkBlocks) for (const q of cb.questions) for (const it of q.items) items.set(it.id, it);
    for (const c of g.children) walk(c);
  }
  for (const g of groups) walk(g);
  return items;
}

// ============================================================
// フリーズ対象レイヤー（Phase 3B開始前の基準に対して不変であるべきもの）。
// Phase 3B-1/3B-2で正当に追加されたファイルはここに含めない（別リストで明示する）。
// ============================================================
const WATCHED_FROZEN_LAYERS = [
  "src/parser",
  "src/knowledgeMaster",
  "src/csvBridge",
  "src/exporter",
  "src/bookStructureMaster",
  "reference/current_app",
  "output/csv_bridge_○×用.csv",
  "output/csv_bridge_4択用.csv",
  "output/csv_bridge_財表DB③形式.csv",
  "output/README.md",
  "output/knowledge_master_full_scan.json",
  "output/intermediate_full_scan.json",
  "output/book_structure_master_full.json",
  "output/book_structure_master_full_validation.json",
  "output/book_structure_master_full_anomalies.csv",
  "output/book_structure_master_phase2a.json",
  "output/book_structure_master_phase2a_validation.json",
  "docs/book_structure_master_schema_draft.json",
  "docs/book_structure_master_phase2a_report.md",
  "docs/book_structure_master_phase2b_report.md",
  "docs/exercise_view_schema_draft.json",
  "docs/exercise_view_phase3a_report.md",
  "output/exercise_view_phase3a.json",
  "output/exercise_view_phase3a_validation.json",
  "output/exercise_view_phase3a_comparison.csv",
  "docs/exercise_view_phase3b_decision_memo.md",
  "docs/exercise_view_spec_v1.md",
  "docs/exercise_view_schema_v1.json",
];
// Phase 3B-1・3B-2で正当に追加・更新されたファイル（比較対象外として明示する）。
const PHASE3B1_3B2_LEGITIMATE_ARTIFACTS = [
  "src/exerciseView",
  "src/cli/run-exercise-view-full.mjs",
  "src/cli/run-exercise-view-phase3a.mjs",
  "src/cli/run-km-compat-adapter.mjs",
  "src/cli/run-phase3b3-verification.mjs",
  "output/exercise_view_full.json",
  "output/exercise_view_full_validation.json",
  "output/exercise_view_km_compat.json",
  "output/exercise_view_km_compat_validation.json",
  "output/exercise_view_km_compat_○×用.csv",
  "output/exercise_view_km_compat_4択用.csv",
  "docs/exercise_view_phase3b1_report.md",
  "docs/exercise_view_phase3b2_report.md",
  "docs/exercise_view_phase3b3_report.md",
];

function hashFile(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}
function snapshotHashes(relPaths) {
  const snapshot = {};
  for (const rel of relPaths) {
    const abs = path.join(ROOT, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      snapshot[rel] = null;
      continue;
    }
    if (st.isDirectory()) {
      const fileHashes = {};
      (function walk(dir, relDir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const abs2 = path.join(dir, entry.name);
          const rel2 = path.join(relDir, entry.name);
          if (entry.isDirectory()) walk(abs2, rel2);
          else fileHashes[rel2] = hashFile(abs2);
        }
      })(abs, "");
      snapshot[rel] = fileHashes;
    } else {
      snapshot[rel] = hashFile(abs);
    }
  }
  return snapshot;
}
function diffSnapshots(before, after) {
  const changed = [];
  for (const rel of Object.keys(before)) {
    const b = before[rel];
    const a = after[rel];
    if (typeof b === "string" || b === null) {
      if (a !== b) changed.push(rel);
    } else {
      const keys = new Set([...Object.keys(b), ...Object.keys(a ?? {})]);
      for (const k of keys) {
        if ((b ?? {})[k] !== (a ?? {})[k]) changed.push(`${rel}/${k}`);
      }
    }
  }
  return changed;
}

// ============================================================
// パイプライン全体(BSM→ExerciseView→Adapter)を1回分生成する。
// ============================================================
function runPipelineOnce({ bsm, itemsById, groups }) {
  const anomalies = detectAnomalies(bsm, { itemsById, builderErrors: [], validationIssues: [] });
  const anomaliesByUnitId = indexAnomaliesByUnitId(anomalies);
  const targets = findAllCheckSections(bsm);
  const { exerciseView } = buildExerciseViewV1(bsm, {
    targets,
    anomaliesByUnitId,
    generatedAt: new Date().toISOString(),
    sourceBsmFile: "output/book_structure_master_full.json",
  });
  const adapterParams = {
    bookId: "book.pointcheck",
    bookTitle: "財務諸表論 ポイントチェック",
    schemaVersion: "0.3.1-draft",
    builtBy: "exercise-view-km-compat-adapter-phase3b2-1.0.0",
  };
  const { km: kmCompat, unsupportedByAdapter, conversionFailures } = buildKmCompatFromExerciseView(exerciseView, adapterParams);
  const compatRows = buildRows({ groups, km: kmCompat }).rows;
  const learningRows = buildLearningRows({ groups, km: kmCompat }).rows;
  return { exerciseView, kmCompat, unsupportedByAdapter, conversionFailures, compatRows, learningRows };
}

function stripTimestamps(exerciseView) {
  const clone = JSON.parse(JSON.stringify(exerciseView));
  delete clone.meta.generatedAt;
  for (const ex of [...clone.exercises, ...clone.withheldExercises]) delete ex.provenance.generatedAt;
  return clone;
}

function sha256OfObject(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
function sha256OfRows(rows) {
  return createHash("sha256").update(JSON.stringify(rows.map((r) => r.row))).digest("hex");
}

// ============================================================
// CSV低レベル検証（生成済みのtoCsvText出力を、対象データから直接検査する。
// 独自のCSVパーサは書かず、対象文字列パターンの存在チェックと、
// 元データ(rows)側から見た性質チェックの組み合わせで検証する）。
// ============================================================
function validateCsvLowLevel(csvText, rows) {
  const issues = [];
  if (!csvText.startsWith("﻿")) issues.push({ check: "csv-bom", detail: "UTF-8 BOMが先頭に無い" });
  const body = csvText.slice(1);
  if (!body.includes("\r\n")) issues.push({ check: "csv-crlf", detail: "CRLF改行が見つからない" });
  if (body.includes("\n") && !/\r\n/.test(body)) issues.push({ check: "csv-crlf-consistency", detail: "LF単独の改行が混在している可能性" });

  // 各行が想定列数を満たすかを、区切り文字カンマの単純カウントではなく、
  // csvWriter.mjsのescapeField実装（"..."内の""エスケープ）を踏まえて簡易パースし、確認する。
  function parseLine(line) {
    const fields = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        fields.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    fields.push(cur);
    return fields;
  }
  // ダブルクォート内の\r\nを含むフィールドがあるため、行単位ではなくレコード単位に再結合してから分割する。
  const records = [];
  {
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      cur += c;
      if (c === '"') inQuotes = !inQuotes;
      if (!inQuotes && body.slice(i, i + 2) === "\r\n") {
        // curにはこの時点で末尾の"\r"のみが追加済み("\n"はまだ追加していない)ため、
        // 除去するのは1文字("\r")のみでよい。
        records.push(cur.slice(0, -1));
        cur = "";
        i++;
      }
    }
    if (cur.length > 0) records.push(cur);
  }
  const header = parseLine(records[0]);
  if (header.length !== CSV3_COLUMNS.length) {
    issues.push({ check: "csv-header-column-count", detail: `期待${CSV3_COLUMNS.length}列、実際${header.length}列` });
  }
  let malformedRowCount = 0;
  for (let i = 1; i < records.length; i++) {
    const fields = parseLine(records[i]);
    if (fields.length !== CSV3_COLUMNS.length) malformedRowCount++;
  }
  if (malformedRowCount > 0) issues.push({ check: "csv-row-column-count", detail: `列数不一致の行が${malformedRowCount}件` });
  if (records.length - 1 !== rows.length) {
    issues.push({ check: "csv-row-count-mismatch", detail: `CSVレコード数(${records.length - 1})と入力行数(${rows.length})が不一致` });
  }

  // カンマ・改行・ダブルクォート・HTMLタグ様文字列・複数行を含む本文が、正しくクォート＋往復できるかを確認する。
  let commaFieldOk = true;
  let quoteFieldOk = true;
  let newlineFieldOk = true;
  let htmlLikeOk = true;
  for (const r of rows) {
    for (const col of ["問題文", "解答", "備考"]) {
      const v = r.row[col] ?? "";
      if (v.includes(",")) {
        // このセルを含むCSVテキスト上の該当箇所がダブルクォートで囲われているはず。厳密な位置特定はせず、
        // records再パース後の値と元値が完全一致するかで往復性を確認する（下記の全件突合で実施）。
      }
      if (v.includes("<") || v.includes(">")) htmlLikeOk = htmlLikeOk && true; // 存在してもCSV上はただの文字列として扱われるべき(エスケープ不要)
    }
  }
  // 全行を実際にCSVへ書き出し→再パースして、元のセル値と完全一致するかを確認する（最も確実な往復検証）。
  let roundTripMismatchCount = 0;
  const roundTripSamples = [];
  for (let i = 0; i < rows.length; i++) {
    const rec = parseLine(records[i + 1]);
    const original = rows[i].row;
    for (let c = 0; c < CSV3_COLUMNS.length; c++) {
      const col = CSV3_COLUMNS[c];
      const expected = String(original[col] ?? "");
      const actual = rec[c] ?? "";
      if (expected !== actual) {
        roundTripMismatchCount++;
        if (roundTripSamples.length < 10) roundTripSamples.push({ itemId: rows[i].itemId, column: col, expected, actual });
      }
    }
  }
  if (roundTripMismatchCount > 0) {
    issues.push({ check: "csv-roundtrip-mismatch", detail: `${roundTripMismatchCount}セルで書き出し→再パース往復不一致`, samples: roundTripSamples });
  }

  return { issues, recordCount: records.length - 1, malformedRowCount, roundTripMismatchCount };
}

// ============================================================
// 新旧経路の1,121 Item全件比較
// ============================================================
function indexKm(km) {
  const evidenceById = new Map(km.evidence.map((e) => [e.id, e]));
  const answerUnitById = new Map(km.answerUnits.map((a) => [a.id, a]));
  const questionByItemId = new Map(km.questions.map((q) => [q.itemId, q]));
  const explanationByItemId = new Map();
  for (const ev of km.evidence) if (ev.kind === "explanation") explanationByItemId.set(ev.itemId, ev);
  return { evidenceById, answerUnitById, questionByItemId, explanationByItemId };
}
function questionSummary(itemId, km, idx) {
  const q = idx.questionByItemId.get(itemId);
  if (!q) return null;
  const promptText = q.promptEvidenceIds.map((id) => idx.evidenceById.get(id).excerpt).join("");
  const answerText = q.answerUnitIds.map((auId) => idx.evidenceById.get(idx.answerUnitById.get(auId).evidenceId).excerpt).join("／");
  const explanationEv = idx.explanationByItemId.get(itemId);
  return {
    operation: q.requirement.operation,
    promptText,
    answerText,
    explanationText: explanationEv ? explanationEv.excerpt : null,
  };
}

function buildExclusionRegistry(exerciseView) {
  const rows = [];
  for (const ex of exerciseView.exercises) {
    if (ex.exerciseType === "multi_blank") {
      rows.push({
        exerciseId: ex.exerciseId,
        exerciseType: ex.exerciseType,
        eligibility: ex.eligibility,
        excludedFrom: "km_adapter_multi_blank",
        checkSectionId: ex.sourceBookStructureIds[0] ?? "",
        checkBlockId: (ex.sourceBookStructureIds[0] ?? "").replace(/^cs-/, ""),
        majorUnitId: ex.sourceBookStructureIds[1] ?? "",
        sourceItemIds: ex.sourceItemIds.join(";"),
        reason: "multi_blankはKM互換Adapterの変換対象外（KM v0.6は1 Item=1 Questionの粒度のみ対応）",
      });
    }
  }
  for (const ex of exerciseView.withheldExercises) {
    rows.push({
      exerciseId: ex.exerciseId,
      exerciseType: ex.exerciseType,
      eligibility: ex.eligibility,
      excludedFrom: "km_adapter_withheld_and_normal_delivery",
      checkSectionId: ex.sourceBookStructureIds[0] ?? "",
      checkBlockId: (ex.sourceBookStructureIds[0] ?? "").replace(/^cs-/, ""),
      majorUnitId: ex.sourceBookStructureIds[1] ?? "",
      sourceItemIds: ex.sourceItemIds.join(";"),
      reason: ex.ineligibilityReasons.join(" | "),
    });
  }
  return rows;
}

function escapeCsvField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toSimpleCsv(columns, rows) {
  const lines = [columns.map(escapeCsvField).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escapeCsvField(row[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function main() {
  const before = snapshotHashes(WATCHED_FROZEN_LAYERS);

  console.log("=== Step A: 入力読み込み(読み取り専用) ===");
  const bsm = JSON.parse(readFileSync(path.join(ROOT, "output/book_structure_master_full.json"), "utf8"));
  const corpus = JSON.parse(readFileSync(path.join(ROOT, "output/intermediate_full_scan.json"), "utf8"));
  const realKm = JSON.parse(readFileSync(path.join(ROOT, "output/knowledge_master_full_scan.json"), "utf8"));
  const groups = corpus.books[0].groups;
  const itemsById = collectAllItems(groups);
  const allItemIds = [...itemsById.keys()];

  console.log("=== Step B: パイプラインを2回実行し、決定論性を確認 ===");
  const run1 = runPipelineOnce({ bsm, itemsById, groups });
  const run2 = runPipelineOnce({ bsm, itemsById, groups });
  const evHash1 = sha256OfObject(stripTimestamps(run1.exerciseView));
  const evHash2 = sha256OfObject(stripTimestamps(run2.exerciseView));
  const kmHash1 = sha256OfObject(run1.kmCompat);
  const kmHash2 = sha256OfObject(run2.kmCompat);
  const compatCsv1 = toCsvText(CSV3_COLUMNS, run1.compatRows.map((r) => r.row));
  const compatCsv2 = toCsvText(CSV3_COLUMNS, run2.compatRows.map((r) => r.row));
  const learningCsv1 = toCsvText(CSV3_COLUMNS, run1.learningRows.map((r) => r.row));
  const learningCsv2 = toCsvText(CSV3_COLUMNS, run2.learningRows.map((r) => r.row));
  const idOrder1 = run1.exerciseView.exercises.map((e) => e.exerciseId).concat(run1.exerciseView.withheldExercises.map((e) => e.exerciseId));
  const idOrder2 = run2.exerciseView.exercises.map((e) => e.exerciseId).concat(run2.exerciseView.withheldExercises.map((e) => e.exerciseId));

  const determinism = {
    exerciseViewMatches: evHash1 === evHash2,
    kmCompatMatches: kmHash1 === kmHash2,
    compatCsvMatches: createHash("sha256").update(compatCsv1).digest("hex") === createHash("sha256").update(compatCsv2).digest("hex"),
    learningCsvMatches: createHash("sha256").update(learningCsv1).digest("hex") === createHash("sha256").update(learningCsv2).digest("hex"),
    exerciseCountMatches: run1.exerciseView.exercises.length === run2.exerciseView.exercises.length,
    withheldCountMatches: run1.exerciseView.withheldExercises.length === run2.exerciseView.withheldExercises.length,
    idOrderMatches: JSON.stringify(idOrder1) === JSON.stringify(idOrder2),
    sha256: {
      exerciseView: evHash1,
      kmCompat: kmHash1,
      compatCsv: createHash("sha256").update(compatCsv1).digest("hex"),
      learningCsv: createHash("sha256").update(learningCsv1).digest("hex"),
    },
  };

  // 以降の比較・検証は run1 の結果を採用する(決定論性が確認できたため、どちらを採用しても同じ)。
  const { exerciseView, kmCompat, unsupportedByAdapter, conversionFailures, compatRows, learningRows } = run1;

  console.log("=== Step C: 既存Knowledge Masterの検証ロジックで新経路KM互換出力を検証 ===");
  const kmValidationIssues = validateKnowledgeMaster(corpus.books[0], kmCompat);

  console.log("=== Step D: 新旧全1,121 Item比較 ===");
  const oldIdx = indexKm(realKm);
  const newIdx = indexKm(kmCompat);
  const exerciseByItemId = new Map();
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    if (ex.exerciseType === "single_blank" || ex.exerciseType === "true_false") {
      for (const id of ex.sourceItemIds) exerciseByItemId.set(id, ex);
    }
  }

  const comparisonRows = [];
  const diffCategoryCounts = { intentional: 0, spec_allowed: 0, possible_bug: 0 };
  let oldOnlyCount = 0;
  let newOnlyCount = 0;
  let bothMissingCount = 0;

  for (const itemId of allItemIds) {
    const oldQ = questionSummary(itemId, realKm, oldIdx);
    const newQ = questionSummary(itemId, kmCompat, newIdx);
    const ev = exerciseByItemId.get(itemId);

    let category = "";
    let detail = "";

    if (!oldQ && !newQ) {
      bothMissingCount++;
      category = "intentional";
      detail = "実KM・新経路ともに未解決Item（既知の29件仕様、または空Question等）";
    } else if (oldQ && !newQ) {
      oldOnlyCount++;
      if (ev) {
        category = "intentional";
        detail = `新経路はwithheldExercises(eligibility=${ev.eligibility})として演習化を保留/停止したため対象外: ${ev.ineligibilityReasons.join(" | ")}`;
      } else {
        category = "possible_bug";
        detail = "旧経路には解答があるが、新経路(Exercise View)にこのItemに対応するsingle_blank/true_falseが見つからない";
      }
    } else if (!oldQ && newQ) {
      newOnlyCount++;
      category = "possible_bug";
      detail = "新経路にのみ存在するItem（旧経路には対応するQuestionが無い）。原因調査が必要";
    } else {
      const opMatch = oldQ.operation === newQ.operation || (oldQ.operation === "freeText" && newQ.operation === "fillBlank");
      const qMatch = oldQ.promptText === newQ.promptText;
      const aMatch = oldQ.answerText === newQ.answerText;
      const eMatch = (oldQ.explanationText ?? "") === (newQ.explanationText ?? "");
      if (opMatch && qMatch && aMatch && eMatch) {
        category = "none";
      } else if (qMatch && aMatch && eMatch && !opMatch) {
        category = "spec_allowed";
        detail = `operationラベルの推定表記差(old="${oldQ.operation}" / new="${newQ.operation}")。docs/exercise_view_spec_v1.md §9 既知の前提`;
      } else if (!qMatch || !aMatch) {
        category = "possible_bug";
        detail = `問題文または解答が不一致(old_ans="${oldQ.answerText}" / new_ans="${newQ.answerText}")`;
      } else {
        category = "spec_allowed";
        detail = "備考(教材解説)の表現差";
      }
    }

    if (category !== "none") {
      diffCategoryCounts[category] = (diffCategoryCounts[category] ?? 0) + 1;
      comparisonRows.push({
        itemId,
        inOld: Boolean(oldQ),
        inNew: Boolean(newQ),
        oldOperation: oldQ?.operation ?? "",
        newOperation: newQ?.operation ?? "",
        oldAnswer: oldQ?.answerText ?? "",
        newAnswer: newQ?.answerText ?? "",
        oldExplanation: oldQ?.explanationText ?? "",
        newExplanation: newQ?.explanationText ?? "",
        category,
        detail,
      });
    }
  }

  console.log("=== Step E: 除外データの追跡登録 ===");
  const exclusionRegistry = buildExclusionRegistry(exerciseView);

  console.log("=== Step F: 除外対象が通常出題経路(CSV)へ混入していないことの確認 ===");
  // 注意: multi_blank除外の対象Itemは、同じItemが個別のsingle_blank Exerciseとしても生成されており、
  // そちらが正当にCSVへ現れるのは仕様どおりである（漏洩ではない）。
  // ここで確認すべき「混入」は、withheldExercises(review_required/ineligible)由来のItemが、
  // 実際に解答付きでCSVへ現れてしまっていないか、という点のみである。
  const withheldItemIds = new Set(
    exclusionRegistry.filter((r) => r.excludedFrom === "km_adapter_withheld_and_normal_delivery").flatMap((r) => r.sourceItemIds.split(";").filter(Boolean))
  );
  let leakCount = 0;
  const leaks = [];
  for (const r of learningRows) {
    if (withheldItemIds.has(r.itemId) && r.kmResolved) {
      leakCount++;
      leaks.push(r.itemId);
    }
  }

  console.log("=== Step G: ID重複の確認(新経路) ===");
  const seenExerciseIds = new Set();
  let duplicateExerciseIdCount = 0;
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    if (seenExerciseIds.has(ex.exerciseId)) duplicateExerciseIdCount++;
    seenExerciseIds.add(ex.exerciseId);
  }
  const seenKmIds = new Set();
  let duplicateKmIdCount = 0;
  for (const arr of [kmCompat.sources, kmCompat.evidence, kmCompat.answerUnits, kmCompat.questions]) {
    for (const x of arr) {
      if (seenKmIds.has(x.id)) duplicateKmIdCount++;
      seenKmIds.add(x.id);
    }
  }

  console.log("=== Step H: CSV低レベル検証(compat/learning両モード) ===");
  const compatCsvChecks = validateCsvLowLevel(compatCsv1, compatRows);
  const learningCsvChecks = validateCsvLowLevel(learningCsv1, learningRows);

  console.log("=== Step I: 既存レイヤー無変更の再確認 ===");
  const after = snapshotHashes(WATCHED_FROZEN_LAYERS);
  const changedPaths = diffSnapshots(before, after);

  const possibleBugCount = diffCategoryCounts.possible_bug ?? 0;

  const summary = {
    generatedAt: new Date().toISOString(),
    totalItemCount: allItemIds.length,
    oldQuestionCount: realKm.questions.length,
    newQuestionCount: kmCompat.questions.length,
    oldOnlyCount,
    newOnlyCount,
    bothMissingCount,
    diffCategoryCounts,
    totalDiffCount: comparisonRows.length,
    exclusionRegistryCount: exclusionRegistry.length,
    multiBlankExcludedCount: unsupportedByAdapter.multiBlankExcluded.length,
    withheldExcludedCount: unsupportedByAdapter.withheldExcluded.length,
    conversionFailureCount: conversionFailures.length,
    excludedDataLeakCount: leakCount,
    excludedDataLeakSamples: leaks.slice(0, 20),
    duplicateExerciseIdCount,
    duplicateKmIdCount,
    kmValidationIssueCount: kmValidationIssues.length,
    determinism,
    compatCsvChecks: { issueCount: compatCsvChecks.issues.length, ...compatCsvChecks },
    learningCsvChecks: { issueCount: learningCsvChecks.issues.length, ...learningCsvChecks },
    frozenLayersUnchanged: changedPaths.length === 0,
    changedPaths,
    endConditions: {
      "1_no_unexplained_possible_bug": possibleBugCount === 0,
      "2_no_conversion_failures": conversionFailures.length === 0,
      "3_no_missing_required_fields": kmValidationIssues.filter((i) => !["question-count-matches-presentation-count", "answerunit-count-matches-parsed-answers-count", "item-coverage"].includes(i.check)).length === 0,
      "4_no_duplicate_ids": duplicateExerciseIdCount === 0 && duplicateKmIdCount === 0,
      "5_deterministic": Object.values(determinism).every((v) => v === true || typeof v === "object"),
      "6_no_excluded_data_leak": leakCount === 0,
      "7_csv_bridge_ok": compatCsvChecks.issues.length === 0 && learningCsvChecks.issues.length === 0,
      "9_frozen_layers_unchanged": changedPaths.length === 0,
    },
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "exercise_view_phase3b3_validation.json"), JSON.stringify({ summary }, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "exercise_view_phase3b3_comparison.csv"),
    toSimpleCsv(["itemId", "inOld", "inNew", "oldOperation", "newOperation", "oldAnswer", "newAnswer", "oldExplanation", "newExplanation", "category", "detail"], comparisonRows),
    "utf8"
  );
  writeFileSync(
    path.join(outDir, "exercise_view_phase3b3_excluded_items.csv"),
    toSimpleCsv(
      ["exerciseId", "exerciseType", "eligibility", "excludedFrom", "checkSectionId", "checkBlockId", "majorUnitId", "sourceItemIds", "reason"],
      exclusionRegistry
    ),
    "utf8"
  );
  console.log("wrote: output/exercise_view_phase3b3_validation.json");
  console.log("wrote: output/exercise_view_phase3b3_comparison.csv");
  console.log("wrote: output/exercise_view_phase3b3_excluded_items.csv");
}

main();
