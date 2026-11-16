// 第2層: 教材構造 → 学習アプリ（../html-v2）の Exercise View JSON。
//
// 今回作る問題（ユーザーの選択、2026-11-16「暗記と〇×から」）:
//   - true_false  … トレーニングの〇×の多問（(1)〜(n) の各取引を1問ずつ）
//   - recall_text … 理論マスターの条文を (1)(2) ごとに1枚の暗記カード（見出し → 本文を思い出す）
//                   と、トレーニングの「述べなさい」の問題
// それ以外（計算・3区分以上の振り分け・選ぶ・空欄）は今回は作らず、件数だけを diagnostics に残す。
//
// 原文は書き換えない。表示用の飾り（小さい字・点線枠・分数）は answerRich / guidanceRich に
// 教材構造の segments をそのまま渡す。プレーンな文字列（answerText 等）は行の text をつないだもの。

const SCHEMA_VERSION = "exercise-view-schema-v1.8.0";
const SUBJECT = "shohizei";

function rawSpan(text, source, nodeId) {
  return {
    text,
    source: source ? { documentId: source.doc, locator: `p.${source.page} line ${source.line}` } : null,
    bsmNodeId: nodeId ?? null,
    inherited: false,
  };
}

function structureNode(id, title) {
  return { structureNodeId: id, titleRaw: rawSpan(title, null, id) };
}

function richLine(line, depth = 0) {
  return {
    segments: line.segments ?? [{ kind: "text", text: line.text }],
    frame: line.visual?.frame ?? "none",
    depth,
  };
}

function baseExercise({ id, type, stableId, structure, structurePath, prompt, instructionRaw, provenance }) {
  return {
    exerciseId: id,
    exerciseType: type,
    sourceBookStructureIds: [],
    sourceItemIds: [stableId],
    stableItemIds: [stableId],
    contentFingerprints: [],
    prompt,
    body: null,
    choices: null,
    expectedAnswer: [],
    judgement: null,
    explanation: null,
    answerForm: null,
    withheldAnswerContent: null,
    structureType: null,
    subQuestions: null,
    bodySegments: null,
    structurePath,
    structure,
    instructionRaw,
    generationRule: null,
    eligibility: "eligible",
    ineligibilityReasons: [],
    provenance,
    reviewOverride: null,
  };
}

// ---- トレーニング ----

/** 問題文の (n) の行と、その折り返しの行をまとめる。【 】の小見出しは各問の前置きとして持つ。 */
function questionItems(problem) {
  const items = new Map();
  let groupHeading = null;
  let current = null;
  for (const l of problem.question.lines) {
    if (l.marker?.kind === "bracket-heading") {
      groupHeading = l;
      current = null;
      continue;
    }
    const m = l.marker?.kind === "paren-number" ? l.marker.raw.match(/[0-9０-９]+/) : null;
    if (m) {
      const no = Number(m[0].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
      current = { no, lines: [l], groupHeading };
      items.set(no, current);
    } else if (current) current.lines.push(l);
  }
  return items;
}

const toHalf = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 解答の〇×を問題番号ごとに集める。教材には2つの書き方がある:
 *   1) 1問1行: 「(n)  ○」「(n)  × 理由…」（理由は次の行へ折り返すことがある）
 *   2) まとめ書き: 「○ …… (1)、(4)、…」「× …… (2)、(3)、…」（番号の並びは次の行へ続くことがある）
 * 同じ番号が○にも×にも出る場合は、その番号を使わない（diag に残す）。
 */
