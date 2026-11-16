# M2詳細設計: Derived Knowledge候補生成(定額法1ケース)

本ファイルは、`planning/vertical_slice_mvp_roadmap.md`のM2(Knowledge候補が
生成される)の詳細設計である。対象は、M1で確定Sourceとした定額法の定義式
ブロック(`block-teigakuho-def`)**1件のみ**。汎用的なKnowledge生成器は作らない
(ユーザー指示)。

**本ファイルは設計のみを行う。** コード実装には進まない。

参照した既存資料(Git管理下のSSOT):

- `CLAUDE.md` / `SPEC.md` / `TASK.md`
- `planning/source_derived_knowledge_design_proposal.md`(第4版・データモデル
  正式設計。4節・5節・5-2節・6節・8節・12節を中心に参照)
- `planning/parser_design_proposal.md`4節(Parser/Derived Knowledge責務境界)
- `planning/vertical_slice_mvp_roadmap.md`(M2〜M6のマイルストーン定義)
- `planning/m1_minimal_parser_prototype_design.md` /
  `planning/m1_implementation_report.md`(M1の実装内容・実際のSource構造)

---

## 0. 前提・スコープ確認

- 入力は`output/cases/teigakuho-definition.json`の`block`(確定Source)1件のみ。
  第2ケース(定額法の複数適用、テーマ8/9)はまだ扱わない
  (`vertical_slice_mvp_roadmap.md`3-2節)。
- 出力は「Derived Knowledge**候補**」1件。人間承認による「公式Knowledge」への
  昇格は次のマイルストーン(M4)の責務であり、M2はまだ扱わない
  (`vertical_slice_mvp_roadmap.md`8節)。
- `sourceRefs.role`(definition/restatement/application/example)・Knowledge
  同一性判定は、Parser側の責務ではなくDerived Knowledge層側の責務である
  (`parser_design_proposal.md`4-2節)。M2はまさにこの責務を担う。

---

## 1. 今回のSourceから何をDerived Knowledge候補として抽出するか

M1で確定したSource(`blockKind: "formula_termbased"`、テーマ8-2の定額法定義式)
から、**Derived Knowledge候補を1件だけ**抽出する。それ以上の抽出は行わない
(このSourceからは1つの計算式知識以外、何も導出されない)。

`source_derived_knowledge_design_proposal.md`4節が示す対応表のとおり、
`formula_termbased`ブロックは`calculation_formula`(算定式・計算パターン)の
由来になる、という既存の判断をそのまま適用する。新しい対応関係を追加する
必要はない。

---

## 2. knowledgeKindは既存設計のどれを使うか

**`calculation_formula`を使う。** 既存3種(`journal_pattern`/
`calculation_formula`/`solution_technique`)のうち、今回の対象は用語ベースの
算定式であり、他の2種には該当しない(`journal_pattern`は仕訳型ボックス由来、
`solution_technique`は方程式解法由来。いずれも今回のSourceの`blockKind`と
一致しない)。

---

## 3. SourceとDerived Knowledge候補をどう紐づけるか

`source_derived_knowledge_design_proposal.md`5節の`sourceRefs`配列をそのまま
使う。

```jsonc
"sourceRefs": [
  { "sourceBlockId": "block-teigakuho-def", "role": "definition" }
]
```

配列であることは維持するが、今回は要素1件のみ。第2ケース(テーマ8/9への
複数適用)に着手した時点で、`role: "application"`の要素を追加していく想定
(6節②のパターンをそのまま踏襲する。`vertical_slice_mvp_roadmap.md`3-2節)。

`sourceBlockId`は、M1が確定Sourceに付与した`id`(`block-teigakuho-def`)を
そのまま参照する。**新しいID体系は導入しない**(既存のIDがそのまま
参照可能であることを確認済み)。

---

## 4. sourceRefs.roleをこの段階でどう扱うか

**`"definition"`のみを使う。** 理由:

- このSourceは、テーマ8-2で計算式が初めて定義される箇所であり、教材上も
  「１ 定額法（〇）」という技術名の直後に式が示されている(M1実装で確認済み、
  `detection.precedingHeading`が記録している)。`restatement`(再掲)・
  `application`(適用)・`example`(具体例)のいずれにも該当しない。
- `source_derived_knowledge_design_proposal.md`10節が「`sourceRefs.role`の
  `application`と`example`が実際に区別できる概念か、今回のような脚注単位の
  細かい粒度では`example`の出番が確認できなかった」と述べているとおり、
  `application`/`example`の区別は今回のケースでは判断材料が無く、無理に
  選ばない(原則4)。
- 複数`role`が必要になるのは、複数Sourceが同一Knowledgeを裏付ける場合
  (6節②)。今回は1 Source → 1 Knowledgeのため、`role`の選択に迷いは生じない。

---

