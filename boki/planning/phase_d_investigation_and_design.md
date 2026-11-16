# Phase D調査・設計: 教材理解・変換エンジンと学習エンジンの接続

## 0. 背景・前提

ユーザーの長期ビジョン(CLAUDE.md「長期ビジョン」節)を踏まえ、Phase Dを
「boki-appを財表ドリルへ統合する」ではなく、「教材理解・変換エンジン
(boki-app)」と「学習エンジン(財表ドリル)」を、責務を分離したまま接続する
方法の検討として扱う。この文書は、財表ドリル側の実装を実際に調査した結果と、
その調査にもとづく接続方式の設計・Phase Dの完了条件を記録する。

**財表ドリルは別リポジトリ(`Zaihyo Parser`、`../Zaihyo Parser/`)にある。**
このリポジトリからは変更しない前提で調査した(調査自体は読み取りのみ)。

## 1. 財表ドリルの実体の特定

ユーザーからの説明(「単一のindex.htmlをSSoTとして、HTML・CSS・JSを1ファイル
にまとめているアプリ」)と、実際に存在するコードには食い違いがあった。

- `Zaihyo Parser/reference/current_app/index.html`(3582行、単一ファイル)は
  初回コミット以降一度も変更されておらず、READMEにも「参考資料であり仕様では
  ない」と明記されている。
- `Zaihyo Parser/html-v2/`(index.html + css/1ファイル + js/20ファイル)は、
  8月15日まで継続的に開発され、GitHub Actionsワークフロー
  (`.github/workflows/deploy-pages.yml`、コメント「財表ドリル(html-v2)を
  GitHub Pagesへ公開する」)によって実際にGitHub Pagesへ公開されている。

**この2点から、現在実際に使われている「財表ドリル」は`html-v2`であると判断
した**(推測ではなく、git履歴・CI設定という一次情報にもとづく確認)。ユーザーの
説明にあった「単一ファイル」という理解は、旧版(`reference/current_app`)を
指しているか、記憶違いの可能性がある。本調査以降はすべて`html-v2`を対象と
する。

## 2. 現在の財表ドリル(html-v2)の構造

- 静的サイト(index.html + css/style.css + js/配下20ファイル)。ビルド工程は
  無く、ブラウザで直接動作する。
- `js/registry.js`が出題形式(exerciseType)ごとの表示・判定ロジックを1箇所に
  集約するレジストリになっている(`EVv2.registry = { true_false, single_blank,
  multi_blank, ordering }`)。新しい出題形式は、ここに1エントリ追加するだけで
  対応できる設計(SPEC.mdの出題形式レジストリ設計と同じ考え方)。
- `js/app.js`(1753行)が画面遷移・学習キュー構築・テーマ階層構築などの
  アプリ全体の制御を担う。

## 3. 問題データの保持方法

- 入力形式は「Exercise View JSON」(`js/evLoader.js`が読み込み)。現行の
  スキーマバージョンは`exercise-view-schema-v1.8.0`。
- トップレベル形状: `{ meta: {...}, exercises: [...], withheldExercises: [...] }`。
  `evLoader.js`の検証は「`meta`がオブジェクトか」「`exercises`/
  `withheldExercises`が配列か」という最小限のみ(旧アプリ
  `reference/current_app`のような、exercise単位の詳細なフィールド検証は
  無い)。schemaVersionが一致しない場合も**警告のみで読み込みは継続する**
  (fail-closedではなく寛容側)。
- 一度読み込んだJSON全体を、この端末のIndexedDB(`js/dataCache.js`)へ
  1レコード("current")として保存する。**新しいファイルを読み込むと、
  この1レコードが丸ごと置き換わる**(複数データセットを同時に保持する仕組みは
  現状無い)。学習履歴(下記5)はこれとは別のlocalStorageキーに保存されるため、
  データセットを切り替えても学習履歴は失われない。
- 教材データ本体(有償ライセンス教材を含む)は`.gitignore`で除外されており、
  GitHub Pages公開経路にもデータは含まれない(利用者が手動でファイルを選択した
  時点で初めてこの端末に保存される設計)。

## 4. 問題表示・回答・採点の仕組み

- `js/render.js`の`createExerciseCard`が、`exerciseType`に応じて
  `registry.js`の該当ハンドラへ描画・判定を委譲する。
