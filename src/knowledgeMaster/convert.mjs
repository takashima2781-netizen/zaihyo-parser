// Intermediate JSON（Book/Group部分木）→ Knowledge Master骨格（v0.5.0-draft）への変換。
// docs/knowledge_master_design.md（コアモデル）／docs/knowledge_master_prototype_plan.md（本プロトタイプの実装範囲）参照。
// Parser本体（src/parser）・既存Exporter（src/exporter）・validateCorpus.mjsは一切参照・変更しない。
//
// 本プロトタイプの実装範囲（プロトタイプ限定。一般化はしない）:
// - 1 Item : 1 Presentation のみを対象とする。presentations.length !== 1 のItemはmeta.unresolvedへ記録し、
//   存在すればpresentations[0]のみを変換する。
// - Presentation.typeは "fillBlank" | "trueFalse" | "freeText" の3種類のみ実装する。
//   "reorder"（実データに0件）は変換せずmeta.unresolvedへ記録する。
// - AnswerRequirement.target/purpose/outputForm/requiredDepthとQuestion.canonicalQuestionIdは常にnull（推測しない）。
// - AnswerRequirementはオブジェクト全体のconfidenceを持たない（v0.5で廃止。フィールドごとの確定度が
//   異なるため、単一値は実態を表さないと判断した。design doc 5章参照）。
// - Evidenceは常にkind（"question"|"answer"|"explanation"）を持ち、excerptが空文字列の場合は生成しない。

function isNonEmptyText(text) {
  return typeof text === "string" && text.trim().length > 0;
}

