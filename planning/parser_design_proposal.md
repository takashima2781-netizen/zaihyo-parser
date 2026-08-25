# Parser設計案(PDF → Source層)

本ファイルは、Parser設計フェーズのうち**「PDF → 機械抽出 → 教材構造の認識 →
Source層(StructureNode/ContentBlock)」の範囲のみ**を対象とした設計案である。

**本ファイルのスコープ外**(次フェーズ以降に扱う):

- Derived Knowledge生成ロジック
- `structure.tokens`の自動生成
- Exercise生成・UI
- 8冊横断の統合ロジック

**本ファイルはコード実装・スキーマの正式コード化に一切進んでいない。** 設計案の
提示までであり、ユーザー承認後に次の段階(小規模検証→実装)へ進む。

**改訂について(第2版)**: 初版(3節でSource粒度の3候補A/B/Cを未決の
まま提示)に対し、実データ7ケースによる小規模検証
(`planning/parser_source_granularity_validation.md`)を実施した。その結果を
踏まえ、3節(Source粒度)を「段階的Source Segmentation方針」として確定し、
新たに4節「Parser / Derived Knowledgeの責務境界」を新設した。検証で見つかった
「親子Source間の`sourceFaithful`重複」問題は、この改訂では解決策を確定せず、
正式な未決事項として残した。

**改訂について(第3版・本版・現時点の正式設計)**: 第2版の未決事項だった
「親子Source間の`sourceFaithful`重複」問題について、実データ2ケース
(重複が発生したケース・発生しなかったケースの両方)による優先比較検証
(`planning/parser_sourcefaithful_duplication_validation.md`)を実施した。
その結果を踏まえ、**重複は許容する(range/span参照やfragment共有レイヤーの
ような新機構は現時点で導入しない)**、**`diag.provenance`によって由来・監査
情報を記録する(同期機構にはしない)**、**`relation`はopen vocabularyとし、
関係の性質によってgateChecksの検証内容を変える**、という方針を確定した
(5節・5-1節)。あわせて、旧`source_derived_knowledge_design_proposal.md`
§6③・13節の「同一`sourceBlockId`+`anchor`」というイメージ例が、今回確定した
Stage1〜3のSource Segmentation・条件付き親子Sourceの方針へ具体化されたことを
示す最小限の整合修正を、当該ファイル側にも行った。検証記録自体は転載せず、
必要な箇所のみ参照する。

**追記(2026-08-16)**: 9節に残っていた検証事項のうち、Block Detectionパターン
検出系(仕訳型・計算式・方程式)の全数調査(`planning/pattern_detection_survey.md`)
と、子Source化候補の必要性判定基準の小規模検証(`planning/child_source_
necessity_validation.md`)を実施した。実データで確認できた事実(検出可否と
子Source化必要性は別問題であること、8ケースの範囲で「独立参照必要性」が
最も判別力の高い軸だったこと等)のみを9節・10節へ最小限反映した。**Stage3の
判定基準そのものは、この版でも正式確定していない**(9節参照)。

**追記(2026-08-16・続き)**: 9節に残っていた残り2項目、「[7] Validation/
DiagnosticsのgateChecks不変条件の具体化」(`planning/gatechecks_invariant_
validation.md`)と「`diag`蓄積型設計の実装可能性」(`planning/diag_
accumulation_validation.md`)を検証した。この結果を踏まえ、5・5-1・6-3・9・
10節を最小限改訂した。**特に、`provenance`の配置を`diag.provenance`から
`diag`外のContentBlock側フィールドへ改める方針とした**(経緯は5-1節に記録)。
**gateChecksの結果は`diag`へ書き戻さず、別管理のValidation実行レポートとする
方針**も確定した(6-3節)。いずれも実データ検証で十分に裏付けられた範囲の
反映であり、`diag`の正式スキーマ・gateChecks本実装・**Stage3判定基準の正式
確定は、この改訂でも行っていない**(9・10節)。

参照した既存資料(Git管理下のSSOT):

- `CLAUDE.md` / `SPEC.md` / `TASK.md`
- `planning/book1_material_survey_report.md`(教材調査・改訂版)
- `planning/source_derived_knowledge_design_proposal.md`(データモデル正式設計・第4版)
- `planning/book1_prototype_validation_plan.md` / `..._results.md`(実データ検証8ケース)
- `planning/parser_source_granularity_validation.md`(Source粒度に関する
  実データ7ケースの検証記録。「なぜ3節の方針になったか」の根拠はこちらに
  記録されている)
- `planning/parser_sourcefaithful_duplication_validation.md`(**本版で新規
  参照**。親子Source間の`sourceFaithful`重複に関する実データ2ケースの検証
  記録。「なぜ5-1節の方針になったか」の根拠はこちらに記録されている)
- Zaihyo Parser(`../Zaihyo Parser`)の`src/parser/`・`src/bookStructureMaster/`・
  `src/cli/build-drill-csv.mjs`・関連docs(アーキテクチャパターンの参考として。
  財表固有の正規表現・具体的ラベル値は移植しない)

---

## 0. この設計の前提となる制約(申し送り事項の再確認)

- `sourceRefs.role`が実データで自然に機能する条件は、単純な「脚注単位まで
  細かく分割する」ことだけではなく、3節で確定した段階的な条件判定による
  (設計案13節の申し送りを、実データ検証を経て具体化したものが3節)。
- Sourceコーパスは「教材から抽出できた範囲」であり「教材の全内容」ではない、
  という前提を維持する(Q&Aの総数不明、等)。
- 教材原文の長文引用はしない。本ファイルでも、既存の調査レポートで既に
  セルフレビュー済みの短い断片のみを再利用する。

---

## 1. Parser全体の責務分割案

Zaihyo Parserの「単一のオーケストレータ関数が、責務ごとに分離した複数ステージを
順に呼び出す」という構成(`src/parser/index.mjs`の`parseDocument()`がStep0〜7を
呼ぶ形)を参考に、次のようなステージ分割を提案する。**名称・段階数は例示であり
そのまま採用する必要はない**(ユーザー指示どおり)。

