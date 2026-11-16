# M5詳細設計: Exercise生成(定額法1件から問題1問)

本ファイルは、`planning/vertical_slice_mvp_roadmap.md`のM5(承認済みKnowledgeから
問題が生成される)の詳細設計である。対象は、M4でユーザーが実際に承認した
定額法のDerived Knowledge**1件のみ**(`dk-calc-formula-teigakuho`)。汎用的な
問題生成エンジンは作らず、この1件から問題1問を生成するところまでを対象とする。

**改訂について**: 初版(`prompt.choices`にM5が固定シャッフルした表示順を
持たせる案、`explanation`という名称、正誤判定をM6が独自ロジックで行う
前提)に対するユーザーレビューを受け、4節・5節・7節・8節を全面的に改訂した。
主な変更点は次のとおり。

- **正誤判定の責務分離を明確化**(7節): M5は「正解チャンク・正解順序・
  判定方式」をExerciseデータの契約として定義するところまでとし、実際の
  ユーザー回答を受け取って判定を実行する処理はM6側の責務とする。
  `exerciseKind`とは独立した`answer.grading.method`(open vocabulary)を
  新設し、M6側が判定方式ごとの実行ロジックをレジストリ的に持てるようにする
  (`exerciseKind`にジャッジ方法を直接ハードコードしない)。
- **提示順序のシャッフルをM5から削除**(旧5-1節を削除、4節・5節を改訂):
  `prompt.choices`(固定シャッフル済みの表示順)というフィールドを廃止し、
  Exerciseは`answer.correctOrder`(正解チャンク+正解順序を兼ねる、唯一の
  正本)のみを持つ。提示順序のシャッフルはM6の表示時の責務とする。
- **`prompt.instruction`が教材由来でないことをデータ上明示**(4節): 
  `instructionOrigin: "app_generated"`を追加した。
- **`explanation`を`reveal`へ改称し、内容を厳格に限定**(8節): 自然言語に
  よる「なぜこの式になるか」という解説文は今回生成しない。正しい式・
  Knowledge参照・Source参照のみを保持する、意図的に最小限のフィールドとする。

**本ファイルは設計のみを行う。** この改訂版を実装対象とする。

参照した既存資料(Git管理下のSSOT):

- `CLAUDE.md`(特に原則1・2・3・4・5)/ `SPEC.md`(特に3節・5節) / `TASK.md`
- `planning/vertical_slice_mvp_roadmap.md`(M5〜M6の定義、6節・7節・9節)
- `planning/boki-app-integration-proposal.md`4節(Zaihyo Parser資産の再評価。
  レジストリパターンの再利用可否)
- `planning/m2_derived_knowledge_candidate_design.md`(Knowledge層のデータ構造、
  11節でExercise接続の責務境界を既に一部整理済み)
- `planning/m4_review_workflow_design.md`(`approved-knowledge.json`の性質)

---

## 0. 前提・スコープ確認

- 入力は`output/knowledge/approved-knowledge.json`(M4が生成した、承認済み
  Knowledgeのみを含む派生ビュー)**1件のみ**。`output/cases/*.json`
  (candidate/rejectedを含む生データ)には一切触れない(5節で徹底する)。
- ゴールは「承認済みKnowledge1件から、実際に解ける問題を1問生成する」ことで
  あり、複数問題・複数形式・ランダム出題は対象外(10節)。
- 出題形式は固定しない(CLAUDE.md原則5)という既存原則を尊重しつつ、今回は
  最初の1形式だけを実装する(3節で選定)。

---

## 1. 既存設計の棚卸し(何が既に確定していて、何が未着手か)

`SPEC.md`・`CLAUDE.md`・`planning/`を確認した結果、Exercise層について
**確定している設計**と**未着手の設計**は次のとおりだった。