- 2つの応答モードがある:
  - **choice(自動採点)**: 選択肢から選ぶ形式。正誤をアプリ側が判定する。
  - **reveal(自己採点)**: 「解答を表示」ボタンで正解を開示し、利用者自身が
    正誤を申告する形式。単答判定が安全にできない場合(選択肢を安全に
    構成できない等)は、無理に判定せずこちらへフォールバックする
    (CLAUDE.md原則4「推測しない」と同じ考え方が既に実装されている)。
- `ordering`(並べ替え)形式は独自のUIを持つ(v2-29で「item-1090専用アダプタ」
  から「Exercise View本体に実在する正式な出題形式」へ昇格済み)。選択肢を
  タップした順に回答欄へ積み上げ、「回答する」ボタンで一括して
  `exact_sequence_match`相当の判定(配列の完全一致)を行う。ドラッグでの
  並べ替えにも対応。この判定方式は、boki-appのExercise
  (`answer.grading.method: "exact_sequence_match"`)と完全に一致する。

## 5. 出題範囲・問題形式・出題モード・学習スタイル・出題順の既存設定

学習設定画面(`study-setup`)は3軸: テーマ(select)・問題形式(チップ、
`true_false`/`single_blank`/`multi_blank`/`ordering`の4種、`app.js`の
`TYPE_ITEMS`にハードコード)・出題モード(チップ、`all`/`unmastered`/
`checked`)。「学習スタイル」「出題順」は専用の設定項目としては存在しない
(節・論点までの絞り込みは過去にあったが、使われていないため廃止済み、
`app.js`コメント参照)。テーマの選択肢は、各Exerciseの`ex.structure.theme`
(`{structureNodeId, titleRaw:{text,...}}`)から動的に構築される
(`buildThemeHierarchy`)。この情報を持たないExerciseは「すべて」でのみ
出題対象になる(特定テーマの絞り込みからは自然に除外される。エラーには
ならない)。

## 6. チェック問題・未修得問題・学習履歴の管理方法

- `js/progressStore.js`がlocalStorageで管理する(教材データ本体とは別の
  保存領域)。
- 履歴の主キーは`[id, exerciseType]`のJSON配列文字列化。`id`は
  **`multi_blank`のみ`exerciseId`、それ以外(`ordering`含む)は
  `stableItemIds[0]`**。→ boki-appのExerciseには`stableItemIds`に相当する
  フィールドが無いため、**接続にあたって安定した一意識別子を新設する必要が
  ある**(下記7で対応)。
- 修得判定は「正解が連続N回」のストリークで`mastered`フラグを立てる方式。
  チェック(`checked`)は単純なブール値のトグル。いずれも`exerciseType`を
  問わない汎用ロジックであり、財表固有の実装ではない。

## 7. 財表固有のUI/汎用的な学習機能の整理

調査の結果、**「出題する・回答する・採点する・チェックする・未修得を出す・
学習履歴を管理する」という中核機能は、実装を見る限りすでに汎用的**
(exerciseType非依存)である。財表固有なのは主に次の点のみ:

- サンプルデータの自動フェッチ(`fetch-sample-btn`、`html-v2/data/`配下の
  財表専用データを既定で読み込むボタン)
- 「文節ならびかえ変換」(`conversionManager.js`等): 財表の自己採点形式
  (共有本文型の穴埋め)を並べ替え問題の下書きへ自動変換するUI。boki-appの
  Exerciseは生成時点で既に適切な出題形式が決まっているため、この変換機構は
  不要(使わない)。
- テーマラベルの表記ゆれ補正(`formatThemeTitle`、「テーマ26」に「テーマ」が
  欠落している教材固有の既知不具合の補正)

これらは接続の妨げにならない(boki-app側のデータが経由する必要のない機能)。

## 8. boki-appのExerciseをどの地点で接続するのが最も自然か

`registry.js`の`ordering`ハンドラが期待するExerciseの形状と、boki-appの
Exercise(`journal_ordering`/`formula_ordering`、`answer.correctOrder`が
文字列トークンの配列、`grading.method: "exact_sequence_match"`)は、
**概念的にすでに一致している**(並べ替え対象の分解・正解順・完全一致判定)。
フィールド名だけが異なる(boki-appは`orderingItems`のような明示的なid付き
配列を持たず、`answer.correctOrder`がトークン文字列そのもの)。

したがって、**Exercise View JSON形式への変換を行う小さな変換レイヤーを
boki-app側に追加する**のが最も自然な接続点である。財表ドリル側のコードは
一切変更しない。

