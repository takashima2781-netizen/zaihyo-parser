# Source / Derived Knowledge 中間データ設計案

`planning/book1_material_survey_report.md`(基礎コース1冊目・教材調査)の
結果を根拠として、Source層・Derived Knowledge層の中間データ設計を提案する。

**本ファイルは設計案の提示までであり、実装(Parser・スキーマのコード化・
Derived Knowledge抽出処理・Exercise生成・UI)には一切進んでいない。**
サンプルはすべて架空の例(実在しない勘定科目・数値)であり、教材原文は
転載していない。

**改訂について(第2版)**: 初版に対するユーザーレビューを受け、(a) Derived
Knowledgeの状態表現(旧`status`3値)が「内容の確信度」「一般性・反復性」
「複数Source統合の可否」という異なる3概念を混同していた点、(b) Sourceの
`raw`が「教材原文の忠実な表現」と「PDF抽出の未解釈な生データ」という
異なる意味で使われていた点、(c) Derived Knowledgeの`statement`を単一
文字列に固定していた点、の3点を中心に5・6・7・8・12節を改訂した。

**改訂について(第3版・本版)**: 第2版でのraw定義(「教材上の忠実な表現」に
一本化)について、機械抽出結果そのものを保持しないことの妥当性を再評価
した結果、`raw`を`sourceFaithful`に改称した上で、機械抽出の生出力を
`extractionRaw`として条件付きで別途保持する4概念モデルへ変更した(7節)。
これに伴い2・3・8・9節の該当箇所を更新している。5・6節(3軸状態モデル・
kind別content)はユーザー承認済みのため変更していない。

---

## 1. 設計目的

- 基礎コース1冊目で実際に確認された教材構造(調査レポート参照)を根拠として、
  「何をSourceとして保持し、そこから何をDerived Knowledgeとして導出するか」
  を定義する。
- 残り7冊・基礎/上級を横断する将来の拡張に耐える設計としつつ、**1冊だけの
  観察から8冊分のスキーマを断定しない**(5節・10節・11節で「確定」と
  「保留」を明示的に分離する)。
- 教材に将来出現しうる未知のブロック種別・知識種別を、スキーマの変更なしに
  追加できる拡張性を最優先する(CLAUDE.md原則5・6の徹底)。

---

## 2. Source層の責務

- 教材の階層構造(テーマ→論点→➊➋➌…等のサブ項目)と、その配下にある個々の
  内容(設例・解説・仕訳型ボックス・計算式・方程式解法・留意点・参考・
  コラム・Q&A・分類表・図解・地の文)を、**要約・言い換えせず原文のまま**
  保持する。
- 分類(この設例とあの解説が同じ知識か等)や統合は一切行わない。Source層の
  責務は「教材に実際に書かれている単位を、失わずに機械可読な形へ落とす」
  ことに限定する。
- 教材調査で判明したとおり、**凡例で定義された分類だけでは教材の実態を
  覆いきれない**ため、内容の種類(kind)は固定enumにせず、開いた語彙
  (open vocabulary)として扱う。未知の種類は`unknown`として保持し、
  無理に既存の種類へ押し込まない(原則6)。
- テキスト抽出だけでは検出できない要素(Q&Aのアイコンラベル等)が存在する
  ことを踏まえ、**Source層自体が「この教材から抽出できた範囲」であり
  「教材の全内容」ではないことを前提とする**。Source層に「未収録の可能性が
  ある」という状態を明示的に表現できるようにする(8節)。

---

## 3. Source層のデータ構造案(抽象例)

具体的なフィールド名・型はここでは仮案であり、確定スキーマではない。
構造の考え方を示すことを目的とする。

### 3-1. 2種類のノード

- **StructureNode**: 階層を表すコンテナ(テーマ／論点／サブ項目／前付けの節、
  など)。タイトル・番号・重要度・既習度マーカーのような「その階層自体が
  持つメタ情報」を保持する。
- **ContentBlock**: StructureNodeの配下にぶら下がる、実際の内容の最小単位
  (1つの設例、1つの仕訳型ボックス、1つの計算式、1つのコラム全文、など)。

これはZaihyo Parser・BookStructureMasterで採用されていた「原文→構造を
保持した再帰的な中間データ」という考え方を踏襲したものであり、財表向けの
具体的なフィールド定義(CodedLabel等)をそのまま流用したものではない。

### 3-2. 抽象サンプル(架空の教材内容)

以下は実在しない架空の論点「XYZ引当金」を例にした構造イメージである
(実装コードではなく設計イメージとしてのJSON風の記述)。

