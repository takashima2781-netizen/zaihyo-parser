// Phase 2Aで生成したBook Structure Masterに対する検証。
// 生成ロジック（buildBookStructureMaster.mjs）そのものは検証せず、生成結果を
// 元のIntermediate JSONおよびスキーマ案と独立に突き合わせるだけの読み取り専用チェッカーである。

import { codeToLabel, CHECK_TYPE_LABELS } from "../parser/checkTypeLabels.mjs";

function isRawSpan(v) {
  return v && typeof v.text === "string" && v.source && typeof v.source.documentId === "string" && typeof v.source.locator === "string";
}
function isCodedLabel(v) {
  return v && "code" in v && "labelRaw" in v;
}

// 1. スキーマ案の必須フィールド・再帰構造への適合（docs/book_structure_master_schema_draft.json準拠）
function validateSchemaShape(bsm) {
  const issues = [];
  function checkQuestionUnit(qu, path) {
    for (const k of ["id", "labelRaw", "promptRaw", "bodyRaw", "parsed", "children", "answer"]) {
      if (!(k in qu)) issues.push({ check: "schema-shape", path: `${path}.${k}`, detail: "missing" });
    }
    if (qu.labelRaw !== null && !isRawSpan(qu.labelRaw)) issues.push({ check: "schema-shape", path: `${path}.labelRaw`, detail: "malformed RawSpan" });
    if (qu.promptRaw !== null && !isRawSpan(qu.promptRaw)) issues.push({ check: "schema-shape", path: `${path}.promptRaw`, detail: "malformed RawSpan" });
    if (qu.bodyRaw !== null && !isRawSpan(qu.bodyRaw)) issues.push({ check: "schema-shape", path: `${path}.bodyRaw`, detail: "malformed RawSpan" });
    if (qu.parsed && !isCodedLabel(qu.parsed.unitKind)) issues.push({ check: "schema-shape", path: `${path}.parsed.unitKind`, detail: "malformed CodedLabel" });
    (qu.children ?? []).forEach((c, i) => checkQuestionUnit(c, `${path}.children[${i}]`));
    if (qu.answer) {
      const a = qu.answer;
      for (const k of ["judgmentSymbolRaw", "answerBodyRaw", "explanationRaw", "explanationRole", "footnoteRefs"]) {
        if (!(k in a)) issues.push({ check: "schema-shape", path: `${path}.answer.${k}`, detail: "missing" });
      }
      if (a.judgmentSymbolRaw !== null && !isRawSpan(a.judgmentSymbolRaw)) issues.push({ check: "schema-shape", path: `${path}.answer.judgmentSymbolRaw`, detail: "malformed RawSpan" });
      if (!isRawSpan(a.answerBodyRaw)) issues.push({ check: "schema-shape", path: `${path}.answer.answerBodyRaw`, detail: "malformed/missing RawSpan" });
      if (a.explanationRaw !== null && !isRawSpan(a.explanationRaw)) issues.push({ check: "schema-shape", path: `${path}.answer.explanationRaw`, detail: "malformed RawSpan" });
      if (!isCodedLabel(a.explanationRole)) issues.push({ check: "schema-shape", path: `${path}.answer.explanationRole`, detail: "malformed CodedLabel" });
    }
  }
  function checkStructureNode(sn, path) {
    for (const k of ["id", "raw", "parsed", "children", "checkSections"]) {
      if (!(k in sn)) issues.push({ check: "schema-shape", path: `${path}.${k}`, detail: "missing" });
    }
    if (!isRawSpan(sn.raw)) issues.push({ check: "schema-shape", path: `${path}.raw`, detail: "malformed RawSpan" });
    if (sn.parsed && !isCodedLabel(sn.parsed.kind)) issues.push({ check: "schema-shape", path: `${path}.parsed.kind`, detail: "malformed CodedLabel" });
    (sn.children ?? []).forEach((c, i) => checkStructureNode(c, `${path}.children[${i}]`));
    (sn.checkSections ?? []).forEach((cs, i) => {
      const csPath = `${path}.checkSections[${i}]`;
      for (const k of ["id", "raw", "parsed", "questionUnits"]) {
        if (!(k in cs)) issues.push({ check: "schema-shape", path: `${csPath}.${k}`, detail: "missing" });
      }
      if (!isRawSpan(cs.raw)) issues.push({ check: "schema-shape", path: `${csPath}.raw`, detail: "malformed RawSpan" });
      if (cs.parsed && !isCodedLabel(cs.parsed.checkType)) issues.push({ check: "schema-shape", path: `${csPath}.parsed.checkType`, detail: "malformed CodedLabel" });
      (cs.questionUnits ?? []).forEach((qu, j) => checkQuestionUnit(qu, `${csPath}.questionUnits[${j}]`));
    });
  }
  for (const book of bsm.books) {
    book.structure.forEach((sn, i) => checkStructureNode(sn, `books[0].structure[${i}]`));
  }
  return issues;
}

