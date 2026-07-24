// Exercise View Phase 3A の中核ビルダー。
// 入力はBook Structure Master (BSM) の該当CheckSection/QuestionUnitのみ（読み取り専用）。
// 既存Knowledge Master・CSV Bridge・Intermediate JSONはここでは一切参照しない
// （既存KMとの比較はsrc/exerciseView/comparisonBuilder.mjsが独立に行う。Option B）。
//
// BSM Builder内部の非スキーマ項目への直接アクセスは行わない。必ず ./sourceRef.mjs の
// getSourceItemId / getSourceItemIds 経由でItem idを取得する。

import { toRef } from "./mappings.mjs";
import { getSourceItemId, getSourceItemIds, getStableItemId, getStableItemIds, getContentFingerprints } from "./sourceRef.mjs";
import { classifyUnitEligibility, combineEligibility } from "./eligibility.mjs";
import { findTargetCheckSections, findAllCheckSections, collectMajorQuestionUnits, collectLeafDescendants } from "./selectors.mjs";

const GENERATOR_VERSION = "exercise-view-phase3a-0.1.0";
// v2-1(answerFormフィールド追加)では意図的に変更していない。src/review/resolveOverrides.mjsが
// この値をレビュー決定ログのexerciseViewGeneratorVersionAtReviewと突き合わせてoverrideの
// 有効性を判定しており(fail-closed、値が変わると既存の承認済み47件が全てstale扱いになる)、
// answerForm追加は既存の生成内容(何が演習化されるか・prompt/expectedAnswer等の値)を一切
// 変えない完全な追加のみの変更のため、レビュー時点の内容を無効化する理由がないと判断した
// (docs/v2_1_data_contract_investigation.md、実装後の検証で47件の適用件数が変化しないことを確認済み)。
const GENERATOR_VERSION_V1 = "exercise-view-f4-1.2.0";

// F4: build-drill-csv.mjsがresolveApplicableOverridesの現行バージョン一致判定に使うため公開する。
export const EXERCISE_VIEW_GENERATOR_VERSION_V1 = GENERATOR_VERSION_V1;

// 重複を除去しつつ、最初に出現した順序を保つ（丸数字①②③等の読み順を崩さないため、
// 文字列の辞書順ソートは行わない）。
function uniqueInOrder(items) {
  return Array.from(new Set(items));
}

function baseProvenance({ generatedAt, generatorVersion, bsmSchemaVersion, sourceBsmFile }) {
  return {
    generatedAt,
    generatorVersion,
    bsmSchemaVersion,
    sourceBsmFile,
    sourceKind: "book_structure_master",
  };
}

function explanationFromAnswer(answer, bsmNodeId) {
  if (!answer || answer.explanationRaw == null) return null;
  return {
    raw: toRef(answer.explanationRaw, bsmNodeId, { inherited: false }),
    role: answer.explanationRole?.code ?? null,
  };
}

// v2-4準備(diagnostic基盤、docs/v2_4_prep_investigation.md)。
// withheldExercises（eligibility !== "eligible"）は仕様上expectedAnswer/judgement/explanationが
// 常に空/nullであり、BSMが実際に持っている解答データ（例: item-1090のような
// possible_marker_misclassification由来のwithheld項目）がExercise View上から一切参照できない。
// これは、将来の並べ替え(ordering)等の新形式検討にあたり、withheld項目の実データを診断目的で
// 確認する必要が生じたために追加する、独立した診断専用フィールドである。
//
// - eligibility・出題可否の判定ロジックは一切変更しない（withheld項目は引き続きwithheldのまま）。
// - BSMのAnswerContent（judgmentSymbolRaw/answerBodyRaw/explanationRaw/explanationRole）を
//   名称変換・内容変更せずそのままRawSpanRef化するだけで、新しい解釈・推測は行わない。
// - eligible（exercises配列）では常にnullとする。真の解答は既にexpectedAnswer/judgement/explanation
//   で表現されているため、同じ内容を二重に持たせる必要がない。
// - multi_blankは複数leafの集約であり、単一のwithheldAnswerContentで表現できないため、
//   常にnullとする（answerFormのgetGroupAnswerFormと異なり、配列化する設計は今回は行わない。
//   multi_blank withheld項目の診断が必要になった時点で改めて設計する。原則6）。
function buildWithheldAnswerContent(answer, bsmNodeId) {
  if (!answer) return null;
  return {
    judgmentSymbolRaw: answer.judgmentSymbolRaw != null ? toRef(answer.judgmentSymbolRaw, bsmNodeId, { inherited: false }) : null,
    answerBodyRaw: answer.answerBodyRaw != null ? toRef(answer.answerBodyRaw, bsmNodeId, { inherited: false }) : null,
    explanationRaw: answer.explanationRaw != null ? toRef(answer.explanationRaw, bsmNodeId, { inherited: false }) : null,
    explanationRole: answer.explanationRole?.code ?? null,
  };
}