```jsonc
{
  "type": "StructureNode",
  "nodeKind": "theme",              // theme / topic / subItem / frontMatterSection など。open vocabulary
  "id": "theme-99",
  "label": { "number": "99", "titleRaw": "ＸＹＺ引当金" },  // titleRawは教材原文の見出しそのまま
  "importance": 3,                   // ★の数。教材に明示されている場合のみ
  "priorKnowledgeMark": null,        // ◎/〇/無印。テーマ単位には無いことが多い
  "children": [
    {
      "type": "StructureNode",
      "nodeKind": "topic",
      "id": "topic-99-1",
      "label": { "number": "99-1", "titleRaw": "ＸＹＺ引当金の計上" },
      "children": [
        {
          "type": "ContentBlock",
          "id": "block-99-1-formula-1",
          "blockKind": "formula_termbased",   // open vocabulary。未知種別はunknown
          "sourceFaithful": "（対象額－既計上額）×設定率＝当期繰入額",  // 架空の式。教材上の表現を忠実に書き写したもの(7節)。機械抽出結果と一致していたため extractionRaw は省略
          "diag": { "extraction": { "status": "captured_matches_sourceFaithful" } },  // なぜextractionRawが無いかを判別可能にする(7-3節)
          "location": { "page": 231, "sequenceOnPage": 2 },
          "references": []                     // 教材が明示するテーマ間参照があれば記録
        },
        {
          "type": "ContentBlock",
          "id": "block-99-1-formula-2",
          "blockKind": "formula_termbased",
          "extractionRaw": {                    // 架空の例。分数がPDF抽出で分断されたケース
            "text": "（対象額－既計上額）×  ４月\n６月  ＝当期繰入額",
            "tool": "pdftotext", "toolVersion": "poppler-XX.X", "invocation": "-layout -enc UTF-8"
          },
          "sourceFaithful": "（対象額－既計上額）×（４月／６月）＝当期繰入額",  // 忠実に書き戻した表現
          "diag": {
            "extraction": { "artifacts": ["fraction_split"] },
            "faithfulReconstruction": { "performed": true, "method": "human_reviewed", "confidence": "high" }
          },
          "location": { "page": 233, "sequenceOnPage": 1 }
        },
        {
          "type": "ContentBlock",
          "id": "block-99-1-journal-1",
          "blockKind": "journal_template",
          "sourceFaithful": "(借) 繰入費用 ××× (貸) ＸＹＺ引当金 ×××",  // 架空の仕訳型(実データではない)
          "diag": { "extraction": { "status": "captured_matches_sourceFaithful" } },
          "placeholders": [
            { "token": "×××", "role": "amount" }
          ],
          "location": { "page": 231, "sequenceOnPage": 3 }
        },
        {
          "type": "ContentBlock",
          "id": "block-99-1-qa-1",
          "blockKind": "qa",
          "extractionRaw": null,                // 機械抽出でも何も取得できなかった
          "sourceFaithful": null,                // アイコンのみで検出できなかった場合はnull
          "diag": { "extraction": { "status": "not_applicable", "artifacts": ["icon_only_no_text_label"] } },
          "detectionStatus": "unresolved_icon_only",
          "location": { "page": 232, "sequenceOnPage": 1 }
        }
      ]
    }
  ]
}
```

補足:

- `blockKind`は最低でも調査で確認した`worked_example`(設例)・
  `explanation`(解説)・`journal_template`(仕訳型)・`formula_termbased`
  (用語ベース計算式)・`formula_equation`(方程式解法)・`note`(留意点)・
  `reference`(参考)・`column_essay`(コラム)・`qa`・`table`(分類表)・
  `diagram`(図解)・`prose`(地の文)・`unknown`を想定するが、**これは初期の
  参考リストであり固定enumではない**。No.2巻以降で新しい種類が見つかれば
  そのまま追加してよい設計とする。
- `sourceFaithful`が`null`かつ`detectionStatus`が付与されているケース
  (Q&Aの例)は、「教材に存在することは分かっているが内容を機械的に
  取得できていない」ことを表す。存在ごと無視するのではなく、**取得
  できなかったという事実を保持する**。`extractionRaw`・`sourceFaithful`・
  `parsed`・`diag`の4概念については7節で詳しく扱う。
- `references`は、教材が明示するテーマ間参照(例:「テーマ４で学習します」)
  のみを記録する。**教材に書かれていない類似性を推測して自動リンクしない**
  (原則6)。

---

## 4. Derived Knowledge層の責務

- **教材のブロック種別とDerived Knowledgeの知識種別は1対1に対応させない。**
  Sourceのブロック種別のうち、学習上「型として繰り返し使う価値がある」と
  判断されたものだけを対象に、Derived Knowledgeとして統合・一般化する。
- 今回の調査結果にもとづき、少なくとも次の知識種別が候補になる(固定では
  ない、open vocabulary)。
  - **仕訳の型**(`journal_template`ブロックが由来)
  - **算定式・計算パターン**(`formula_termbased`ブロックが由来)
  - **方程式等を用いる解法テクニック**(`formula_equation`ブロックが由来。
    調査で判明したとおり、これは算定式の「文字式版」ではなく、独立した
    知識種別として扱う)
- 一方、**留意点・参考・コラム・Q&A・図解・分類表は、原則としてDerived
  Knowledgeへ自動的に昇格させない**。これらはSourceとしては保持するが、
  「型として反復練習する知識」ではなく「読んで理解する注記」または
  「学習知識そのものではない」性質のものだからである(調査レポート7節)。
  ただし、これは**絶対に昇格させないという禁止ルールではない**。将来、
  留意点の中に独立して繰り返し使う価値のある知識が見つかった場合は、
  個別に判断してDerived Knowledge化してよい余地を残す。

