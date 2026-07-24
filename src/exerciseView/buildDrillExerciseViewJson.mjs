// Phase 1(docs/exercise_view_json_migration_plan.md, docs/phase1_drill_exercise_view_design.md)。
// Exercise View(exerciseView.exercises のみ。withheldExercisesは対象外)から、
// 学習用の構造化データ drill_exercise_view.json の中身を組み立てる純粋関数群。
//
// 位置づけ:
// - 選別ロジック(eligibility判定・reviewOverride反映)は一切再実装しない。exerciseView.exercisesに
//   既に確定した「出題対象」をそのまま採用するだけ(docs/phase1_drill_exercise_view_design.md §1)。
// - Exercise Viewの構造(RawSpanRefのsource/inherited等)をできる限りそのまま保持する。
//   既存のkmCompatAdapter.mjsのように.textだけへ縮退させない。
// - fail closed: 検証違反が1件でもあれば、部分的な出力を作らず全体を停止する(ユーザー指示)。
//   不正データの黙った除外・推測補完は行わない。
// - BSM・Parser・既存CSV Bridge・kmCompatAdapter・reference/current_app/index.htmlのいずれも
//   参照・変更しない。

// v1.1.0(Phase 2A)でtheme/importanceを追加した。v1.2.0(docs/phase2c_blank_position_schema_design.md)
// でbodySegmentsを追加した(shared_body_blanksのみ非null。Exercise View本体のbodySegmentsを
// 加工せずそのままprojectionするだけ)。これらはdrill_exercise_view.json自身のスキーマ
// バージョンであり、Exercise View本体のschemaVersion(exercise-view-schema-v1.6.0、
// src/exerciseView/buildExerciseView.mjs)とは別物。
export const DRILL_EXERCISE_VIEW_SCHEMA_VERSION = "drill-exercise-view-v1.2.0";

export const KNOWN_EXERCISE_TYPES = new Set(["single_blank", "multi_blank", "true_false"]);

// true_falseのjudgement.symbolRaw.textとして解釈可能な値。〇(U+3007)と○(U+25CB)は
// 既存HTML(reference/current_app/index.html:1641-1642)が同一視して正規化しているのと同じ扱い。
export const VALID_TRUE_FALSE_SYMBOLS = new Set(["○", "×", "〇"]);

// 2026-07-23時点のoutput/exercise_view_full.json（build-drill-csv.mjsのF4レビュー
// 反映機構により、output/review_decisions.jsonのapproved決定47件を適用した後の
// 「正式経路」最終状態）に基づく既知件数(docs/phase1_drill_exercise_view_design.md §4)。
// fail closedの回帰ガードとして使う。BSM/Parser/Exercise View生成ロジックの正当な
// 変更で件数が変わった場合は、ここを意図的に更新すること(自動追従はしない)。
// 更新履歴: 1233/817/151/265 → 1224/808/151/265。
//   multi_blank(151、無変更): Parserのマーカー誤検出補正(GroupA、9件、
//     docs/phase2c_pdf_visual_verification.md参照)はmulti_blank大問4件の内部の
//     expectedAnswer/subQuestions件数のみを減らすもので、大問(Exercise)自体の
//     個数・exerciseTypeには影響しない。
//   single_blank(817→808)・true_false(265、結果的に一致): 今回のGroupA/数字ノイズ
//     補正とは無関係。output/review_decisions.jsonに蓄積されたレビュー承認47件が
//     build-drill-csv.mjsのF4反映機構によりwithheldから通常exerciseへ移動した結果
//     （1177+47=1224）であり、Exercise View生成ロジック自体は今回無変更。
export const EXPECTED_TOTAL_COUNT = 1224;
export const EXPECTED_TYPE_COUNTS = { single_blank: 808, multi_blank: 151, true_false: 265 };

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function projectRawSpanRef(ref) {
  if (ref == null) return null;
  return {
    text: ref.text ?? null,
    source: ref.source ? { documentId: ref.source.documentId ?? null, locator: ref.source.locator ?? null } : null,
    bsmNodeId: ref.bsmNodeId ?? null,
    inherited: ref.inherited ?? null,
  };
}