// v2-1(docs/v2_1_data_contract_investigation.md、answerFormデータ契約)。
// BSMのleaf QuestionUnitが既に持つ`parsed.unitKind.code`（"blank"|"subQuestion"|"unknown"等、
// src/bookStructureMaster/mappings.mjs::determineUnitKind()が算出済み）を、そのままコピーする。
// 新しい意味判定は一切行わない。値の名称変換・統合もしない（"blank"を"shortAnswer"へ言い換える等は
// しない。ユーザー指示: 現行のunitKind.codeを基準とし、勝手な名称変換や統合は行わない）。
function getAnswerFormFromUnitKind(unit) {
  return unit?.parsed?.unitKind?.code ?? null;
}

// multi_blankは複数leafの集約であり、単一のanswerForm値で表現できるのは全leafのunitKind.codeが
// 一致する場合のみ。実データ(output/book_structure_master_full.json)では151件のmulti_blank候補
// 全件で一致することを確認済み(docs/v2_1_data_contract_investigation.md §1-3)だが、コードとしては
// 混在ケースを検出したら推測でどちらか一方を選ばず、nullへフォールバックする(原則6)。
function getGroupAnswerForm(leaves) {
  const kinds = leaves.map((l) => getAnswerFormFromUnitKind(l));
  if (kinds.some((k) => k == null)) return null;
  const uniqueKinds = uniqueInOrder(kinds);
  return uniqueKinds.length === 1 ? uniqueKinds[0] : null;
}

// 大問配下の末端群から、fillBlank（空欄）パターンかtrueFalseパターンかを判定する。
// 解答が存在する末端があれば、その judgmentSymbolRaw の有無で機械的に判定する
// （これはBSM Builder自身が既に分離済みのAnswerContentフィールドをそのまま見るだけで、
// 新しい推測ロジックではない）。
//
// 末端に解答が1件も存在しない場合（missing_answer）は、unitKindの種類を問わずfillBlank扱いにする。
// これは解答内容を推測するものではない —このラベルはbuildMultiBlankExercise/buildSingleBlankExercise
// のどちらの生成関数を通すかを選ぶための内部ルーティングに過ぎず、解答が無い以上
// combineEligibility()は必ずineligible（missing_answer）と判定し、expectedAnswerは常に空配列になる
// （src/exerciseView/eligibility.mjs参照）。Phase 3B-1で checkblock-117/item-460
// （unitKind="subQuestion"のfreeText型で解答なし）が本来この分岐に該当すべきなのに
// 判定できず生成失敗になっていたことが判明したため、unitKind.codeによる限定をやめ、
// 「解答が1件も無い」という条件だけで判定する形へ一般化した
// （docs/exercise_view_phase3b1_report.md §6・ユーザー判断による）。
//
// 解答が存在する末端同士でjudgmentSymbolRawの有無が一致しない（真に混在した）場合のみ、
// "unknown"として呼び出し側に生成失敗を報告させる（推測でどちらか一方を選ばない）。
function detectMajorQuestionPattern(leaves) {
  const withAnswer = leaves.filter((l) => l.answer != null);
  if (withAnswer.length === 0) return "fillBlank";
  if (withAnswer.every((l) => l.answer.judgmentSymbolRaw != null)) return "trueFalse";
  if (withAnswer.every((l) => l.answer.judgmentSymbolRaw == null)) return "fillBlank";
  return "unknown";
}