---

## 5. Derived Knowledge層のデータ構造案(改訂: 3軸の状態モデル + kind別content)

### 5-1. 「status」1本を廃止し、3つの独立した軸に分離する

旧版の`status`(confirmed/candidate/unresolved)には、性質の異なる3つの
概念が混ざっていた。

- **A. 内容確信度**: このKnowledgeの中身(何を言っているか)を、どの程度
  正しく抽出・記述できていると考えてよいか。1回しか登場しない知識でも、
  教材に明確に書かれていれば確信度は高くなりうる(反復回数とは無関係)。
- **B. 一般性・反復性の証拠**: このKnowledgeが、どの程度の範囲・頻度で
  裏付けられているか(出現回数・テーマ数・巻数・基礎/上級を跨ぐか等)。
  これは**判断材料としてのEvidence**であり、それ自体が確信度や統合可否を
  決めるものではない(「2箇所以上ならconfirmed」のような機械的な閾値は
  採用しない)。
- **C. 統合状態**: 複数のSourceを同一のKnowledgeとして統合してよいか
  どうかの判断状態。反復回数が多くても統合してよいとは限らず、逆に1回
  しか登場しない知識には、そもそも統合の判断自体が発生しない。

この3つを独立したフィールドとして分離する。

```jsonc
{
  "type": "DerivedKnowledge",
  "id": "dk-formula-xyz-provision",
  "knowledgeKind": "calculation_formula",   // journal_pattern / calculation_formula /
                                             // solution_technique など。open vocabulary

  "content": { /* 5-2節。knowledgeKindごとに形が異なる */ },

  "sourceRefs": [
    { "sourceBlockId": "block-99-1-formula-1", "role": "primary" }
  ],

  // A. 内容確信度(このKnowledgeの記述自体をどの程度信頼できるか)
  "contentConfidence": {
    "level": "verified_from_source",  // verified_from_source / reconstructed /
                                       // uncertain など。open vocabulary、固定enumではない
    "note": "Source原文の用語ベース式をそのまま転記。復元・意訳なし"
  },

  // B. 一般性・反復性の証拠(判断材料としてのみ保持。閾値判定には使わない)
  "evidence": {
    "occurrenceCount": 1,
    "distinctThemes": ["theme-99"],
    "distinctBooks": ["book-1"],
    "crossesBaseAdvanced": false
  },

  // C. 統合状態(複数Sourceを同一Knowledgeとみなしてよいか)
  "consolidation": {
    "state": "single_source",  // single_source(統合の判断自体が不要) /
                                // merged_confirmed / merge_candidate /
                                // merge_rejected 。open vocabulary
    "possibleDuplicateOf": []
  },

  "scopeNote": "本書テーマ99でのみ確認。他テーマ・他冊での再出現は未確認"
}
```

**重要**: A・B・Cは互いに独立であり、組み合わせは自由である。

- 「1回しか登場しないが、教材に明確に記載されている解法」
  → `contentConfidence.level = verified_from_source`(確信度は高い) /
    `evidence.occurrenceCount = 1`(証拠は少ない) /
    `consolidation.state = single_source`(統合の論点なし)
- 「同一テーマ内で数十回反復されるが、抽出結果が壊れやすい式」
  → `contentConfidence.level = reconstructed`(復元に頼っており確信度は
    中程度) / `evidence.occurrenceCount = 34`(証拠は豊富) /
    `consolidation.state = merged_confirmed`

出現回数の多さが、そのままKnowledgeの確信度や統合可否を意味しない、
という前提をデータ構造の時点で強制する設計になっている。

### 5-2. `content`はknowledgeKindごとに異なる構造を持つ(statement固定を廃止)

旧版では`statement`という単一の文字列フィールドにすべてのKnowledgeの
内容を詰め込んでいたが、仕訳の型・算定式・方程式解法では最終的に必要な
構造が異なりうるため、これを廃止し、Sourceの`parsed`と同様に**kind別に
形が異なる`content`オブジェクト**とする。以下は3つの`knowledgeKind`
それぞれについての、現時点での**イメージ例**(確定スキーマではない。
10節のとおり具体的なフィールドは今後の実データで調整する)。

```jsonc
// knowledgeKind: "journal_pattern" の content イメージ
{
  "rawTemplate": "(借) 繰入費用 ××× (貸) ＸＹＺ引当金 ×××",  // 架空の例
  "debitAccounts": ["繰入費用"],
  "creditAccounts": ["ＸＹＺ引当金"],
  "placeholderRoles": [{ "token": "×××", "role": "amount" }]
}

// knowledgeKind: "calculation_formula" の content イメージ
{
  "rawFormula": "（対象額－既計上額）×設定率＝当期繰入額",  // 架空の例
  "termsRaw": ["対象額", "既計上額", "設定率", "当期繰入額"]
}

// knowledgeKind: "solution_technique" の content イメージ
{
  "rawExample": "Ｘ－0.24Ｘ＝91,200 → 0.76Ｘ＝91,200 → Ｘ＝120,000",  // 架空化した例
  "technique": "linear_equation_backsolve",
  "appliesWhen": "既知の帳簿価額等から取得原価のような未知額を逆算する場合"
}
```