| 項目 | 状態 | 出典 |
|---|---|---|
| Source/Derived Knowledge/Exerciseの3層構造 | 確定 | `SPEC.md`3節 |
| Exercise層はレジストリ設計(出題形式ごとにハンドラを追加できる)にする | 確定(アーキテクチャ原則) | `CLAUDE.md`原則5 |
| 出題形式は「穴埋め」「並び替え」に固定しない、将来の未知形式に対応できる設計にする | 確定(原則) | `CLAUDE.md`原則5・`SPEC.md`5節 |
| 初期に想定される2形式(仕訳穴埋め・公式並び替え)は「一例」であり確定仕様ではない | 確定(スタンス) | `SPEC.md`5節 |
| 既存Zaihyo Parserの`ordering`(`assembledFromSource`前提)はそのまま流用しない | 確定 | `SPEC.md`5節・`vertical_slice_mvp_roadmap.md`6-1節 |
| Zaihyo ParserのExerciseViewレジストリパターン(`html-v2/js/registry.js`)は設計思想として再利用候補 | 確定(思想のみ、スキーマは非流用) | `boki-app-integration-proposal.md`4節 |
| **Exerciseの具体的なデータモデル(フィールド定義)** | **未着手** | `SPEC.md`3節が明記 |
| **公式の出題形式の具体的なUI・データ構造** | **未着手** | `SPEC.md`5節が明記 |

**結論**: 「レジストリで拡張できるようにする」「特定の形式に固定しない」という
**アーキテクチャ原則**は既存設計として確定しているため、これはそのまま尊重する。
一方、Exerciseの**具体的なデータモデル**は白紙であるため、今回新規に設計する。
既存の`ordering`データモデルへ引きずられないよう、3節で改めてゼロベースの
検討を行う(ユーザー指示どおり)。

---

## 2. Knowledge / Exerciseの責務境界(一方向のデータフロー)

CLAUDE.md原則3(出典追跡)・原則2(原文保持)を踏まえ、次の原則を確定する。

```
承認済みKnowledge(output/knowledge/approved-knowledge.json)
   │  読み取り専用(Exercise生成はこのファイルを一切書き換えない)
   ▼
Exercise生成
   │
   ▼
Exercise(output/exercises/exercises.json、新設)
```

- **Exercise生成は、承認済みKnowledgeの内容を一切書き換えない。** 問題を
  作る都合で`content`・`contentConfidence`・`evidence`・`consolidation`等へ
  情報を書き戻すことは行わない。
- **Exercise生成は`approved-knowledge.json`のみを読む。** `output/cases/`
  配下(candidate/rejectedを含む生データ)には触れない。M4が確立した
  「M5はcandidateを直接使わない」という境界(`m4_review_workflow_design.md`
  6-1節)を、M5自身の実装でも徹底する。
- **Exerciseは必ず`knowledgeRef`でKnowledgeを参照する。** Knowledgeの内容を
  Exercise側へ複製・改変するのではなく、参照を持たせたうえで、表示に必要な
  最小限の情報だけをExercise自身のデータとして保持する(4節で詳述)。

---

## 3. 最初の問題形式の比較・選定

`vertical_slice_mvp_roadmap.md`は「並び替え」を候補としていたが、これは
Knowledgeの実データが存在しない段階での暫定案だった。今回、実際に生成された
`content.structure`(5トークン語彙による構造化結果)を踏まえて、改めて比較する。

### 3-1. 候補