function answerJudgements(problem, diag) {
  const out = new Map();
  let current = null;
  for (const l of problem.answer.lines) {
    if (l.judgement) {
      current = { judgement: l.judgement, lines: [l] };
      out.set(l.judgement.itemNo, current);
    } else if (current && !l.marker) current.lines.push(l);
    else current = null;
  }
  if (out.size > 0) return out;

  const grouped = new Map();
  let symbol = null;
  for (const l of problem.answer.lines) {
    const t = l.text.trim();
    const head = t.match(/^([○〇×])\s*[…‥・.\s]+(.*)$/);
    let listText;
    if (head) {
      symbol = head[1] === "〇" ? "○" : head[1];
      listText = head[2];
    } else if (symbol && /^[（(][0-9０-９]+[）)]/.test(t)) listText = t;
    else {
      symbol = null;
      continue;
    }
    for (const m of listText.matchAll(/[（(]\s*([0-9０-９]+)\s*[）)]/g)) {
      const no = Number(toHalf(m[1]));
      if (grouped.has(no) && grouped.get(no).judgement.symbol !== symbol) {
        grouped.get(no).conflict = true;
        continue;
      }
      grouped.set(no, { judgement: { itemNo: no, symbol, symbolRaw: symbol, reasonRaw: null }, lines: [l], grouped: true });
    }
  }
  for (const [no, v] of grouped) {
    if (v.conflict) {
      diag.push({ reason: "true-false-grouped-conflict", problem: problem.parsed.no, item: no });
      grouped.delete(no);
    }
  }
  return grouped;
}

function trainingExercises(structure, diag, bookTitles) {
  const bookId = structure.meta.bookId;
  const allProblems = structure.children.flatMap((s) => s.children);
  setRightEdgesFromLines(allProblems.flatMap((p) => [...(p.question?.lines ?? []), ...(p.answer?.lines ?? []), ...(p.guidance?.lines ?? [])]));
  const bookTitle = bookTitles[bookId] ?? bookId;
  const exercises = [];
  const provenance = { generator: "shohizei-exercise-view-0.1", sourceKind: "shohizei_training_structure", bookId };
  for (const session of structure.children) {
    const sessionTitle = session.raw ?? "（回の見出しなし）";
    for (const p of session.children) {
      const forms = p.question?.formCandidates.map((f) => f.form) ?? [];
      const theme = structureNode(`${bookId}`, bookTitle);
      const section = structureNode(`${bookId}:session-${session.parsed.no}`, sessionTitle);
      const topic = structureNode(p.stableId, `問題${p.parsed.no} ${p.parsed.titleRaw}`);
      const structureRef = { theme, section, topic };
      const path = [theme, section, topic].map((n) => n.structureNodeId);
      const guidanceRich = p.guidance ? richLines(p.guidance.lines) : null;
      const instructionRaw = p.question?.instructionRaw ? rawSpan(p.question.instructionRaw.replace(/\s*\n\s*/g, ""), p.source[1], p.id) : null;

      if (forms.includes("true_false_set")) {
        const items = questionItems(p);
        const answers = answerJudgements(p, diag);
        let made = 0;
        for (const [no, item] of items) {
          const a = answers.get(no);
          if (!a) {
            diag.push({ reason: "true-false-answer-not-found", problem: p.parsed.no, item: no });
            continue;
          }
          const bodyText = item.lines.map((l) => l.text.trim()).join("");
          const ex = baseExercise({
            id: `${p.stableId}:tf-${no}`,
            type: "true_false",
            stableId: `${p.stableId}:item-${no}`,
            structure: structureRef,
            structurePath: path,
            prompt: rawSpan((item.groupHeading ? item.groupHeading.text.trim() + "\n" : "") + bodyText, item.lines[0].source, p.id),
            instructionRaw,
            provenance,
          });
          ex.judgement = {
            symbolRaw: rawSpan(a.judgement.symbol, a.lines[0].source, p.id),
            answerBodyRaw: rawSpan(a.grouped ? a.judgement.symbol : a.lines.map((l) => l.text.trim()).join(""), a.lines[0].source, p.id),
          };
          const reason = a.grouped ? "" : [a.judgement.reasonRaw, ...a.lines.slice(1).map((l) => l.text.trim())].filter(Boolean).join("");
          ex.explanation = reason ? { raw: rawSpan(reason, a.lines[0].source, p.id), role: "reason" } : null;
          ex.guidanceRich = guidanceRich;
          exercises.push(ex);
          made += 1;
        }
        if (made === 0) diag.push({ reason: "true-false-no-items", problem: p.parsed.no });
        continue;
      }

      if (forms.includes("statement_recall") && p.answer) {
        const answerText = p.answer.lines.map((l) => l.text.trim()).join("\n");
        const ex = baseExercise({
          id: `${p.stableId}:recall`,
          type: "recall_text",
          stableId: p.stableId,
          structure: structureRef,
          structurePath: path,
          prompt: rawSpan(p.question.lines.map((l) => l.text.trim()).join("\n"), p.question.lines[0]?.source, p.id),
          instructionRaw: null,
          provenance,
        });
        ex.expectedAnswer = [{ answerText: rawSpan(answerText, p.answer.lines[0]?.source, p.id) }];
        ex.answerRich = richLines(p.answer.lines);
        ex.guidanceRich = guidanceRich;
        exercises.push(ex);
        continue;
      }

      diag.push({ reason: "form-not-converted-yet", problem: p.parsed.no, forms });
    }
  }
  return exercises;
}