// F4(docs/exercise_view_f4_review_reflection_report.md、レビュー結果の反映機構)。
// leaf単位のeligibilityがeligibleでない場合のみ、そのleafのstableItemIdがapprovedOverrides
// (F3の決定ログから安全確認済みの"approved"判断のみを抽出したMap、src/review/resolveOverrides.mjs)
// に存在するかを確認し、存在すればeligible相当へ差し替える。大問自身の構造的異常(ownResult)は
// Item単位のレビューでは解消できないため対象外(呼び出し側でownResultとは別に合成する)。
// 差し替えが発生した場合のみ、監査用のoverride情報を返す(発生しなければnull)。
function resolveLeafEligibilityWithOverride(leaf, anomaliesByUnitId, approvedOverrides) {
  const original = classifyUnitEligibility(leaf.id, anomaliesByUnitId);
  if (original.eligibility === "eligible") return { result: original, override: null };
  const stableItemId = getStableItemId(leaf);
  const decision = stableItemId ? approvedOverrides?.get(stableItemId) : undefined;
  if (!decision) return { result: original, override: null };
  return {
    result: { eligibility: "eligible", reasons: [] },
    override: {
      applied: true,
      stableItemId,
      decisionReviewedAt: decision.reviewedAt,
      decisionReviewedBy: decision.reviewedBy,
      decisionReasonCode: decision.reasonCode,
      originalIneligibilityReasons: original.reasons,
    },
  };
}

function finalizeGenerationRule(attemptedRule, eligibility) {
  if (eligibility === "eligible") return attemptedRule;
  return {
    name: "withheld_due_to_anomaly_v1",
    description:
      `本来は"${attemptedRule.name}"により生成される演習だが、BSM異常検出により演習化を` +
      `${eligibility === "ineligible" ? "停止した" : "保留（レビュー待ち）にした"}診断用レコード。` +
      "expectedAnswer/judgementは意図的に空にし、出題可能な解答内容を持たせていない。",
  };
}

// v1.5.0(Phase 1、docs/phase1_multiblank_31_structural_investigation.md)。
// multi_blankには構造の異なる2パターンが混在することが判明した:
// - "shared_body_blanks": 大問自身が共有本文(bodyRaw/promptRaw)を持ち、子leafは①②③のような
//   本文中の空欄を埋める（子leaf自身はbodyRawを持たない）。従来からの想定パターン(151件中120件)。
// - "independent_subquestions": 大問自身は共有本文を持たない(bodyRaw/promptRawともにnull)代わりに、
//   各子leafがそれぞれ独立して完結した設問文(bodyRaw)を持つ(151件中31件)。「①②③の穴埋め」ではなく
//   「問X配下に複数の独立した小問がある」という別の構造であり、単純な文字列連結は
//   「複数の独立した設問」という構造自体を破壊するため行わない(調査報告§3参照)。
// どちらの条件にも一致しない場合はunknownとし、推測しない(原則6)。
function detectMultiBlankStructureType(majorUnit, leaves) {
  const hasSharedBody = majorUnit.bodyRaw != null || majorUnit.promptRaw != null;
  if (hasSharedBody) return "shared_body_blanks";
  const allLeavesHaveOwnBody = leaves.length > 0 && leaves.every((l) => l.bodyRaw != null);
  if (allLeavesHaveOwnBody) return "independent_subquestions";
  return "unknown";
}

// independent_subquestions構造専用。子leaf単位の構造(本文・正答・出典・順序)を、
// 既存expectedAnswer[](採点・互換性維持用、変更しない)とは別に保持する。
// expectedAnswerに解答テキストを混在させず、責務を分離する(ユーザー指示)。
function buildSubQuestions(leaves) {
  return leaves.map((l, i) => ({
    sourceItemId: getSourceItemId(l),
    stableItemId: getStableItemId(l),
    body: toRef(l.bodyRaw, l.id, { inherited: false }),
    expectedAnswer: toRef(l.answer.answerBodyRaw, l.id, { inherited: false }),
    order: i + 1,
  }));
}