いずれの`content`も、少なくとも1つは「原文に近い忠実なテキスト」
(`rawTemplate`/`rawFormula`/`rawExample`)を持つことを緩い共通ルールとする
(要約・言い換え禁止の原則をDerived Knowledge側でも守るため)。それ以外の
構造化フィールドは、`knowledgeKind`ごとに自由に増減してよい。

`sourceRefs`は配列であり、以下すべてを自然に表現できる(旧版から変更なし)。

- **1 Source → 1 Knowledge**: `sourceRefs`が1件のみ(上記例)。
- **複数Source → 1 Knowledge**: 同じ計算式が複数テーマで確認された場合
  (調査レポート6節の「定額法の計算式がテーマ8→9で反復」に相当)、
  `sourceRefs`に複数の`sourceBlockId`を追加し、`evidence.occurrenceCount`・
  `distinctThemes`を増やし、`consolidation.state`を`merged_confirmed`にする。
- **1 Source → 複数Knowledge**: 1つの仕訳型ボックスに`※1`・`※2`のように
  複数の補足式がぶら下がる場合(調査レポート3節)、同じ`sourceBlockId`を
  参照する複数のDerivedKnowledgeを作り、`sourceRefs`側に`anchor: "note1"`
  のような補足識別子を持たせて、どの補足式に対応するかを区別する。

---

## 6. Source ↔ Derived Knowledgeの参照関係・具体例(改訂: 3軸モデルで表現)

架空の例で4パターンを示す。いずれも5節の3軸(内容確信度/evidence/統合状態)
がどう表れるかを併記する。

**① 1 Source → 1 Knowledge、確信度は高いが証拠は少ない**

```
SourceBlock[block-A] "（残高－既存額）×率＝当期計上額"(テーマ50、教材に明記)
   → DerivedKnowledge[dk-A]
     sourceRefs=[block-A]
     contentConfidence.level=verified_from_source(原文どおり転記、確信度は高い)
     evidence.occurrenceCount=1(証拠はまだ少ない)
     consolidation.state=single_source(統合の論点自体が発生しない)
```

1回しか登場しない知識でも、内容確信度と証拠の少なさは別軸であるため、
`candidate`のような単一ラベルで「弱い」と一括評価されることはない。

**② 複数Source → 1 Knowledge(反復確認により統合、証拠が豊富)**

```
SourceBlock[block-B1] 同じ計算式(テーマ50)
SourceBlock[block-B2] 同じ計算式が別資産に適用(テーマ51)
   → DerivedKnowledge[dk-B]
     sourceRefs=[block-B1, block-B2]
     contentConfidence.level=verified_from_source
     evidence.occurrenceCount=2, distinctThemes=[theme-50, theme-51]
     consolidation.state=merged_confirmed(同一知識として統合してよいと判断済み)
```

「2箇所以上だからconfirmed」という閾値判定はしない。ここでの
`merged_confirmed`は、出現回数そのものではなく、**2つのSourceが同一の
知識を表しているという統合判断が(暫定的にせよ)行われたこと**を表す。

**③ 1 Source → 複数Knowledge(1ボックス内の複数補足式)**

```
SourceBlock[block-C] 仕訳型(※1取得価額の算定式、※2月割計算式を含む)
   → DerivedKnowledge[dk-C1] sourceRefs=[{block-C, anchor: note1}]
   → DerivedKnowledge[dk-C2] sourceRefs=[{block-C, anchor: note2}]
     (いずれもconsolidation.state=single_source。両者は別知識であり統合対象ではない)
```

**④ 「同じ知識かもしれないが未確定」(統合状態のみがunresolved)**

```
SourceBlock[block-D1] 計算式(テーマ60、「調整額」という表現。教材には明確に記載)
SourceBlock[block-D2] 類似した計算式(テーマ62、「補正額」という表現。教材には明確に記載)
   → DerivedKnowledge[dk-D1]
     sourceRefs=[block-D1]
     contentConfidence.level=verified_from_source(D1自体の内容は明確)
     consolidation.state=merge_candidate
     possibleDuplicateOf=[dk-D2]
   → DerivedKnowledge[dk-D2]
     sourceRefs=[block-D2]
     contentConfidence.level=verified_from_source(D2自体の内容も明確)
     consolidation.state=merge_candidate
     possibleDuplicateOf=[dk-D1]
```

④の重要な点: **D1・D2それぞれの内容確信度は高いままでよい**(教材に
明確に書かれているため)。「未確定」なのはあくまで**統合してよいかという
C軸だけ**であり、旧版のように「unresolved」という1つのラベルで内容の
不確かさまで一緒くたにしない。この区別により、「同じ知識だと思われるが、
まだ統合してよいか判断できない」という状態を、Knowledge自体の信頼性を
落とすことなく保持できる。