- 変換対象: boki-appの`output/exercises/exercises.json`
  (`journal_ordering`/`formula_ordering`)
- 変換後: Exercise View JSON(`exerciseType: "ordering"`)。1件のExerciseが
  1件のExerciseへ1:1で対応する。
- `stableItemIds`: boki-appにはBSM由来の安定IDが無いため、
  `["boki:" + knowledge.id]`(Knowledge IDは既に一意性がgateChecksで保証
  されている、`src/gateChecks/idUniquenessChecks.mjs`)を採用する。
- テーマ表示: 現時点ではboki-app全体を1つの疑似テーマ(「簿記論
  (boki-app)」)として扱う。論点単位の粒度でのテーマ分割は、教材投入量が
  増えて実際に必要性が確認されてから対応する(CLAUDE.md原則6、先回りしない)。

## 9. 将来別科目・別教材を追加するときにも使える境界

Exercise View JSONという**共通データ形式**を境界にする限り、追加の教材
理解・変換エンジン(将来の税法・語学等)は、それぞれ自分のExerciseから
Exercise View JSONを生成する変換レイヤーさえ持てば、財表ドリル(学習エンジン)
側を一切変更せずに接続できる。これは過剰設計ではなく、**財表ドリル側が
既に持っている汎用インポート機構をそのまま使うだけ**であるため、
「今必要な範囲だけ汎用化する」という方針とも矛盾しない。

複数データセットの同時読み込み・テーマをまたいだ統合出題(財表と簿記論を
同時に1つの学習キューへ混ぜる等)は、現状のデータセット単一保持の制約
(3節)により今回のスコープには含めない。将来必要になった時点で、財表ドリル
側の設計判断として別途検討する(このリポジトリの権限外)。

## 10. 統合方式の評価: **A(現在の構造のまま安全に接続できる)**

財表ドリル(html-v2)側のコードは**一切変更しない**。boki-app側に、
Exercise View JSON形式への変換スクリプトを追加するのみ。

根拠:
- 入力形式(Exercise View JSON)は財表ドリル側に既存の、汎用的な
  インポート機構であり、boki-app専用の変更を必要としない。
- `ordering`出題形式は既に財表ドリル本体に正式な形式として存在し、
  boki-appのExerciseと判定方式(完全一致)が一致する。
- 学習履歴・チェック・修得管理はexerciseType非依存の汎用ロジックであり、
  安定IDさえ用意すれば財表ドリル側の変更なしに機能する。
- データセットの切り替えは、既存の「ファイルを選択して読み込む」操作
  そのままで行える(利用者が財表用ファイルとboki-app用ファイルを
  手動で切り替える。複数データセットの同時併存は今回のスコープ外、9節)。

## 11. Phase Dの完了条件(有限・確認可能)

中心的な完了条件(ユーザー指定どおり):

- **boki-appで実際の財表教材から生成したExerciseが、Exercise View JSONへ
  変換され、財表ドリル(html-v2)の既存の出題・回答・採点・学習フロー
  (出題設定→学習セッション→解答→採点→学習履歴への反映)の中で実際に
  利用できること。**

調査の結果、追加すべき条件は無いと判断した(上記中心条件を満たせば、
テーマ・チェック・未修得絞り込み等の周辺機能もexerciseType非依存の
既存ロジックがそのまま機能するため、個別の確認条件を積み増す必要が無い)。

達成の確認方法: boki-appの`scripts/export-exercise-view.mjs`が実際の
`output/exercises/exercises.json`(現時点で承認済みKnowledge1件分、定額法の
formula_ordering)からExercise View JSONを生成し、財表ドリル(html-v2)を
ローカルで起動してそのファイルを読み込み、出題→並べ替え回答→採点→
学習履歴(修得/チェック)への反映までを実際に確認する。

## 12. 明示的にスコープ外とすること

- 財表ドリル側のコード変更(evLoaderの検証強化、exerciseType追加、
  UI文言のboki-app対応等)は、今回は不要と判断したため行わない。
- 複数データセットの同時読み込み・統合出題キュー。
- 論点単位のテーマ階層分割(8節)。
- Knowledge審査待ちの6件・保留中の項目(為替手形の振出人・減価償却費の
  月割計算等)は、Phase Cから引き続き保留のままPhase Dを進める
  (承認され次第、次回のExercise生成・エクスポートに自動的に反映される)。