// v1.6.0(docs/phase2c_blank_position_schema_design.md)。shared_body_blanks専用。
// majorUnit.bodyRaw.textを、各leafがBSM層で既に確定して持っているsharedBodyBlankPosition
// (Parserが決定し、値を変更せず伝播してきたもの)で分割し、text/blankセグメントの配列を作る。
// ここでは本文中の丸数字を探す・判定するといった新しい推測は一切行わない
// （位置は既にBSMが確定済みの値をそのまま使うだけ）。
// 1件でも位置情報が欠けている・範囲外・ラベル不一致・重複・順序不整合の場合は、
// nullを返し呼び出し側でfail closedとして扱う（推測で埋めない）。
function buildBodySegments(majorUnit, leaves) {
  const bodyText = majorUnit.bodyRaw?.text;
  if (typeof bodyText !== "string") return null;

  const segments = [];
  let cursor = 0;
  let previousEnd = -1;
  const seenPositions = new Set();

  for (const [i, leaf] of leaves.entries()) {
    const pos = leaf.parsed?.sharedBodyBlankPosition;
    const label = leaf.labelRaw?.text ?? null;
    if (!pos || label == null) return null;
    if (pos.length <= 0 || pos.index < 0 || pos.index + pos.length > bodyText.length) return null;
    if (bodyText.slice(pos.index, pos.index + pos.length) !== label) return null;
    const posKey = `${pos.index}:${pos.length}`;
    if (seenPositions.has(posKey)) return null;
    seenPositions.add(posKey);
    if (pos.index < previousEnd) return null;

    if (pos.index > cursor) {
      segments.push({ type: "text", text: bodyText.slice(cursor, pos.index) });
    }
    segments.push({
      type: "blank",
      blankId: leaf.id,
      label,
      blankUnitId: leaf.id, // expectedAnswer[].blankUnitIdとの対応に使う(既存の対応関係をそのまま使う。新しいID体系は作らない)
      order: i + 1,
    });
    cursor = pos.index + pos.length;
    previousEnd = cursor;
  }
  if (cursor < bodyText.length) {
    segments.push({ type: "text", text: bodyText.slice(cursor) });
  }

  // fail-closed: text連結+blankラベル差し込みでbody.textを完全再構成できることを、
  // 生成直後に自己検証する(§7.2)。
  const reconstructed = segments.map((s) => (s.type === "text" ? s.text : s.label)).join("");
  if (reconstructed !== bodyText) return null;

  return segments;
}

function buildMultiBlankExercise(majorUnit, leaves, checkSectionId, ctx) {
  const ownResult = classifyUnitEligibility(majorUnit.id, ctx.anomaliesByUnitId);
  const leafResults = leaves.map((l) => classifyUnitEligibility(l.id, ctx.anomaliesByUnitId));
  const combined = combineEligibility([ownResult, ...leafResults]);

  const sourceBookStructureIds = uniqueInOrder([checkSectionId, majorUnit.id, ...leaves.map((l) => l.id)]);
  const sourceItemIds = uniqueInOrder(leaves.flatMap((l) => getSourceItemIds(l)));
  const stableItemIds = uniqueInOrder(leaves.flatMap((l) => getStableItemIds(l)));
  const contentFingerprints = uniqueInOrder(leaves.flatMap((l) => getContentFingerprints(l)));

  const expectedAnswer =
    combined.eligibility === "eligible"
      ? leaves.map((l) => ({
          blankUnitId: l.id,
          sourceItemId: getSourceItemId(l),
          stableItemId: getStableItemId(l),
          answerText: toRef(l.answer.answerBodyRaw, l.id, { inherited: false }),
        }))
      : [];

  const structureType = detectMultiBlankStructureType(majorUnit, leaves);
  // subQuestionsは、eligibleかつindependent_subquestions構造の場合のみ生成する。
  // withheld(eligibility!=="eligible")では、expectedAnswerと同様に内容を一切保持しない(常にnull)。
  const subQuestions = combined.eligibility === "eligible" && structureType === "independent_subquestions" ? buildSubQuestions(leaves) : null;

  // v1.6.0(docs/phase2c_blank_position_schema_design.md)。eligibleかつshared_body_blanks構造の
  // 場合のみ生成する。withheldでは内容を一切保持しない(常にnull、既存フィールドと同じ方針)。
  let bodySegments = null;
  if (combined.eligibility === "eligible" && structureType === "shared_body_blanks") {
    bodySegments = buildBodySegments(majorUnit, leaves);
    if (bodySegments == null) {
      // fail closed: BSM層で既に検証済みのはずの位置情報がここで矛盾を起こした場合、
      // 推測で埋めず例外を投げる(呼び出し元がgenerationFailuresとして報告する)。
      throw new Error(
        `shared_body_blanksのbodySegments生成に失敗した(majorUnitId=${majorUnit.id})。` +
          "sharedBodyBlankPositionの欠損・範囲外・ラベル不一致・重複・順序不整合、" +
          "またはbody.textの再構成不一致のいずれか。"
      );
    }
  }

  // description文言はstructureTypeにより分岐する。共有本文型(120件)は既存文言を一切変更しない
  // (ユーザー指示: 既存構造を変更しない)。新しい説明文はindependent_subquestions型(31件)にのみ付与する。
  const attemptedRule = {
    name: "multi_blank_from_question_children_v1",
    description:
      structureType === "independent_subquestions"
        ? "大問QuestionUnitの共有bodyRaw/promptRawを1回だけ採用し、全ての子QuestionUnit（空欄）の解答をまとめて1つの演習として保持する。共有本文を持たずindependent_subquestions構造と判定されたため、subQuestions[]に子Item単位の構造を別途保持する(v1.5.0)。"
        : "大問QuestionUnitの共有bodyRaw/promptRawを1回だけ採用し、全ての子QuestionUnit（空欄）の解答をまとめて1つの演習として保持する。",
  };

  return {
    exerciseId: `ex-multiblank-${majorUnit.id}`,
    exerciseType: "multi_blank",
    sourceBookStructureIds,
    sourceItemIds,
    stableItemIds,
    contentFingerprints,
    prompt: toRef(majorUnit.promptRaw, majorUnit.id, { inherited: false }),
    body: toRef(majorUnit.bodyRaw, majorUnit.id, { inherited: false }),
    choices: null,
    expectedAnswer,
    judgement: null,
    explanation: null,
    answerForm: getGroupAnswerForm(leaves),
    withheldAnswerContent: null, // multi_blankは複数leafの集約のため常にnull(上記コメント参照)
    structureType, // v1.5.0で追加。"shared_body_blanks" | "independent_subquestions" | "unknown"
    subQuestions, // v1.5.0で追加。independent_subquestions構造かつeligibleの場合のみ非null
    bodySegments, // v1.6.0で追加。shared_body_blanks構造かつeligibleの場合のみ非null
    generationRule: finalizeGenerationRule(attemptedRule, combined.eligibility),
    eligibility: combined.eligibility,
    ineligibilityReasons: combined.reasons,
    provenance: baseProvenance(ctx),
    reviewOverride: null, // multi_blankはF4のoverride適用対象外(計画§対象外、現状もCSV非出力のため)
  };
}

