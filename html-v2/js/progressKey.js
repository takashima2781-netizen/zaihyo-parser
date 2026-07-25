// v2-1(docs/v2_1_data_contract_investigation.md §9)で導入した、学習履歴の主キー方式
// （stableItemId + exerciseType の複合キー）を検証するための診断機能。
//
// 単純な文字列連結（"a"+"::"+"b"）は、区切り文字がどちらかの値に偶然含まれていた場合に
// 異なる入力から同一キーが生成される衝突リスクがあるため、JSON配列の文字列化という
// 構造化された方式を採用する（ユーザー指示の例のうち「JSON配列の文字列化」を採用）。
//
// v2-3(docs/v2_3_implementation_report.md)で、実際の永続化(html-v2/js/progressStore.js)の
// キー形式が確定した([id, exerciseType]の2要素、バージョン管理は保存データ全体のenvelope側
// (progressStore.jsのSTORAGE_SCHEMA_VERSION)で行う方式へ変更)のに合わせ、buildProgressKeyを
// その形式に更新した。v2-1/v2-2時点では[version, id, exerciseType]の3要素だったが、
// 実際の永続化と診断ツールのキー生成を一致させておく方が診断結果の信頼性が高いため統一した。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

// id・exerciseTypeのいずれかが無ければキーを生成しない（推測でフォールバックしない）。
EVv2.buildProgressKey = function (id, exerciseType) {
  if (!id || !exerciseType) return null;
  return JSON.stringify([id, exerciseType]);
};

// exercises/withheldExercises全件について、複合キーが安全に生成できるかを検査する。
// fail-closedの方針(docs/v2_1_data_contract_investigation.md §9-4):
// - stableItemIdsが空 → 進捗保存対象外(missingStableItemId)
// - stableItemIdsが複数件(multi_blank等) → 複合キー方式が未定義のため対象外(keyUndefinedMultiId)。
//   multi_blank自身のキー導出方法は、multi_blankのUIを実装する後続フェーズで別途決定する
//   (Architecture v2 Proposal §4-2で既に留保済みの論点)。
// - 同一複合キーが複数Exerciseに割り当たっている(本来起きないはずの異常) → 該当分すべてを
//   進捗保存対象外とする(黙って上書きしない)。
EVv2.diagnoseProgressKeys = function (exerciseView) {
  var all = exerciseView.exercises.concat(exerciseView.withheldExercises);
  var missingStableItemId = [];
  var keyUndefinedMultiId = [];
  var seenKeyToExerciseIds = {};
  var generatedCount = 0;

  all.forEach(function (ex) {
    if (!ex.stableItemIds || ex.stableItemIds.length === 0) {
      missingStableItemId.push(ex.exerciseId);
      return;
    }
    if (ex.stableItemIds.length !== 1) {
      keyUndefinedMultiId.push({ exerciseId: ex.exerciseId, stableItemIdCount: ex.stableItemIds.length });
      return;
    }
    var key = EVv2.buildProgressKey(ex.stableItemIds[0], ex.exerciseType);
    generatedCount += 1;
    if (!seenKeyToExerciseIds[key]) seenKeyToExerciseIds[key] = [];
    seenKeyToExerciseIds[key].push(ex.exerciseId);
  });

  var duplicateKeys = [];
  var duplicateExerciseIdSet = {};
  Object.keys(seenKeyToExerciseIds).forEach(function (key) {
    var ids = seenKeyToExerciseIds[key];
    if (ids.length > 1) {
      duplicateKeys.push({ key: key, exerciseIds: ids });
      ids.forEach(function (id) {
        duplicateExerciseIdSet[id] = true;
      });
    }
  });

  var progressEligibleCount = generatedCount - Object.keys(duplicateExerciseIdSet).length;

  return {
    total: all.length,
    missingStableItemIdCount: missingStableItemId.length,
    missingStableItemIdExamples: missingStableItemId.slice(0, 10),
    keyUndefinedMultiIdCount: keyUndefinedMultiId.length,
    keyUndefinedMultiIdExamples: keyUndefinedMultiId.slice(0, 10),
    keyGeneratedCount: generatedCount,
    duplicateKeyGroupCount: duplicateKeys.length,
    duplicateKeys: duplicateKeys.slice(0, 10),
    progressEligibleCount: progressEligibleCount,
  };
};

// v2-2(docs/v2_2_implementation_report.md §4)。multi_blank配下の各unit(空欄)を、将来の
// 学習履歴で個別に識別するための安定キーを調査する診断機能。ここでもlocalStorageへの
// 実際の保存は行わない。
//
// 優先順位（ユーザー指示どおり）:
//   1. unit.stableItemId（F2で導入済み、出典位置ベースの安定ID。AnswerItemに既に存在する）
//   2. unit.blankUnitId（BSMのleafノードID。「marker」に相当する構造的な識別子。
//      stableItemIdより弱い保証だが、少なくとも同一BSM生成内では安定している）
//   3. 配列内の位置インデックス（最後の手段。教材構造の並べ替え等に弱い）
// これはstableItemId単位でのユニット別キー（診断専用、v2-3時点で未採用）の話であり、
// 実際の学習履歴保存（progressStore.js）はexerciseId単位のキーをcomputeExerciseKeyで
// 別途生成して使っている（v2-3で確定済み）。キーの構造自体はEVv2.buildProgressKeyと同じ
// ([id, exerciseType]のJSON配列化)を再利用する。exerciseTypeには親Exerciseの"multi_blank"を
// 使うため、同一stableItemIdを持つ兄弟single_blank（v2-1で発見済み、761件）とキーが衝突する
// ことはない。
EVv2.resolveMultiBlankUnitKey = function (unit, index) {
  if (unit.stableItemId) {
    return { key: EVv2.buildProgressKey(unit.stableItemId, "multi_blank"), source: "stableItemId" };
  }
  if (unit.blankUnitId) {
    return { key: EVv2.buildProgressKey(unit.blankUnitId, "multi_blank"), source: "blankUnitId(marker相当)" };
  }
  return { key: EVv2.buildProgressKey("idx:" + index, "multi_blank"), source: "unitIndex" };
};

EVv2.diagnoseMultiBlankUnitKeys = function (exerciseView) {
  var multiBlanks = exerciseView.exercises
    .concat(exerciseView.withheldExercises)
    .filter(function (ex) {
      return ex.exerciseType === "multi_blank";
    });

  var sourceCounts = { stableItemId: 0, "blankUnitId(marker相当)": 0, unitIndex: 0 };
  var seenKeyToUnits = {};
  var totalUnits = 0;

  multiBlanks.forEach(function (ex) {
    ex.expectedAnswer.forEach(function (unit, idx) {
      totalUnits += 1;
      var resolved = EVv2.resolveMultiBlankUnitKey(unit, idx);
      sourceCounts[resolved.source] = (sourceCounts[resolved.source] || 0) + 1;
      var label = ex.exerciseId + "#" + idx;
      if (!seenKeyToUnits[resolved.key]) seenKeyToUnits[resolved.key] = [];
      seenKeyToUnits[resolved.key].push(label);
    });
  });

  var duplicateKeys = [];
  Object.keys(seenKeyToUnits).forEach(function (key) {
    if (seenKeyToUnits[key].length > 1) {
      duplicateKeys.push({ key: key, units: seenKeyToUnits[key] });
    }
  });

  return {
    multiBlankGroupCount: multiBlanks.length,
    totalUnits: totalUnits,
    sourceCounts: sourceCounts,
    duplicateKeyGroupCount: duplicateKeys.length,
    duplicateKeys: duplicateKeys.slice(0, 10),
  };
};