// 2. 出典参照の欠落件数（RawSpanはすべて有効なdocumentId/locatorを持つべき）
function validateProvenance(bsm) {
  const issues = [];
  function walkRaw(rawSpan, path) {
    if (rawSpan === null) return;
    if (!isRawSpan(rawSpan)) issues.push({ check: "provenance-missing", path, detail: "source欠落または不正" });
  }
  function walkQuestionUnit(qu, path) {
    walkRaw(qu.labelRaw, `${path}.labelRaw`);
    walkRaw(qu.promptRaw, `${path}.promptRaw`);
    walkRaw(qu.bodyRaw, `${path}.bodyRaw`);
    (qu.children ?? []).forEach((c, i) => walkQuestionUnit(c, `${path}.children[${i}]`));
    if (qu.answer) {
      walkRaw(qu.answer.judgmentSymbolRaw, `${path}.answer.judgmentSymbolRaw`);
      walkRaw(qu.answer.answerBodyRaw, `${path}.answer.answerBodyRaw`);
      walkRaw(qu.answer.explanationRaw, `${path}.answer.explanationRaw`);
    }
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node, path) {
        walkRaw(node.raw, `${path}.raw`);
        (node.children ?? []).forEach((c, i) => walkSn(c, `${path}.children[${i}]`));
        (node.checkSections ?? []).forEach((cs, i) => {
          walkRaw(cs.raw, `${path}.checkSections[${i}].raw`);
          (cs.questionUnits ?? []).forEach((qu, j) => walkQuestionUnit(qu, `${path}.checkSections[${i}].questionUnits[${j}]`));
        });
      })(sn, "structure");
    }
  }
  return issues;
}

// 3. 同一IDの重複
function validateDuplicateIds(bsm) {
  const seen = new Map();
  function record(id, path) {
    if (!id) return;
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id).push(path);
  }
  function walkQuestionUnit(qu, path) {
    record(qu.id, path);
    (qu.children ?? []).forEach((c, i) => walkQuestionUnit(c, `${path}.children[${i}]`));
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node, path) {
        record(node.id, path);
        (node.children ?? []).forEach((c, i) => walkSn(c, `${path}.children[${i}]`));
        (node.checkSections ?? []).forEach((cs, i) => {
          record(cs.id, `${path}.checkSections[${i}]`);
          (cs.questionUnits ?? []).forEach((qu, j) => walkQuestionUnit(qu, `${path}.checkSections[${i}].questionUnits[${j}]`));
        });
      })(sn, "structure");
    }
  }
  const issues = [];
  for (const [id, paths] of seen) {
    if (paths.length > 1) issues.push({ check: "duplicate-id", id, count: paths.length, paths });
  }
  return issues;
}