| 候補 | 内容 | 評価 |
|---|---|---|
| **A. 並び替え(トークン単位)** | `content.structure.tokens`(トップレベルの5要素)をシャッフルし、正しい順序に並べ替えさせる | 後述、採用 |
| B. 穴埋め(空所補充) | 式の一部(例: 分母の`耐用年数`)を隠し、選択肢から選ばせる | 「どこを隠すか」「どんな誤答選択肢を作るか」という**新しい判断**が必要になり、教材にない情報(誤答の妥当性等)を追加するリスクがある。今回のVertical Sliceには荷が重い |
| C. 意味↔式のマッチング | 「取得原価から残存価額を引き、耐用年数で按分する方法は?」のような自然文とこの式を対応させる選択問題 | 自然文による言い換えが必要になり、CLAUDE.md原則2(要約・言い換え禁止)に抵触するリスクが高い。Source/Knowledgeに存在しない新しい文章を作ることになる |
| D. 数値当てはめ計算問題 | 実際の数値(取得原価◯◯円等)を与えて計算させる | 今回のKnowledge(定義式のみ、`role: definition`)には数値適用例が無い(第2ケースの`application`Sourceが必要)。存在しないデータを捏造することになり、原則4に反する |

### 3-2. 選定: A(並び替え、ただしトップレベルトークン単位)

**Aを採用する。** 理由は次のとおり、ユーザーが挙げた5条件すべてを満たす。

- **Knowledgeとの対応が明確**: `content.structure.tokens`(トップレベル配列)を
  そのまま使う。Exercise生成側で新しい分解ロジックを作る必要がない。
- **正解を機械的に判定できる**: 配列の順序比較のみで判定できる(4節)。
- **教材にない意味を勝手に追加しない**: シャッフル(順序の変更)のみを行い、
  各トークンの表示文字列は`renderTokens()`でそのままレンダリングする
  (M2・M3・M4で共有している同じ関数を再利用。5節で詳述)。新しい文言・
  解釈を一切加えない。
- **実装が小さい**: 新しいトークン分解ロジックが不要(既存の`content.
  structure`をそのまま使う)。
- **後の汎用化を邪魔しない**: 将来、より細かい粒度(`group`の中身まで
  シャッフル対象にする等)で別形式を作る場合も、同じ`content.structure`から
  別の粒度で生成すればよく、Knowledge側のデータモデルに手を入れる必要がない。

### 3-3. シャッフル粒度の確定(roadmap案の具体化)

`vertical_slice_mvp_roadmap.md`6-2節は「`structure.tokens`をシャッフルする」
とのみ書いており、どの階層をシャッフル単位にするかを specifiedしていなかった。
今回、実際の構造を見たうえで**トップレベルの5要素**(`group`・`operator`・
`group`・`operator`・`term`)を1つの塊としてシャッフル単位にすることを
確定する。

理由: `group`・`fraction`の中身(例: `取得原価`・`－`・`残存価額`)まで
individually にシャッフルすると、「（」「）」「／」のような構造記号を
どう提示するかという新しい表示上の問題が生じる。トップレベル単位で
シャッフルすれば、各チャンクは`renderTokens()`で完全な文字列
(`「（取得原価－残存価額）」`等)としてレンダリングでき、構造記号の
表示問題が発生しない。

---

## 4. Exerciseの最小データモデル(改訂版)

```jsonc
{
  "type": "Exercise",
  "id": "exercise-teigakuho-formula-ordering",
  "exerciseKind": "formula_ordering",   // open vocabulary。将来の形式追加を妨げない(CLAUDE.md原則5)
  "knowledgeRef": {
    "knowledgeId": "dk-calc-formula-teigakuho",
    "approvedAt": "(approved-knowledge.jsonのapprovedAtをそのまま転記)"
  },
  "prompt": {
    "instruction": "正しい式になるように並べ替えてください。",  // 教材原文ではない、UI操作指示文(4-2節)
    "instructionOrigin": "app_generated"   // instructionが教材由来ではないことをデータ上明示する
  },
  "answer": {
    "correctOrder": [
      "（取得原価－残存価額）",
      "×",
      "（１年／耐用年数）",
      "＝",
      "年間減価償却費"
    ],
    "grading": {
      "method": "exact_sequence_match"   // open vocabulary。判定方式のレジストリキー(7節)
    }
  },
  "reveal": {
    "rawFormula": "（取得原価－残存価額）×（１年／耐用年数）＝年間減価償却費",
    "sourceRefs": [{ "sourceBlockId": "block-teigakuho-def", "role": "definition" }]
  }
}
```