function buildSingleBlankExercise(leaf, majorUnit, checkSectionId, ctx) {
  // majorUnit自身がstableItemIdを持つ(=leafとmajorUnitが同一ノード、子への分解が無いケース)場合は
  // ownResult側にもoverrideが及ぶ必要がある。真の集約ノード(複数子を持つ、provenance:null)では
  // getStableItemIdがnullを返すため、ここでoverrideを通しても常にno-opであり安全(構造的異常は
  // Item単位の承認では解消できないという方針どおり)。
  const { result: ownResult } = resolveLeafEligibilityWithOverride(majorUnit, ctx.anomaliesByUnitId, ctx.approvedOverrides);
  const { result: leafResult, override } = resolveLeafEligibilityWithOverride(leaf, ctx.anomaliesByUnitId, ctx.approvedOverrides);
  const combined = combineEligibility([ownResult, leafResult]);

  const sourceItemIds = uniqueInOrder(getSourceItemIds(leaf));
  const stableItemIds = uniqueInOrder(getStableItemIds(leaf));
  const contentFingerprints = uniqueInOrder(getContentFingerprints(leaf));

  const prompt =
    leaf.promptRaw != null
      ? toRef(leaf.promptRaw, leaf.id, { inherited: false })
      : majorUnit.promptRaw != null
        ? toRef(majorUnit.promptRaw, majorUnit.id, { inherited: true })
        : null;

  const body =
    leaf.bodyRaw != null
      ? toRef(leaf.bodyRaw, leaf.id, { inherited: false })
      : majorUnit.bodyRaw != null
        ? toRef(majorUnit.bodyRaw, majorUnit.id, { inherited: true })
        : null;

  const expectedAnswer =
    combined.eligibility === "eligible" && leaf.answer
      ? [
          {
            blankUnitId: leaf.id,
            sourceItemId: getSourceItemId(leaf),
            stableItemId: getStableItemId(leaf),
            answerText: toRef(leaf.answer.answerBodyRaw, leaf.id, { inherited: false }),
          },
        ]
      : [];

  const attemptedRule = {
    name: "single_blank_from_question_child_v1",
    description:
      "大問QuestionUnitの共有body/promptRawを継承(inherited:true)しつつ、1つの子QuestionUnit（空欄）だけを独立した演習として保持する。教材構造自体は複製・変更しない。",
  };

  return {
    exerciseId: `ex-singleblank-${leaf.id}`,
    exerciseType: "single_blank",
    sourceBookStructureIds: uniqueInOrder([checkSectionId, majorUnit.id, leaf.id]),
    sourceItemIds,
    stableItemIds,
    contentFingerprints,
    prompt,
    body,
    choices: null,
    expectedAnswer,
    judgement: null,
    explanation: combined.eligibility === "eligible" ? explanationFromAnswer(leaf.answer, leaf.id) : null,
    answerForm: getAnswerFormFromUnitKind(leaf),
    withheldAnswerContent: combined.eligibility === "eligible" ? null : buildWithheldAnswerContent(leaf.answer, leaf.id),
    structureType: null, // v1.5.0で追加。multi_blank専用の軸のため、single_blankは常にnull
    subQuestions: null, // v1.5.0で追加。multi_blank専用の軸のため、single_blankは常にnull
    bodySegments: null, // v1.6.0で追加。shared_body_blanks専用の軸のため、single_blankは常にnull
    generationRule: finalizeGenerationRule(attemptedRule, combined.eligibility),
    eligibility: combined.eligibility,
    ineligibilityReasons: combined.reasons,
    provenance: baseProvenance(ctx),
    reviewOverride: combined.eligibility === "eligible" ? override : null,
  };
}

