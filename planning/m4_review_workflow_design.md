# M4詳細設計: Derived Knowledge候補の承認・修正・除外(定額法1件)

本ファイルは、`planning/vertical_slice_mvp_roadmap.md`のM4(Knowledgeを承認
できる)の詳細設計である。対象は、M2で生成した定額法のDerived Knowledge候補
**1件のみ**(`dk-calc-formula-teigakuho`)。汎用的なレビュー管理画面は作らず、
現在のM3開発用確認UIを最小限発展させる。

**改訂について**: 初版(3節「修正可能フィールド」を`structure`/`sourceRefs`/
`contentConfidence`/`evidence`/`consolidation`/`scopeNote`の6項目とし、
JSON自由編集で修正する案)に対するユーザーレビューを受け、修正可能範囲を
再検討した。`sourceRefs`・`evidence`・`consolidation`はSourceとの関係から
機械的に決まる性質が強く、自由編集を許すと「Sourceと矛盾するsourceRefs」
「sourceRefsと矛盾するevidence」等の不整合を人間が作れてしまう。この結果を
踏まえ、3節を全面的に改訂し、修正可能範囲を`contentConfidence`・
`scopeNote`の実質2項目へ縮小した。また、6節(approved-knowledge.jsonの性質)
を「ケースファイルからの一方向の派生ビュー」として明確化した(ユーザー提案を
採用)。**この改訂版が実装対象である。**

**本ファイルは設計のみを行う。** コード実装には進まない。

参照した既存資料(Git管理下のSSOT):

- `CLAUDE.md` / `SPEC.md` / `TASK.md`
- `planning/source_derived_knowledge_design_proposal.md`(データモデル正式設計)
- `planning/vertical_slice_mvp_roadmap.md`(M1〜M6のマイルストーン定義。特に
  5-2節・8節のM4定義)
- `planning/m2_derived_knowledge_candidate_design.md`(M2設計。特に10節
  reviewStatusの扱い、5-2節の3軸モデル)
- `planning/m1_minimal_parser_prototype_design.md`(M1設計。5-3節の教材保護
  パターンをM4のデータ配置でも踏襲する)

---

## 0. 前提・スコープ確認

- 対象は`output/cases/teigakuho-definition.json`の`derivedKnowledgeCandidate`
  1件のみ。他の候補・他のケースは扱わない。
- ゴールは「今ブラウザで見えている定額法1件を、実際に承認して公式Knowledge
  にできる」ことであり、承認/修正/除外のワークフロー全体を汎用化すること
  ではない(ユーザー指示)。
- M3の閲覧専用UIを土台とし、新しい管理画面を別途作らない。

---

## 1. reviewStatusの状態遷移(最小)

### 1-1. 状態は3つのみ

```
candidate(M2が生成した初期状態)
   │
   ├─ 承認 ──────────────→ approved
   │
   └─ 除外 ──────────────→ rejected

candidate ── 修正 ──→ candidate(内容が更新されるが状態は変わらない)
```

**`approved`・`rejected`からの遷移は今回定義しない**(承認取り消し・再考の
フローは9節の未決事項とし、今回は「一度決定したら、この画面上では変更
しない」という一方向の運用とする)。理由: 取り消しを許すと「承認済み
Knowledgeが後から消える」ケースをM5側が考慮する必要が生じ、縦切りMVPの
最小スコープを超える。

### 1-2. reviewStatusを持つ場所(既存方針の踏襲)

`m2_derived_knowledge_candidate_design.md`10節でユーザー承認済みの方針
(案A)をそのまま踏襲し、`reviewStatus`はDerived Knowledge本体
(`knowledge`)の外側で管理し続ける。M4ではこれに加えて、レビュー行為
そのものの記録として次の2フィールドを**同じ外側の階層**へ追加する。