---

## 7. extractionRaw / sourceFaithful / parsed / diagの採否・使い方(旧: raw / parsed / diag。改訂第2弾: データ段階の再評価)

第2版では「`raw`の意味を教材上の忠実な表現に一本化し、機械抽出の生出力は
フィールド化しない」としていた。この点について、Parserの改善・回帰検証・
誤変換の原因調査という観点から機械抽出結果自体を保持する価値があるのでは
ないか、という指摘を受け、6つの観点(原文性・再現性・Parserのデバッグ
可能性・回帰検証・データ量・実装複雑性)から改めて評価する。

### 7-1. 「機械抽出結果を保持しなくても再生成できる」という前提の検証

まず、「元PDFから機械抽出結果はいつでも再生成できるので保持不要」という
判断が成立するかを検証する。**成立しないと判断する。** 理由は次のとおり。

- **抽出方法自体がプロジェクトの中で変化してきた実績がある**。Zaihyo
  Parserでは、同じ入力PDFに対して`intermediate_full_scan_before.json`・
  `..._before_candidate1.json`・`..._before_candidate2.json`・
  `..._before_checktype.json`・`..._before_pagefix.json`・
  `..._before_topicscope.json`のように、抽出・解析ロジックの複数の
  試行錯誤の跡が実際に残っている。これは「同じPDFに対して常に同じ抽出
  結果が得られる」という前提が、この種のプロジェクトでは長期的に成立
  しないことを示す実例である。
- ツールのバージョン・オプション(`-layout`有無等)・OSの差異によっても
  抽出結果が変わりうる。
- 「後から同じ結果を再現できる」という**再現性の主張自体を検証する手段**
  (今回本当に前回と同じ抽出結果が得られているか)がないと、Parserの
  挙動が変わったのか、教材の版が変わったのか、抽出ツールが変わったのか
  を切り分けられない。

したがって、**機械抽出結果は「いつでも再生成できるから保持不要」とは
判断せず、少なくとも一部は保持する**。

### 7-2. 推奨するデータ段階(4概念モデル)

以下の4概念に分ける。ユーザー提示の5段階のうち、(1)「PDF上の教材表現」
は物理的な原本そのものであり、データとしては複製せず`location`(ページ
番号等)による参照のみを保持する(ページ画像・PDF自体は既存の教材保護
ルールどおりGit管理外)。残る(2)〜(5)を、次の4つのフィールド概念に対応
させる。

| # | 概念(暫定名) | 意味 | 対応するユーザー提示の段階 |
|---|---|---|---|
| 1 | `extractionRaw` | 機械抽出ツールが実際に返した未解釈の生データ。ツール名・バージョン・実行オプション・抽出日時のメタ情報を伴う | (2) 機械抽出によって実際に取得された未解釈データ |
| 2 | `sourceFaithful`(第2版の`raw`を改称) | 教材上の表現を要約・言い換えなしに忠実に書き写したもの。`extractionRaw`が原文の見た目と食い違う場合(分数の分断等)は、ここで書き戻す | (3) 必要に応じて復元・正規化された忠実表現 |
| 3 | `parsed` | Parserによる意味・構造の解釈(ブロック種別ごとに形が異なる、第2版から変更なし) | (4) Parserによる意味構造 |
| 4 | `diag` | 上記の変換過程(誰が/何が、どの根拠で、どの程度の確信度で行ったか)の監査情報 | (5) その変換過程の診断情報 |

**「raw」という言葉を`sourceFaithful`から外した**理由は7-6節で述べる。

### 7-3. 何を永続保存し、何を再生成可能データとするか

- **`sourceFaithful`・`parsed`・`diag`は常に永続保存する**(第2版から
  変更なし)。これらはSource/Derived Knowledgeの本体であり、教材保護
  ルールの範囲内でGit管理外のデータストアに保持する。
- **`extractionRaw`は「条件付きで」永続保存する**。具体的には、
  `sourceFaithful`が`extractionRaw`と完全に一致する場合(=機械抽出の
  結果がそのまま忠実な表現になっており、書き戻し・補正が発生しなかった
  場合。大半の地の文・単純な設例文などがこれに該当すると見込まれる)は、
  `extractionRaw`を別途保持せず省略してよい(`diag`に「補正なし」と
  記録すれば十分)。**`sourceFaithful`が`extractionRaw`と異なる場合
  (分数・指数の書き戻し、文字化けの補正、スラッシュの意味解釈が必要な
  場合など)は、`extractionRaw`を必ず保持する。**
  - これにより、データ量の増加を「実際に補正が発生した箇所」に限定
    でき(調査レポート9節で確認した問題箇所は本編全体のごく一部)、
    かつ回帰検証・デバッグに必要な監査証跡は失われない。
  - Q&A・図解のように、機械抽出そのものが空(何も検出できない)ケースは、
    `extractionRaw`も`sourceFaithful`もともに`null`とし、`diag`に検出
    不能である旨を記録する(第2版の`detectionStatus`を踏襲)。