// ---- 理論マスター ----

// PDFの行の折り返し: 前の行が版面の右端近くまで届いているときだけ、次の行をその続き
// （continues: true）とみなす。表示側はつなげて1段落にする（原文の行そのものは segments に残る）。
// 「① 定 義」のような短い見出し行の次の行はつなげない。
let rightEdgeByPage = new Map();
function setRightEdges(structure) {
  rightEdgeByPage = new Map();
  const visit = (n) => {
    for (const l of n.lines ?? []) {
      const k = `${l.source.doc}:${l.source.page}`;
      rightEdgeByPage.set(k, Math.max(rightEdgeByPage.get(k) ?? 0, l.source.bbox[2]));
    }
    for (const c of n.children ?? []) visit(c);
  };
  structure.children.forEach(visit);
}
function setRightEdgesFromLines(lines) {
  rightEdgeByPage = new Map();
  for (const l of lines) {
    const k = `${l.source.doc}:${l.source.page}`;
    rightEdgeByPage.set(k, Math.max(rightEdgeByPage.get(k) ?? 0, l.source.bbox[2]));
  }
}
/** 行の並びを表示用にする。行頭記号のある行は必ず新しい段落。 */
function richLines(lines, depth = 0) {
  return lines.map((l, i) => ({ ...richLine(l, depth), continues: i > 0 && !l.marker && reachesRightEdge(lines[i - 1]) }));
}
function reachesRightEdge(line) {
  const edge = rightEdgeByPage.get(`${line.source.doc}:${line.source.page}`);
  return edge != null && line.source.bbox[2] >= edge - 12;
}

function collectLines(node, depth, out) {
  const lines = node.lines ?? [];
  lines.forEach((l, i) => out.push({ ...richLine(l, depth), continues: i > 0 && reachesRightEdge(lines[i - 1]) }));
  for (const c of node.children ?? []) collectLines(c, depth + 1, out);
  return out;
}