function buildTrueFalseExercise(leaf, majorUnit, checkSectionId, ctx) {
  const { result: ownResult } = resolveLeafEligibilityWithOverride(majorUnit, ctx.anomaliesByUnitId, ctx.approvedOverrides);
  const { result: leafResult, override } = resolveLeafEligibilityWithOverride(leaf, ctx.anomaliesByUnitId, ctx.approvedOverrides);
  const combined = combineEligibility([ownResult, leafResult]);

  const sourceItemIds = uniqueInOrder(getSourceItemIds(leaf));
  const stableItemIds = uniqueInOrder(getStableItemIds(leaf));
  const contentFingerprints = uniqueInOrder(getContentFingerprints(leaf));

  const prompt =
    leaf.promptRaw != null
      ? toRef(leaf.promptRaw, leaf.id, { inherited: false })
      : majorUnit.promptRaw != null
        ? toRef(majorUnit.promptRaw, majorUnit.id, { inherited: true })
        : null;

  const body = leaf.bodyRaw != null ? toRef(leaf.bodyRaw, leaf.id, { inherited: false }) : null;

  const judgement =
    combined.eligibility === "eligible" && leaf.answer
      ? {
          symbolRaw: toRef(leaf.answer.judgmentSymbolRaw, leaf.id, { inherited: false }),
          answerBodyRaw: toRef(leaf.answer.answerBodyRaw, leaf.id, { inherited: false }),
        }
      : null;

  const attemptedRule = {
    name: "true_false_from_leaf_answer_v1",
    description:
      "末端QuestionUnitのanswer.judgmentSymbolRaw/answerBodyRaw/explanationRawを、判定・解答原文・教材解説として分離して保持する。expectedAnswerは使用せず、judgementを唯一の正解表現とする。",
  };

  return {
    exerciseId: `ex-truefalse-${leaf.id}`,
    exerciseType: "true_false",
    sourceBookStructureIds: uniqueInOrder([checkSectionId, majorUnit.id, leaf.id]),
    sourceItemIds,
    stableItemIds,
    contentFingerprints,
    prompt,
    body,
    choices: null,
    expectedAnswer: [],
    judgement,
    explanation: combined.eligibility === "eligible" ? explanationFromAnswer(leaf.answer, leaf.id) : null,
    // true_falseはanswerForm(短答/長文の区別)の対象外として常にnullとする。この軸はfillBlankパターン
    // (single_blank/multi_blank)の解答テキストの性質を表すものであり、true_falseの表示(常に○/×の
    // 2択)はanswerFormの値に依存しない。BSMのunitKind.codeはtrueFalse leafにも便宜上"subQuestion"が
    // 付与されるが(src/bookStructureMaster/mappings.mjs::determineUnitKind)、これをそのまま伝播すると
    // 「long-form」等の誤った解釈を招きかねないため、意図的に伝播しない(docs/v2_1_data_contract_investigation.md §4-2)。
    answerForm: null,
    withheldAnswerContent: combined.eligibility === "eligible" ? null : buildWithheldAnswerContent(leaf.answer, leaf.id),
    structureType: null, // v1.5.0で追加。multi_blank専用の軸のため、true_falseは常にnull
    subQuestions: null, // v1.5.0で追加。multi_blank専用の軸のため、true_falseは常にnull
    bodySegments: null, // v1.6.0で追加。shared_body_blanks専用の軸のため、true_falseは常にnull
    generationRule: finalizeGenerationRule(attemptedRule, combined.eligibility),
    eligibility: combined.eligibility,
    ineligibilityReasons: combined.reasons,
    provenance: baseProvenance(ctx),
    reviewOverride: combined.eligibility === "eligible" ? override : null,
  };
}

