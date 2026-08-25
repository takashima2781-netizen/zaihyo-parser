# `diag`蓄積型設計 実装可能性の小規模検証

`planning/parser_design_proposal.md`9節に残る検証事項のうち、「`diag`蓄積型設計の
実装可能性確認」について、既存資料からの`diag`関連情報の洗い出しと、実データ
(これまでのセッションで確認済みの8ケース)による検証を行った結果である。

**本ファイルは設計・検証結果の報告のみである。** `diag`正式スキーマの確定・
gateChecks本実装・Parser本体実装・Source/Derived Knowledgeスキーマの正式コード化・
Stage3判定基準の正式確定・Derived Knowledge生成には一切進んでいない。
`parser_design_proposal.md`・`source_derived_knowledge_design_proposal.md`・
`TASK.md`は、この検証が終わるまで変更していない。`planning/gatechecks_invariant_
validation.md`も引き続き未追跡のまま維持している。

**今回の目的は`diag`の正式スキーマを決めることではない。** 複数の蓄積方式の候補を
比較し、実データに当てたときにどの形が自然かを確認することに限定する。最初から
大きな汎用ログシステムは設計しない。

---

## 1. 検証目的

Parserの複数ステージ(抽出・復元・検出・不確実性・artifact・レビュー要否・
provenance・Validation結果)で発生する診断情報を、1つのSourceに対してどう蓄積
すれば、次の4要件を満たせるかを検証する。

1. 情報を上書き・消失しない
2. どのステージで何が起きたか追跡できる
3. gateChecksが必要な情報を機械的に参照できる
4. 人間レビュー時にも原因を追える

---

## 2. 既存資料からの`diag`関連情報の洗い出し

| # | 情報 | 出典 | 形状 |
|---|---|---|---|
| 1 | `diag.extraction.status`(5値: `captured_matches_sourceFaithful`/`captured_differs`/`attempted_empty`/`not_attempted`/`not_applicable`) | source_derived_knowledge_design_proposal.md 7-3節 | `diag.extraction`名前空間内の文字列 |
| 2 | `diag.extraction.artifacts`(文字列配列。`fraction_split`/`exponent_split`/`column_order_shift`) | 同7-3・7-4節、parser_design_proposal.md 6-1節 | 文字列配列(構造化されていない) |
| 3 | `extractionRaw.tool`/`toolVersion`/`invocation` | source_derived_knowledge_design_proposal.md 3-2節例 | `extractionRaw`側のメタ情報(`diag`側ではない) |
| 4 | `diag.faithfulReconstruction.performed`/`method`/`confidence` | 同7-4節例 | `diag.faithfulReconstruction`名前空間 |
| 5 | `diag.parseInterpretation.confidence`/`note` | 同7-4節例 | `diag.parseInterpretation`名前空間 |
| 6 | `diag.provenance.parentBlockId`/`relation`/`note` | parser_design_proposal.md 5-1節 | `diag.provenance`名前空間 |
| 7 | `detectionStatus`(`unresolved_icon_only`等) | source_derived_knowledge_design_proposal.md 3-2節例(Q&Aブロック) | **`diag`の外側、ContentBlockの兄弟フィールド** |
| 8 | `diag.note`(表ブロックの`／`解釈注記) | 同3-2節、table例 | **自由記述の`note`文字列を`diag`直下に直接持たせる形**(`extraction`等の名前空間を経由しない) |
| 9 | gateChecks検証結果(包含チェック・参照存在チェック等) | gatechecks_invariant_validation.md 4-1・4-2節 | 未確定。今回`diag`に書くか別管理かを検証する対象 |
| 10 | review routingの理由(要レビュー一覧のカテゴリ) | parser_design_proposal.md 6-2節(`unresolved: {locator, reason}[]`参考パターン) | `diag`とは別の一覧として構想されていた(Zaihyo Parser参考パターン) |
| 11 | 縦積み`○○○`/`〇〇〇`の崩れ | gatechecks_invariant_validation.md 4-3節 | 対応する`artifacts`語彙が現状存在しない(欠落) |
| 12 | plain/layout間の差(ラベル行分断、`\s?`→`\s*`変更) | label_detection_prototype_validation.md 4-1節 | `diag`側のどこにも明示的な置き場が無い(未検討だった) |