// 4. raw/parsed/diagの混入有無: content系フィールド(labelRaw/promptRaw/bodyRaw/answer内のRawSpan)に
//    diag.notesの文言がそのまま紛れ込んでいないかを確認する
function validateNoContentDiagMixing(bsm) {
  const issues = [];
  const markers = ["BSM Builder:", "no-marker fallback", "フォールバック", "対応する解答が見つからなかった"];
  function checkText(text, path) {
    if (!text) return;
    for (const m of markers) {
      if (text.includes(m)) issues.push({ check: "content-diag-mixing", path, marker: m });
    }
  }
  function walkQuestionUnit(qu, path) {
    checkText(qu.labelRaw?.text, `${path}.labelRaw`);
    checkText(qu.promptRaw?.text, `${path}.promptRaw`);
    checkText(qu.bodyRaw?.text, `${path}.bodyRaw`);
    if (qu.answer) {
      checkText(qu.answer.answerBodyRaw?.text, `${path}.answer.answerBodyRaw`);
      checkText(qu.answer.explanationRaw?.text, `${path}.answer.explanationRaw`);
    }
    (qu.children ?? []).forEach((c, i) => walkQuestionUnit(c, `${path}.children[${i}]`));
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node, path) {
        (node.children ?? []).forEach((c, i) => walkSn(c, `${path}.children[${i}]`));
        (node.checkSections ?? []).forEach((cs, i) => {
          (cs.questionUnits ?? []).forEach((qu, j) => walkQuestionUnit(qu, `${path}.checkSections[${i}].questionUnits[${j}]`));
        });
      })(sn, "structure");
    }
  }
  return issues;
}

// 5. 推測によって生成された値の有無:
//    - promptRawは常にnullであるべき（Phase 2Aの方針）
//    - explanationRole.codeは常にnullであるべき（Phase 2Aの方針）
//    - CodedLabel.labelRawは、null、または既存のcheckTypeLabels対応表に実在する値のみであるべき
function validateNoInventedValues(bsm) {
  const issues = [];
  const knownLabels = new Set(CHECK_TYPE_LABELS.map((e) => e.label));
  function checkCodedLabel(cl, path) {
    if (!cl) return;
    if (cl.labelRaw != null && !knownLabels.has(cl.labelRaw)) {
      issues.push({ check: "invented-label", path, value: cl.labelRaw, detail: "既存のcheckTypeLabels対応表に存在しない値" });
    }
  }
  function walkQuestionUnit(qu, path) {
    if (qu.promptRaw !== null) issues.push({ check: "invented-promptRaw", path: `${path}.promptRaw`, detail: "Phase 2Aの方針違反: promptRawはnullであるべき" });
    checkCodedLabel(qu.parsed?.unitKind, `${path}.parsed.unitKind`);
    if (qu.answer) {
      if (qu.answer.explanationRole?.code != null) {
        issues.push({ check: "invented-explanationRole", path: `${path}.answer.explanationRole`, detail: "Phase 2Aの方針違反: explanationRole.codeはnullであるべき" });
      }
      checkCodedLabel(qu.answer.explanationRole, `${path}.answer.explanationRole`);
    }
    (qu.children ?? []).forEach((c, i) => walkQuestionUnit(c, `${path}.children[${i}]`));
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node, path) {
        checkCodedLabel(node.parsed?.kind, `${path}.parsed.kind`);
        (node.children ?? []).forEach((c, i) => walkSn(c, `${path}.children[${i}]`));
        (node.checkSections ?? []).forEach((cs, i) => {
          checkCodedLabel(cs.parsed?.checkType, `${path}.checkSections[${i}].parsed.checkType`);
          (cs.questionUnits ?? []).forEach((qu, j) => walkQuestionUnit(qu, `${path}.checkSections[${i}].questionUnits[${j}]`));
        });
      })(sn, "structure");
    }
  }
  return issues;
}

// 6. 元Intermediate JSONとの原文一致（逐語性）。対象Itemのraw.question/answers/explanationが
//    生成結果のどこかに逐語で出現するかを確認する。
function validateVerbatimAgainstIntermediateJson(bsm, itemsById) {
  const issues = [];
  const bsmText = JSON.stringify(bsm);
  for (const [itemId, item] of itemsById) {
    const texts = [
      ...item.raw.question.map((q) => q.text),
      ...item.raw.answers.map((a) => a.text.text),
      ...(item.raw.explanation ? [item.raw.explanation.text] : []),
    ];
    for (const t of texts) {
      if (!bsmText.includes(JSON.stringify(t).slice(1, -1))) {
        issues.push({ check: "verbatim-mismatch", itemId, textSample: t.slice(0, 40) });
      }
    }
  }
  return issues;
}