## 5. contentConfidence / evidence / consolidation の3軸をどう扱うか

`source_derived_knowledge_design_proposal.md`6節①のパターン(「1 Source →
1 Knowledge、確信度は高いが証拠は少ない」)にそのまま一致する。

```jsonc
"contentConfidence": {
  "level": "verified_from_source",
  "note": "Source原文の用語ベース式(sourceFaithful)をそのまま転記。復元・意訳なし"
},
"evidence": {
  "byRole": { "definition": 1 },
  "distinctThemes": ["theme-8"],
  "distinctBooks": ["book-1"],
  "crossesBaseAdvanced": false
},
"consolidation": {
  "state": "single_source",
  "possibleDuplicateOf": []
},
"scopeNote": "本書テーマ8-2でのみ確認。テーマ8/9への数値適用は本ケースでは未収録(第2ケースで扱う予定)"
```

**それぞれの決定根拠:**

- `contentConfidence.level = "verified_from_source"`: M1の`sourceFaithful`が
  `diag.faithfulReconstruction.method: "human_reviewed"`・
  `confidence: "high"`で復元済みであることを根拠に、機械的に決定できる
  (Sourceの復元確信度をDerived Knowledge側の内容確信度へそのまま伝播させる、
  という単純な規則。7節で詳述)。
- `evidence.byRole = { definition: 1 }`: `sourceRefs`の`role`集計そのもの。
  機械的に導出できる。
- `distinctThemes` / `distinctBooks`: Sourceの`structureContext.theme.id`
  (`theme-8`)から機械的に導出できる。`distinctBooks`の値
  (`"book-1"`)は、`source_derived_knowledge_design_proposal.md`5-1節の
  イメージ例が使っていた表記をそのまま踏襲した(正式なbook ID体系は
  まだ存在しないため、この1冊を指す仮のIDとして扱う。12節で未決事項として
  明記)。
- `crossesBaseAdvanced = false`: 基礎コース1冊目のみを扱っているため
  機械的に`false`。
- `consolidation.state = "single_source"`: Sourceが1件のみであるため、
  統合判断そのものが発生しない(5節の原則どおり)。**「1箇所しかないから弱い」
  という意味ではないことに注意**(5節の原則: 内容確信度と証拠の量は別軸)。
- `scopeNote`: 原則4(推測しない)に基づき、「テーマ8/9への適用はまだ
  このKnowledgeに含まれていない」という既知の不完全性を明示する。

---

## 6. 教材上の忠実な表現と、構造化・抽象化した表現の境界

`source_derived_knowledge_design_proposal.md`5-2節の原則(「教材上の忠実な
式表現」「構造化された式」「学習用表現」の3つを混同しない)を、今回の実装
方針として次のとおり具体化する。

### 6-1. `content.rawFormula`(正本、忠実な表現)

**SourceのsourceFaithfulと完全に同一の文字列とする。** 一切の要約・言い換え・
補完を行わない(CLAUDE.md原則2)。

```
content.rawFormula === block.sourceFaithful
```

この等価性は、後述7節のgateCheck候補として機械的に検証できる
(`rawFormula`が`sourceRefs`の指すSourceの`sourceFaithful`と一致しない場合、
生成を失敗させる)。

### 6-2. `content.structure`(構造化表現、忠実な表現の"代わり"ではない)

`rawFormula`を**意味的に一切変えず**、`term`/`operator`/`fraction`/`group`/
`power`の5トークン種別(5-2節で確定済み)へ機械的に分解したものである。
要約・省略・言い換えは一切行わない。

このケースの具体的な分解案(実際のrawFormulaは架空化して示す。実際の値は
`output/cases/teigakuho-definition.json`参照):

```jsonc
// 例: rawFormula = "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額"
{
  "kind": "sequence",
  "tokens": [
    { "kind": "group", "tokens": [
        { "kind": "term", "value": "架空項Ａ" },
        { "kind": "operator", "value": "－" },
        { "kind": "term", "value": "架空項Ｂ" }
    ]},
    { "kind": "operator", "value": "×" },
    { "kind": "group", "tokens": [
        { "kind": "fraction",
          "numerator":   [{ "kind": "term", "value": "１架空単位" }],
          "denominator": [{ "kind": "term", "value": "架空全体単位" }] }
    ]},
    { "kind": "operator", "value": "＝" },
    { "kind": "term", "value": "架空額" }
  ]
}
```

**分数を`group`で囲む理由**: M1のFaithful Restorationで、分子/分母を
「／」で結んだ際に前後へ丸括弧を補った(6-2節例の`（１架空単位／架空全体単位）`)。
この丸括弧は原文の視覚的な分数表現を線形テキストへ変換する際の既存の表記
慣習(design proposal 5-2節の例と同じ表記)であり、構造化表現でも
`fraction`を`group`で包むことで、後述の往復整合性(6-3節)がそのまま成立する。