**旧版からの変更点**: `prompt.choices`(M5が固定シャッフルした表示順)を
廃止した。Exerciseが持つのは`answer.correctOrder`(正解チャンクの集合+
正しい順序を兼ねる、唯一の正本)のみであり、**提示順序のシャッフルは
M6の表示時の責務**とする(4-3節)。`explanation`は`reveal`へ改称し、
内容を最小限に絞った(8節)。

### 4-1. 各フィールドの位置づけ(ユーザー指定の8項目との対応)

| ユーザー指定の項目 | 対応するフィールド |
|---|---|
| Exercise自身のID | `id` |
| 元になったKnowledgeへの参照 | `knowledgeRef`(`knowledgeId`必須。`approvedAt`は「どの承認時点の内容から作られたか」の追跡用) |
| 問題形式 | `exerciseKind`(open vocabulary、レンダリングの手がかりとなるレジストリキー) |
| 問題として表示する情報 | `prompt.instruction`+`answer.correctOrder`(M6がこれをシャッフルして表示、4-3節) |
| 選択肢等の回答に必要な情報 | `answer.correctOrder`(表示用シャッフルの元データとしても、正誤判定の正本としても使う唯一のフィールド) |
| 正解 | `answer.correctOrder` |
| 正誤判定に必要な情報 | `answer.correctOrder`+`answer.grading.method`(7節で判定方法を詳述) |
| 解説表示に必要な情報 | `reveal`(`rawFormula`+`sourceRefs`。8節で「解説」ではなく「開示情報」に限定する理由を説明) |

### 4-2. `prompt.instruction`はKnowledgeでもSourceでもない

`instruction`(「正しい式になるように並べ替えてください。」)は、**教材由来の
情報ではなく、UI操作を説明するための問題生成上の追加文言**である。
`instructionOrigin: "app_generated"`という値をデータ自体に持たせることで、
「これは教材から読み取った情報ではない」という区別を、ドキュメントの説明
だけでなく実データからも機械的に判別できるようにする(6節で扱いを詳述)。
生成AIによる問題文生成・言い換えは行わず、固定文言をそのまま使う。

### 4-3. 提示順序のシャッフルはM6の責務(新設)

**Exerciseの正本データ(`answer.correctOrder`)には、特定の提示順序を
一切含めない。** 理由:

- 正解チャンクの集合は`answer.correctOrder`の要素そのものであり、
  「正解順序」と「シャッフルして見せる順序」を別々のフィールドとして
  Exercise側に持たせると、2つの配列が同じ要素集合を表しているという
  不変条件を常に維持する責務が生まれる(M4で回避した「evidenceと
  sourceRefsが矛盾しうる」のと同種の問題)。
- 同じExerciseを繰り返し解く場合に、毎回同じ順序で出題されるより、
  M6が表示のたびに独自にシャッフルできるほうが学習UIとして自然である。
- M5はここでも決定的な処理(同じ入力から常に同じ出力)を維持できる
  (`answer.correctOrder`は`content.structure.tokens`から一意に決まり、
  乱数を一切使わない)。

したがって、**「正解チャンク+正解順序」を持つのがM5(Exercise生成)の責務、
「その中身をどう並べ替えて画面に見せるか」はM6(学習UI)の責務**、という
分担にする。M5はシャッフル関数を一切実装しない。

---

## 5. Knowledge → Exercise変換規則(改訂版)

```
承認済みKnowledge(dk-calc-formula-teigakuho)
   │
   ├─ content.structure.tokens(トップレベル5要素)
   │     │ 各要素をrenderTokens()でレンダリング(M2・M3・M4と同じ関数を再利用)
   │     ▼
   │  ["（取得原価－残存価額）", "×", "（１年／耐用年数）", "＝", "年間減価償却費"]
   │     │
   │     └─ そのまま answer.correctOrder へ(シャッフルはしない、4-3節)
   │
   ├─ content.rawFormula → reveal.rawFormula へそのままコピー
   │
   └─ sourceRefs → reveal.sourceRefs へそのままコピー
```