// 大問QuestionUnitの部分木に、Intermediate JSON Itemが1件も対応していないかどうかを判定する。
// (例: checkblock-05/qu-question-05 — Intermediate JSON上のQuestionがitems:[]で、
//  対応するItemが最初から存在しない「空のQuestion」。BSMはこれを忠実にchildren:[]・answer:null・
//  Item逆参照(Builder内部項目)なしのQuestionUnitとして保持している。)
// getSourceItemIds()は互換helper(./sourceRef.mjs)経由なので、非スキーマ項目への直接アクセスにはならない。
export function isEmptyQuestionSubtree(majorUnit) {
  return getSourceItemIds(majorUnit).length === 0;
}

// 1つの大問QuestionUnitからExerciseを生成する。
// - 対応するItemが1件も無い「空のQuestion」(isEmptyQuestionSubtree)は、生成対象外として
//   emptyQuestionSkippedを返す（失敗ではない。追跡すべき教材単位が存在しないため）。
// - fillBlank/trueFalseいずれにも判定できない真に未知のパターンに遭遇した場合は、例外を投げず
//   「失敗」として返す（全件展開時に1件の未知パターンで全体が止まらないようにするため。
//   src/bookStructureMaster/buildBookStructureMaster.mjsのbuilderErrors設計と同じ考え方）。
// 呼び出し側が失敗/スキップの扱いを決める。
function generateExercisesForMajorQuestion(majorUnit, checkSectionId, checkBlockId, ctx) {
  if (isEmptyQuestionSubtree(majorUnit)) {
    return { exercises: [], failure: null, emptyQuestionSkipped: { checkBlockId, majorUnitId: majorUnit.id } };
  }
  try {
    const leaves = collectLeafDescendants(majorUnit);
    const pattern = detectMajorQuestionPattern(leaves);
    const exercises = [];

    if (pattern === "fillBlank") {
      if (leaves.length > 1) {
        exercises.push(buildMultiBlankExercise(majorUnit, leaves, checkSectionId, ctx));
      }
      for (const leaf of leaves) {
        exercises.push(buildSingleBlankExercise(leaf, majorUnit, checkSectionId, ctx));
      }
    } else if (pattern === "trueFalse") {
      for (const leaf of leaves) {
        exercises.push(buildTrueFalseExercise(leaf, majorUnit, checkSectionId, ctx));
      }
    } else {
      return {
        exercises: [],
        failure: {
          checkBlockId,
          majorUnitId: majorUnit.id,
          reason: `fillBlank/trueFalseいずれにも判定できないパターン(pattern=${pattern})`,
          leafCount: leaves.length,
        },
        emptyQuestionSkipped: null,
      };
    }
    return { exercises, failure: null, emptyQuestionSkipped: null };
  } catch (err) {
    return {
      exercises: [],
      failure: { checkBlockId, majorUnitId: majorUnit.id, reason: `生成中に例外が発生: ${err.message}` },
      emptyQuestionSkipped: null,
    };
  }
}

// BSM全体・異常検出結果・対象CheckBlockリストから、Phase 3AのExercise View全体を生成する。
// (Phase 3Aの代表5 CheckBlockのみが対象。既存のoutput/exercise_view_phase3a.jsonは
// この関数の出力であり、試作記録として変更しない。Phase 3B以降の実装判断には使わない
// —docs/exercise_view_spec_v1.md参照。全件展開にはbuildExerciseViewV1を使う。)
export function buildExerciseViewPhase3A(bsm, { anomaliesByUnitId, generatedAt, sourceBsmFile }) {
  const ctx = { anomaliesByUnitId, generatedAt, generatorVersion: GENERATOR_VERSION, bsmSchemaVersion: bsm.meta.schemaVersion, sourceBsmFile };
  const targets = findTargetCheckSections(bsm);
  const exercises = [];

  for (const { checkBlockId, checkSection } of targets) {
    for (const majorUnit of collectMajorQuestionUnits(checkSection)) {
      const { exercises: generated, failure } = generateExercisesForMajorQuestion(majorUnit, checkSection.id, checkBlockId, ctx);
      if (failure) {
        throw new Error(`checkBlockId=${failure.checkBlockId} majorUnit=${failure.majorUnitId}: ${failure.reason}。Phase 3Aの対象外`);
      }
      exercises.push(...generated);
    }
  }

  const generationRules = uniqueInOrder(exercises.map((e) => e.generationRule.name)).sort();

  return {
    meta: {
      schemaVersion: "exercise-view-schema-draft-0.1.0",
      status: "provisional-phase3a-sample",
      generatedAt,
      sourceBookStructureMasterPath: sourceBsmFile,
      targetCheckBlockIds: targets.map((t) => t.checkBlockId),
      generationRules,
    },
    exercises,
  };
}