**`extractionRaw`が存在しない理由を機械的に判別できるようにする(追加
修正)**: `extractionRaw`が省略・欠落している状態には、性質の異なる
複数のケースがありうる(意図的な省略、抽出したが何も得られなかった、
そもそも抽出処理を行っていない、テキスト抽出の対象外)。これらを見分け
られないと、後から「本当に何も無かったのか」「単に処理し忘れたのか」を
判断できない。そこで、新しいデータ層を追加せず、`diag`に常に1つの
小さなフィールド`diag.extraction.status`を持たせ、この値だけで
`extractionRaw`が無い理由を判別できるようにする。

| `diag.extraction.status`の値(open vocabulary、暫定名) | 意味 |
|---|---|
| `captured_matches_sourceFaithful` | 機械抽出を実施し、結果は`sourceFaithful`と完全一致したため、`extractionRaw`を意図的に省略した |
| `captured_differs` | 機械抽出を実施し、結果が`sourceFaithful`と異なったため`extractionRaw`を保持している(=`extractionRaw`が存在する通常のケース) |
| `attempted_empty` | 機械抽出を実施したが、何も取得できなかった(想定外の空結果。異常の可能性があり要確認) |
| `not_attempted` | この Source ブロックに対して抽出処理そのものを実行していない |
| `not_applicable` | 図解・Q&Aアイコンのように、そもそも機械的なテキスト抽出の対象にならない要素である |

この1フィールドを常に(`extractionRaw`の有無にかかわらず)`diag`へ記録
することで、`extractionRaw`が無いことそのものから理由を推測する必要が
なくなり、`diag`だけを見れば判別できる。

### 7-4. 復元・補正の監査情報(diag)

`diag`は「`extractionRaw`から`sourceFaithful`をどう得たか」
「`sourceFaithful`から`parsed`をどう解釈したか」という**2段階それぞれの
変換根拠**を記録する。特に、書き戻し・補正が**自動処理で行われたのか、
人間が確認したのか**を区別できるようにする。

```jsonc
// diag のイメージ(架空の例。分数の書き戻しが発生したケース)
{
  "extraction": {
    "status": "captured_differs",     // extractionRawが存在する理由(7-3節)
    "artifacts": ["fraction_split"]   // 検出された既知の抽出崩れの種類
  },
  "faithfulReconstruction": {
    "performed": true,
    "method": "human_reviewed",       // human_reviewed / auto_rule:<ルール名> /
                                       // auto_rule:<ルール名>+human_reviewed 等
    "confidence": "high"
  },
  "parseInterpretation": {
    "confidence": "medium",
    "note": "分数の分母側が耐用年数を指すと解釈(按分計算式として構造化)"
  }
}
```

これにより、「どこを自動復元し、どこを人間が確認したのか」を`diag`単体で
追跡できる。将来、自動復元ロジック(分数の再結合等)を実装した場合も、
`method`の値を切り替えるだけで、人間確認との混在状況を追跡し続けられる。

### 7-5. 評価結果(6つの観点)

| 観点 | 評価 |
|---|---|
| 原文性 | `sourceFaithful`が担う(第2版の結論を維持)。`extractionRaw`は原文性そのものには寄与しないが、`sourceFaithful`が正しく原文を反映しているかを事後検証する手段になる |
| 再現性 | 7-1節のとおり、この種のプロジェクトでは抽出パイプライン自体が変化するため、「後で再生成できる」という前提は安全ではない。`extractionRaw`を保持することで、時点を固定した再現性が確保できる |
| Parserのデバッグ可能性 | `sourceFaithful`が誤っている場合に、「抽出自体が崩れていたのか」「書き戻しロジックが誤ったのか」を切り分けられる。`extractionRaw`が無いと、この切り分けができない |
| 回帰検証 | Parserの改善やルール変更の前後で、`extractionRaw`(変化しないはず)と`sourceFaithful`/`parsed`(改善により変化しうる)を分けて比較できる。両者を区別せず1つのフィールドで運用すると、「教材理解が改善したのか、たまたま抽出結果が変わったのか」を区別できなくなる |
| データ量 | 7-3節の条件付き保存により、実際に補正が発生したブロックのみが対象になるため、全ブロックに対して一律保持するより増加を抑えられる |
| 実装複雑性 | フィールドが1つ(旧`raw`)から2つ(`extractionRaw`+`sourceFaithful`)に増えるが、条件付き保存により実装・運用の手間は限定的。`parsed`をブロック種別ごとに変えてよいという第2版の設計判断は変更しない |

**結論**: `raw`を`sourceFaithful`に一本化するだけでは、機械抽出結果という
「変換の出発点」の記録が失われ、Parserのデバッグ・回帰検証・誤変換の
原因調査に支障が出ると判断する。**5段階すべてを常に別フィールドにする
必要はないが、`extractionRaw`は条件付き(補正が発生した場合のみ)で
別フィールドとして保持する4概念モデルを採用する。**