function blankUnitTrailingNumber(blankUnitId) {
  const m = String(blankUnitId ?? "").match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// docs/phase2c_blank_position_schema_design.md §6。Exercise Viewが既に自己検証済みの
// bodySegmentsを、projection後にもこのCLI側で独立に再確認する(信頼して素通りさせない)。
function reconstructBodyTextFromSegments(segments) {
  return segments
    .map((s) => {
      if (s.type === "text") return typeof s.text === "string" ? s.text : null;
      if (s.type === "blank") return typeof s.label === "string" ? s.label : null;
      return null;
    })
    .join("");
}

// v1.1.0(Phase 2A、docs/phase2_html_design.md)。BSMの構造木(books[].structure[]、
// StructureNode[.children[]]*.checkSections[])を走査し、checkSectionId -> 祖先チェーン
// (root→leafの順、StructureNode配列)の索引を作る。同一checkSectionIdが複数箇所に
// 出現した場合はoccurrenceCountで検出できるようにする(一意性が崩れていたらfail closed
// させるため。推測でどちらか一方を採用したりしない)。
function buildCheckSectionAncestryIndex(bsm) {
  const index = new Map();
  const books = Array.isArray(bsm?.books) ? bsm.books : [];
  function walk(nodes, ancestors) {
    for (const node of nodes) {
      const nextAncestors = [...ancestors, node];
      if (Array.isArray(node.checkSections)) {
        for (const cs of node.checkSections) {
          const entry = index.get(cs.id) ?? { ancestors: null, occurrenceCount: 0 };
          entry.occurrenceCount += 1;
          if (entry.occurrenceCount === 1) entry.ancestors = nextAncestors;
          index.set(cs.id, entry);
        }
      }
      if (Array.isArray(node.children) && node.children.length > 0) walk(node.children, nextAncestors);
    }
  }
  for (const book of books) {
    if (Array.isArray(book.structure)) walk(book.structure, []);
  }
  return index;
}

// v1.1.0(Phase 2A)。1件のExerciseについて、sourceBookStructureIds[0](checkSectionId)を
// 起点にBSM祖先チェーンを辿り、theme(最も近いkind.code==="theme"祖先)とimportance
// (最も近いimportanceRawが非nullの祖先)を決定的に取得する。
//
// fail closed条件(いずれか1つでも満たせば、その場でnullを返しerrorsへ追記する。
// 推測での補完・穴埋めは一切行わない):
// - checkSectionIdが無い/空文字
// - checkSectionIdがBSM上に見つからない
// - checkSectionIdが複数箇所に出現する(一意性違反)
// - theme(kind.code==="theme")の祖先が1つも見つからない
// - theme祖先は見つかったが、id/no/titleRawのいずれかが欠落している(不完全なtheme情報)
//
// importanceは欠落(null)そのものはfail closedの対象にしない(教材原文に重要度表記が
// 存在しないという既存の正しい状態であり、docs/master_csv_html_fidelity_diagnosis.md
// で確認済みの既存CSVと同じ欠落パターン)。取得できた値は正規化・変換せずそのまま使う。
function resolveThemeAndImportance(ex, ancestryIndex, errors) {
  const checkSectionId = ex.sourceBookStructureIds?.[0];
  if (!isNonEmptyString(checkSectionId)) {
    errors.push({ check: "theme-checkSectionId-missing", exerciseId: ex.exerciseId ?? null });
    return null;
  }
  const entry = ancestryIndex.get(checkSectionId);
  if (!entry) {
    errors.push({ check: "theme-checkSection-not-found-in-bsm", exerciseId: ex.exerciseId ?? null, checkSectionId });
    return null;
  }
  if (entry.occurrenceCount > 1) {
    errors.push({ check: "theme-checkSection-ambiguous", exerciseId: ex.exerciseId ?? null, checkSectionId, occurrenceCount: entry.occurrenceCount });
    return null;
  }

  let themeNode = null;
  let importance = null;
  const ancestors = entry.ancestors;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (themeNode === null && a.parsed?.kind?.code === "theme") themeNode = a;
    if (importance === null && a.parsed?.importanceRaw != null) importance = a.parsed.importanceRaw;
  }

  if (!themeNode) {
    errors.push({ check: "theme-ancestor-not-found", exerciseId: ex.exerciseId ?? null, checkSectionId });
    return null;
  }
  if (!isNonEmptyString(themeNode.id) || typeof themeNode.parsed?.no !== "number" || !isNonEmptyString(themeNode.parsed?.titleRaw)) {
    errors.push({ check: "theme-info-incomplete", exerciseId: ex.exerciseId ?? null, checkSectionId, themeId: themeNode.id ?? null });
    return null;
  }

  return {
    theme: { id: themeNode.id, no: themeNode.parsed.no, title: themeNode.parsed.titleRaw },
    importance: importance ?? null,
  };
}