function theoryExercises(structure, diag) {
  const bookId = structure.meta.bookId;
  setRightEdges(structure);
  const exercises = [];
  const provenance = { generator: "shohizei-exercise-view-0.1", sourceKind: "shohizei_theory_structure", bookId };
  for (const theme of structure.children) {
    const themeTitle = `理論マスター テーマ${theme.parsed.no} ${theme.parsed.titleRaw ?? ""}`.trim();
    const themeNode = structureNode(theme.stableId, themeTitle);
    for (const theory of theme.children) {
      if (theory.kind !== "theory") continue;
      const theoryTitle = `${theory.parsed.codeRaw} ${theory.parsed.titleRaw}`;
      const sectionNode = structureNode(theory.stableId, theoryTitle);
      theory.children.forEach((heading, hi) => {
        if (heading.kind === "supplement") {
          diag.push({ reason: "supplement-not-converted", theory: theory.parsed.code });
          return;
        }
        if (heading.kind !== "heading") return;
        const headingTitle = `${heading.parsed.markerRaw}${heading.parsed.titleRaw}`;
        const topicNode = structureNode(`${theory.stableId}:heading-${hi + 1}`, headingTitle);
        const structureRef = { theme: themeNode, section: sectionNode, topic: topicNode };
        const path = [themeNode, sectionNode, topicNode].map((n) => n.structureNodeId);

        // カードの単位: 見出しの下の (1)(2)… ごと。(1) が無い見出しは見出しごとに1枚。
        // ただし、(1) が1行だけで本文を持たない（列挙そのもの）場合や、(1) より前に見出し直属の本文が
        // ある場合は、分けると中身が欠けるので見出しごとに1枚にする。
        const units = heading.children.filter((c) => c.parsed?.marker?.kind === "paren-number");
        const unitHasBody = (u) => u.lines.length > 1 || u.children.length > 0;
        const splitByUnit =
          units.length > 0 && units.length === heading.children.length && units.every(unitHasBody) && (heading.lines?.length ?? 0) === 0;
        if (units.length > 0 && !splitByUnit) diag.push({ reason: "recall-card-per-heading-instead-of-unit", theory: theory.parsed.code, heading: hi + 1 });
        const cards = splitByUnit
          ? units.map((u) => ({ node: u, title: u.lines[0], rest: { lines: u.lines.slice(1), children: u.children } }))
          : [{ node: heading, title: null, rest: { lines: heading.lines, children: heading.children } }];
        cards.forEach((card, ci) => {
          const answerRich = collectLines(card.rest, 0, []);
          if (answerRich.length === 0) {
            diag.push({ reason: "recall-card-without-body", theory: theory.parsed.code, heading: hi + 1 });
            return;
          }
          const promptText = [theoryTitle, headingTitle, card.title ? card.title.text.trim() : null].filter(Boolean).join("\n");
          const stableId = card.title ? `${theory.stableId}:heading-${hi + 1}:unit-${ci + 1}` : `${theory.stableId}:heading-${hi + 1}`;
          const ex = baseExercise({
            id: `${stableId}:recall`,
            type: "recall_text",
            stableId,
            structure: structureRef,
            structurePath: path,
            prompt: rawSpan(promptText, card.title ? card.title.source : heading.source[0], card.node.id),
            instructionRaw: null,
            provenance,
          });
          ex.promptRich = card.title ? [richLine(card.title)] : null;
          ex.expectedAnswer = [{ answerText: rawSpan(answerRich.map((l) => l.segments.map((s) => s.text ?? "").join("")).join("\n"), null, card.node.id) }];
          ex.answerRich = answerRich;
          ex.recallMeta = { rankRaw: theory.parsed.rankRaw, importanceRaw: heading.parsed.importanceRaw };
          exercises.push(ex);
        });
      });
    }
  }
  return exercises;
}

// ---- 暗記カード → 並べ替え（ordering） ----
//
// ユーザーの選択（2026-11-16）: 暗記カードを並べ替え問題としても出す。
//   - ピースの区切り:「、」「。」の直後。区切りが無く2ピースに満たない本文だけ、文節で分ける
//     （財表の「並び替え問題に変換」と同じ html-v2/js/phraseSegmenter.js の autoSplitPhraseText）
//   - ピースが MAX_PIECES を超えるカードは、段落（①・イ などの行頭記号の切れ目）で2問以上に分ける
// ピースはつなげると必ず本文に戻る（文字を足したり消したりしない）。ただし表示と同じく、PDFの
// 折り返しの直前の空白だけは詰める。分数を含むカードは文字列にできないので作らない。

const MAX_PIECES = 12;

function paragraphsOf(card) {
  const paras = [];
  for (const line of card.answerRich) {
    if (line.segments.some((s) => s.kind === "fraction")) return null;
    const text = line.segments.map((s) => s.text ?? "").join("");
    if (line.continues && paras.length) {
      const last = paras[paras.length - 1];
      last.text = last.text.replace(/[ 　]+$/, "") + text;
    } else paras.push({ text });
  }
  return paras.map((p) => ({ text: p.text.replace(/^[ 　]+|[ 　]+$/g, "") })).filter((p) => p.text);
}

function splitByPunctuation(text) {
  return text.split(/(?<=[、。])/).filter((t) => t.trim() !== "");
}

