// Phase 2A: Intermediate JSONから、選定した対象CheckBlockのみを対象に
// Book Structure Master（docs/book_structure_master_schema_draft.json準拠）を組み立てる。
// Phase 2B: 同じマッピングロジックを、全CheckBlock（全1,121 Item）へ適用する
// buildBookStructureMasterFull() を追加する（buildBookStructureMasterPhase2Aの既存動作・
// 既存出力は一切変更しない）。
// Intermediate JSONは読み取り専用の入力として扱う（変更しない）。

import { selectTargetCheckBlocks, selectAllCheckBlocks } from "./selectors.mjs";
import { mapGroupToStructureNode, mapCheckBlockToCheckSection, buildQuestionUnitTree } from "./mappings.mjs";
import { assignStableItemIds } from "./stableItemId.mjs";

// stableItemId(Phase 3D-1/F2)は教材全体（全1,121 Item）を対象に一括算出する。
// Phase 2A（対象4 CheckBlockのみ）でも、全件を対象にstableIdsByIdを算出してから該当分だけを
// 使うことで、Phase 2AとFullとで同じItemに常に同じstableItemIdが割り当たることを保証する
// （occurrenceOrdinalは対象範囲ではなく教材全体での出現順に基づくため）。
function computeStableIdsForWholeBook(book) {
  const allItems = selectAllCheckBlocks(book).flatMap(({ checkBlock }) => checkBlock.questions.flatMap((q) => q.items));
  return assignStableItemIds(allItems);
}

// 複数のCheckBlockが同じ祖先Group（テーマ・節・項目）を共有する場合、
// StructureNodeを共有元ごとに1回だけ生成し、重複を作らない（3章「共有情報は1箇所だけ保持する」の
// 実践）。Phase 2A・Phase 2B共通のロジック。
export function buildMergedStructure(selections) {
  const nodeCache = new Map(); // group.id -> { node, childOrder: string[] (group.id), childrenByGroupId: Map }
  const roots = [];
  const rootOrder = [];

  function getOrCreateEntry(group) {
    if (nodeCache.has(group.id)) return nodeCache.get(group.id);
    const entry = {
      node: mapGroupToStructureNode(group),
      childrenByGroupId: new Map(),
      childOrder: [],
    };
    nodeCache.set(group.id, entry);
    return entry;
  }

  for (const { checkBlock, ancestors, questionUnit } of selections) {
    let parentEntry = null;
    for (const group of ancestors) {
      const entry = getOrCreateEntry(group);
      if (parentEntry === null) {
        if (!rootOrder.includes(group.id)) {
          rootOrder.push(group.id);
          roots.push(entry);
        }
      } else if (!parentEntry.childrenByGroupId.has(group.id)) {
        parentEntry.childrenByGroupId.set(group.id, entry);
        parentEntry.childOrder.push(group.id);
      }
      parentEntry = entry;
    }
    // parentEntryは対象CheckBlockの直接の親Group（最も深い祖先）
    parentEntry.node.checkSections.push(mapCheckBlockToCheckSection(checkBlock, [questionUnit]));
  }

  function finalize(entry) {
    return {
      ...entry.node,
      children: entry.childOrder.map((gid) => finalize(entry.childrenByGroupId.get(gid))),
    };
  }

  return roots.map(finalize);
}

export function buildBookStructureMasterPhase2A(corpus, { targetCheckBlockIds } = {}) {
  const book = corpus.books[0];
  const selectedRaw = selectTargetCheckBlocks(book, targetCheckBlockIds);
  const { stableIdsById } = computeStableIdsForWholeBook(book);

  const selections = selectedRaw.map(({ checkBlock, ancestors }) => {
    // Phase 2Aは1 CheckBlock = 1 Questionのケースのみを対象とする（実データの対象4件はすべて該当）。
    if (checkBlock.questions.length !== 1) {
      throw new Error(`CheckBlock ${checkBlock.id} は複数Questionを持つため、Phase 2Aの対象外（未対応）`);
    }
    const question = checkBlock.questions[0];
    const questionUnit = buildQuestionUnitTree(question, question.items, stableIdsById);
    return { checkBlock, ancestors, questionUnit };
  });

  const structure = buildMergedStructure(selections);

  const bsm = {
    meta: {
      schemaVersion: "book-structure-master-0.2.0-draft",
      status: "provisional",
      sourceDocuments: corpus.meta.sourceDocuments,
      unresolved: [],
    },
    books: [
      {
        id: `${book.id}.phase2a`,
        title: book.title,
        sourceDocumentIds: book.sourceDocumentIds,
        structure,
      },
    ],
  };

  const targetItemIds = selectedRaw.flatMap(({ checkBlock }) => checkBlock.questions.flatMap((q) => q.items.map((it) => it.id)));

  return { bsm, targetCheckBlockIds: selectedRaw.map((s) => s.checkBlock.id), targetItemIds };
}