### 7-6. 名称について(raw / parsed / diagを維持するか)

第2版で`raw`という言葉に「教材上の忠実な表現」という意味を持たせたこと
自体が、今回のような再検討を招いた(「raw」は本来「未加工の生データ」を
指す語感が強く、機械抽出の生出力と衝突しやすい)。この反省を踏まえ、

- **「raw」という語は、最も語感の合う`extractionRaw`(機械抽出の生出力)
  にのみ使う。**
- 教材上の忠実な表現は`raw`から`sourceFaithful`へ改称し、「原文に忠実」
  という意味をフィールド名自体に持たせる。
- `parsed`・`diag`は概念・名称ともに変更しない。

したがって、**旧来の「raw/parsed/diag」という3点セットの呼び名は維持
せず**、「extractionRaw / sourceFaithful / parsed / diag」という4概念を
今後の呼称とする(このファイル内でも本節以降はこの4概念で統一する)。
なお、いずれも暫定名であり、スキーマの正式コード化時に変更してよい。

---

## 8. unknown / unresolvedの扱い

- **Source層**: `blockKind: "unknown"`(種類自体が分類不能)、
  `sourceFaithful: null` + `detectionStatus`(内容が取得できない)、という
  2種類の「わからなさ」を区別する。加えて、**Sourceコーパス全体が「教材の
  全内容を網羅している保証はない」という前提**を明示する(Q&Aの総数が
  不明であることなど)。これはブロック単位のunknownとは別の、**コーパス
  レベルの既知の不完全性**として、調査レポートの「なお残る調査」と
  紐づけて記録する。
- **Derived Knowledge層(改訂)**: 旧版は`unresolved`を「内容が不確か」と
  「統合してよいか未確定」の両方に使っていたが、5節の改訂により、この
  2つを次のように明確に分離した。
  - **内容そのものが不確か**な場合(例: 抽出結果の復元に自信がない、
    Q&Aのように内容自体を取得できていない)は、`contentConfidence.level`
    を`uncertain`や`unresolved`寄りの値にする。これはSource層の
    `detectionStatus`とも連動しうる(Sourceの`sourceFaithful`が`null`
    であれば、それに由来するDerived Knowledgeの内容確信度は当然低くなる)。
  - **統合してよいか未確定**な場合(6節④)は、`consolidation.state`を
    `merge_candidate`にし、`possibleDuplicateOf`で候補をリンクする。
    内容自体の確信度(A軸)は下げない。
  - **反復・一般性が乏しい**こと自体は`evidence.occurrenceCount`が
    小さいという事実として保持するだけであり、それ自体を理由に
    Knowledgeを「弱い」「未確定」とは扱わない(統合提案・CLAUDE.md原則4
    のとおり、出現回数は判断材料であって確定ルールの根拠にはしない。
    「2箇所以上ならconfirmed」という機械的な閾値は採用しない、という
    ユーザー方針をデータ構造レベルで反映したもの)。

---

## 9. 今回の教材調査結果をどう設計へ反映したか

| 調査結果 | 設計への反映 |
|---|---|
| 凡例7分類だけでは教材の実態を覆えない(コラム・Q&A確認) | `blockKind`をopen vocabularyにし、未知種別を`unknown`で許容 |
| 計算式が「用語ベース」と「方程式」の2種類あり、後者は独立した技術 | Derived Knowledgeの`knowledgeKind`を`calculation_formula`と`solution_technique`に分離し、混同しない |
| 仕訳型ボックスに複数の脚注式がぶら下がる複雑な形式がある | Source ContentBlockに複数の補足式を保持でき、Derived Knowledge側で`anchor`により個別参照できる設計(6節③) |
| 定額法の計算式がテーマ8→9へ反復適用される | 複数Source→1 Knowledgeの参照パターンを明示的に設計(6節②) |
| コラム・Q&Aは会計知識ではない | Derived Knowledgeへの自動昇格対象から明示的に除外(4節) |
| Q&Aのアイコンがテキストラベルを持たず検出できない場合がある | Source層に`detectionStatus`、コーパスレベルの不完全性の明示(8節) |
| 「／」の多義性、分数・指数の分断 | extractionRaw/sourceFaithful/parsed/diagの4概念分離の採用根拠として明記(7節) |
| (改訂)機械抽出結果を残さないと、教材理解の改善なのか抽出結果の変化なのか回帰検証で区別できない | `sourceFaithful`(旧`raw`)とは別に、補正が発生した場合のみ`extractionRaw`を条件付きで保持する4概念モデルへ変更(7節) |
| 基礎/上級統合は本冊だけでは判断できない | Derived Knowledgeの状態を「内容確信度/evidence/統合状態」の3軸に分離し、出現回数による機械的な確定ルールを採用しない(5節・8節)。基礎/上級統合ロジック自体は10節・12節の保留事項として残す |
| (改訂)出現回数の多さと内容確信度・統合可否は別問題 | `status`という単一フィールドを廃止し、`contentConfidence`/`evidence`/`consolidation`の3軸へ分離(5節・6節・8節) |
| (改訂)rawが「原文の忠実な表現」か「機械抽出の生出力」か曖昧だった | `raw`を「教材上の表現を要約・言い換えなしに忠実に書き写したもの」に定義を確定し、機械抽出との差異は`diag`側の監査情報として保持(7節) |
| (改訂)仕訳の型・算定式・方程式解法で必要な構造が異なる | Derived Knowledgeの`statement`(単一文字列)を廃止し、`knowledgeKind`ごとに形が異なる`content`オブジェクトへ変更(5-2節) |