// 7. 共有設問文の重複排除確認: sharedPromptRawTextが親へ一本化された場合、
//    子QuestionUnitのbodyRawが重複してnull以外になっていないか確認する。
function validateSharedPromptDeduplication(bsm) {
  const issues = [];
  function walkQuestionUnit(qu, path, parentHasSharedBody) {
    if (parentHasSharedBody && qu.bodyRaw !== null) {
      issues.push({ check: "shared-prompt-duplicated", path, detail: "親が共有本文を持つのに子もbodyRawを持っている（重複）" });
    }
    const childHasSharedBody = qu.children?.length > 1 && qu.bodyRaw !== null;
    (qu.children ?? []).forEach((c, i) => walkQuestionUnit(c, `${path}.children[${i}]`, childHasSharedBody));
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node, path) {
        (node.children ?? []).forEach((c, i) => walkSn(c, `${path}.children[${i}]`));
        (node.checkSections ?? []).forEach((cs, i) => {
          (cs.questionUnits ?? []).forEach((qu, j) => {
            // トップレベルのQuestionUnit自体は「共有本文を持つ親の子」ではないため、
            // parentHasSharedBodyはfalseで開始する（子孫の判定はwalkQuestionUnit内で行う）。
            walkQuestionUnit(qu, `${path}.checkSections[${i}].questionUnits[${j}]`, false);
          });
        });
      })(sn, "structure");
    }
  }
  return issues;
}

// shared_body_blanks空欄位置の整合性確認(docs/phase2c_blank_position_schema_design.md §7.1)。
// Parserが確定した位置情報を、値を変更せず伝播しているだけであることを、BSM層でも独立に
// 再検証する(信頼して素通りさせない。多層防御)。
export function validateSharedBodyBlankPositions(bsm) {
  const issues = [];
  function walkQuestionUnit(qu, path) {
    const isSharedBodyMajorUnit = qu.bodyRaw !== null && Array.isArray(qu.children) && qu.children.length > 1;
    if (isSharedBodyMajorUnit) {
      const bodyText = qu.bodyRaw.text;
      const seen = new Set();
      let previousEnd = -1;
      qu.children.forEach((child, i) => {
        const pos = child.parsed?.sharedBodyBlankPosition;
        const childPath = `${path}.children[${i}]`;
        if (!pos) {
          issues.push({ check: "shared-body-blank-position-missing", path: childPath, detail: "sharedBodyBlankPositionが欠損している" });
          return;
        }
        if (pos.length <= 0 || pos.index < 0 || pos.index + pos.length > bodyText.length) {
          issues.push({
            check: "shared-body-blank-position-out-of-range",
            path: childPath,
            detail: `index=${pos.index}, length=${pos.length}, bodyLength=${bodyText.length}`,
          });
          return;
        }
        const actual = bodyText.slice(pos.index, pos.index + pos.length);
        const label = child.labelRaw?.text ?? null;
        if (actual !== label) {
          issues.push({
            check: "shared-body-blank-position-label-mismatch",
            path: childPath,
            detail: `expected="${label}" actual="${actual}"`,
          });
        }
        const key = `${pos.index}:${pos.length}`;
        if (seen.has(key)) {
          issues.push({ check: "shared-body-blank-position-duplicate", path: childPath, detail: `position ${key} duplicated` });
        }
        seen.add(key);
        if (pos.index < previousEnd) {
          issues.push({
            check: "shared-body-blank-position-order-mismatch",
            path: childPath,
            detail: `index=${pos.index} < previousEnd=${previousEnd}`,
          });
        }
        previousEnd = pos.index + pos.length;
      });
    }
    (qu.children ?? []).forEach((c, i) => walkQuestionUnit(c, `${path}.children[${i}]`));
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node, path) {
        (node.children ?? []).forEach((c, i) => walkSn(c, `${path}.children[${i}]`));
        (node.checkSections ?? []).forEach((cs, i) => {
          (cs.questionUnits ?? []).forEach((qu, j) => {
            walkQuestionUnit(qu, `${path}.checkSections[${i}].questionUnits[${j}]`);
          });
        });
      })(sn, "structure");
    }
  }
  return issues;
}