function piecesOf(paragraphs, phraseSplit) {
  // 段落の終わりもピースの切れ目にする（段落をまたいでピースをつなげない）
  let pieces = paragraphs.flatMap((p) => splitByPunctuation(p.text).map((t) => ({ text: t, para: p })));
  let method = "punctuation";
  if (pieces.length < 2 && phraseSplit) {
    pieces = paragraphs.flatMap((p) => phraseSplit(p.text).map((t) => ({ text: t, para: p })));
    method = "phrase";
  }
  return { pieces, method };
}

/** 段落の並びを、ピースの数が MAX_PIECES 以下になるように順番どおり束ねる（1段落だけで超えるものはそのまま1束）。 */
function groupParagraphs(paragraphs, countOf) {
  const groups = [];
  let cur = [];
  let n = 0;
  for (const p of paragraphs) {
    const c = countOf(p);
    if (cur.length && n + c > MAX_PIECES) {
      groups.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(p);
    n += c;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function orderingFromRecall(card, diag, phraseSplit) {
  const paragraphs = paragraphsOf(card);
  if (!paragraphs) {
    diag.push({ reason: "ordering-skipped-fraction", card: card.exerciseId });
    return [];
  }
  const total = piecesOf(paragraphs, phraseSplit);
  if (total.pieces.length < 2) {
    diag.push({ reason: "ordering-skipped-too-few-pieces", card: card.exerciseId });
    return [];
  }
  const groups =
    total.pieces.length > MAX_PIECES && total.method === "punctuation"
      ? groupParagraphs(paragraphs, (p) => splitByPunctuation(p.text).length)
      : [paragraphs];
  const out = [];
  groups.forEach((group, gi) => {
    const { pieces, method } = piecesOf(group, phraseSplit);
    if (pieces.length < 2) {
      diag.push({ reason: "ordering-part-too-few-pieces", card: card.exerciseId, part: gi + 1 });
      return;
    }
    const partLabel = groups.length > 1 ? `（${gi + 1}／${groups.length}）` : "";
    const stableId = `${card.stableItemIds[0]}:order-${gi + 1}`;
    const items = pieces.map((p, i) => ({ id: `item-${i}`, label: String(i + 1), text: p.text }));
    const ex = baseExercise({
      id: `${stableId}:ordering`,
      type: "ordering",
      stableId,
      structure: card.structure,
      structurePath: card.structurePath,
      prompt: { ...card.prompt, text: card.prompt.text + partLabel },
      instructionRaw: { text: "本文になるように、下のピースを正しい順番に並べ替えなさい。", source: null, bsmNodeId: null, inherited: false },
      provenance: { ...card.provenance, derivedFrom: card.exerciseId },
    });
    ex.orderingItems = items;
    ex.correctOrder = items.map((it) => it.id);
    ex.assembledFromSource = true;
    ex.sourceExerciseId = card.exerciseId;
    ex.orderingMeta = { pieceSplit: method, part: gi + 1, parts: groups.length };
    out.push(ex);
    if (pieces.length > MAX_PIECES) diag.push({ reason: "ordering-part-over-max-pieces", card: card.exerciseId, part: gi + 1, pieces: pieces.length });
  });
  return out;
}

export function buildShohizeiExerciseView({ trainings = [], theories = [], bookTitles = {}, phraseSplit = null, generatedAt = new Date().toISOString() }) {
  const diagnostics = [];
  const base = [
    ...theories.flatMap((t) => theoryExercises(t, diagnostics)),
    ...trainings.flatMap((t) => trainingExercises(t, diagnostics, bookTitles)),
  ];
  // 並べ替えは、元の暗記カードのすぐ後ろに置く（範囲の中で教材の順に並ぶように）。
  const exercises = base.flatMap((ex) => (ex.exerciseType === "recall_text" ? [ex, ...orderingFromRecall(ex, diagnostics, phraseSplit)] : [ex]));
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      subject: SUBJECT,
      status: "shohizei-generated-draft",
      generatedAt,
      sourceBookStructureMasterPath: null,
      targetCheckBlockIds: [],
      generationRules: ["shohizei_true_false_v0.1", "shohizei_recall_text_v0.1", "shohizei_recall_to_ordering_v0.1"],
      exerciseCount: exercises.length,
      withheldExerciseCount: 0,
    },
    exercises,
    withheldExercises: [],
    diagnostics,
  };
}