```
[1] Extraction
     PDF → ページ単位の生テキスト(+可能なら座標等のレイアウト情報)
        ↓
[2] Structure Recognition
     テーマ/論点/サブ項目の階層見出しを検出し、StructureNode骨格を組み立てる
        ↓
[3] Block Detection
     ラベル(設例/解説/留意点/参考/コラム 等)・仕訳型ボックス・計算式パターンを
     検出し、ContentBlock候補(範囲+暫定blockKind)を洗い出す
        ↓
[4] Source Segmentation
     ContentBlock候補を、実際にSourceのContentBlockとして確定する粒度で分割・
     統合する(3節が本設計の中心論点。段階的Source Segmentation方針として確定)
        ↓
[5] Faithful Restoration
     extractionRawからsourceFaithfulへの書き戻し(既知の抽出崩れパターンの補正、
     または人間確認)
        ↓
[6] Parsing
     blockKindごとのparsed構造を生成(placeholders/table grid 等。
     structure.tokensの自動生成はスコープ外)
        ↓
[7] Validation / Diagnostics
     コーパス全体の不変条件チェック(gateChecks相当)+ 検出不能・要レビュー
     要素の一覧化(anomaly/review queue相当)
```

### 1-1. StructureNode認識(ステージ2の設計方針)

- 教材調査で確認済みの階層(テーマ→論点`##-#`→➊➋➌…)は、**番号+タイトルという
  見出し行パターン**をページ内から検出することで認識する、という基本方針は
  財表Parserと同型(`buildThemeTitleByNo()`相当の「見出し行の正規表現マッチ→
  番号とタイトルの対応表構築」というロジックの**型**)。
- ただし正規表現自体(テーマ番号の表記ゆれ、全角/半角数字、目次ページの除外
  条件等)は簿記論教材の実データで再確認・再設計する。財表側の`テーマ([0-9０-９]+)`
  という具体的パターンをそのまま移植しない。
- 財表Parserがテーマ26で見出し行の文字化けに遭遇し「他ページのクリーンな
  見出しから補完する」対処をしていた実績(`buildThemeTitleByNo()`)は、
  簿記論教材でも同種の文字化けが起きた場合の設計パターンとして参考にできるが、
  **簿記論教材で実際に同種の崩れが起きるかどうかは未確認**であり、9節の
  検証事項とする。
- 既習度マーカー(◎/〇/無印)・重要度(★の数)は、StructureNode認識と同じ段階で
  見出し行の周辺から検出し、StructureNodeのメタ情報として付与する(設計案3-2節の
  想定どおり)。

### 1-2. ContentBlock検出・分割(ステージ3の設計方針)

`blockKind`がopen vocabularyであるという確定済み設計を維持するため、検出器を
「既知ラベル用」と「パターンベース(ラベルを持たない)」の2系統に分ける。

- **ラベル検出系**: 「設例」「解説」「留意点」「参考」「コラム」等、アイコン+
  隣接テキストラベルという体裁を持つブロックは、**そのラベル文字列を機械的に
  検出し、次のラベル(または見出し)までの範囲をそのblockKindのContentBlockと
  する**という基本アルゴリズムを軸にする。ラベル文字列自体は`labelRaw`として
  保持し、`blockKind`はラベル文字列からの対応表(open vocabulary、未知ラベルは
  `unknown`)で決定する。
- **パターン検出系**: 仕訳型ボックス(`×××`/`○○○`プレースホルダの存在)、
  用語ベース計算式(漢字項+演算子記号の組み合わせ)、方程式解法(単一英字+
  演算子)は、ラベルではなく**内容パターン**で検出する独立した検出器とする。
  これらはラベル検出系と責務が異なるため、同じ検出器に混ぜない。
- **どちらの検出器にも一致しない領域**は`blockKind: "unknown"`として保持し、
  無理に既存種別へ分類しない(原則6の徹底)。
- **アイコンのみでテキストラベルを持たないブロック(Q&A等)** は、上記2系統
  いずれの機械検出でも原理的に見つからない(調査レポート2節・9節、検証結果
  ケース7bで再確認済み)。この種別は6節で別途扱う。
- パターン検出系は、[3] Block Detectionの段階では**独立した視覚単位に対して
  だけでなく、より大きな視覚単位(設例等)の内部に対しても同じ検出器を適用
  する**(3節Stage3参照)。「検出できる」ことと「それを独立したSourceとして
  確定するか」は別の判断であり、後者は[4] Source Segmentationの責務とする。

---

## 2. 各段階の入力・出力

| ステージ | 入力 | 出力 | 備考 |
|---|---|---|---|
| [1] Extraction | PDFファイル、対象ページ範囲 | ページ単位の生テキスト(`extractionRaw`の元)。可能ならツール名/バージョン/実行オプションのメタ情報 | 意味解釈は一切行わない。Zaihyo Parserの`extractText.mjs`相当 |
| [2] Structure Recognition | ページ単位テキスト | StructureNodeの骨格(階層・`label.titleRaw`・`importance`・`priorKnowledgeMark`)。中身(ContentBlock)はまだ空 | テーマ/論点の境界を確定させる段階。ここで確定した境界が後段のContentBlock所属先になる |
| [3] Block Detection | ページ単位テキスト + StructureNode境界 | ContentBlock候補のリスト(範囲・暫定`blockKind`・検出根拠)。ネストした候補(大きな視覚単位の内部で検出された計算式等)も候補として含む | 「候補」であり、まだSourceとして確定していない(3節・[4]へ) |
| [4] Source Segmentation | ContentBlock候補 | 確定したContentBlockの集合(通常は単一。3節の条件に該当する場合のみ親子構造) | 3節の中心論点。ここで生成される単位が最終的な`sourceRefs`の参照粒度になる |
| [5] Faithful Restoration | 確定ContentBlockの`extractionRaw` | `sourceFaithful` + `diag.extraction`/`diag.faithfulReconstruction` | 自動補正/人間確認の切り分けは6-1節。親子構造の場合の重複は許容し`provenance`(`diag`外、5-1節)で記録する |
| [6] Parsing | `sourceFaithful` | `parsed`(blockKindごとの構造) + `diag.parseInterpretation` | `structure.tokens`はスコープ外 |
| [7] Validation / Diagnostics | 全ContentBlock + StructureNode | 不変条件チェック結果(gateChecks相当)、検出不能・要レビュー要素の一覧(コーパスレベルmeta含む) | Zaihyo Parserの`anomalyDetector.mjs`+`build-drill-csv.mjs`のgateChecksパターンを参考に、簿記論固有の不変条件を新規設計する |