export function validateBookStructureMasterPhase2A(bsm, { itemsById }) {
  const issues = [
    ...validateSchemaShape(bsm),
    ...validateProvenance(bsm),
    ...validateDuplicateIds(bsm),
    ...validateNoContentDiagMixing(bsm),
    ...validateNoInventedValues(bsm),
    ...validateVerbatimAgainstIntermediateJson(bsm, itemsById),
    ...validateSharedPromptDeduplication(bsm),
  ];
  return issues;
}

// Phase 2A用の7チェックを個別にexportし、Phase 2Bの全件検証でも再利用できるようにする
// （Phase 2A向けのエクスポート・挙動自体は変更しない）。
export {
  validateSchemaShape,
  validateProvenance,
  validateDuplicateIds,
  validateNoContentDiagMixing,
  validateNoInventedValues,
  validateVerbatimAgainstIntermediateJson,
  validateSharedPromptDeduplication,
};

function collectLeaves(bsm) {
  const leaves = [];
  function walkQu(qu, checkBlockId, questionId) {
    if (qu._sourceItemId) leaves.push({ qu, checkBlockId, questionId });
    (qu.children ?? []).forEach((c) => walkQu(c, checkBlockId, questionId));
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node) {
        (node.children ?? []).forEach(walkSn);
        (node.checkSections ?? []).forEach((cs) => {
          (cs.questionUnits ?? []).forEach((qu) => walkQu(qu, cs.id, qu.id));
        });
      })(sn);
    }
  }
  return leaves;
}

function collectCheckSectionIds(bsm) {
  const ids = new Set();
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node) {
        (node.children ?? []).forEach(walkSn);
        (node.checkSections ?? []).forEach((cs) => ids.add(cs.id));
      })(sn);
    }
  }
  return ids;
}

// 8. 件数対応チェック: 生成結果のItem/Question(CheckSection)/CheckBlock件数が、
//    Intermediate JSON側の全件（1,121/322/322）と一致するかを確認する。
export function validateCounts(bsm, { expectedItemCount, expectedCheckBlockCount }) {
  const issues = [];
  const leaves = collectLeaves(bsm);
  const csIds = collectCheckSectionIds(bsm);
  if (leaves.length !== expectedItemCount) {
    issues.push({ check: "count-mismatch-item", detail: `生成結果のLeaf QuestionUnit数=${leaves.length}, 期待値=${expectedItemCount}` });
  }
  if (csIds.size !== expectedCheckBlockCount) {
    issues.push({ check: "count-mismatch-checkblock", detail: `生成結果のCheckSection数=${csIds.size}, 期待値=${expectedCheckBlockCount}` });
  }
  return issues;
}

// 9. 全Item対応確認: 入力側1,121 Itemのすべてが、(a) 生成結果のLeaf QuestionUnitとして
//    _sourceItemIdで参照されている、または (b) builderErrorsに記録されたCheckBlock配下のItemとして
//    明示的に「未解決」と記録されている、のいずれかを満たすかを確認する。
//    どちらにも該当しないItemがあれば「黙って除外された」ことを意味する。
export function validateFullItemCoverage(bsm, { allItemIds, builderErrorCheckBlockIds, itemIdsByCheckBlockId }) {
  const issues = [];
  const leaves = collectLeaves(bsm);
  const coveredIds = new Set(leaves.map((l) => l.qu._sourceItemId));
  const errorItemIds = new Set();
  for (const cbId of builderErrorCheckBlockIds) {
    for (const itemId of itemIdsByCheckBlockId.get(cbId) ?? []) errorItemIds.add(itemId);
  }
  for (const itemId of allItemIds) {
    if (!coveredIds.has(itemId) && !errorItemIds.has(itemId)) {
      issues.push({ check: "silently-dropped-item", itemId, detail: "生成結果にもbuilderErrorsにも記録されていない" });
    }
  }
  return issues;
}