// 1件のExerciseに対する構造検証。違反があればerrors配列へ追記するのみで、
// 個別のExerciseを黙ってスキップすることはしない(呼び出し側で全体停止させる)。
function validateExercise(ex, errors, seenExerciseIds, seenStableTypeKeys) {
  let ok = true;

  if (!isNonEmptyString(ex.exerciseId)) {
    errors.push({ check: "exerciseId-missing", exerciseId: ex.exerciseId ?? null });
    ok = false;
  } else if (seenExerciseIds.has(ex.exerciseId)) {
    errors.push({ check: "exerciseId-duplicate", exerciseId: ex.exerciseId });
    ok = false;
  } else {
    seenExerciseIds.add(ex.exerciseId);
  }

  if (!KNOWN_EXERCISE_TYPES.has(ex.exerciseType)) {
    errors.push({ check: "unknown-exerciseType", exerciseId: ex.exerciseId ?? null, exerciseType: ex.exerciseType ?? null });
    ok = false;
  }

  const stableItemIds = Array.isArray(ex.stableItemIds) ? ex.stableItemIds : [];
  if (stableItemIds.length === 0 || stableItemIds.some((s) => !isNonEmptyString(s))) {
    errors.push({ check: "stableItemId-missing", exerciseId: ex.exerciseId ?? null });
    ok = false;
  } else if (KNOWN_EXERCISE_TYPES.has(ex.exerciseType)) {
    // 判定キー = stableItemId + exerciseType。multi_blankとsingle_blankが同じstableItemIdを
    // 共有するのは既知・想定内のパターンのため、exerciseTypeをまたいだ重複はエラーにしない
    // (ユーザー指示、src/review/reviewQueue.mjs冒頭コメントのパターンB/Cと同じ理由)。
    for (const sid of stableItemIds) {
      const key = `${sid}|${ex.exerciseType}`;
      if (seenStableTypeKeys.has(key)) {
        errors.push({ check: "stableItemId-duplicate-within-type", exerciseId: ex.exerciseId, stableItemId: sid, exerciseType: ex.exerciseType });
        ok = false;
      } else {
        seenStableTypeKeys.add(key);
      }
    }
  }

  // v1.5.0(Exercise View)対応: multi_blankがindependent_subquestions構造の場合、
  // 大問レベルのprompt/bodyは(共有本文が存在しないため)nullのままで正しい。この場合は
  // subQuestions[]側に本文が保持されていることを問題文の存在条件とする。EV側で新たに
  // 補完したものをそのまま変換するだけであり、この生成スクリプト側での独自補完ではない。
  const promptText = ex.prompt?.text ?? null;
  const bodyText = ex.body?.text ?? null;
  const hasTopLevelText = isNonEmptyString(promptText) || isNonEmptyString(bodyText);
  const hasSubQuestionText =
    ex.exerciseType === "multi_blank" &&
    ex.structureType === "independent_subquestions" &&
    Array.isArray(ex.subQuestions) &&
    ex.subQuestions.length > 0 &&
    ex.subQuestions.every((sq) => isNonEmptyString(sq?.body?.text));
  if (!hasTopLevelText && !hasSubQuestionText) {
    errors.push({ check: "question-text-missing", exerciseId: ex.exerciseId ?? null });
    ok = false;
  }

  if (ex.exerciseType === "multi_blank" && ex.structureType === "independent_subquestions") {
    const sqs = Array.isArray(ex.subQuestions) ? ex.subQuestions : null;
    const ea = Array.isArray(ex.expectedAnswer) ? ex.expectedAnswer : [];
    if (!sqs || sqs.length === 0) {
      errors.push({ check: "subQuestions-missing", exerciseId: ex.exerciseId });
      ok = false;
    } else {
      if (sqs.length !== ea.length) {
        errors.push({ check: "subQuestions-expectedAnswer-count-mismatch", exerciseId: ex.exerciseId, subQuestionsLength: sqs.length, expectedAnswerLength: ea.length });
        ok = false;
      }
      sqs.forEach((sq, i) => {
        if (sq?.order !== i + 1) {
          errors.push({ check: "subQuestions-order-invalid", exerciseId: ex.exerciseId, index: i, order: sq?.order ?? null });
          ok = false;
        }
        if (!isNonEmptyString(sq?.body?.text)) {
          errors.push({ check: "subQuestions-body-empty", exerciseId: ex.exerciseId, index: i });
          ok = false;
        }
        if (!isNonEmptyString(sq?.expectedAnswer?.text)) {
          errors.push({ check: "subQuestions-answer-empty", exerciseId: ex.exerciseId, index: i });
          ok = false;
        }
      });
    }
  }

  if (ex.exerciseType !== "multi_blank" && ex.bodySegments != null) {
    errors.push({ check: "bodySegments-unexpected", exerciseId: ex.exerciseId, exerciseType: ex.exerciseType ?? null });
    ok = false;
  }

  if (ex.exerciseType === "single_blank") {
    const ea = Array.isArray(ex.expectedAnswer) ? ex.expectedAnswer : [];
    if (ea.length !== 1) {
      errors.push({ check: "expectedAnswer-missing", exerciseId: ex.exerciseId, exerciseType: ex.exerciseType, length: ea.length });
      ok = false;
    } else if (!isNonEmptyString(ea[0]?.answerText?.text)) {
      errors.push({ check: "single-blank-answer-empty", exerciseId: ex.exerciseId });
      ok = false;
    }
  } else if (ex.exerciseType === "multi_blank") {
    const ea = Array.isArray(ex.expectedAnswer) ? ex.expectedAnswer : [];
    if (ea.length === 0) {
      errors.push({ check: "expectedAnswer-missing", exerciseId: ex.exerciseId, exerciseType: ex.exerciseType, length: ea.length });
      ok = false;
    } else {
      // 「blanksとexpectedAnswerの件数不一致」に相当するチェック: 本設計ではblanksを
      // 独立フィールドとして持たず、expectedAnswer[]自体が空欄構造を表すため、
      // 二つの配列が食い違う、という事態は構造上発生しない。代わりに、配列の内部整合性
      // (各要素が解答テキストを持つこと、順序が空欄出現順と一致すること)を検証する。
      const nums = ea.map((u) => blankUnitTrailingNumber(u?.blankUnitId));
      const orderOk = nums.every((n, i) => n != null && (i === 0 || n > nums[i - 1]));
      if (!orderOk) {
        errors.push({ check: "multi-blank-order-mismatch", exerciseId: ex.exerciseId, blankUnitIds: ea.map((u) => u?.blankUnitId ?? null) });
        ok = false;
      }
      for (const u of ea) {
        if (!isNonEmptyString(u?.answerText?.text)) {
          errors.push({ check: "multi-blank-unit-answer-empty", exerciseId: ex.exerciseId, blankUnitId: u?.blankUnitId ?? null });
          ok = false;
        }
      }
    }

    // v1.6.0(Exercise View)対応: structureType==="shared_body_blanks"の場合のみbodySegmentsを
    // 検証する(docs/phase2c_blank_position_schema_design.md §6)。ここでの検証はExercise View
    // 生成時の自己検証を信頼せず、projection後のこの時点でも独立に再確認するもの。
    if (ex.structureType === "shared_body_blanks") {
      const segments = Array.isArray(ex.bodySegments) ? ex.bodySegments : null;
      if (!segments || segments.length === 0) {
        errors.push({ check: "bodySegments-missing", exerciseId: ex.exerciseId });
        ok = false;
      } else {
        const reconstructed = reconstructBodyTextFromSegments(segments);
        if (reconstructed !== bodyText) {
          errors.push({ check: "bodySegments-reconstruction-mismatch", exerciseId: ex.exerciseId });
          ok = false;
        }
        const blankSegs = segments.filter((s) => s.type === "blank");
        if (blankSegs.length !== ea.length) {
          errors.push({
            check: "bodySegments-blank-count-mismatch",
            exerciseId: ex.exerciseId,
            blankSegCount: blankSegs.length,
            expectedAnswerCount: ea.length,
          });
          ok = false;
        }
        const blankUnitIdsFromSegments = blankSegs.map((s) => s.blankUnitId);
        if (new Set(blankUnitIdsFromSegments).size !== blankUnitIdsFromSegments.length) {
          errors.push({ check: "bodySegments-blankUnitId-duplicate", exerciseId: ex.exerciseId });
          ok = false;
        }
        blankSegs.forEach((s, i) => {
          const counterpart = ea[i];
          if (!counterpart || s.blankUnitId !== counterpart.blankUnitId) {
            errors.push({
              check: "bodySegments-expectedAnswer-correspondence-mismatch",
              exerciseId: ex.exerciseId,
              index: i,
              segmentBlankUnitId: s.blankUnitId ?? null,
              expectedAnswerBlankUnitId: counterpart?.blankUnitId ?? null,
            });
            ok = false;
          }
        });
      }
    } else if (ex.bodySegments != null) {
      errors.push({ check: "bodySegments-unexpected", exerciseId: ex.exerciseId, structureType: ex.structureType ?? null });
      ok = false;
    }
  } else if (ex.exerciseType === "true_false") {
    const symbol = ex.judgement?.symbolRaw?.text;
    if (!VALID_TRUE_FALSE_SYMBOLS.has(symbol)) {
      errors.push({ check: "true-false-symbol-uninterpretable", exerciseId: ex.exerciseId, symbol: symbol ?? null });
      ok = false;
    }
    if (!isNonEmptyString(ex.judgement?.answerBodyRaw?.text)) {
      errors.push({ check: "true-false-answerBody-empty", exerciseId: ex.exerciseId });
      ok = false;
    }
  }

  return ok;
}