---

## 3. Source粒度の設計案(確定: 段階的Source Segmentation方針)

実データ7ケースによる小規模検証(`planning/parser_source_granularity_validation.md`)
を経て、Source粒度の方針を次のとおり確定する。**なぜこの方針に至ったかの
根拠・全7ケースの評価は同ファイルを参照し、本節には転載しない。**

### 3-1. 段階的Source Segmentation方針

Sourceは最初から意味単位へ細分化するのではなく、次の3段階で判断する。

```
Stage 1: 基本Source
  教材上の視覚的・内容的に完結した単位(仕訳ボックス1つ、式1行、設例1つ、
  解説1つ、参考/留意点/コラム1つ、表全体1つ 等)を、既定のSourceとして保持する。

Stage 2: 教材明示境界による子Source化(候補)
  教材自身が明示的に区切っている境界(※1・※2、個別に番号付けされた仕訳
  (1)/(2) 等)があり、かつそれを独立して参照する必要がある場合は、
  子Sourceへの分割候補とする。

Stage 3: パターン検出によるネスト単位の子Source化(候補)
  教材上の明示境界がなくても、Parserのパターン検出器が独立して検出できる
  意味単位(例: 設例内部に現れる、定義済み公式と同型の独立した計算式)が、
  より大きなSourceの内部にネストしており、それを独立して参照する必要が
  ある場合は、条件付きで子Sourceを生成する。
```

**Stage2/3はいずれも「検出できたものを必ず子Source化する」ことを意味しない。**
独立Sourceとして扱う必要性がない場合は、Stage1のSourceだけを保持する
(次段落・3-2節)。

### 3-2. 親子Sourceは条件付き機構(常設構造ではない)

検証した7ケースのうち、親子Source構造が実際に必要だったのは2ケース
(教材明示境界によるもの1件、パターン検出によるネストが1件)のみで、残る
5ケースはStage1(単一Source)だけで無理なく表現できた。

したがって、**「すべてのContentBlockが親子構造を持つ」ようなモデルにはしない**。
通常ケース(多数派)は単一Sourceで完結し、Stage2/3の条件に実際に該当する
ケースだけが、任意で親Source+0件以上の子Sourceという可変構造を持てる、
という設計を推奨方針とする。

具体的なフィールド表現(親子関連付けの持たせ方)は、10節の未決事項に含める
(この設計案では確定しない)。

### 3-3. Source分割の目的(満たすべき条件)

Source Segmentationの目的は、細かく分割すること自体ではない。少なくとも
次の4条件を**同時に**満たすことを目的とする。

- **教材上の文脈を保持する**(表のセルを独立させると列見出しという文脈を失う、
  複数ステップの式変形を分割すると導出の連続性を失う、等の実例で裏付け済み)
- **Derived Knowledgeから根拠箇所を一意に参照できる**(`sourceRefs.role`の
  `application`と`example`が実データ上区別可能になるかは、この一意性に
  依存する)
- **Parserが現実的に検出できる**(人間の意味理解に近い判断まではParserの
  責務としない。4節参照)
- **不必要な重複・複雑化を生まない**(親子Source間の`sourceFaithful`重複は
  許容するが、重複排除のための新機構は実データで必要性が確認されるまで
  導入しない。5-1節参照)

**「細かいほどよい」「意味単位なら必ず分ける」という考え方は採用しない。**
表のセル単位分割・複数ステップの式変形の分割・仕訳ボックスの借方/貸方分割は、
いずれも過度な細分化がむしろ文脈を損なう実例として検証で確認されている。

### 3-4. 代表例(検証記録より2件のみ引用)

- **Stage2の例**: 固定資産買換の仕訳ボックス(`※1`〜`※5`)。ボックス本体を
  親、各脚注を子とする。教材が脚注記号で明示的に区切っており、脚注記号
  (ポインタ)と脚注本体(実体)が教材上もともと分離しているため、親子間の
  `sourceFaithful`重複は生じない。
- **Stage3の例**: 定額法計算式がテーマ8-2で定義され、後続の複数設例(テーマ
  8・9)に、教材明示の区切りなしで数値適用の計算行として繰り返し現れる。
  設例全体を親、計算行を子とする条件付き分割を試みたところ、`application`
  roleを一意に参照できるようになった一方、**子の`sourceFaithful`(計算行)が
  親の`sourceFaithful`(設例全文)と文字面上部分的に重複する**ことが判明した。
  この重複自体は許容し、`provenance`(`diag`外、5-1節)で由来を記録する方針
  として確定している。
- **Stage1のみで完結する例**: 通常の設例→解説の対提示(教材中で最も高頻度、
  61/57件)、比較表全体、複数ステップの方程式解法。いずれも子Source化の
  必要性がなく、単一Sourceのまま4軸評価(教材上の文脈保持・根拠参照・検出
  容易性・重複の少なさ)を満たせた。

### 3-5. まだ確定していないこと

- 親子関連付けの具体的なフィールド名・型(`provenance`のフィールド構成は
  5-1節で方向性を示したが、正式なフィールド名・型のコード化はまだ行っていない)
- Stage2/3で検出された候補を「実際に子Source化するかどうか」の必要性判定
  基準そのもの(現時点では「Derived Knowledgeから一意に参照する必要がある
  場合」という記述的な基準に留まり、これをParserがどこまで自動判定できるか、
  どこから人間レビューが必要かは未確定)

