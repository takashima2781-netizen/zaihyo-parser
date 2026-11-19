// テキストの教材構造 → 「読む」問題（exerciseType: reading）。
// shohizei/src/exerciseView/buildExerciseView.mjs の textExercises（と readingContentOf・splitAtNumberedHeadings）を
// 財表向けに複製したもの（2026-11-20、WISHLIST W-9。消費税側は変えない）。財表で変えたこと:
//   - 範囲を選ぶ画面の並びを 教材（テキスト名）→ テーマ → 節 にする（structure.book / theme / section）
//   - id・学習記録のキーは ztext: で始める（ポイントチェック・答練と重ならない）
//
// 原文の文字は変えない。表示用に位置合わせの空白を消し（displayText.mjs）、段落のつながり・字下げは
// 位置から決める（readingLayout.mjs）。図・表は画像（figures.json）を埋め込む。

import { layoutReadingLines } from "./readingLayout.mjs";
import { removeAlignmentSpacesMultiline, removeAlignmentSpacesInSegments } from "./displayText.mjs";

export const READING_GENERATOR = "zaihyo-texts-exercise-view-0.1";

function rawSpan(text, source, nodeId) {
  return {
    text: removeAlignmentSpacesMultiline(text),
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
    segments: removeAlignmentSpacesInSegments(line.segments ?? [{ kind: "text", text: line.text }]),
    frame: line.visual?.frame ?? "none",
    depth,
  };
}

// 節の中を ❶❷…（➊➋…）で始まる見出しの行で分ける。最初の見出しより前に中身があれば「はじめ」の部分にする。
const NUMBERED_HEADING = /^[\s　]*[❶-❿➊-➓]/;
export function splitAtNumberedHeadings(blocks) {
  const parts = [{ heading: null, blocks: [] }];
  for (const b of blocks) {
    if (b.kind === "line" && b.style === "heading" && NUMBERED_HEADING.test(b.text)) parts.push({ heading: b.text.trim().replace(/\s+/g, " "), blocks: [b] });
    else parts[parts.length - 1].blocks.push(b);
  }
  return parts.filter((pt, k) => k > 0 || pt.blocks.length > 0);
}

function readingContentOf(blocks, figuresById, diag) {
  const content = [];
  let run = [];
  const flush = () => {
    const layout = layoutReadingLines(run);
    if (run.length)
      content.push({
        kind: "lines",
        lines: run.map((b, i) => ({
          ...richLine(b, layout[i].depth),
          continues: layout[i].continues,
          ...(layout[i].rowJoin ? { rowJoin: true } : {}),
          ...(layout[i].indent ? { indent: layout[i].indent } : {}),
          heading: b.style === "heading",
        })),
      });
    run = [];
  };
  for (const b of blocks) {
    if (b.kind === "line") run.push(b);
    else {
      flush();
      const img = figuresById.get(b.id);
      if (!img) {
        diag.push({ reason: "text-figure-missing", figure: b.id });
        continue;
      }
      content.push({ kind: "figure", src: `data:image/jpeg;base64,${img.jpegBase64}`, width: img.width, height: img.height, page: b.page });
    }
  }
  flush();
  return content;
}

function themeTitleOf(session, theme) {
  const base = theme.parsed.no === "unknown" ? "（テーマの前）" : `テーマ${theme.parsed.no} ${theme.parsed.titleRaw === "unknown" ? "" : theme.parsed.titleRaw}`.trim();
  // 回・編がある本（上級テキスト・直前対策テキスト）は、どの回・編のテーマかを頭に付ける
  return session.parsed.no === "main" ? base : `${session.parsed.raw} ${base}`;
}

export function buildReadingExercises(structure, figures, bookTitle, { diag = [] } = {}) {
  const bookId = structure.meta.bookId;
  const figuresById = new Map(figures.map((f) => [f.id, f]));
  const exercises = [];
  const provenance = { generator: READING_GENERATOR, sourceKind: "zaihyo_text_structure", bookId };
  const bookNode = structureNode(`ztext:${bookId}`, bookTitle);
  for (const session of structure.children) {
    for (const theme of session.children) {
      const themeTitle = themeTitleOf(session, theme);
      const themeNode = structureNode(`ztext:${bookId}:${session.parsed.no}:${theme.parsed.no}:${theme.id}`, themeTitle);
      for (const sec of theme.children) {
        const title = [sec.parsed.codeRaw, sec.parsed.titleRaw].filter(Boolean).join(" ");
        const parts = splitAtNumberedHeadings(sec.blocks);
        const outline = parts.map((pt) => pt.heading);
        const sectionNode = structureNode(`ztext:${sec.stableId}`, title);
        parts.forEach((pt, k) => {
          const content = readingContentOf(pt.blocks, figuresById, diag);
          if (content.length === 0) return;
          const stableId = `ztext:${parts.length === 1 ? sec.stableId : `${sec.stableId}:part-${k + 1}`}`;
          const path = [bookNode, themeNode, sectionNode].map((n) => n.structureNodeId);
          exercises.push({
            exerciseId: `${stableId}:reading`,
            exerciseType: "reading",
            sourceBookStructureIds: [],
            sourceItemIds: [stableId],
            stableItemIds: [stableId],
            contentFingerprints: [],
            prompt: rawSpan(pt.heading ? `${title} ${pt.heading}` : title, sec.source[0], sec.id),
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
            structurePath: path,
            structure: { book: bookNode, theme: themeNode, section: sectionNode, topic: sectionNode },
            instructionRaw: null,
            generationRule: null,
            eligibility: "eligible",
            ineligibilityReasons: [],
            provenance,
            reviewOverride: null,
            readingContent: content,
            readingMeta: {
              bookTitle,
              themeTitle,
              sectionTitle: title,
              partTitle: pt.heading,
              part: k + 1,
              parts: parts.length,
              outline: outline.map((h) => h ?? "（はじめ）"),
            },
          });
        });
      }
    }
  }
  return exercises;
}