function projectExercise(ex, themeImportance) {
  const base = {
    exerciseId: ex.exerciseId,
    exerciseType: ex.exerciseType,
    stableItemIds: ex.stableItemIds,
    sourceItemIds: ex.sourceItemIds,
    sourceBookStructureIds: ex.sourceBookStructureIds,
    contentFingerprints: ex.contentFingerprints,
    // v1.1.0(Phase 2A)で追加。BSMの祖先チェーンから決定的に取得した値をそのまま転記する
    // (theme.id/no/titleはBSMのStructureNode、importanceはimportanceRawをそのまま。
    // 正規化・全角半角変換・ランク変換等は行わない)。
    theme: themeImportance.theme,
    importance: themeImportance.importance,
    prompt: projectRawSpanRef(ex.prompt),
    body: projectRawSpanRef(ex.body),
    // 現時点で常にnull(docs/master_csv_html_fidelity_diagnosis.md §8.2の調査結果どおり、
    // 実データが一度も存在しないため)。推測データは入れない。
    choices: null,
    answerForm: ex.answerForm ?? null,
    expectedAnswer:
      ex.exerciseType === "true_false"
        ? []
        : ex.expectedAnswer.map((u) => ({
            blankUnitId: u.blankUnitId,
            sourceItemId: u.sourceItemId,
            stableItemId: u.stableItemId,
            answerText: projectRawSpanRef(u.answerText),
          })),
    judgement:
      ex.exerciseType === "true_false"
        ? { symbolRaw: projectRawSpanRef(ex.judgement.symbolRaw), answerBodyRaw: projectRawSpanRef(ex.judgement.answerBodyRaw) }
        : null,
    // v1.5.0(Exercise View)対応。structureTypeはmulti_blankのみ非null。subQuestionsは
    // structureType==="independent_subquestions"の場合のみ非null(EVの値をそのまま転記するだけ)。
    structureType: ex.structureType ?? null,
    subQuestions: Array.isArray(ex.subQuestions)
      ? ex.subQuestions.map((sq) => ({
          sourceItemId: sq.sourceItemId,
          stableItemId: sq.stableItemId,
          body: projectRawSpanRef(sq.body),
          expectedAnswer: projectRawSpanRef(sq.expectedAnswer),
          order: sq.order,
        }))
      : null,
    // v1.6.0(Exercise View)対応。structureType==="shared_body_blanks"の場合のみ非null。
    // Exercise Viewが既に生成・自己検証済みのbodySegmentsを、加工せずそのままprojectionする
    // (新しい判定・再計算は一切行わない。docs/phase2c_blank_position_schema_design.md §2.4)。
    bodySegments: Array.isArray(ex.bodySegments)
      ? ex.bodySegments.map((s) =>
          s.type === "text"
            ? { type: "text", text: s.text }
            : { type: "blank", blankId: s.blankId, label: s.label, blankUnitId: s.blankUnitId, order: s.order }
        )
      : null,
    explanation: ex.explanation ? { raw: projectRawSpanRef(ex.explanation.raw), role: ex.explanation.role ?? null } : null,
    reviewOverride: ex.reviewOverride ?? null,
    provenance: {
      generatedAt: ex.provenance?.generatedAt ?? null,
      generatorVersion: ex.provenance?.generatorVersion ?? null,
      bsmSchemaVersion: ex.provenance?.bsmSchemaVersion ?? null,
      sourceBsmFile: ex.provenance?.sourceBsmFile ?? null,
    },
  };
  return base;
}