親子Source間の`sourceFaithful`重複の扱いは5-1節で方針を確定した。残る
詳細(文字列正規化の範囲、不一致時にfail-closedとするか要レビューとするか等)
は9節・10節へ持ち越す。

---

## 4. Parser と Derived Knowledge の責務境界

実データ検証(定額法計算式の設例内適用ケース)で、Parserのパターン検出器が
「独立した意味単位(計算式)がある」ことは検出できても、「その計算式が、
どの定義済み公式(Derived Knowledge)の`application`であるか」は判断できない、
という境界が明確になった。今後の実装で責務が混ざらないよう、ここで明記する。

### 4-1. Parserの責務(この設計案の範囲)

- 教材上に実際に存在する構造(StructureNodeの階層、ContentBlockの範囲)を
  認識する。
- パターン検出器で検出可能な意味単位(仕訳型・計算式・方程式等)を、独立した
  ContentBlock候補として洗い出す(ネストした候補を含む、1-2節・3節Stage3)。
- 原文に忠実なSource(`extractionRaw`/`sourceFaithful`/`parsed`/`diag`)を
  生成する。
- 3節Stage2/3の条件に該当する候補を、子Source化の**候補**として提示する。

### 4-2. Parserの責務ではないもの(Source → Derived Knowledgeフェーズへ)

- 検出された計算式・仕訳型が、**既存のどのDerived Knowledgeと同一か**の
  同一性判定(consolidation)。
- `sourceRefs.role`(definition/restatement/application/example)の割り当て。
  この`role`はSource層自体には存在せず、Derived Knowledgeが複数のSourceを
  束ねる際に付与するフィールドである(設計案5節と整合。Source層のContentBlock
  は`role`を持たない)。
- 複数Source→1 Knowledgeへの統合判断、`contentConfidence`/`evidence`の算定。

### 4-3. 実務上の帰結

Parserの出力(Source層)は、「ここに独立した意味単位らしきものがある」という
**候補の提示**までを行う。その候補を「本当に独立したSourceとして確定させるか」
「どのDerived Knowledgeの`role`として扱うか」の判断は、次フェーズ
(Source → Derived Knowledge)の責務とする。Parserは3節Stage2/3の候補を
`diag`または別の候補一覧として出力するに留め、確定的な意味分類(definition/
application等)を行わない。

---

## 5. 4概念モデルとの対応

`extractionRaw`/`sourceFaithful`/`parsed`/`diag`のどの段階がどれを生成するかを
整理する(1節のステージ番号に対応)。親子Sourceを条件付きで生成する場合でも、
4概念モデル自体は維持する(子ContentBlockも親と同じ4概念を持つ、通常の
ContentBlockとして扱う)。

| 概念 | 生成段階 | 備考 |
|---|---|---|
| `extractionRaw` | [1] Extraction | ツール出力そのまま。意味解釈なし |
| `sourceFaithful` | [5] Faithful Restoration | `extractionRaw`と一致する場合は書き戻し不要(`diag.extraction.status = captured_matches_sourceFaithful`を設定するのみ) |
| `parsed` | [6] Parsing | `sourceFaithful`確定後にのみ生成できる(依存関係が明確) |
| `diag` | 複数段階(蓄積型) | 基本はステージ別namespace(`diag.extraction`は[1]、`diag.faithfulReconstruction`は[5]、`diag.parseInterpretation`は[6]がそれぞれ担当分を追記する)。ただしplain抽出失敗→layout抽出成功のように**複数回の試行が本質的に起こりうる情報**だけは、名前空間内に履歴(attempt配列)を持たせる(通常ケースまで一律イベントログ化はしない)。`provenance`はこの`diag`には含めない(5-1節) |

**`diag`蓄積型設計の実装可能性を小規模検証した結果(確定方針、`planning/diag_
accumulation_validation.md`)**: 基本はステージ別namespace、複数回試行が
本質的な情報のみ履歴化、という組み合わせ方式が実データ8ケースに最も無理が
少なかった。`diag`は**処理の事実・監査情報のみを保持し**、`reviewRequired`の
ような要レビューかどうかの最終判断は持たせない(判断は[7] Validation側の
責務とする、6-3節)。また、artifact(`diag.extraction.artifacts`)は単なる
文字列配列ではなく、少なくとも`kind`/`stage`/`resolved`/`note`程度の構造を
持たせる方向とする。いずれも方向性の確定であり、正式なフィールド名・型の
コード化はまだ行っていない(10節)。

### 5-1. 親子Source間の`sourceFaithful`重複(確定方針)

3節Stage2/3の条件で親子Sourceを生成した場合、子の`sourceFaithful`が親の
`sourceFaithful`の一部と文字面上重複するケースが実データで確認されている
(3-4節)。実データ2ケース(重複が発生したケース・発生しなかったケースの両方)
による優先比較検証(`planning/parser_sourcefaithful_duplication_validation.md`)
を経て、次の方針を確定する。

- **重複は許容する。** range/span参照(親への位置参照で内容を再構成する方式)、
  fragment共有レイヤー(親子が共通の断片IDを参照する新レイヤー)のような、
  重複排除を目的とした新機構は**現時点では導入しない**。実データで必要性が
  確認されていない複雑さを持ち込まないことを優先する。
- **子に`provenance`(由来情報)を持たせる。** 例:
  `provenance = { parentBlockId: "...", relation: "extracted_from_parent",
  note: "..." }`(フィールド名・型は方向性の例示であり、正式なコード化は
  行っていない)。**`provenance`は同期機構ではない。** 親が修正された
  際に子を自動的に追従させる仕組みではなく、あくまで「この子がどの親と
  どういう関係にあるか」を記録する情報であり、親子間の整合性確認は
  [7] Validation / Diagnostics(gateChecks)側の責務とする。
- **`relation`はopen vocabularyとする。** 検証で確認できたのは次の2種類の
  初期語彙であり、固定enumとしては確定しない。No.1巻で確認された初期語彙
  として扱い、今後の教材で新しい関係の性質が見つかった場合に追加できる
  設計とする。
  - `extracted_from_parent`: 子が親の内容の一部を抜粋したもの(内容的重複を
    伴う。例: 設例内の計算行)
  - `footnote_of_parent`: 子が親と同じ視覚単位に属するが、教材上もともと
    別の場所にある独立した内容(内容的重複を伴わない。例: `※1`等の脚注)