```jsonc
"derivedKnowledgeCandidate": {
  "reviewStatus": "candidate" | "approved" | "rejected",
  "reviewedAt": null | "ISO日時",   // 承認/除外が行われた日時。修正のみでは更新しない
  "reviewNote": null | "人間が残したコメント(除外理由・修正メモ等)",
  "knowledge": { ... }              // 3軸モデル等、Knowledgeそのものの内容
}
```

`reviewedAt`/`reviewNote`も`knowledge`の外側に置く。理由は`reviewStatus`と
同じで、これらは「人間のレビュー工程の記録」であり、Knowledgeの内容・
確信度・出典とは別の関心事だからである(5-2節で再確認する)。

---

## 2. 承認(approve)

### 2-1. 何が変わるのか

- `derivedKnowledgeCandidate.reviewStatus`が`"candidate"`から`"approved"`へ
  更新される。
- `derivedKnowledgeCandidate.reviewedAt`に承認日時が記録される。
- **`knowledge`オブジェクト自体(`content`/`sourceRefs`/`contentConfidence`/
  `evidence`/`consolidation`/`scopeNote`)は変更しない。** 承認は「今の内容を
  公式Knowledgeとして認める」という行為であり、内容そのものを書き換える
  行為ではない(修正は別操作、3節)。

### 2-2. どこへ保存されるのか(2箇所への書き込み、6節で詳述)

1. `output/cases/teigakuho-definition.json`(既存ファイル)の
   `derivedKnowledgeCandidate`を更新する(監査証跡として、この候補が
   いつ・どういう経緯で承認されたかを引き続き1つのケースファイルに残す)。
2. **新設**`output/knowledge/approved-knowledge.json`(6節)へ、承認された
   `knowledge`オブジェクトを追記する。これがM5への入力になる。

### 2-3. candidateとapprovedの区別、DK本体とレビュー状態の分離

1-2節の構造そのものが区別・分離を実現する。`reviewStatus`という1つの
フィールドを見るだけで区別でき、`knowledge`の内容は承認の前後で不変で
あるため、「承認によって内容が変わってしまう」という事故が起こらない。

---

## 3. 修正(edit、改訂版)

### 3-1. フィールドをA(人間が直接編集)/B(システムが再計算)/C(編集不可)に分類する

`content.rawFormula`のSource忠実性(3-1節・M2設計6-1節で確定済み)に加え、
今回の再検討で、`sourceRefs`・`evidence`・`consolidation`も**Sourceとの
関係から機械的に決まる性質が強く、人間の自由編集を許すと矛盾を作れる**
ことが分かった(実際のSourceと一致しない`sourceRefs`、`sourceRefs`と
矛盾する`evidence`、Source1件なのに`merged_confirmed`になっている
`consolidation`、等)。この結果、修正可能範囲を次の3分類へ縮小する。

| 分類 | フィールド | 理由 |
|---|---|---|
| **A. 人間が直接編集する** | `contentConfidence`(level・note)、`scopeNote` | レビューによる確信度の再評価・注記そのものが人間判断の対象であり、機械的に導出できない |
| **B. システムが`sourceRefs`から再計算する(人間は直接編集しない)** | `evidence`、`consolidation` | `sourceRefs`が変わらない限り値も変わらないため、今回のケースでは実質固定値になるが、**保存のたびにsourceRefsから再計算する**ことで、手で書き換えて矛盾を作れないようにする(将来sourceRefsが増える別ケースに備えた、正しい依存関係を今のうちに作っておく) |
| **C. 編集不可(固定)** | `type`・`id`・`knowledgeKind`・`content.rawFormula`・`content.structure`・`sourceRefs` | `rawFormula`はSource忠実性の不変条件(4節)。`structure`はこの式の正規表現ベースの機械的トークン化で一意に決まり、解釈の余地が無い(このケースには構造化の曖昧さが存在しない)。`sourceRefs`はSourceの実在性そのものに関わるため、人間の自由編集を許さない |