### 6-3. 往復整合性(round-trip)という新しい検証規約(提案)

`content.structure`が`rawFormula`の**忠実な構造化**であることを機械的に
保証するため、次の規約を提案する。

> `structure.tokens`を既定のレンダリング規則(`group`→`（`+内容+`）`、
> `fraction`→分子+`／`+分母、`operator`/`term`→値をそのまま出力、
> `sequence`→連結)で文字列へ復元した結果が、`rawFormula`と完全一致する。

これは**新しいフィールドではなく、既存フィールド間の整合性検証(gateCheck
候補)**であり、5-2節のデータモデル自体を変更するものではない。7節で
自動化方針を述べる。

### 6-4. 「学習用表現」は今回も設計しない

5-2節が示す3番目の概念(学習用に利用する表現)は、引き続きExercise層の
責務として今回も設計しない(9節で境界を明確化する)。

---

## 7. 自動生成する部分と、人間確認が必要な部分

CLAUDE.md原則4(推測しない)を踏まえ、次のとおり分担する。**M1の
Faithful Restoration(fail-closedな個別確認済み補正)と同じ考え方を踏襲する。**

| 項目 | 分担 | 理由 |
|---|---|---|
| `knowledgeKind` | 自動 | Sourceの`blockKind`から一意に決まる(2節の対応表) |
| `content.rawFormula` | 自動 | `sourceFaithful`をそのままコピーするだけ(判断不要) |
| `content.structure` | **半自動(fail-closed)** | このケースの式の形状(丸括弧グルーピング1件・分数1件を含む「（A－B）×（C／D）＝E」という形)に限定したトークン化ロジックを適用する。想定外の形状(トークン化できない・往復整合性が取れない)の場合は、無理に構造化せず処理を止めて人間確認を要求する。**汎用的な数式パーサーは作らない**(このケースの形状専用) |
| `sourceRefs` | 自動 | Sourceが1件・`role`が`definition`以外にありえないため機械的に決まる(4節) |
| `contentConfidence.level` | 自動(初期値) | Sourceの`diag.faithfulReconstruction.confidence`から伝播させる、単純な規則で決まる。**ただし「候補」段階の値であり、10節で述べる最終承認(M4)を経て公式Knowledgeになる** |
| `evidence` | 自動 | Sourceの構造情報(`structureContext`)から集計できる |
| `consolidation.state` | 自動 | Sourceが1件のみのため`single_source`一択(判断が発生しない) |
| `scopeNote` | **人間確認を推奨** | 「何がまだ含まれていないか」の記述は、機械的なテンプレートで仮生成してもよいが、内容の妥当性は人間が確認することを推奨する(将来ケースが増えると自動集計が難しくなるため) |

**「完全自動生成を目指さない」という方針の具体化**: `content.structure`の
生成が、このケースの形状に特化したロジックであり、汎用的な数式パーサーへは
発展させない。次の式(第2ケース以降)が別の形状であれば、そのケース専用の
ロジックを個別に追加する(M1の`fraction_split`補正データと同じ、
ケースごとに個別確認する運用パターン)。

---

## 8. 教材上の忠実な表現と構造化表現の往復整合性を、どこで検証するか

7節の往復整合性(6-3節)は、Derived Knowledge候補生成処理の内部で
**生成直後に自動検証**し、一致しなければ候補を出力せず例外を投げる
(fail-closed、M1の`applyKnownCorrection`と同じパターン)。将来、
`gateChecks`(`parser_design_proposal.md`6-3節)の枠組みへ統合するかどうかは
未決事項とする(12節)。

---

## 9. M3確認UIへ何を追加表示するか

`output/cases/teigakuho-definition.json`へ、新しいトップレベルフィールド
`derivedKnowledgeCandidate`を追記する(M1報告で示唆したとおり、既存の
`block`等とは兄弟フィールドとして追加。既存フィールドは変更しない)。

`dev-viewer/index.html`には、既存の「6. 確定Source」セクションの後に、
新しいセクション「7. Derived Knowledge候補」を追加する。表示内容:

- `knowledgeKind`
- `content.rawFormula`(表示し、`sourceFaithful`と**同一であることを明示**する。
  例えば両者を並べて表示し、一致していることが一目で分かるようにする——
  これは「要約・言い換えをしていない」ことを人間が確認できる最重要ポイント)
- `content.structure`(トークン構造。折りたたみでJSON表示すれば足り、専用の
  ツリー描画UIは不要——デザインの作り込みはしない、既存方針を踏襲)
- 往復整合性チェックの結果(一致/不一致のバッジ表示。8節の検証結果をそのまま見せる)
- `sourceRefs`(`role`込み)
- `contentConfidence` / `evidence` / `consolidation` / `scopeNote`