**`provenance`の配置についての改訂(2026-08-16)**: 第3版では`provenance`を
`diag.provenance`として`diag`の内側に置いていた。`diag`蓄積型設計の小規模検証
(`planning/diag_accumulation_validation.md`5-4節)の結果、`provenance`は
「うまくいった/いかなかった」という評価軸を持たない**構造的な由来情報**であり、
抽出・復元の成否を記録する`diag`本来の診断情報とは性質が異なること、また抽出・
復元に何の問題もないContentBlock(`diag`の他の部分がほぼ空になるもの)でも
`provenance`は必ず存在するケースが多数見つかったことから、**`provenance`を
`diag`から分離し、ContentBlockの独立したフィールド(`location`等と同格)として
扱う方針へ改訂する**。`relation`(`extracted_from_parent`/`footnote_of_parent`)は
`provenance`に属する情報として、この`provenance`フィールド側で引き続き管理する。
**この改訂は方向性の確定であり、正式なフィールド名・型のコード化はまだ行って
いない**(10節)。以降、本ファイルでは`diag.provenance`という表記は使わず、
`provenance`(`diag`外)として統一する。旧`diag.provenance`という表記が使われて
いた検証記録(`parser_sourcefaithful_duplication_validation.md`等)は履歴資料
のため書き換えていない。

**gateChecksは`relation`ごとに検証規則を変えられる構造を前提とする**
(6-3節)。`relation`を区別せず一律の検証をかけると、`footnote_of_parent`の
ような重複のない関係に対して誤検知(false positive)を生むことが検証で
確認されている。

---

## 6. 自動処理 / 要レビューの境界

### 6-1. extractionRaw → sourceFaithfulの復元・補正

| 区分 | 該当する実例 | 扱い方の方針 |
|---|---|---|
| **自動処理でよい** | `extractionRaw`が`sourceFaithful`と完全一致するかどうかの判定 | 文字列比較で機械的に判定可能。一致すれば書き戻し自体が不要 |
| **ルール化できる可能性がある** | `fraction_split`(分数の分子/分母が別行に分離)、`exponent_split`(指数が式外に分離)、`column_order_shift`(仕訳ボックス内の列入れ替わり、検証ケース2で新規発見) | 複数実例で観測済みのパターン。ただしZaihyo Parserの`knownTextCorrections.mjs`と同じ「個別確認済みノイズのみ補正し、想定外の出現数で例外停止する」fail-closedな適用が安全(無条件の自動適用はしない)。**検出**(artifact識別)は自動化しつつ、**書き戻し**(実際の`sourceFaithful`確定)は当面人間確認を必須とする段階的な自動化を提案する |
| **人間確認が必須** | 既知パターンにない新種の崩れ、記号(`／`等)の文脈依存の意味解釈が絡む箇所の最終判断(設計案7-7節) | 自動化を試みない |

### 6-2. 検出不能・不確実な要素

- **内容自体が機械的に取得できない**(図解・縦書きフロー図等): `extractionRaw`/
  `sourceFaithful`ともに`null`、`diag.extraction.status = "not_applicable"`
  (設計案・検証ケース7aで確認済みの扱い方をそのまま踏襲)。
- **内容は取得できるがブロック種別の判定が困難**(Q&A等、アイコンのみで
  テキストラベルを伴わない): この種のブロックは、そもそも[3] Block Detection
  段階の機械検出(ラベル検出系・パターン検出系のいずれ)でも原理的に発見でき
  ない。そのため、Parserの範囲では**「検出できなかった」という事実そのものを
  隠さない**ことを最優先とする。個別ブロックの`detectionStatus`に加え、
  **コーパス全体のmetaに「この種のブロックが本編中に他に何件存在するかは
  不明である」という既知の不完全性を記録する専用の出力**を[7] Validation /
  Diagnostics段階に持たせる(設計案8節の「コーパスレベルの既知の不完全性」に
  対応するParser側の責務)。
- **要レビュー一覧の生成**: Zaihyo Parserの`unresolved: {locator, reason}[]`
  配列、および`anomalyDetector.mjs`が生成する`severity`(info/review/error/
  warning)付きの一覧というパターンは、簿記論版でも再利用候補として提案する
  (7節)。ただし、カテゴリ語彙(`missing_answer`等)は財表固有のため、簿記論の
  ブロック種別・粒度の実態に合わせて作り直す。3節Stage2/3の「子Source化候補」
  も、このカテゴリの一種として要レビュー一覧に含めることを想定する。

### 6-3. 親子Source間の整合性検証(gateChecks、確定方針)

5-1節で確定したとおり、`provenance.relation`ごとに、[7] Validation /
Diagnostics段階のgateChecksで異なる検証を行う構造を前提とする。実データ検証
(`planning/parser_sourcefaithful_duplication_validation.md`、および後続の
`planning/gatechecks_invariant_validation.md`)で確認できた2種類の検証は
次のとおり。

| `relation` | 必要な検証 | 分類 |
|---|---|---|
| `footnote_of_parent` | 親の`sourceFaithful`側に、子を指す参照記号(`※1`等)が実際に存在するか(**参照存在チェック**) | hard invariant候補(実データで安定した検出・誤検知の少なさを確認済み) |
| `extracted_from_parent` | 子の`sourceFaithful`が、`parentBlockId`が指す親の現在の`sourceFaithful`に部分文字列として実際に含まれているか(**包含チェック**) | 現時点ではhard invariantにしない(下記) |

`relation`を区別せず一律に包含チェックをかけると、`footnote_of_parent`の
ような元々重複しない関係に対して誤検知を生むため、relationに応じた検証の
出し分けが必須である。