---

## 10. 1冊目だけでは確定しない事項

- `blockKind`・`knowledgeKind`の具体的な語彙一覧(今回確認した12種程度は
  あくまで初期リストであり、残り7冊で増える前提)
- 方程式による解法テクニックをDerived Knowledge化する価値があるかどうか
  (1件のみの確認のため、独立した知識種別として十分な根拠があるとは
  まだ言えない)
- コラム・Q&Aを本当に一律Derived Knowledge対象外としてよいか(例外の
  有無は他冊を見ないと分からない。ただし4節のとおり、個別例外を許す設計
  自体は既に採用している)
- `parsed`・`content`の具体的なフィールド定義(ブロック種別・
  knowledgeKindごとに変わる想定だが、実データが少なく網羅的な設計は
  できない)
- `contentConfidence.level`・`consolidation.state`の具体的な語彙(今回
  例示した`verified_from_source`/`reconstructed`/`uncertain`、
  `single_source`/`merged_confirmed`/`merge_candidate`/`merge_rejected`は
  いずれもイメージ例であり、確定した値一覧ではない)
- `extractionRaw`を保持する/省略する境界(「`sourceFaithful`と完全一致
  すれば省略」で十分か、軽微な差異(全角/半角の揺れ等)まで含めて厳密に
  一致判定するか)、および`diag`の具体的なフィールド構成(7-4節の例は
  イメージであり確定していない)
- 基礎/上級統合の具体的な判定ロジック(本冊は基礎コースのみのため判断
  材料がない。`evidence.crossesBaseAdvanced`のような証拠フィールドは
  用意したが、それをどう判断に使うかは決めていない)

## 11. No.2以降で検証すべき事項

- 「計算パターン」「プラスα」「研究」ラベルが後続巻・上級コースで
  実際に使われるか
- コラム・Q&Aの出現頻度・形式が巻ごとに一貫しているか
- 方程式による金額推定が他の論点でも使われるか(頻度の把握)
- 定額法のようなテーマ横断の反復パターンが、他の論点・他冊でも同様に
  見られるか
- 前付け(教材の使い方・記帳ルール)の内容が全巻共通か、巻ごとに変わるか
- 基礎コースと上級コースで、同一の仕訳型・計算式がどの程度共通するか
  (統合提案での「複数教材で確認＝本質」というヒューリスティックの
  実データによる検証。`evidence.crossesBaseAdvanced`をどう活用するかを
  含む)
- 5節の3軸モデル(内容確信度/evidence/統合状態)が、実データが増えても
  独立した軸として機能し続けるか(2巻目以降で軸同士が実は強く相関する、
  といったことが分かれば、モデル自体を見直す可能性がある)

## 12. 実装前にユーザーが判断すべき事項

今回のレビューで、次の5点は**ユーザーの判断として既に決定済み**である。
今後の設計・実装はこれを前提として進める。

| 事項 | 決定内容 |
|---|---|
| extractionRaw/sourceFaithful/parsed/diagの採否(旧: raw/parsed/diag) | **承認済み(最終形)**。`raw`は`sourceFaithful`へ改称し、機械抽出結果を`extractionRaw`として条件付き(補正発生時のみ)で別途保持する4概念モデルを採用。`extractionRaw`省略時の理由は`diag.extraction.status`で常に判別可能にする(7節) |
| 前付け「教材の使い方・記帳ルール」 | Sourceには含める。Derived Knowledge抽出対象にするかは別問題として保留 |
| コラム/Q&A/図解/分類表 | Sourceには保持する。Derived Knowledgeへの自動昇格はさせないが、「一律対象外」と固定せず、個別に学習上独立した知識が見つかった場合はDerived化できる設計とする(4節) |
| Derived Knowledgeの確信度・確定基準 | 「2箇所以上でconfirmed」という出現回数ベースのルールは採用しない。出現回数は`evidence`として保持し、内容確信度・統合判断とは分離する(5節・8節) |
| `parsed`層の自動化範囲 | 今は決めない。スキーマ設計と最小実装を通じて、機械的に安全に処理できる範囲を確認してから決める |

**まだ判断されていない事項**(次フェーズ以降で改めて相談する):

- 方程式による解法テクニックを独立したDerived Knowledgeとして扱う価値が
  あるか(10節。1件のみの確認のため保留)
- `contentConfidence.level`・`consolidation.state`の正式な語彙一覧
- Source層・Derived Knowledge層のフィールド名・型を、この設計案どおりに
  コード化してよいか(スキーマの正式な確定・実装の承認)