**もし`sourceRefs`自体を増やす必要が生じたら**(第2ケースで複数Sourceを
参照する等)、それはM4の「修正」ではなく、M2(Derived Knowledge生成)側で
新しいSourceを追加して再生成する話である(責務の混同を避ける)。

### 3-2. 編集方法(最小: 2フィールド分の小さなフォーム)

A分類が実質2項目(`contentConfidence`・`scopeNote`)まで縮小したため、
JSON自由編集ではなく、**この2項目だけの単純なフォーム**で足りる
(JSON構文エラーというクラスの不具合自体が起こらないという利点もある)。

```
編集フォームの入力項目:
- contentConfidence.level (テキスト入力、現在値を初期表示)
- contentConfidence.note  (テキストエリア)
- scopeNote               (テキストエリア)
- reviewNote(修正メモ、任意) — 「何を・なぜ修正したか」の記録
```

保存時、サーバ側は次の手順で再構成する。

```
新しいknowledge = {
  type, id, knowledgeKind, content: { rawFormula, structure },
    ← すべて元の値のまま(C分類、変更不可)
  sourceRefs: (元の値のまま、変更不可。C分類)
  contentConfidence: (編集後の値。A分類)
  evidence, consolidation: (sourceRefsから再計算した値。B分類、5節参照)
  scopeNote: (編集後の値。A分類)
}
```

**この再構成の方法自体が、C分類のフィールドを編集不能にする**(UIでの
注意書きに頼らず、機構として書き換えられなくする。3-1節初版からの方針は
維持)。

### 3-3. evidence/consolidationの再計算ロジック(B分類)

M2の`deriveTeigakuhoKnowledgeCandidate`が最初に計算したのと**同じロジック**
を再利用し、`sourceRefs`から`evidence.byRole`・`consolidation.state`等を
毎回再計算する(このケースでは`sourceRefs`が不変のため、常に同じ値に
なる)。新しい計算ロジックを別途書かない。

### 3-4. 保存時の再検証(fail-closed)

`content.structure`はC分類(編集不可)になったため、通常は往復整合性が
崩れる余地は無い。ただし、将来の変更に備えた防御として、保存の都度
`renderTokens(structure) === rawFormula`を再検証し、万一崩れていたら
保存を拒否する(`src/knowledge/formulaTokenizer.mjs`の`renderTokens`を
再利用。M2・M3・M4で同じ実装を共有し、食い違いを防ぐ)。

### 3-5. 修正操作はreviewStatusを変えない

修正は`candidate`状態でのみ許可し(1-1節)、修正後も`reviewStatus`は
`candidate`のまま(承認は別操作)。`reviewNote`に「何を・なぜ修正したか」
を人間が記録できるようにする(任意入力)。

---

## 4. 除外(reject)

### 4-1. 単純削除ではなく状態遷移として扱う

`derivedKnowledgeCandidate`全体を削除するのではなく、`reviewStatus`を
`"rejected"`に更新し、`knowledge`はそのまま残す。**除外理由
(`reviewNote`)の入力を推奨(必須にはしない。最小構成を優先し、後から
理由を追記できる仕組みまでは今回作らない)。**

### 4-2. 監査可能性

`output/cases/teigakuho-definition.json`を見れば、「この候補は検出され、
人間が確認し、不採用と判断した」という経緯がそのまま残る
(`reviewStatus: "rejected"`・`reviewedAt`・`reviewNote`)。M3の画面でも
このケースを開けば、`rejected`であることと理由がいつでも確認できる。
**新しい「除外ログ」のような別データ構造は作らない**(3-8節の候補一覧
レポートが持つ「除外ログ」概念とは別物であることに注意。あちらはParserが
候補化すらしなかった領域の記録、こちらは人間がいったん候補として認めた
上で不採用にした記録であり、性質が異なる)。

### 4-3. approved-knowledge.jsonへは書き込まない

除外された候補は、6節の`approved-knowledge.json`に一切登場しない。
「そこに無いことがすなわち除外された(または未決)ことを意味する」という
単純な設計にする。

---