**`extracted_from_parent`の包含チェックを無条件でfail-closedにしない理由
(`gatechecks_invariant_validation.md`4-1節)**: 分数を含む式のように、
Faithful Restorationで`／`のような記号が新たに挿入されて復元されるケースでは、
親と子が同じ復元処理を経ていない限り、内容的には正しいデータでも包含チェックが
不一致(false positive)と誤判定することを実データで確認した。したがって、
**`extracted_from_parent`の包含チェックは、親子の復元処理の一貫性が保証できる
条件が整うまでは review invariant(要レビュー)として扱い、無条件のfail-closed
にはしない**。将来hard invariantへ昇格できる条件は未決事項として10節に残す。

**gateChecksの位置づけについての確認(`gatechecks_invariant_validation.md`)**:
gateChecksは、Sourceの**意味解釈が正しいか**を判定する仕組みではなく、
**生成済みデータが設計上要求される構造・整合性の契約を満たしているか**を
検証する仕組みと位置づける。候補は次の3種類に分類する。

- **hard invariant(fail-closed候補)**: データ構造として矛盾しているもの
  (参照先が存在しない、IDが重複している等)。意味解釈を伴わない。
- **review invariant(review routing候補)**: 検出はできるが、教材の意図の
  理解を要し人間確認が必要なもの(上記`extracted_from_parent`包含チェック等)。
- **diagnostic/warning**: `unresolved`・`merge_candidate`のように意図的に
  保持される不確実な状態の記録。異常ではない。

「検出できなかった」「意味判断できない」「データ構造として矛盾している」を
同じ失敗として扱わない。

**文字列比較の正規化について**: 空白の揺れ(ラベル検出で確認済みの文字間
スペース挿入等)は安全に許容できるが、`○`(U+25CB)と`〇`(U+3007)のような
**文字そのものの違い**は安易に同一視しない(原則2の原文保持に抵触するリスク)。
また、フラクション復元による`／`の挿入は**正規化の対象ではなく、Faithful
Restorationの一貫性の問題**であり、文字列比較の正規化ルールでは解決しない
(上記`extracted_from_parent`の議論を参照)。

**gateChecksの結果は`diag`へ書き戻さない。** gateChecksは`sourceFaithful`・
`diag`等の生成済みデータを**読んで**検証する処理であり、その結果は各
ContentBlockの`diag`ではなく、Source/Derived Knowledgeデータとは別の
「Validation実行レポート」として管理する(生成処理と検証処理が同じデータへ
書き込む循環を避けるため)。正式な構造は未確定(10節)。

**次の詳細は今回確定せず、Parser実装前またはvalidator設計時に決める**:
文字列比較時の正規化範囲(全角/半角・空白の揺れをどこまで許容するか)、
`extracted_from_parent`を将来hard invariantへ昇格できる条件、Validation
実行レポートの正式構造。

---

## 7. Zaihyo Parserから再利用できるパターン

アーキテクチャレベルの型・パターンとして再利用候補になるもの(具体的な正規表現・
ラベル値・財表固有ロジックは対象外):

- `extractionRaw`/`sourceFaithful`/`parsed`/`diag`という**概念分離、および
  `diag`を独立した名前空間として持たせる**設計思想(BSM層の`raw`/`parsed`+
  `parsed.diag`という三分離と同型)。
- パイプラインを**複数の独立したステージ関数に分割し、1つのオーケストレータが
  順に呼び出す**構成(`parseDocument()`のStep0〜7パターン)。
- **fail-closedなgateChecks**: 複数の不変条件を個別に数値化→AND判定→失敗時は
  正式な成果物を書き出さない。ただし診断用の中間成果物(除外一覧・要レビュー
  キュー等)は結果によらず常に書き出す(監査・原因調査のため)、という
  `build-drill-csv.mjs`の設計。
- **個別確認済みノイズ補正パターン**: 既知の崩れ方だけをリスト化して補正し、
  想定外の出現数を検知したら例外を投げて処理を停止する(`knownTextCorrections.mjs`)。
- **`unresolved`配列による「わからなさ」の記録**: 判定できなかった箇所を
  黙って捨てず、`{locator, reason}`の形で一覧化する。
- **内容ベースのfingerprint比較による回帰検証**: 位置に依存するIDではなく
  内容ハッシュで新規/消失/重複を検出する仕組み(`run-full-scan.mjs`の
  `itemFingerprint()`)。Parser改修前後の比較に有効。
- **2回実行して結果ハッシュが一致するかを見る決定性チェック**。
- **「オープンなコード分類+原文由来のラベル」という型パターン**
  (`CodedLabel{code, labelRaw}`)。具体的な`code`語彙は財表固有だが、
  「機械的な分類コード」と「原文の表示ラベル」を分けて持つという型は
  `blockKind`(open vocabulary)+`label.titleRaw`という簿記論側の設計とも
  親和性が高い。

---

## 8. 簿記論用に新規設計すべき部分

- **ページ種別の粗い二分は存在しない**: 財表Parserは「問題ページ/解答ページ」
  という2ページ構成を前提にページ単位で種別判定していたが、簿記論の基本
  テキストは本編内に設例・解説・仕訳型等が混在する構成であり、この前提が
  そのまま使えない。ページ単位ではなく、**ラベル(アイコン+テキスト)の検出
  という別の切り口**([3] Block Detectionのラベル検出系)を中心に据える
  必要がある。
- **見出し行パターンの再設計**: テーマ・論点番号の表記、目次ページの除外
  条件等は、簿記論教材の実データで確認し直す(財表の`テーマ([0-9０-９]+)`
  相当のロジックはそのまま移植しない、ユーザー指示どおり)。
- **Q&A等アイコンのみブロックの検出手段**: 財表Parser側に相当する仕組みが
  なく、完全に新規で検討が必要。当面は自動検出を前提とせず、6-2節のとおり
  「検出できないことを明示する」設計に留める。
- **`diag.extraction.status`の値語彙**: 簿記論設計独自の値(7-3節で定義済みの
  5値)であり、財表側の`DiagMeta`をそのまま使わず作り直す(名前空間分離という
  設計思想のみ流用)。