### 2-1. 既存文書間で見つかった食い違い(統一せず報告)

- **`detectionStatus`は`diag`の内側か外側か**: `source_derived_knowledge_design_
  proposal.md`3-2節のQ&Aブロック例では、`detectionStatus: "unresolved_icon_
  only"`が`diag`と**同じ階層の兄弟フィールド**として置かれている
  (`diag: {...}, detectionStatus: "unresolved_icon_only"`)。一方、同じ
  ファイルの7-3節の文章では「`sourceFaithful`が`null`かつ`detectionStatus`が
  付与されているケース」を`diag.extraction.status`の話と並べて説明しており、
  両者がどういう関係にあるか(`detectionStatus`は`diag.extraction.status`の
  別名なのか、独立した第5の概念なのか)は本文からは明確に読み取れない。
- **`diag`直下に自由記述の`note`を直接持たせる形と、名前空間構造化された
  形が同じファイル内に混在している**: 3-2節のformula-1例は
  `diag: { extraction: { status: "..." } }`という名前空間構造だが、table例は
  `diag: { note: "..." }`という**名前空間を経由しない直接の自由記述**である。
  どちらが正式な形なのか、それとも両方とも許容される(=`diag`は名前空間付き
  フィールドと自由記述フィールドが混在してよい)のかは、既存資料からは断定
  できない。
- **`diag.provenance`の位置づけ**: 参考にしたZaihyo Parser(`src/
  bookStructureMaster/mappings.mjs`)の実装を確認したところ、財表側では
  `provenance`は`parsed.diag`の**内側ではなく、ノードの兄弟フィールド**
  として独立に持たせている(`{ raw, parsed: { diag, ... }, provenance: null,
  children: [] }`という形。`mapDiag()`関数自体も`{parserVersion, confidence,
  notes}`という単純な3フィールドのみで、`provenance`を一切含まない)。これは
  boki-app側の設計案(`diag.provenance`として`diag`の内側に置く、
  parser_design_proposal.md 5-1節)と**配置が異なる**。財表固有の実装詳細を
  そのまま移植する話ではないが、「`provenance`を`diag`と同列に扱わない」
  という設計判断が既に別プロジェクトの実装で採られていた、という参考事実
  として報告する(7節で詳しく検討する)。

これらの食い違いは、今回どちらが正しいかを断定せず、6節以降の比較検証の材料
として扱う。

---

## 3. 比較するdiag蓄積方式の候補

### 方式A: フラット単一オブジェクト(名前空間なし)

各ステージが同じ`diag`オブジェクトの**トップレベルに直接**フィールドを追記する。

```jsonc
{ "status": "captured_differs", "artifacts": ["fraction_split"],
  "method": "human_reviewed", "confidence": "high" }
```

### 方式B: ステージ別namespace(既存資料が既に使っている形)

各ステージが自分の名前空間(`extraction`/`faithfulReconstruction`/
`parseInterpretation`等)だけに書き込む。**現状の設計案の書き方(7-4節例)は
既にこの形に近い。**

```jsonc
{ "extraction": { "status": "captured_differs", "artifacts": ["fraction_split"] },
  "faithfulReconstruction": { "performed": true, "method": "human_reviewed", "confidence": "high" } }
```

### 方式C: イベント/issue蓄積方式

各ステージが「何が起きたか」を1件のレコードとして配列へ**追記**する。上書きが
発生しない。

```jsonc
{ "events": [
    { "stage": "extraction", "tool": "pdftotext-plain", "result": "fraction_split_detected" },
    { "stage": "extraction", "tool": "pdftotext-layout", "result": "partial_recovery" },
    { "stage": "faithfulReconstruction", "method": "human_reviewed", "result": "resolved" }
] }
```