// Phase 2B: 全CheckBlockを対象にBook Structure Masterを組み立てる。
// 固定ID指定は行わない。1件のCheckBlockの処理で例外が起きても全体を止めず、
// builder_error として記録し処理を継続する（全1,121 Itemを黙って取りこぼさないため）。
export function buildBookStructureMasterFull(corpus) {
  const book = corpus.books[0];
  const selectedRaw = selectAllCheckBlocks(book);
  const { stableIdsById, collisionBlocks } = computeStableIdsForWholeBook(book);

  const builderErrors = [];
  const selections = [];
  const coveredItemIds = new Set();

  for (const { checkBlock, ancestors } of selectedRaw) {
    try {
      // 実データでは全CheckBlockが1 Questionのみを持つことを確認済み（docs/book_structure_master_phase2b_report.md）。
      // 万一複数Questionを持つCheckBlockが見つかった場合も、全Questionをそれぞれ処理し取りこぼさない。
      const questionUnits = checkBlock.questions.map((question) => {
        for (const it of question.items) coveredItemIds.add(it.id);
        return buildQuestionUnitTree(question, question.items, stableIdsById);
      });
      selections.push({ checkBlock, ancestors, questionUnits });
    } catch (err) {
      builderErrors.push({ checkBlockId: checkBlock.id, message: err.message, stack: err.stack });
    }
  }

  // buildMergedStructureは { checkBlock, ancestors, questionUnit }（単数）を期待するため、
  // 複数Questionのケースがあっても対応できるよう、CheckSection単位にラップして渡す。
  const structureSelections = selections.map(({ checkBlock, ancestors, questionUnits }) => ({
    checkBlock,
    ancestors,
    questionUnit: null,
    _questionUnits: questionUnits,
  }));
  const structure = buildMergedStructureMulti(structureSelections);

  const bsm = {
    meta: {
      schemaVersion: "book-structure-master-0.2.0-draft",
      status: "provisional",
      sourceDocuments: corpus.meta.sourceDocuments,
      unresolved: [],
    },
    books: [
      {
        id: `${book.id}.phase2b`,
        title: book.title,
        sourceDocumentIds: book.sourceDocumentIds,
        structure,
      },
    ],
  };

  const allItemIds = selectedRaw.flatMap(({ checkBlock }) => checkBlock.questions.flatMap((q) => q.items.map((it) => it.id)));

  return {
    bsm,
    allCheckBlockIds: selectedRaw.map((s) => s.checkBlock.id),
    allItemIds,
    coveredItemIds: [...coveredItemIds],
    builderErrors,
    // Item ID正式化(F2): 同一(documentId,page,block,marker)が複数Itemに割り当たったグループ
    // （要人手確認。docs/item_id_formalization_design_memo.md §1・§4参照）。
    stableItemIdCollisionBlocks: collisionBlocks,
  };
}

// buildMergedStructureの複数Question対応版（1 CheckBlockが複数QuestionUnitを持ちうる場合）。
function buildMergedStructureMulti(selections) {
  const nodeCache = new Map();
  const roots = [];
  const rootOrder = [];

  function getOrCreateEntry(group) {
    if (nodeCache.has(group.id)) return nodeCache.get(group.id);
    const entry = { node: mapGroupToStructureNode(group), childrenByGroupId: new Map(), childOrder: [] };
    nodeCache.set(group.id, entry);
    return entry;
  }

  for (const { checkBlock, ancestors, _questionUnits } of selections) {
    let parentEntry = null;
    for (const group of ancestors) {
      const entry = getOrCreateEntry(group);
      if (parentEntry === null) {
        if (!rootOrder.includes(group.id)) {
          rootOrder.push(group.id);
          roots.push(entry);
        }
      } else if (!parentEntry.childrenByGroupId.has(group.id)) {
        parentEntry.childrenByGroupId.set(group.id, entry);
        parentEntry.childOrder.push(group.id);
      }
      parentEntry = entry;
    }
    parentEntry.node.checkSections.push(mapCheckBlockToCheckSection(checkBlock, _questionUnits));
  }

  function finalize(entry) {
    return { ...entry.node, children: entry.childOrder.map((gid) => finalize(entry.childrenByGroupId.get(gid))) };
  }
  return roots.map(finalize);
}