**追加しないもの**: 承認/修正/除外の操作ボタン(M4の責務、
`vertical_slice_mvp_roadmap.md`5-2節)。今回も引き続き閲覧専用。

---

## 10. 「候補」から「公式Knowledge」への遷移をどう表現するか(新しい論点、要確認)

`source_derived_knowledge_design_proposal.md`のDerived Knowledgeスキーマ
(5-1節)には、実は**「これは候補か、承認済みの公式Knowledgeか」を表す
明示的なフィールドが無い**ことに気づいた。3軸モデル(`contentConfidence`/
`evidence`/`consolidation`)は内容の性質を表す軸であり、「人間のレビューを
経たかどうか」という運用上の状態とは別物である。

`vertical_slice_mvp_roadmap.md`のM2/M4の区別(「候補が生成される」→
「承認できる」)を実現するには、**何らかの形でこの状態を持たせる必要がある**。
2つの選択肢を比較する。

| 案 | 内容 | 評価 |
|---|---|---|
| **A. 新しいラッパーフィールドを追加(推奨)** | 正式なDerived Knowledgeスキーマ自体は変更せず、M3の表示用JSON側に`reviewStatus: "candidate" \| "approved"`のような**DK候補オブジェクトの外側**のフィールドを追加する(M1の`segmentationDecision`・`outOfScopeDetections`と同じ、正式スキーマ外の診断・運用フィールドという扱い) | 正式スキーマ(12節が「まだコード化してよいか判断されていない」としている)に手を加えずに済む。将来正式スキーマを確定する際、この運用フィールドを持ち込むかどうかを改めて判断できる |
| B. `contentConfidence.level`に新しい値を追加 | 承認前は`"pending_review"`のような新語彙、承認後に`"verified_from_source"`等へ更新する | 3軸モデルの意味(内容確信度)と運用状態(レビュー済みか)を混同するおそれがある。5節が「3つの異なる概念を混同しない」ことを重視していた経緯と逆行する |

**推奨案はAである。** 正式なDerived Knowledgeスキーマの外側
(`derivedKnowledgeCandidate.reviewStatus`)に置くことで、5-1節が確立した
3軸モデルの独立性を壊さない。ただし**これは今回新たに必要になった判断であり、
正式決定ではなく提案として提示する**(原則4)。ユーザー確認を経てから
実装したい。

---

## 11. 後のExercise生成へどう接続できる形にするか

- Exercise(並び替え)は、承認済みDerived Knowledgeの`content.structure.tokens`
  を入力として使う想定(`vertical_slice_mvp_roadmap.md`6節)。M2はこの
  `structure`を正しく(往復整合性を保って)生成することに責任を持つ。
- **どのトークンをどう束ねて1つの「並び替え単位」にするか**(例えば
  `group`の中身は常に1つの塊として動かすのか、内部の`term`/`operator`まで
  個別に並び替えさせるのか)は、**Exercise生成(M5)側の設計判断であり、
  M2では決定しない**。M2は「並び替え可能な忠実な構造」を提供するところ
  までとし、出題上のUI都合(どこまで細かく崩すか)には踏み込まない
  (Parser/Derived Knowledge/Exerciseの責務分離を維持する)。
- `sourceRefs`は、Exercise側が「この問題はどのSourceに基づくか」を表示する
  際にそのまま使える(解説画面での出典表示、`vertical_slice_mvp_roadmap.md`
  7節が要求する機能)。

---

## 12. 未決事項・要確認事項

- **10節のreviewStatus(案A)を正式に採用してよいか**: ユーザー確認が必要。
- `distinctBooks`の値(`"book-1"`)は仮のID表記であり、正式なbook ID体系は
  まだ存在しない(`source_derived_knowledge_design_proposal.md`10節で
  既に未決事項として明記されている論点を継承)。
- 往復整合性(6-3節・8節)を、将来的に正式な`gateChecks`(`parser_design_
  proposal.md`6-3節)の枠組みへ統合するか、Derived Knowledge生成処理内の
  独立したチェックのままにするかは未決。
- `content.structure`のトークン化ロジックを、どこまでケース固有のまま
  保つか(第2ケース・`journal_pattern`等、対象が増えた時点で判断する。
  現時点では汎用化を急がない)。
- Derived Knowledge候補・確定Knowledgeの正式なファイル配置(`output/`配下の
  ディレクトリ構成)は、M1の`output/cases/`をそのまま踏襲する想定だが、
  正式決定ではない。

---

以上がM2(Derived Knowledge候補生成、定額法1ケース)の詳細設計である。
特に10節(reviewStatusの扱い)は、既存設計に無かった新しい判断が必要な
論点のため、実装着手前にユーザー確認を得たい。それ以外の項目は、既存の
確定済み設計(`source_derived_knowledge_design_proposal.md`)をそのまま
適用できると判断している。