- **仕訳型・計算式・方程式のパターン検出器**: `×××`/`○○○`プレースホルダ検出、
  用語ベース代数式検出、単一記号方程式検出は簿記論固有のロジックであり
  新規設計する。
- **表(比較表)構造の検出**: 財表側に相当する仕組みがなく新規設計が必要。
- **段階的Source Segmentation(3節)・親子Sourceの条件付き生成**: 財表側の
  BookStructureMasterには相当する仕組みがなく(階層は固定的なStructureNode/
  QuestionUnitの再帰構造のみ)、簿記論固有の新規設計事項である。

---

## 9. 小規模実装へ進む前に検証すべき事項

前フェーズ(Source/Derived Knowledgeモデル)と同じ方法論(実データを少数
ケース選び、手作業またはごく小さいスクリプトで試し、無理が生じないか確認する)
を、Parser設計についても踏襲する。**Source粒度の3案比較検証**
(`planning/parser_source_granularity_validation.md`)**、親子Source間の
`sourceFaithful`重複問題の優先比較検証**
(`planning/parser_sourcefaithful_duplication_validation.md`)**、
StructureNode認識の下調べ**(`planning/structurenode_recognition_survey.md`)
**、ラベル検出の試作**(`planning/label_detection_prototype_validation.md`)
**、Block Detectionパターン検出系(仕訳型・計算式・方程式)の全数調査**
(`planning/pattern_detection_survey.md`)**、および子Source化候補の必要性
判定基準の小規模検証**(`planning/child_source_necessity_validation.md`)
**は完了した**。

StructureNode認識の下調べでは、全209ページの機械的走査により次を確認した
(詳細・根拠は同ファイルを参照し、本節には転載しない)。テーマ・論点・
サブ項目見出しはいずれも全角/半角の表記ゆれを吸収する正規表現で高精度に
検出できること、致命的な文字化け(置換文字レベル)は見出し検出に影響しない
こと、各テーマ冒頭の目次一覧は本書に実収録の論点一覧としては使えないこと
(本文側の実検出結果のみを正とすべきこと)、➊➋➌等のダイアグリフがStructureNode
のサブ項目以外(前付け・ラベル付きブロック内部)でも再利用されうるため
[3] Block Detectionの結果との突き合わせが必要になりうること、表ブロックの
構造化には`-layout`モード相当の座標情報が必要なこと。

ラベル検出の試作では、本編での使用が実在確認済みの6ラベル(設例/解説/留意点/
参考/コラム/研究)を対象に、全209ページの機械的走査により次を確認した
(詳細・根拠は同ファイルを参照し、本節には転載しない)。**ラベルは単純な
文字列一致だけでなく、PDF内部で私用領域(PUA)の1文字として抽出される
アイコン文字を検出条件に含めることで、地の文中の言及やテーマ名との
誤検出を大きく減らせる**こと、**ラベルの文字間には空白が挿入される場合
があり、検出時にはこれを考慮する必要がある**こと、**plainモードのみでは
ラベル自体が行分断され検出漏れとなるケースがあり、比較表(3節)以外の
場面でも`-layout`モード相当の座標情報が必要になりうる**こと。これらは
いずれも本書1冊・6ラベルの範囲での検証結果の要約であり、➊➋➌との
突き合わせ方法の確定・Q&A的アイコンの意味確定・アイコンコードポイントの
固定enum化・他冊での再現性確認は、いずれも本改訂では行わず、確認できた
事実としてのみ扱う(未決事項として10節に残す)。

Block Detectionパターン検出系の全数調査(`planning/pattern_detection_survey.md`)
では、1-2節で想定していた「パターン検出系」(仕訳型・計算式・方程式)が
全209ページでどう出現するかを機械的に確認した(詳細・根拠は同ファイルを
参照し、本節には転載しない)。**pattern detectorが候補を検出できることと、
その候補が教材上の意味的に完結した単位であること、その候補を独立Sourceとして
参照する必要があることは、それぞれ別問題である**ことが実データで明確に
なった。プレースホルダ(`×××`/`○○○`/`〇〇〇`)の有無に関わらない仕訳の
表記系統が複数確認できたこと、分数・べき乗を含む式が複数行にまたがって
抽出されること(分数は分母が次行、べき乗は指数が前行に分断される、分断の
方向が逆であること)、`／`記号が5通り以上の意味を持つことなどが確認できた。

子Source化候補の必要性判定基準の小規模検証
(`planning/child_source_necessity_validation.md`)では、既存の粒度検証
(`parser_source_granularity_validation.md`)で確定済みの4ケースと、パターン
検出系調査から選んだ4ケースの計8ケースを比較した。**教材明示境界の有無・
意味的完結性・反復回数・blockKindのいずれも、単独では子Source化の要否を
説明できなかった**。8ケースの範囲では、**「Derived Knowledge等から独立して
参照する必要がありそうか」という軸(独立参照必要性)が、最も判別力の高い
判定材料だった**。また、自動判断できず要レビューとしたケースにも、
(a)教材の意図の理解を要する意味判断待ちのケースと、(b)Faithful Restoration
による式の復元が完了していないために判断の前提が整っていない検出安定性待ちの
ケース、という**性質の異なる2種類の原因**が観察された。**この8ケースだけで
Stage3の判定基準を正式なルールとして確定するには至っていない**。基準の具体化
には追加のケース検証が必要であり、詳細・根拠は同ファイルを参照し本節には
転載しない。

gateChecks不変条件の具体化(`planning/gatechecks_invariant_validation.md`)
では、既存資料からgateChecks候補18件を洗い出し、実データ8ケース(親子重複2種・
`diag.extraction.status`3値・Faithful Restoration未解決ケース・StructureNode/
ラベル衝突ケース等)で検証した。**gateChecksは意味判断器ではなく、生成済み
データが設計上の構造・整合性契約を満たしているかを検証するものと位置づける**
(6-3節に反映)。`footnote_of_parent`の参照存在チェックはhard invariant候補、
`extracted_from_parent`の単純包含チェックはFaithful Restorationの復元表現差で
false positiveが生じうるため現時点では無条件fail-closedにしない、という結論を
得た(詳細・根拠は同ファイルを参照し本節には転載しない)。