function makeIdFactory() {
  const counters = {};
  return function nextId(prefix) {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${counters[prefix]}`;
  };
}

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

// Source.corpusRef.parserVersion: 部分木内のGroup/CheckBlock/Itemが持つparsed.parserVersionを
// すべて集め、単一値に統一されている場合のみ採用する（推測しない。混在時はnull）。
function determineParserVersion(groups) {
  const versions = new Set();
  function walk(gs) {
    for (const g of gs) {
      if (g.parsed?.parserVersion) versions.add(g.parsed.parserVersion);
      for (const cb of g.checkBlocks) {
        if (cb.parsed?.parserVersion) versions.add(cb.parsed.parserVersion);
        for (const q of cb.questions) {
          for (const it of q.items) {
            if (it.parsed?.parserVersion) versions.add(it.parsed.parserVersion);
          }
        }
      }
      walk(g.children);
    }
  }
  walk(groups);
  return versions.size === 1 ? [...versions][0] : null;
}

// presentation.answerRef(s) を、order→AnswerUnit.id の対応表から解決する。
// 本プロトタイプはfillBlank/trueFalse/freeTextのみ対応（3章参照）。reorder等は未対応としてnullを返す。
function resolveAnswerUnitIds(presentation, answerUnitIdByOrder, item, flagUnresolved) {
  function idsFor(orders) {
    const ids = [];
    for (const order of orders) {
      const id = answerUnitIdByOrder.get(order);
      if (!id) {
        flagUnresolved(`item:${item.id}`, `presentation(${presentation.type})のanswerRef=${order}に対応するAnswerUnitが見つからない`);
        return null;
      }
      ids.push(id);
    }
    return ids;
  }

  if (presentation.type === "trueFalse" || presentation.type === "fillBlank") {
    return idsFor([presentation.answerRef]);
  }
  if (presentation.type === "freeText") {
    return idsFor(presentation.answerRefs);
  }
  flagUnresolved(`item:${item.id}`, `presentation.type="${presentation.type}"は本プロトタイプで未実装（fillBlank/trueFalse/freeTextのみ対応）`);
  return null;
}

export function convertBookToKnowledgeMaster(book, { schemaVersion, builtBy }) {
  const nextId = makeIdFactory();
  const unresolved = [];
  const flagUnresolved = (locator, reason) => unresolved.push({ locator, reason });

  const parserVersion = determineParserVersion(book.groups);
  if (parserVersion === null) {
    flagUnresolved(`book:${book.id}`, "parsed.parserVersionが複数種類混在しているため、Source.corpusRef.parserVersionを確定できなかった");
  }

  const sourceId = nextId("source");
  const source = {
    id: sourceId,
    title: book.title,
    corpusRef: {
      bookId: book.id,
      schemaVersion,
      parserVersion,
    },
  };

  const evidence = [];
  const answerUnits = [];
  const questions = [];

  for (const item of collectItemsFlat(book.groups)) {
    if (!item.parsed) {
      flagUnresolved(`item:${item.id}`, "parsedがnullのため変換対象外");
      continue;
    }
    if (!item.raw.answers || item.raw.answers.length === 0) {
      flagUnresolved(`item:${item.id}`, "raw.answersが空（解答未リンク）のため変換対象外");
      continue;
    }

    // Evidence: 問題文（raw.question[]の全要素、kind:"question"。variantsを1件に絞らない）
    const promptEvidenceIds = [];
    for (const q of item.raw.question) {
      if (!isNonEmptyText(q.text)) {
        flagUnresolved(`item:${item.id}`, "raw.question[]のtextが空文字列のためEvidence化しなかった");
        continue;
      }
      const id = nextId("ev");
      evidence.push({ id, itemId: item.id, kind: "question", answerOrder: null, excerpt: q.text, excerptSource: "raw" });
      promptEvidenceIds.push(id);
    }

    // Evidence + AnswerUnit: parsed.answers[]（rawIndexでraw.answers[]と対応）から1件ずつ生成、kind:"answer"
    const answerUnitIdByOrder = new Map();
    for (const parsedAnswer of item.parsed.answers) {
      const rawAnswer = item.raw.answers[parsedAnswer.rawIndex];
      if (!rawAnswer) {
        flagUnresolved(
          `item:${item.id}`,
          `parsed.answers[].rawIndex=${parsedAnswer.rawIndex}に対応するraw.answersが見つからない`
        );
        continue;
      }
      if (!isNonEmptyText(rawAnswer.text.text)) {
        flagUnresolved(`item:${item.id}`, "raw.answers[].text.textが空文字列のためAnswerUnit/Evidence化しなかった");
        continue;
      }
      const evId = nextId("ev");
      evidence.push({
        id: evId,
        itemId: item.id,
        kind: "answer",
        answerOrder: parsedAnswer.order,
        excerpt: rawAnswer.text.text,
        excerptSource: "raw",
      });

      const auId = nextId("au");
      answerUnits.push({ id: auId, sourceId, order: parsedAnswer.order, evidenceId: evId });
      answerUnitIdByOrder.set(parsedAnswer.order, auId);
    }

    // Evidence: 備考（存在し、かつ空文字列でない場合のみ）、kind:"explanation"。
    // AnswerUnit/Questionからは参照しない（将来利用のための保持）。
    if (item.raw.explanation && isNonEmptyText(item.raw.explanation.text)) {
      evidence.push({
        id: nextId("ev"),
        itemId: item.id,
        kind: "explanation",
        answerOrder: null,
        excerpt: item.raw.explanation.text,
        excerptSource: "raw",
      });
    }

    // Question: 本プロトタイプは1 Presentationのみ対象（3章参照）
    if (item.presentations.length === 0) {
      flagUnresolved(`item:${item.id}`, "presentationsが空のため変換対象外");
      continue;
    }
    if (item.presentations.length > 1) {
      flagUnresolved(
        `item:${item.id}`,
        `presentationsが${item.presentations.length}件（本プロトタイプの対象外。presentations[0]のみ変換）`
      );
    }

    const presentation = item.presentations[0];
    const answerUnitIds = resolveAnswerUnitIds(presentation, answerUnitIdByOrder, item, flagUnresolved);
    if (answerUnitIds === null) continue;

    questions.push({
      id: nextId("q"),
      sourceId,
      itemId: item.id,
      presentationIndex: 0,
      promptEvidenceIds,
      requirement: {
        target: null,
        operation: presentation.type,
        purpose: null,
        requiredCount: answerUnitIds.length,
        outputForm: null,
        requiredDepth: null,
        notes:
          "knowledge-master-converter-prototype: target/purpose/outputForm/requiredDepthは本プロトタイプでは常にnull",
      },
      answerUnitIds,
      canonicalQuestionId: null,
    });
  }

  return {
    meta: { schemaVersion: "0.5.0-draft", status: "provisional", builtBy, unresolved },
    sources: [source],
    evidence,
    answerUnits,
    questions,
  };
}