// docs/exercise_view_spec_v1.md（Phase 3B-0で凍結）に基づく、全件展開用のビルダー。
// targetsには findAllCheckSections(bsm) の結果（全322 CheckBlock）を渡すことを想定するが、
// 代表例のみに絞ったリストを渡すことも可能（テスト用途）。
// fillBlank/trueFalseいずれにも判定できないパターンは、例外を投げずgenerationFailuresへ記録し、
// 該当する大問部分木はexercises/withheldExercisesのどちらにも出力しない
// （未知のパターンに対し推測でExerciseTypeを割り当てることはしないため。原則6「推測しない」）。
// approvedOverrides(F4、省略可): Map<stableItemId, decisionRecord>。
// src/review/resolveOverrides.mjsのresolveApplicableOverridesが返す、安全確認済みの
// "approved"判断のみを渡すことを前提とする(stale/conflict/形状不正なレコードは含まれない)。
// 省略時(既定は空Map)は完全に従来どおりの動作になる(run-exercise-view-full.mjs等の
// 診断用呼び出しはこの引数を渡さないため、無変更のまま)。
export function buildExerciseViewV1(bsm, { targets, anomaliesByUnitId, generatedAt, sourceBsmFile, approvedOverrides = new Map() }) {
  const ctx = {
    anomaliesByUnitId,
    generatedAt,
    generatorVersion: GENERATOR_VERSION_V1,
    bsmSchemaVersion: bsm.meta.schemaVersion,
    sourceBsmFile,
    approvedOverrides,
  };
  const allExercises = [];
  const generationFailures = [];
  const emptyQuestionsSkipped = [];

  for (const { checkBlockId, checkSection } of targets) {
    for (const majorUnit of collectMajorQuestionUnits(checkSection)) {
      const { exercises: generated, failure, emptyQuestionSkipped } = generateExercisesForMajorQuestion(
        majorUnit,
        checkSection.id,
        checkBlockId,
        ctx
      );
      allExercises.push(...generated);
      if (failure) generationFailures.push(failure);
      if (emptyQuestionSkipped) emptyQuestionsSkipped.push(emptyQuestionSkipped);
    }
  }

  const exercises = allExercises.filter((e) => e.eligibility === "eligible");
  const withheldExercises = allExercises.filter((e) => e.eligibility !== "eligible");
  const generationRules = uniqueInOrder(allExercises.map((e) => e.generationRule.name)).sort();

  return {
    exerciseView: {
      meta: {
        // v1.3.0(v2-1、answerFormフィールド追加。docs/v2_1_data_contract_investigation.md)。
        // v1.4.0(v2-4準備、withheldAnswerContentフィールド追加。診断専用、eligibility判定には
        // 影響しない)。v1.5.0(Phase 1、docs/phase1_multiblank_31_structural_investigation.md、
        // multi_blankへstructureType/subQuestionsフィールド追加。既存expectedAnswer[]は無変更、
        // 追加フィールドのみ)。v1.6.0(docs/phase2c_blank_position_schema_design.md、
        // shared_body_blanksへbodySegmentsフィールド追加。本文中の空欄位置をHTML側が
        // 再判定せずに済むよう、Parser/BSMが確定済みの位置情報から生成した
        // text/blankセグメント配列。既存body.text/expectedAnswer[]は無変更、追加フィールドのみ)。
        // GENERATOR_VERSION_V1は意図的に変更していない(上部のコメント参照。
        // フィールド追加のみで既存値は一切変わらないため、47件の承認済みレビューへ影響しない)。
        schemaVersion: "exercise-view-schema-v1.6.0",
        status: "provisional-phase3b1-full",
        generatedAt,
        sourceBookStructureMasterPath: sourceBsmFile,
        targetCheckBlockIds: targets.map((t) => t.checkBlockId),
        generationRules,
        exerciseCount: exercises.length,
        withheldExerciseCount: withheldExercises.length,
      },
      exercises,
      withheldExercises,
    },
    generationFailures,
    emptyQuestionsSkipped,
  };
}
