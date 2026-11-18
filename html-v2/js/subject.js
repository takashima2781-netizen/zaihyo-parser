// v2-54(WISHLIST W-5/W-6): 科目の切り替え。
//
// 学習アプリのコードは1つのまま、科目ごとに「問題データ・データのキャッシュ・学習履歴・メモ・
// 制限時間の記憶・書き出しファイル名」を分ける。同じ github.io のサイトは localStorage と
// IndexedDB を共有するため、保存先の名前を科目ごとに変えないと記録が混ざる。
//
// - 財表の保存先の名前は従来のまま変えない（変えると既存の学習履歴の移し替えが必要になり、失うおそれがある）。
// - 明暗テーマ（zaihyoDrill.themePreference）は科目に関係なく共通。
// - 科目の決め方: URLの ?subject=… → 前回開いた科目 → 財表。科目の切り替えはページの読み直しで行う
//   （各ストアは読み込み時に保存先の名前を決めるため、途中で差し替えない）。
//
// このファイルは他のjsより先に読み込むこと（index.html）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

(function () {
  var LAST_SUBJECT_KEY = "studyDrill.lastSubject";

  var SUBJECTS = [
    {
      id: "zaihyo",
      shortName: "財表",
      name: "財務諸表論",
      appTitle: "財表ドリル",
      sourceLabel: "財務諸表論ポイントチェック",
      dataUrl: "./data/exercise_view_full.json",
      storage: {
        progress: "zaihyo-drill-v2-progress",
        memos: "zaihyo-drill-v2-memos",
        dataCacheDb: "zaihyo-drill-v2-data-cache",
        timeLimit: "zaihyoDrill.timeLimitSec",
        rangeOpen: "zaihyoDrill.rangeOpen", // v2-62: 範囲を選ぶ画面で開いている見出し
        rangeEmpty: "zaihyoDrill.rangeEmpty", // v2-63: 0問の範囲を出すか（show / hide）
      },
      filePrefix: "zaihyo-drill",
      // meta.subject を持たない問題データ・書き出しファイル（科目切り替え導入前のもの）は財表のもの。
      acceptsUnlabeled: true,
    },
    {
      id: "boki",
      shortName: "簿記論",
      name: "簿記論",
      appTitle: "簿記論ドリル",
      sourceLabel: "簿記論",
      dataUrl: "./data/boki/exercise_view.json",
      storage: {
        progress: "boki-drill-v2-progress",
        memos: "boki-drill-v2-memos",
        dataCacheDb: "boki-drill-v2-data-cache",
        timeLimit: "bokiDrill.timeLimitSec",
        rangeOpen: "bokiDrill.rangeOpen", // v2-62: 範囲を選ぶ画面で開いている見出し
        rangeEmpty: "bokiDrill.rangeEmpty", // v2-63: 0問の範囲を出すか（show / hide）
      },
      filePrefix: "boki-drill",
      acceptsUnlabeled: false,
    },
    {
      id: "shohizei",
      shortName: "消費税",
      name: "消費税法",
      appTitle: "消費税ドリル",
      sourceLabel: "消費税法",
      dataUrl: "./data/shohizei/exercise_view.json",
      storage: {
        progress: "shohizei-drill-v2-progress",
        memos: "shohizei-drill-v2-memos",
        dataCacheDb: "shohizei-drill-v2-data-cache",
        timeLimit: "shohizeiDrill.timeLimitSec",
        rangeOpen: "shohizeiDrill.rangeOpen", // v2-62: 範囲を選ぶ画面で開いている見出し
        rangeEmpty: "shohizeiDrill.rangeEmpty", // v2-63: 0問の範囲を出すか（show / hide）
      },
      filePrefix: "shohizei-drill",
      acceptsUnlabeled: false,
    },
  ];

  function findSubject(id) {
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (SUBJECTS[i].id === id) return SUBJECTS[i];
    }
    return null;
  }

  function fromUrl() {
    try {
      var v = new URLSearchParams(window.location.search).get("subject");
      return v ? findSubject(v) : null;
    } catch (e) {
      return null;
    }
  }

  function fromLastUsed() {
    try {
      return findSubject(window.localStorage.getItem(LAST_SUBJECT_KEY));
    } catch (e) {
      return null;
    }
  }

  var current = fromUrl() || fromLastUsed() || SUBJECTS[0];
  try {
    window.localStorage.setItem(LAST_SUBJECT_KEY, current.id);
  } catch (e) {}

  EVv2.SUBJECTS = SUBJECTS;
  EVv2.SUBJECT = current;

  // その科目を開くURL（同じページに ?subject=… を付けたもの）。
  EVv2.subjectUrl = function (id) {
    var url = new URL(window.location.href);
    url.searchParams.set("subject", id);
    url.hash = "";
    return url.pathname + url.search;
  };

  // 画面の名前と、ヘッダーの科目切り替え。このファイルは body 末尾で読まれるので要素は既にある。
  function applyToPage() {
    document.title = current.appTitle;
    var title = document.getElementById("app-title");
    if (title) title.textContent = current.appTitle;
    var sourceLabel = document.getElementById("subject-source-label");
    if (sourceLabel) sourceLabel.textContent = current.sourceLabel;
    // 初回セットアップ（問題データ未読込）とトップ画面の両方に置く。
    var navs = document.querySelectorAll(".subject-switch");
    Array.prototype.forEach.call(navs, function (nav) {
      nav.textContent = "";
      SUBJECTS.forEach(function (s) {
        var a = document.createElement("a");
        a.className = "chip" + (s.id === current.id ? " active" : "");
        a.href = EVv2.subjectUrl(s.id);
        a.textContent = s.shortName;
        if (s.id === current.id) a.setAttribute("aria-current", "page");
        nav.appendChild(a);
      });
    });
  }
  applyToPage();

  // 問題データ・書き出しファイルの科目ラベルが今の科目に合うか。
  // label が無い（科目切り替え導入前の）ものは、acceptsUnlabeled の科目（財表）だけが受け付ける。
  // 戻り値: null（合う）またはエラー文。
  EVv2.checkSubjectLabel = function (label, what) {
    if (label == null || label === "") {
      return current.acceptsUnlabeled
        ? null
        : what + "に科目の情報がありません。" + current.name + "用のファイルを選んでください。";
    }
    if (label === current.id) return null;
    var other = findSubject(label);
    return (
      what + "は" + (other ? other.name : "別の科目（" + label + "）") + "のものです。" +
      "今は" + current.name + "を開いています。"
    );
  };
})();