### 5-1. `renderTokens`の再利用(重複実装を作らない)

M2実装時に発見した「往復整合性チェックの重複実装リスク」(`m2_derived_
knowledge_candidate_design.md`実装時の教訓)と同じ考え方を踏襲し、
Exercise生成が`answer.correctOrder`を作る際も、`src/knowledge/
formulaTokenizer.mjs`の`renderTokens`をそのまま再利用する(新しい
レンダリングロジックを作らない)。

### 5-2. `answer.grading.method`は固定値でよい

今回は判定方式が1種類(`exact_sequence_match`)しかないため、Exercise
生成側は常にこの固定値を設定する。判定方式を選ぶロジック(条件分岐)は
不要——`exerciseKind`と`grading.method`が今回たまたま1:1対応するだけであり、
将来別の`exerciseKind`が同じ`grading.method`を共有したり、逆に同じ
`exerciseKind`でも状況により異なる`grading.method`を使ったりする余地を
残すため、この2つのフィールドは今回も独立させたまま実装する(4節)。

---

## 6. 教材忠実性の扱い(Source → Knowledge → Exerciseの追跡)

各段階で「何が原文由来か」「何が構造変換か」「何が問題生成上の追加情報か」を
明確に区別する。

| 段階 | 原文由来(そのまま) | 構造変換(機械的、意味を変えない) | 問題生成上の追加情報(教材に無い) |
|---|---|---|---|
| Source | `sourceFaithful`(正本) | — | — |
| Derived Knowledge | `content.rawFormula`(`sourceFaithful`の複製) | `content.structure`(5トークン語彙への構造化、往復整合性保証) | — |
| Exercise | `reveal.rawFormula`(`content.rawFormula`の複製) | `answer.correctOrder`(`structure.tokens`の各要素をレンダリングしただけ、順序は変えない) | `prompt.instruction`(操作説明文、`instructionOrigin`で明示、4-2節) |

**Exercise生成において新たに追加される情報は`prompt.instruction`のみ**で
あり、これは「教材の内容」ではなく「問題を解くための操作説明」という
明確に異なるカテゴリである。この境界を、ドキュメント上の説明だけでなく
`instructionOrigin: "app_generated"`というデータ自体のフィールドとしても
分離しておく(`prompt`と`reveal`を同じフィールドに混在させない)。

---

## 7. 正誤判定方法(改訂版: M5が契約を定義、M6が実行)

### 7-1. 責務分離

```
M5(Exercise生成)の責務:
  - 正解チャンク・正解順序を生成する(answer.correctOrder)
  - どの判定方式を使うべきかを宣言する(answer.grading.method)
  ↓ Exerciseデータとして受け渡す
M6(学習UI)の責務:
  - ユーザーの回答(並べ替えた結果)を受け取る
  - answer.grading.methodを見て、対応する判定ロジックを実行する
  - 判定結果(正解/不正解)を表示する
```

**M6は`exerciseKind`ごとに正誤判定をハードコードしない。** 判定方式は
`answer.grading.method`という独立したopen vocabularyのキーで表現し、M6側は
このキーに対応する判定関数をレジストリ的に引けるようにする(実装イメージ:
`gradingRegistry["exact_sequence_match"](userAnswer, exercise.answer)`の
ような、キー→関数のマップ)。**この「キー→判定関数」のレジストリ自体は
M6実装時に作るものであり、M5は`grading.method`という値を1つ設定するだけ**
(7-2節)。

### 7-2. 今回の判定方式: `exact_sequence_match`

```
ユーザーが並べ替えた結果(文字列配列) === answer.correctOrder(完全一致比較)
```