### 方式D: 組み合わせ(状態は名前空間、履歴が要る情報だけ配列)

方式Bを基本としつつ、**複数回の試行や再実行が本質的に起こりうるフィールドだけ**
配列にする。`provenance`は`diag`の外側(ContentBlockの兄弟フィールド)へ出す。

```jsonc
{
  "extraction": {
    "status": "captured_differs",
    "attempts": [
      { "tool": "pdftotext-plain", "outcome": "fraction_split_detected" },
      { "tool": "pdftotext-layout", "outcome": "partially_recovered" }
    ]
  },
  "faithfulReconstruction": { "performed": true, "method": "human_reviewed", "confidence": "high" }
}
```

---

## 4. 8ケースでの追跡検証

各ケースについて、どのステージが何を書き、後続ステージ・gateChecks・人間
レビューが何を読む必要があるかを追跡し、方式B/C/Dでどう表現が変わるかを比較
した。方式Aは4-3節以降でまとめて評価する(個別ケースごとの表現は方式Bとほぼ
同じ形になり、差は「名前空間があるかないか」だけのため、個別追跡は省略する)。

### 4-1. 通常ケース(47〜48ページ、プレースホルダなし具体的仕訳)

`extractionRaw`≒`sourceFaithful`で特別なartifactが無い。

- 書く: [1] Extractionが`diag.extraction.status = captured_matches_
  sourceFaithful`のみを書く。他ステージは実質何も追記しない。
- 読む: 後続ステージ・gateChecksは「補正不要だった」という事実だけを確認
  できればよい。

**方式B/C/Dの差**: このケースでは3方式とも同じくらい単純(`{extraction:
{status: "captured_matches_sourceFaithful"}}`程度)。**通常ケースの単純さを
損なわない、という要件は3方式とも満たす。**

### 4-2. 分数復元ケース(155〜158ページ、`／`復元)

- [1] Extractionが`extraction.status = captured_differs`、
  `artifacts: ["fraction_split"]`を書く。
- [5] Faithful Restorationが`faithfulReconstruction.performed = true`、
  `method = "human_reviewed"`、`confidence = "high"`を書く。

**方式Bでの表現**: `extraction`と`faithfulReconstruction`が別の名前空間に
分かれ、[1]と[5]どちらが何を書いたかが読み取りやすい。

**方式Cでの表現**: `events`配列に2件(`extraction`ステージの検出イベント、
`faithfulReconstruction`ステージの復元イベント)が並ぶ。読む側は「最後の
イベントが復元成功だったか」を配列の末尾から判定する必要があり、方式Bより
一手間増える。

**gateChecks(4-1節既存検証との接続)**: gateChecks側が必要とするのは
「`artifacts`に`fraction_split`があり、かつ`faithfulReconstruction.
performed = true`か」という**最終状態の組み合わせ**であり、復元に至る
過程(何回試みたか)は今回のケースでは不要だった。**方式Bの方が、この種の
「最終状態を機械的に参照する」用途には自然**、という結果になった。

### 4-3. 縦積み`○○○`/`〇〇〇`ケース(52・97ページ、plain/layoutで抽出状態が異なる)

- [1] Extraction(plainモード)が、3文字が別行に分断された生テキストを
  `extractionRaw`へ格納し、`extraction.status = attempted_empty`寄りの
  何らかの状態(**2-1節で触れたとおり、対応する`artifacts`語彙が現状存在
  しない**)を書こうとするが、既存語彙に該当がなく詰まる。
- 同じ内容を[1] Extraction(layoutモード)で再試行すると`○○○`/`〇〇〇`と
  してひとまとまりに取得できる。