## 5. 永続化(ローカルファイルへの書き戻し、DBは導入しない)

### 5-1. 新しいAPIエンドポイント(既存サーバの延長)

`src/devViewer/server.mjs`(M3で作成済み)に、GETに加えてPOSTを3つ追加する。
既存の`/api/case/<name>`と同じ許可リスト方式(`ALLOWED_CASES`)を流用し、
汎用的な「どのケースでも何でも書き込める」エンドポイントにはしない。

| メソッド・パス | 用途 | body |
|---|---|---|
| `POST /api/case/<name>/approve` | 承認 | `{ "note"?: string }` |
| `POST /api/case/<name>/reject` | 除外 | `{ "note"?: string }` |
| `POST /api/case/<name>/edit` | 修正 | `{ "contentConfidence": {"level","note"}, "scopeNote", "note"? }`(3-2節、A分類の2項目のみ。`evidence`/`consolidation`はサーバ側がB分類として再計算する) |

いずれも`reviewStatus`が`candidate`のときのみ受け付ける(1-1節の一方向
遷移)。`approved`/`rejected`に対する呼び出しは409相当のエラーとして拒否
する。

### 5-2. 書き込み方式

M1・M2と同じ「JSONファイルを読み込み→更新→書き戻す」方式を踏襲する。
DB・キューイング等は導入しない。同時書き込みの競合(複数タブから同時に
操作する等)は、今回のユーザー1人・1ケースのみの利用を前提に考慮しない
(9節の未決事項)。

### 5-3. `output/`配下の配置(教材保護の踏襲)

`承認済みのknowledge`は教材原文由来のデータ(`rawFormula`等)を含むため、
既存の`.gitignore`の`/output/`除外ルールの範囲内に置く(新しいディレクトリ
だが、`/output/`配下であるため追加の除外設定は不要)。

```
output/
  cases/
    teigakuho-definition.json      既存。M1〜M4のレビュー結果まで含む監査証跡
  knowledge/                       新設
    approved-knowledge.json        M4で承認されたKnowledgeのみを集約(6節)
```

---

## 6. M5への受け渡し

### 6-1. 新設: `output/knowledge/approved-knowledge.json`

```jsonc
{
  "knowledge": [
    {
      "approvedAt": "2026-08-26T00:00:00.000Z",
      "sourceCase": "teigakuho-definition",
      "knowledge": { /* 承認された時点のknowledgeオブジェクトそのもの */ }
    }
  ]
}
```

**M5(Exercise生成)は、このファイルだけを入力として読む。**
`output/cases/*.json`(候補・却下も含む生データ)には触れない。これにより、
「M5がcandidateを直接使わず、人間が公式化したKnowledgeだけを使う」という
ユーザー要求を、運用ルールではなく**ファイル分離という構造そのもので**
担保する。

### 6-2. approved-knowledge.jsonの性質(改訂: 一方向の派生ビューとして確定)

**正本(SSOT)は`output/cases/*.json`側であり、`approved-knowledge.json`は
そこから毎回作り直される派生ビューである。** ユーザー提案どおり、次の
一方向の関係として実装する。

```
[正本] output/cases/*.json の derivedKnowledgeCandidate.reviewStatus
   ↓ (承認/除外のたびに全ケースファイルを走査し、approvedのみ抽出)
[派生ビュー] output/knowledge/approved-knowledge.json を全件再生成する
```

**承認時に`approved-knowledge.json`へ個別追記することはしない。** 承認・
除外いずれのアクションの後も、`output/cases/`配下の全ファイルを毎回
スキャンし直し、`reviewStatus === "approved"`のものだけを集めて
`approved-knowledge.json`を**全体書き換え**する。

**この設計が二重管理のドリフトを構造的に防ぐ理由**: 個別追記方式だと
「ケースファイルは`rejected`に変わったのに、`approved-knowledge.json`に
古い`approved`の記録が残ってしまう」といった不整合が理論上起こりうるが、
毎回全件再生成する方式ではそのような不整合が原理的に発生しない
(`approved-knowledge.json`は常に「今この瞬間のケースファイル群の状態を
反映した計算結果」でしかないため)。