`diag`蓄積型設計の実装可能性確認(`planning/diag_accumulation_validation.md`)
では、単一オブジェクト追記・ステージ別namespace・イベント/issue蓄積・組み合わせ
の4方式を比較し、実データ8ケースで検証した。**基本はステージ別namespaceとし、
plain抽出失敗→layout抽出成功のような複数回試行が本質的な情報だけを履歴
(attempt配列)として持たせる組み合わせ方式**が最も無理が少なかった。artifactは
最低限`kind`/`stage`/`resolved`/`note`程度の構造を持たせる方向、`diag`は処理の
事実・監査情報のみを保持し`reviewRequired`のような最終判断は持たせない方向、
`provenance`は`diag`から分離しContentBlock側の由来情報として扱う方向(5-1節に
反映済み)、という結論を得た(詳細・根拠は同ファイルを参照し本節には転載しない)。

残る検証事項は次のとおり。

- **子Source化候補の必要性判定基準の追加検証**: 8ケースの小規模検証で得られた
  「独立参照必要性が最も判別力が高い」という示唆を、他のケース(教材上の
  他の反復パターン、`①②③`のような未検証の列挙記号等)でも確認し、判定基準を
  より確からしいものにする。**9節に残る検証事項のうち、これが唯一の未着手
  項目である。**

これらの検証は、いずれもParserのコード実装そのものではなく、**モデル・
アーキテクチャの妥当性を確認する小規模な試行**として位置づける(前フェーズの
プロトタイプ検証と同じ性質)。

---

## 10. 未決事項

この設計案の時点で、まだ決定していない事項を明示する。

- `provenance`(旧`diag.provenance`。5-1節で`diag`外への分離方針を確定)の
  正式なフィールド名・型のコード化。
- 親子Source間の整合性検証(gateChecks)における文字列正規化の範囲(6-3節)。
- `extracted_from_parent`の包含チェックを将来hard invariantへ昇格できる条件
  (親子の復元処理の一貫性をどう保証するか、6-3節)。
- Validation実行レポート(gateChecksの結果を保持する、Source/Derived
  Knowledgeデータとは別のレポート)の正式構造(6-3節)。
- `diag`の正式なフィールド名・型のコード化。artifact(`diag.extraction.
  artifacts`)を`{kind, stage, resolved, note}`程度の構造にする方向性は
  確定したが(5節)、正式なスキーマは未確定。
- 縦積み`○○○`/`〇〇〇`の崩れに対応する`artifact.kind`の正式語彙の命名
  (`gatechecks_invariant_validation.md`8節、`diag_accumulation_validation.md`
  9節から持ち越し)。
- [3] Block Detection段階(まだContentBlockが確定していない候補の段階)に
  関する診断情報を、どの主体の`diag`に帰属させるか(`diag_accumulation_
  validation.md`4-4・4-8・9節)。
- 親子関連付けの具体的なフィールド名・型のコード化。
- StructureNode/ContentBlockのその他のフィールド名・型のコード化。
- 3節Stage2/3の「子Source化候補」を、Parserがどこまで自動判定でき、どこから
  人間レビューが必要かの具体的な境界。小規模検証(`child_source_necessity_
  validation.md`)により「独立参照必要性」が最も判別力の高い軸であることの
  示唆は得られたが、8ケースの範囲での帰納にとどまり、正式な判定ルールとしては
  未確定。
- ラベル検出のアルゴリズム: `label_detection_prototype_validation.md`により
  「PUAアイコン+文字列パターン(空白許容)」が本書6ラベルの範囲では有効
  であることは確認できたが、次の点は未確定のまま残る。
  - ➊➋➌等がStructureNodeのサブ項目か、ラベル付きブロック内部のローカルな
    列挙かを判定する具体的な突き合わせ方法(1件の実例からの示唆のみ)。
  - Q&A的なアイコン(候補: U+E224/U+E225)の意味の確定、および検出手段
    としての採否。
  - アイコンのコードポイントを固定enumとしてコード化してよいか
    (open vocabulary原則を維持するか)。
  - No.2巻以降でも同じアイコン・空白挿入規則が成立するか。
- Q&A等の検出不能要素に対する運用方針(完全に人手に委ねるか、部分的な機械的
  絞り込み補助を用意するか)。
- [7] Validation / Diagnosticsの具体的な不変条件リスト。`gatechecks_
  invariant_validation.md`でA/B/C分類の候補18件を洗い出したが、正式な
  コード化・リストの確定はまだ行っていない。
- `structure.tokens`の自動生成可否は、本設計案の対象外として次フェーズ
  (Source→Derived Knowledgeフェーズ)へ明示的に持ち越す。

---

以上がPDF→Source層に関するParser設計案(第3版・現時点の正式設計)である。
Source粒度(3節)・親子Source間の`sourceFaithful`重複(5-1節・6-3節)・
`provenance`の`diag`外への分離(5-1節)・gateChecksの位置づけと候補分類
(6-3節)・`diag`蓄積型の組み合わせ方式(5節)は、いずれも実データ検証を経て
方針を確定した。StructureNode認識の下調べ(`planning/structurenode_
recognition_survey.md`)・ラベル検出の試作(`planning/label_detection_
prototype_validation.md`)・Block Detectionパターン検出系の全数調査
(`planning/pattern_detection_survey.md`)・子Source化候補の必要性判定基準の
小規模検証(`planning/child_source_necessity_validation.md`)・gateChecks
不変条件の具体化(`planning/gatechecks_invariant_validation.md`)・`diag`
蓄積型設計の実装可能性確認(`planning/diag_accumulation_validation.md`)も
完了した。**子Source化候補の必要性判定基準は、8ケースの小規模検証を経ても
正式なルールとしては未確定であり**(Stage3)、9節に残る検証事項はこの追加
検証のみである。Parser本体の実装・スキーマの正式コード化は、この検証を経て
から改めて着手を判断する。