**ここで方式B(単純な名前空間)の限界が具体的に見えた**: 方式Bでは、
`extraction`名前空間は「1回の抽出試行の結果」を表すことが暗黙の前提になって
おり、**「plainでは失敗し、layoutでは成功した」という2回の試行そのものを
自然に表現する場所がない**。無理に表現しようとすると、`extraction.status`を
layoutでの成功結果(`captured_differs`)で上書きすることになり、**「plainでは
取得できなかった」という事実がフィールドの値としては残らない**(4-3節で
確認した崩れ方自体は残るが、「なぜ2回試みたのか」という経緯は消える)。

**方式C/Dであれば**: `events`または`attempts`配列に、`{tool: "pdftotext-
plain", outcome: "split_across_lines"}`→`{tool: "pdftotext-layout", outcome:
"recovered"}`という2件を順に追記でき、**情報を上書き・消失しない**という
要件1を満たせる。**このケースは、方式Bと方式C/Dの差が最も明確に現れるケース
だった。**

### 4-4. ラベル分断ケース(62・124ページ、plainで「解」「説」に分断、layoutで復元)

`label_detection_prototype_validation.md`4-1節で確認済みの実例(plainモードで
`解`と`説`が別行に分断され、layoutモードかつ`\s*`許容の正規表現変更で回収
できたケース)。

これは4-3節(縦積み`○○○`)と**構造的に同じパターン**(plainで失敗→layoutで
回収)であることが、今回diag設計の観点で見比べて初めて明確になった。**両者を
同じ`diag`の形(`attempts`配列に`tool`ごとの結果を積む)で統一的に表現できる
可能性が高い**、という気づきが得られた。ただし、このケースはStructureNode/
Block Detectionの検出パターン自体(正規表現の`\s?`→`\s*`変更)に関わる話であり、
「検出できたかどうか」というBlock Detection段階の情報を、ContentBlock確定前
(まだ`sourceFaithful`が確定していない段階)の`diag`にどう記録するかは、
今回の8ケースの中でも扱いが定まらなかった([3] Block Detectionの時点では
まだContentBlockが確定していないため、`diag`を持つ主体自体がまだ存在しない
可能性がある。10節の未決事項とする)。

### 4-5. `extracted_from_parent`(親子で`sourceFaithful`が重複)

`gatechecks_invariant_validation.md`4-1節の検証(93〜96ページ差額補充法、
157〜158ページ定額法)を`diag`蓄積の観点で追跡した。

- [4] Source Segmentationが親子関係を確定した時点で、子の`diag.provenance
  = {parentBlockId, relation: "extracted_from_parent"}`を書く(既存案どおり)。
- [7] gateChecksがこの`provenance`を読み、包含チェックを実行する。

**ここで2-1節・3節で触れた`provenance`の配置問題が具体的に効いてくる**:
`provenance`は「抽出や復元がどの程度うまくいったか」という**診断情報とは
性質が異なる**(親子関係という**構造的な事実**であり、`extraction`や
`faithfulReconstruction`のような「うまくいった/いかなかった」という評価軸を
持たない)。方式B/C/Dのいずれであっても、`provenance`を`extraction`や
`faithfulReconstruction`と同じ`diag`の名前空間・イベント配列に混ぜると、
「診断情報の一覧を見たら、たまたま親子関係の情報も混ざっていた」という、
性質の異なる情報が同じ入れ物に同居する状態になる。

### 4-6. `footnote_of_parent`(内容重複ではなく参照関係)

169〜170ページの構造(`gatechecks_invariant_validation.md`4-2節)を追跡した。
4-5節と同様、`diag.provenance = {parentBlockId, relation: "footnote_of_
parent"}`を書く形になるが、**性質の違い(4-5節)は同じく当てはまる**。加えて、
このケースは`extraction`/`faithfulReconstruction`側の情報が(補正不要のため)
ほぼ空であり、**`diag`オブジェクトの中身が実質`provenance`だけになる**
ContentBlockが多数派になることが分かった(169〜170ページの5つの脚注はいずれも
抽出崩れが無い)。**`provenance`だけのために`diag`オブジェクトを持たせるのは、
「診断情報」という`diag`本来の意味と噛み合っていない**、という違和感が実データ
で具体的に確認できた。