現時点ではケースファイルが1件のみのため、実際のスキャン対象も1件のみだが、
将来ケースが増えても同じロジック(`output/cases/`配下の`*.json`を走査する)
がそのまま使える。

---

## 7. M3 UIへの最小追加

現在の「7. Derived Knowledge候補」セクション(閲覧専用)に、操作を追加する。
**新しい画面は作らない。**

### 7-1. `reviewStatus === "candidate"`のときのみ表示する3つの操作

- **承認ボタン**: クリックで、インラインの確認表示(「承認しますか?」+
  実行/キャンセル)を1つ挟んでから`POST .../approve`を呼ぶ(取り消せない
  一方向遷移のため、1-1節。ネイティブの`confirm()`ダイアログは使わず、
  画面内の小さな確認パネルにする)。
- **修正ボタン**: クリックで、3-2節のフォーム(`contentConfidence.level`・
  `contentConfidence.note`・`scopeNote`・任意の修正メモの4項目)を展開する。
  「保存」ボタンで`POST .../edit`を呼ぶ。バリデーションエラー(万一の
  往復整合性違反等)はそのままエラーメッセージとして表示し、保存させない
  (fail-closedを画面上でも徹底する)。
- **除外ボタン**: クリックで理由入力欄(小さなテキストエリア)を展開し、
  `POST .../reject`を呼ぶ。

### 7-2. `reviewStatus !== "candidate"`のときの表示

操作ボタンを隠し、代わりに`reviewStatus`(承認済み/除外済み)・
`reviewedAt`・`reviewNote`を表示する(読み取り専用の結果表示)。

### 7-3. 操作後の再描画

いずれの操作も、成功時にサーバから最新の`output/cases/teigakuho-
definition.json`相当のレスポンスを受け取り、既存の`render(data)`関数を
そのまま再実行して画面を更新する(新しい描画ロジックを別途作らない)。

---

## 8. 実装範囲の提案

### 8-1. 今回実装するもの

- `src/devViewer/server.mjs`への3エンドポイント追加(5-1節)
- `src/knowledge/`への「編集の再構成+再検証」ロジック(3-2節・3-3節、
  `formulaTokenizer.mjs`の`renderTokens`を再利用)
- `output/knowledge/approved-knowledge.json`への追記処理(6節)
- `dev-viewer/index.html`のセクション7への操作UI追加(7節)
- 上記の単体テスト(承認/修正/除外それぞれの正常系、fail-closedの異常系
  〈往復整合性が壊れる編集の拒否、`candidate`以外への操作の拒否〉)

### 8-2. 今回実装しないもの(先送り)

- 承認・除外の取り消し(1-1節)
- 複数候補・複数ケースに対応した一覧管理UI
- 編集履歴(誰が・いつ・何を変えたかの複数世代ログ)。`reviewNote`は
  最新1件のみ保持する
- 同時編集の排他制御
- 複数ケースをまたぐ`evidence`/`consolidation`の統合ロジック(B分類、
  第2ケース以降で`sourceRefs`が複数になった場合の再計算ルールの拡張)

---

## 9. 未決事項・要確認事項

- 承認・除外を取り消す必要が実際に生じた場合の対応方針(1-1節)。
- 修正内容の履歴を残す必要が将来生じるか(3-5節、`reviewNote`1件のみで
  足りるかは運用してみないと分からない)。
- `approved-knowledge.json`の全件再生成(6-2節)が、ケースファイル数が
  増えた場合にも十分高速か(現時点では1件のみのため問題にならない)。

---

以上がM4(Derived Knowledge候補の承認・修正・除外)の詳細設計である。
ユーザー確認を得たうえで、コード実装(サーバのPOSTエンドポイント・
`dev-viewer/index.html`への操作UI追加)へ進む。