// exerciseView(exercises/withheldExercisesを含む完全なExercise Viewオブジェクト)と
// bsm(Book Structure Master本体、theme/importance解決専用)から
// drill_exercise_view.jsonの中身を組み立てる。withheldExercisesは一切参照しない。
// bsmは呼び出し側(build-drill-exercise-view-json.mjs)が明示的に読み込んで渡す
// (このファイル自身はファイルI/Oを行わない、純粋関数)。
//
// 戻り値:
// - errors.length > 0 の場合、document は null。1件でも検証違反があれば全体を停止する
//   (部分的な出力・不正データの黙った除外・推測補完はしない)。
// - errors.length === 0 の場合のみ document を返す。
export function buildDrillExerciseViewJson(exerciseView, bsm, { generatedAt, source, expectedTotalCount = EXPECTED_TOTAL_COUNT, expectedTypeCounts = EXPECTED_TYPE_COUNTS } = {}) {
  const errors = [];
  const exercises = Array.isArray(exerciseView?.exercises) ? exerciseView.exercises : [];
  const ancestryIndex = buildCheckSectionAncestryIndex(bsm);

  const seenExerciseIds = new Set();
  const seenStableTypeKeys = new Set();
  const outExercises = [];

  for (const ex of exercises) {
    const ok = validateExercise(ex, errors, seenExerciseIds, seenStableTypeKeys);
    const themeImportance = resolveThemeAndImportance(ex, ancestryIndex, errors);
    if (ok && themeImportance) outExercises.push(projectExercise(ex, themeImportance));
  }

  // 全体件数のfail closedチェック(ユーザー指示: 1,233件・817/151/265と不一致なら停止)。
  // 個々のExerciseの検証で既にエラーが出ている場合は、件数不一致は当然の帰結なので
  // 別途重複報告しない(検証違反が先に報告される)。
  if (errors.length === 0) {
    if (outExercises.length !== expectedTotalCount) {
      errors.push({ check: "total-count-mismatch", expected: expectedTotalCount, actual: outExercises.length });
    }
    const typeCounts = {};
    for (const ex of outExercises) typeCounts[ex.exerciseType] = (typeCounts[ex.exerciseType] ?? 0) + 1;
    for (const [type, expected] of Object.entries(expectedTypeCounts)) {
      const actual = typeCounts[type] ?? 0;
      if (actual !== expected) errors.push({ check: "exerciseType-count-mismatch", exerciseType: type, expected, actual });
    }
    for (const type of Object.keys(typeCounts)) {
      if (!(type in expectedTypeCounts)) errors.push({ check: "exerciseType-count-mismatch", exerciseType: type, expected: 0, actual: typeCounts[type] });
    }
  }

  if (errors.length > 0) {
    return { errors, document: null };
  }

  const anyExercise = outExercises[0] ?? null;
  const document = {
    schemaVersion: DRILL_EXERCISE_VIEW_SCHEMA_VERSION,
    generatedAt: generatedAt ?? new Date().toISOString(),
    source: {
      sourceExerciseViewFile: source?.sourceExerciseViewFile ?? null,
      sourceExerciseViewFileSha256: source?.sourceExerciseViewFileSha256 ?? null,
      sourceExerciseViewGeneratorVersion: anyExercise?.provenance?.generatorVersion ?? null,
      sourceBsmSchemaVersion: anyExercise?.provenance?.bsmSchemaVersion ?? null,
    },
    summary: {
      exercisesTotal: outExercises.length,
      exerciseTypeCounts: (() => {
        const c = {};
        for (const ex of outExercises) c[ex.exerciseType] = (c[ex.exerciseType] ?? 0) + 1;
        return c;
      })(),
      reviewOverrideAppliedCount: outExercises.filter((ex) => ex.reviewOverride?.applied === true).length,
    },
    exercises: outExercises,
  };

  return { errors: [], document };
}