部分点・ヒント・複数正解の許容等は行わない(10節)。`answer.grading.method
= "exact_sequence_match"`という値を設定することが、M5がこのExerciseに
対して行う唯一の「判定方式の指定」である。実際の比較処理(JSの`===`相当の
配列比較関数)はM6側に実装する(11節のファイル構成で、この契約に対応する
最小限の判定関数をM5側にも用意するかは12節で検討する)。

---

## 8. 解説ではなく「開示情報」の扱い(改訂版、重要)

**今回のKnowledgeは定額法の公式そのものであり、教材に存在しない「なぜこの
式になるのか」という自然言語の解説文を、M5が勝手に生成することはしない。**
CLAUDE.md原則2(要約・言い換え禁止)・原則4(推測しない)を、Exercise層でも
徹底する。

そのため、フィールド名を`explanation`(解説)から`reveal`(正解後に開示する
情報)へ改め、内容を次の2つだけに厳格に限定する。

- `reveal.rawFormula`: 正しい式(教材上の忠実な表現、`content.rawFormula`
  の複製)。
- `reveal.sourceRefs`: 元のSourceへの参照(`sourceRefs`の複製)。学習者が
  「教材のどこにこの式が書かれているか」を辿れるようにする(原則3)。

**含めないもの**: 「なぜこの式になるのか」「どういう場面で使うのか」等の
自然言語による解説。これらは、対応する教材Source(留意点・解説ブロック等)
が実際に存在し、それが別のDerived Knowledgeとして公式化された後に、
`reveal`へ`sourceRefs`を追加する形で拡張する方が安全である(今回のスコープ
外、12節)。

---

## 9. M6への出力契約

### 9-1. 新設: `output/exercises/exercises.json`

```jsonc
{
  "exercises": [
    { /* 4節のExerciseオブジェクト */ }
  ]
}
```

M4が確立した「ステージごとに専用の派生ストアを持つ」というパターン
(`output/knowledge/approved-knowledge.json`)をそのまま踏襲する。**M6は
このファイルだけを読み、`approved-knowledge.json`や`output/cases/`には
一切触れない**(2節の一方向データフローを、M5→M6の境界でも維持する)。

### 9-2. 教材保護(既存パターンの踏襲)

`reveal.rawFormula`は教材原文由来のデータを含むため、`output/exercises/`
も既存`.gitignore`の`/output/`除外ルールの範囲内に置く(追加の除外設定は
不要)。

### 9-3. M6が必要とする情報がすべて揃っているか

`vertical_slice_mvp_roadmap.md`7節の要件(問題を見る→回答する→正誤を見る→
正解・解説を見る)を、4節のExerciseオブジェクト1件だけで満たせることを
確認済み(`prompt.instruction`+`answer.correctOrder`をM6がシャッフルして
表示→回答操作→`answer.grading.method`で判定→`reveal`で開示情報を表示)。

---

## 10. 実装範囲の提案

### 10-1. 今回実装するもの

- `output/knowledge/approved-knowledge.json`から`dk-calc-formula-teigakuho`
  1件を読み込み、4節のExerciseオブジェクト1件を生成するロジック
  (`src/exercise/`配下、このKnowledge専用)
- `renderTokens`を使った`answer.correctOrder`の生成(5節)
- `output/exercises/exercises.json`への書き出し
- M3開発用確認UIへ「8. Exercise」セクションを追加(閲覧のみ、ユーザー指示。
  13節で詳述)
- 単体テスト(架空のKnowledgeデータを使用)・実データによる統合テスト
  (`approved-knowledge.json`が存在する場合のみ実行、構造的性質のみ検証)

### 10-2. 今回実装しないもの(先送り)

- 複数の出題形式に対応するレジストリ機構そのもの(1形式しか無いため、
  `exerciseKind`という**将来の拡張点だけ**を用意し、実際の分岐ロジックは
  作らない。`m4_review_workflow_design.md`と同じ「先回りして抽象化しない」
  方針を踏襲)