// 10. trueFalseフィールド分離チェック: presentations[0].type==="trueFalse"の全Itemについて、
//     answer.judgmentSymbolRaw / answer.answerBodyRaw / answer.explanationRaw が
//     互いに混同されず正しく分離されているか（judgmentSymbolRawはParserのparsed.answers[0].textと
//     一致し、explanationRawはraw.explanationの有無と一致するか）を確認する。
export function validateTrueFalseFieldSeparation(bsm, { itemsById }) {
  const issues = [];
  const leaves = collectLeaves(bsm);
  for (const { qu } of leaves) {
    const item = itemsById.get(qu._sourceItemId);
    if (!item || item.presentations?.[0]?.type !== "trueFalse") continue;
    if (item.raw.answers.length === 0) continue; // missing_answerと重複するため対象外
    const expectedJudgment = item.parsed?.answers?.[0]?.text ?? null;
    const actualJudgment = qu.answer?.judgmentSymbolRaw?.text ?? null;
    if (expectedJudgment !== actualJudgment) {
      issues.push({ check: "truefalse-judgment-mismatch", itemId: item.id, expected: expectedJudgment, actual: actualJudgment });
    }
    const expectedHasExplanation = item.raw.explanation != null;
    const actualHasExplanation = qu.answer?.explanationRaw != null;
    if (expectedHasExplanation !== actualHasExplanation) {
      issues.push({ check: "truefalse-explanation-mismatch", itemId: item.id, expected: expectedHasExplanation, actual: actualHasExplanation });
    }
    if (qu.answer?.answerBodyRaw?.text !== item.raw.answers[0].text.text) {
      issues.push({ check: "truefalse-answerbody-mismatch", itemId: item.id });
    }
  }
  return issues;
}

// 11. 既知の29件missing_answer Itemが、全件answer===nullとして正しく保持されているかを確認する。
export function validateKnownUnresolvedItems(bsm, { itemsById }) {
  const issues = [];
  const leaves = collectLeaves(bsm);
  const leafByItemId = new Map(leaves.map((l) => [l.qu._sourceItemId, l.qu]));
  let expectedCount = 0;
  for (const [itemId, item] of itemsById) {
    if (item.raw.answers.length === 0) {
      expectedCount += 1;
      const qu = leafByItemId.get(itemId);
      if (!qu) {
        issues.push({ check: "unresolved-item-not-found", itemId, detail: "解答なしItemが生成結果のLeaf QuestionUnitに見つからない" });
      } else if (qu.answer !== null) {
        issues.push({ check: "unresolved-item-answer-not-null", itemId, detail: "解答なしItemなのにanswerがnullではない" });
      }
    }
  }
  return { issues, expectedCount };
}

// Phase 2A正規化: QuestionUnit木からdiagのnotes等ノイズになりうる可変フィールドを除いた
// 構造比較用の値を作る（Phase 2A出力とFull出力の対応部分構造比較に用いる）。
function normalizeForRegression(value) {
  return JSON.parse(JSON.stringify(value));
}

// 12. Phase 2Aリグレッションチェック: Full出力に含まれるPhase 2A対象4 CheckBlock分のCheckSectionが、
//     既存のoutput/book_structure_master_phase2a.jsonのCheckSectionと構造的に同一であることを確認する。
export function validatePhase2ARegression(fullBsm, phase2aBsm) {
  const issues = [];
  function collectCheckSectionsById(bsm) {
    const map = new Map();
    for (const book of bsm.books) {
      for (const sn of book.structure) {
        (function walkSn(node) {
          (node.children ?? []).forEach(walkSn);
          (node.checkSections ?? []).forEach((cs) => map.set(cs.id, cs));
        })(sn);
      }
    }
    return map;
  }
  const fullMap = collectCheckSectionsById(fullBsm);
  const phase2aMap = collectCheckSectionsById(phase2aBsm);
  for (const [csId, cs2a] of phase2aMap) {
    const csFull = fullMap.get(csId);
    if (!csFull) {
      issues.push({ check: "phase2a-regression-missing", csId, detail: "Full出力にPhase 2A対象のCheckSectionが見つからない" });
      continue;
    }
    const a = JSON.stringify(normalizeForRegression(cs2a));
    const b = JSON.stringify(normalizeForRegression(csFull));
    if (a !== b) {
      issues.push({ check: "phase2a-regression-mismatch", csId, detail: "Full出力内の同一CheckSectionがPhase 2A出力と構造的に一致しない" });
    }
  }
  return issues;
}