### 4-7. Faithful Restoration未解決ケース(155/171〜174/186ページ)

`child_source_necessity_validation.md`C3、`gatechecks_invariant_validation.md`
4-5節で確認済み。171〜174ページの二重分数は、**layoutモードでも一部の項が
欠落する**(=部分的にしか解決しない)という、単純な真偽値では表現しきれない
状態を持つ。

- [1] Extractionが`artifacts: ["fraction_split"]`(または複合分数用の新語彙、
  10節)を書く。
- [5] Faithful Restorationが**部分的にしか解決できなかった**ことを書こうと
  すると、`performed: true`だが`confidence: "low"`、かつ本文には欠落した項が
  残っている、という**「試みたが完全には解決していない」状態**を表現する
  必要がある。

**artifactを単なる文字列配列のままにした場合の問題が、このケースで最も具体的に
表面化した**: `artifacts: ["fraction_split"]`という文字列だけでは、**この
artifactが「未解決のまま残っている」のか「解決済みで記録だけ残している」のか
を判別できない**。`gatechecks_invariant_validation.md`候補13(「未解決
artifactが子Source化の根拠にされていないか」)を機械的に判定するには、
artifactごとに最低限**解決状態**を持たせる必要があることが、このケースで
具体的に確認できた(6節で構造案を検証する)。

### 4-8. StructureNode/Block Detection衝突ケース(87ページ、研究ブロック内`➊➋`)

`gatechecks_invariant_validation.md`4-6節の検証を`diag`蓄積の観点で追跡した。
このケースは**ContentBlock単位の`diag`ではなく、StructureNodeサブ項目候補と
いう別の主体に関する情報**であり、そもそも「どのContentBlockの`diag`に
書くべきか」という主体の特定自体が曖昧になることが分かった(候補になっている
`➊➋`は、まだStructureNodeのサブ項目として確定していない段階の候補であり、
確定したContentBlock/StructureNodeの`diag`に後付けで書き込む形にはなじまない)。

**このケースは、`diag`の蓄積方式そのものよりも、「[3] Block Detection段階の
候補(まだ確定していないもの)に関する情報を、確定後のどのノードの`diag`に
帰属させるか」という、より手前の設計問題であることが分かった**。これは今回の
`diag`蓄積方式の比較では解決しない範囲であり、10節の未決事項として扱う。

---

## 5. 特に確認したいことへの回答

### 5-1. 「現在状態」と「履歴」を分ける必要があるか

**両方が必要であり、フィールドの性質によって使い分けるのが実データに最も
合っていた。** 4-2節(分数復元)のように「最終的にどうなったか」だけで
gateChecksが判定できるケースでは、履歴を持たせても使われず冗長になる。一方、
4-3節(縦積みプレースホルダ、plain失敗→layout成功)・4-4節(ラベル行分断、
同型のパターン)のように、**「最初の試行で失敗し、別の手段で再試行して成功
した」という経緯自体が診断・回帰検証の価値を持つケース**では、最終状態のみの
保存だと**「plainで失敗した」という事実が消える**ことを具体的に確認した。

**結論(方式Dの採用根拠)**: 全フィールドを画一的に「状態」または「履歴」の
どちらかに決め打ちするのではなく、**複数ステージ・複数回の試行が本質的に
起こりうるフィールド(抽出方式の再試行等)だけ配列(履歴)にし、それ以外
(復元の最終確信度等、1ステージが1回だけ書く性質のもの)は単純な名前空間の値
(状態)のままにする**、という方式Dの考え方が、通常ケースの単純さ(4-1節)と
異常ケースの追跡可能性(4-3節)の両方を実データで満たせた。

### 5-2. artifactに必要そうな最小構造

