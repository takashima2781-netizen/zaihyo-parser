// 編集モード（アプリ内エディタ）が新規追加するコンテンツ用のID採番と、編集の来歴（provenance）付与。
// Parser/BSM/EV由来の実データID（sitem:src.pdf.pointcheck:... 等）とは名前空間を分離し、
// アプリ内で作成・編集されたものであることが常に判別できるようにする（原文と混同しない）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

function randomToken() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  // 古い環境向けの簡易フォールバック（衝突耐性は落ちるが、この用途では十分）。
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

EVv2.generateUserExerciseId = function () {
  return "ex-useredit-" + randomToken();
};
EVv2.generateUserStableItemId = function () {
  return "sitem:user-edit:" + randomToken();
};
EVv2.generateUserBlankUnitId = function () {
  return "useredit-" + randomToken();
};
// true_falseの「大問（共有指示文グループ）」を新規作成する際の、グループ識別子
// （sourceBookStructureIds[1]相当）。既存データの"qu-question-XX"と混同しない名前空間にする。
EVv2.generateUserGroupId = function () {
  return "qu-user-" + randomToken();
};

// exercise/subQuestion単位で、アプリ内編集で作成・変更されたことを記録する。
// originは初回付与時のみ"created"/"edited"を決定し、以後の再編集では上書きしない
// （「新規作成されたものか、既存データの手直しか」の区別を保つ）。
EVv2.markUserEdited = function (obj, isNewlyCreated) {
  var origin = obj.appEdit ? obj.appEdit.origin : (isNewlyCreated ? "created" : "edited");
  obj.appEdit = { origin: origin, editedAt: new Date().toISOString() };
  return obj;
};

// rawSpan（{text, source, bsmNodeId, inherited}等）のテキストを書き換える前に、
// 初回編集時のみ元のテキストをoriginalTextへ退避する（原文を失わない）。
// 既にoriginalTextがある場合は上書きしない（2回目以降の編集で「本当の原文」が消えないように）。
EVv2.captureOriginalText = function (rawSpan) {
  if (!rawSpan) return;
  if (rawSpan.originalText === undefined) {
    rawSpan.originalText = rawSpan.text;
  }
};