// ============================================================
// Item ID正式化(F2、docs/item_id_formalization_design_memo.md)向けの追加検証。
// ============================================================

// 13. provenanceの整合性: 末端(_sourceItemIdを持つ)QuestionUnitは常にprovenanceを持ち、
//     provenance.legacyItemIdが_sourceItemIdと一致すること。中間ノード(大問等)はprovenanceが
//     常にnullであること。
export function validateProvenanceConsistency(bsm) {
  const issues = [];
  function walkQuestionUnit(qu, path) {
    const isLeaf = Boolean(qu._sourceItemId);
    if (isLeaf) {
      if (!qu.provenance) {
        issues.push({ check: "provenance-missing-on-leaf", path, itemId: qu._sourceItemId });
      } else if (qu.provenance.legacyItemId !== qu._sourceItemId) {
        issues.push({
          check: "provenance-legacy-id-mismatch",
          path,
          detail: `provenance.legacyItemId=${qu.provenance.legacyItemId} != _sourceItemId=${qu._sourceItemId}`,
        });
      }
    } else if (qu.provenance !== null) {
      issues.push({ check: "provenance-present-on-non-leaf", path, detail: "中間ノードのprovenanceはnullであるべき" });
    }
    (qu.children ?? []).forEach((c, i) => walkQuestionUnit(c, `${path}.children[${i}]`));
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node, path) {
        (node.children ?? []).forEach((c, i) => walkSn(c, `${path}.children[${i}]`));
        (node.checkSections ?? []).forEach((cs, i) => {
          (cs.questionUnits ?? []).forEach((qu, j) => walkQuestionUnit(qu, `${path}.checkSections[${i}].questionUnits[${j}]`));
        });
      })(sn, "structure");
    }
  }
  return issues;
}

// 14. stableItemIdの一意性: 全末端QuestionUnitのprovenance.stableItemIdに重複が無いことを確認する
//     （src/bookStructureMaster/stableItemId.mjsのoccurrenceOrdinal機構により保証されるはずだが、
//     独立した安全網として再確認する）。
export function validateStableItemIdUniqueness(bsm) {
  const issues = [];
  const leaves = collectLeaves(bsm);
  const seen = new Map();
  for (const { qu } of leaves) {
    const id = qu.provenance?.stableItemId;
    if (!id) continue; // provenance-missing-on-leafは検証13が別途検出する
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id).push(qu._sourceItemId);
  }
  for (const [stableId, itemIds] of seen) {
    if (itemIds.length > 1) {
      issues.push({ check: "duplicate-stable-item-id", stableItemId: stableId, itemIds });
    }
  }
  return issues;
}

// 15. stableItemId衝突ブロック(要人手確認)の件数・内容が、buildBookStructureMasterFull()が
//     報告したcollisionBlocksと一致することを確認する(生成結果とレポートの整合性チェック)。
export function validateCollisionBlocksReported(bsm, collisionBlocks) {
  const issues = [];
  const leaves = collectLeaves(bsm);
  const withOrdinal = leaves.filter(({ qu }) => (qu.provenance?.stableItemId ?? "").includes(":o"));
  const itemIdsWithOrdinal = new Set(withOrdinal.map(({ qu }) => qu._sourceItemId));
  const itemIdsInCollisionBlocks = new Set(collisionBlocks.flatMap((b) => b.itemIds));
  for (const itemId of itemIdsWithOrdinal) {
    if (!itemIdsInCollisionBlocks.has(itemId)) {
      issues.push({ check: "collision-block-underreported", itemId, detail: "occurrenceOrdinal>0を持つが衝突ブロック一覧に含まれない" });
    }
  }
  return issues;
}