4-7節の検証により、**単なる文字列配列のままでは「未解決artifactが子Source化の
根拠にされていないか」というgateChecks候補(#13)を機械的に判定できない**
ことが分かった。最低限、次の構造が必要と考えられる。

```jsonc
{ "kind": "fraction_split", "stage": "extraction", "resolved": false,
  "note": "layoutモードでも分母が次行に残る(171〜174ページ型)" }
```

- `kind`: artifact種別(open vocabulary、既存の`fraction_split`等)
- `stage`: どのステージで検出されたか
- `resolved`: 解決済みかどうか(4-7節の二重分数のような部分解決ケースは、
  `resolved: false`+`note`で「部分的にしか解決していない」事実を記録する
  程度に留め、3値目("partially_resolved"等)を今回は導入しない。**最小構造を
  保つため**、状態の種類を増やしすぎないことを優先した)
- `note`: 根拠・補足(自由記述)

ユーザー提示の候補(kind/stage/resolved/根拠)は、実データ(4-7節)による検証の
範囲でそのまま有効だった。**これ以上の構造化(例: 誰が解決したか、解決日時等)
は、今回の8ケースでは必要性を確認できなかった**ため提案しない。

### 5-3. review routingとの関係

**diagは事実だけを記録し、`reviewRequired`のような最終判断は別のValidation/
routing処理が持つべき**、という設計思想を支持する。

根拠: 4-7節の`resolved: false`という**事実**と、「これを要レビューに回すか」
という**判断**は、実データ上も別のタイミングで生じている。`resolved: false`
自体はFaithful Restoration段階で判明する事実だが、「未解決のまま子Source化に
使ってよいか」という判断は[7] Validationの責務(`gatechecks_invariant_
validation.md`候補13)であり、**判断のロジック自体が変わりうる**(例えば
将来、二重分数の復元アルゴリズムが改善されれば、同じ`resolved: false`という
事実に対する判断が変わりうる)。もし`reviewRequired: true`を`diag`自身に
持たせてしまうと、判断ロジックの変更のたびに**過去に生成済みの`diag`データを
書き換える**必要が生じ、「`diag`は変換過程の監査情報である」という既存の
設計思想(source_derived_knowledge_design_proposal.md 7節)と整合しなくなる。
**事実(`resolved: false`)は`diag`に、判断(要レビューかどうか)は別のValidation
結果側に、という責務分離が実データ(4-7節)からも支持される。**

### 5-4. `provenance`の扱い

**`diag`の内側ではなく、ContentBlockの兄弟フィールドとして独立させる方が
自然、という結論を支持する実データが複数見つかった。**

- 4-5・4-6節で確認したとおり、`provenance`は「うまくいった/いかなかった」
  という評価軸を持たない**構造的な事実**であり、`extraction`/
  `faithfulReconstruction`のような**診断情報とは性質が異なる**。
- 4-6節の脚注ケースのように、抽出・復元に何の問題もない(=`diag`の他の部分が
  ほぼ空になる)ContentBlockでも`provenance`は必ず存在する、というケースが
  多数見つかった。「診断情報がほぼ空なのに`diag`オブジェクト自体は存在する」
  という状態は、`diag`の意味(何か診断すべきことがあった記録)と噛み合わない。
- 2-1節で確認したとおり、参考にしたZaihyo Parserの実装でも、`provenance`
  (正確には`parsed.diag`と同格の`provenance`フィールド)は**`diag`
  (`parsed.diag`)とは別の場所に独立して置かれていた**。これは同種の設計
  判断が既に他プロジェクトの実装で採られていたという参考事実であり、
  そのまま踏襲すべき決定的な根拠ではないが、本検証の結論と方向性が一致する。

**結論(提案)**: `provenance`は`diag`から切り離し、ContentBlockの独立した
フィールド(`location`等と同格)とする案を、次フェーズで正式に検討する価値が
あると考える。ただし**これは提案であり、今回の検証だけで確定するものではない**
(既存設計の変更を伴うため、正式な判断はユーザーに委ねる)。

### 5-5. gateChecks結果を`diag`へ持たせるか

**持たせず、別管理にする方が自然、という結論を支持する。**

根拠: gateChecksは`diag`(および`sourceFaithful`等)を**読んで**検証結果を
出力する処理である。もしgateChecksの結果自体を各ContentBlockの`diag`へ
書き戻すとすると、**「`diag`を生成する処理」と「`diag`を読んで検証する処理」
が同じデータへ書き込む循環**が生じる。具体的な問題として、Parserを再実行
せずにgateChecksだけを再実行した場合(例: 検証ルールを修正して再チェックする
場合)、`diag`という「変換過程の監査情報」に**検証ルール変更の結果**が
混ざり込み、「いつのgateChecksルールでの結果か」を`diag`自身の中で追跡する
必要が生じてしまう。これは4-3節で確認した「複数回の試行を履歴として残す」
必要性とは**性質が異なる**(抽出・復元は教材の内容に対する処理だが、
gateChecksは生成済みデータに対する検証であり、実行のたびに毎回結果が変わり
うる)。

参考にしたZaihyo Parser(`src/cli/build-drill-csv.mjs`)でも、`gateChecks`
オブジェクトは各アイテムのデータへ書き戻すのではなく、**実行全体に対する
1つの独立した検証結果**として出力されていた(2-1節で確認したアーキテクチャ
パターン)。**gateChecksの結果は、Source/Derived Knowledgeデータとは別の
「Validation実行レポート」として持つ**、という方向性を推奨する。

---

## 6. 評価軸による比較

| 評価軸 | 方式A(フラット) | 方式B(名前空間) | 方式C(イベント配列) | 方式D(組み合わせ) |
|---|---|---|---|---|
| 通常ケースの単純さ(4-1節) | ○(単純だが衝突リスクあり) | ◎ | △(通常ケースでも配列を作る必要があり冗長) | ◎ |
| 異常ケースの追跡可能性(4-3・4-4節) | △ | ×(最終状態しか残せない、4-3節で確認) | ◎ | ◎(履歴が要るフィールドのみ配列化) |
| 情報消失の有無 | △(同名フィールドの上書きリスク) | ×(4-3節で「plainで失敗した」事実が消えることを確認) | ○ | ○ |
| gateChecksからの参照しやすさ(4-2節) | △(どのステージ由来か不明瞭) | ◎(4-2節で最終状態を素直に参照できることを確認) | △(配列の末尾を都度解釈する必要) | ◎ |
| 人間レビュー時の読みやすさ | △ | ○ | ○(時系列で経緯を追える) | ○ |
| ステージ間の責務分離 | ×(同じ階層にどのステージも書けてしまう) | ◎(名前空間で書き込み範囲が明確) | ○(`stage`フィールドで区別できるが強制力はない) | ◎ |
| 将来のParser実装コスト | 低い(単純) | 低い(既存資料の書き方をほぼ踏襲できる) | 中(配列操作・順序保証の実装が要る) | 中(使い分けの基準を実装・ドキュメント化する必要) |

---

## 7. 最も自然だった方式と理由

**方式D(組み合わせ: 基本はステージ別namespace、複数回の試行が本質的なフィールド
だけ配列化、`provenance`は`diag`の外に出す)が、8ケースを通じて最も無理が
少なかった。**

- 4-1・4-2節(通常ケース・分数復元ケース)では、方式Bと同等の単純さを保てた。
- 4-3・4-4節(plain失敗→layout成功という2回の試行)では、方式Bでは
  「plainで失敗した」という情報が消える(要件1違反)ことを具体的に確認した
  一方、履歴配列を使うことでこの情報を残せた。
- 4-5・4-6節(`provenance`)では、`provenance`を`diag`の名前空間の1つとして
  扱うと、「診断すべきことが何もないのに`diag`が存在する」という違和感が
  生じることを確認し、`diag`の外に出す方が自然という結論に至った。
- 4-7節(未解決artifact)では、artifactを`{kind, stage, resolved, note}`の
  最小構造にすることで、gateChecks候補13(未解決artifactを根拠にした子
  Source化の検出)が機械的に実現できる形になることを確認した。

**ただし、方式Dは「どのフィールドを履歴化し、どのフィールドを状態のままに
するか」という判断基準を実装時に決める必要があり、この基準自体は今回の8
ケースからの帰納にとどまる**(10節)。

---

## 8. 既存設計との整合性・食い違い

明確な矛盾は見つからなかったが、2-1節で述べた食い違い(`detectionStatus`の
位置づけ、`diag.note`の自由記述形と名前空間構造化形の混在)に加え、次の点が
今回の検証で新たに具体化した。

- `parser_design_proposal.md`5節は「`diag`は複数段階が書き込む共有オブジェクト
  であり、責務境界が曖昧になるリスクがある」と**既に懸念を明示**していた。
  今回の検証(4-3・4-4節)は、この懸念が**実データで具体的に発現するケース
  (plain失敗→layout成功のような複数回試行)を特定できた**という点で、
  既存の懸念を裏付ける追加知見にあたる。矛盾ではない。
- `parser_design_proposal.md`5-1節は`diag.provenance`という配置を前提に
  詳細を詰めていたが、今回の検証(5-4節)は**この配置自体を見直す提案**を
  含む。これは既存資料の記述と直接矛盾するものではない(5-1節時点では
  `provenance`の`diag`内外の位置づけ自体が検討課題になっていなかった)が、
  今回の提案を採用する場合は5-1節の記述に影響する可能性がある。

---

## 9. 未決事項

- 方式Dにおいて「どのフィールドを履歴化すべきか」の具体的な基準(4-4節で
  ラベル行分断が縦積みプレースホルダと同型と分かったが、他にも同型の
  ケースがあるかは未確認)。
- [3] Block Detection段階(まだContentBlockが確定していない候補の段階)に
  関する診断情報を、どの主体の`diag`に帰属させるか(4-4節後半・4-8節で
  浮上した、`diag`蓄積方式そのものより手前の設計問題)。
- `provenance`を`diag`の外へ出す提案(5-4節)を正式に採用するかどうかの
  ユーザー判断。採用する場合、`parser_design_proposal.md`5-1節・
  `source_derived_knowledge_design_proposal.md`側の記述への影響範囲の洗い出し。
- artifactの最小構造案(`kind`/`stage`/`resolved`/`note`、5-2節)を正式な
  スキーマとして採用するかどうか。今回は8ケースの範囲での有効性確認に
  留まる。
- 縦積み`○○○`/`〇〇〇`の崩れに対応する`artifacts`の`kind`語彙の命名
  (`gatechecks_invariant_validation.md`8節から持ち越し)。
- gateChecks結果を「別管理のValidation実行レポート」として持たせる場合の
  具体的な形(5-5節は方向性の提案に留まり、データ構造の設計はまだ行って
  いない)。

---

## 10. 次に進むべきフェーズの提案

`parser_design_proposal.md`9節に残っていた3項目(子Source化候補の必要性判定
基準・gateChecks不変条件の具体化・`diag`蓄積型設計の実装可能性)は、いずれも
小規模検証を完了した。今回までに得られた知見(特に5-4節の`provenance`配置・
5-2節のartifact最小構造・5-5節のgateChecks結果の別管理案)は、いずれも
**既存設計への具体的な変更提案を含む**ため、次のフェーズとしては、

1. 今回・前回(`gatechecks_invariant_validation.md`)の検証結果をユーザーと
   すり合わせ、既存資料(`parser_design_proposal.md`・`source_derived_
   knowledge_design_proposal.md`・`TASK.md`)へどこまで反映するかを判断する

ことを推奨する。Parser本体実装・スキーマの正式コード化は、この反映判断の
後に改めて着手を検討するのが妥当と考えるが、最終判断はユーザーに委ねる。

---

以上が`diag`蓄積型設計の実装可能性の小規模検証結果である。`diag`正式スキーマの
確定・gateChecks本実装・Parser本体実装・スキーマの正式コード化には進んで
いない。この結果を踏まえて次にどう進めるか、確認をお願いしたい。