- 提示順序のシャッフル処理そのもの(4-3節、M6側の実装)
- 判定方式のレジストリ(キー→判定関数のマップ)そのもの(7-1節、M6側の
  実装。M5は`grading.method`という値を1つ設定するだけ)
- 複数Exercise・複数Knowledgeへの対応(承認済みKnowledgeが複数になった
  場合にどう扱うかは、次のケースに着手する時点で判断する)
- 穴埋め形式(`journal_pattern`向け、3節で比較検討のみ行い実装しない)
- 学習履歴・進捗保存・未修得管理(roadmap9節で既に後回しと判断済み)

---

## 11. 最小限必要なファイル構成(案)

```
src/exercise/
  generateFormulaOrderingExercise.mjs   このKnowledge専用の生成ロジック
scripts/
  run-teigakuho-exercise.mjs             CLIエントリポイント
test/exercise/
  generateFormulaOrderingExercise.test.mjs        単体テスト(架空データ)
  generateFormulaOrderingExercise.integration.test.mjs  統合テスト(実データ、構造的性質のみ)
output/
  exercises/
    exercises.json                       新設(Git管理対象外、9-2節)
```

---

## 12. 実装前の確認事項(解決済み)

初版で未決だった3項目は、ユーザーレビューにより次のとおり解決した。

1. **正誤判定ロジックの置き場所** → 7-1節のとおり解決。M5は`answer.
   correctOrder`+`answer.grading.method`という契約を定義するところまで。
   実際の判定処理の実装はM6側(13節)。
2. **M3開発用確認UIへの表示追加の要否** → 追加する(ユーザー指示、13節)。
3. **`prompt.instruction`の文言** → 「正しい式になるように並べ替えて
   ください。」に確定(4節)。`instructionOrigin: "app_generated"`で
   教材由来でないことをデータ上明示する。

---

## 13. M3開発用確認UIへの追加(セクション8)

M2〜M4が確立してきたパターン(既存確認UIへ新しいセクションを追加する、
新しい画面は作らない)をそのまま踏襲する。**この画面はあくまで開発用の
確認画面であり、「問題を解くUI」にはしない**(実際に解く操作はM6で作る)。

セクション8として、次の情報を表示する(ユーザー指定の9項目)。

| 表示項目 | 対応するExerciseフィールド |
|---|---|
| Exercise ID | `id` |
| 元Knowledge ID | `knowledgeRef.knowledgeId`(「7. Derived Knowledge候補」のKnowledge IDと一致することを、見比べて確認できるようにする) |
| 問題形式 | `exerciseKind` |
| instruction | `prompt.instruction`+`instructionOrigin`のバッジ(教材由来でないことを視覚的に示す) |
| 出題時に提示されるチャンク | `answer.correctOrder`の各要素(このUIでは並べ替え済みの正しい順序のまま表示してよい。シャッフル自体はM6の責務であり、M3は「Exerciseの中身が正しく生成されたか」を確認する場であるため) |
| 正解順序 | `answer.correctOrder`(上記と同じ配列だが、「これが正解である」ことが分かるように明示的にラベル付けする) |
| 判定規則 | `answer.grading.method` |
| 解説として利用する情報 | `reveal.rawFormula`+`reveal.sourceRefs` |
| Knowledgeからどのように変換されたか | 5節の変換規則をUI上でも簡潔に示す(例: 「`content.structure.tokens`の各要素をrenderTokens()でレンダリングしたもの」という説明文+`content.rawFormula`との突き合わせ表示) |

「このExerciseは、私が承認したどのKnowledgeから生成されたのか」が一目で
追えるよう、セクション7(Derived Knowledge候補)とセクション8(Exercise)を
`knowledgeId`で見比べられる位置に配置する。

---

以上がM5(Exercise生成、定額法1件から問題1問)の詳細設計(改訂版)である。
この内容で実装へ進む。
