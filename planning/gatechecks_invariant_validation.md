# [7] Validation / Diagnostics: gateChecks不変条件 設計・小規模実データ検証

`planning/parser_design_proposal.md`9節に残る検証事項のうち、「[7] Validation/
DiagnosticsのgateChecks不変条件の具体化」について、既存資料からの候補洗い出しと、
実データ(これまでのセッションで確認済みの実例)による検証を行った結果である。

**本ファイルは設計・検証結果の報告のみである。** gateChecks本実装・Parser本体
実装・Source/Derived Knowledgeスキーマの正式コード化・Stage3判定基準の正式確定・
`diag`蓄積型のコード実装・Derived Knowledge生成には一切進んでいない。
`parser_design_proposal.md`等の既存資料は、この検証が終わるまで変更していない。

**前回のStep0〜3(`planning/child_source_necessity_validation.md`9節の判定フロー
案)をそのままgateChecksへ移植していない。** 前回セッションの最終報告で指摘した
とおり、Step0〜3は「Source Segmentationの判定ロジック」「人間レビューへの
routing条件」「gateChecksが検証する不変条件」が混在したものであり、本検証では
この3つを分離した上で、**gateChecksが担うべき範囲(=生成済みSourceデータに対する
事後的な構造・整合性の検証)だけを対象とする**。

---

## 1. 検証目的

gateChecksの責務を明確にし、次の3つを混同しない形で整理する。

- Parser / Source Segmentationが行う判定(何を子Sourceにするか、どこで区切るか)
- 人間レビューへroutingする条件(自動判断できず要確認とする条件)
- 生成済みSourceデータに対してgateChecksが検証する不変条件(事後的な構造・
  整合性の検証)

候補を**A. hard invariant(fail-closed候補)**・**B. review invariant(review
routing候補)**・**C. diagnostic/warning(監査・品質記録)**の3種類に分類し、
「検出できなかった」「意味判断できない」「データ構造として矛盾している」を
同じ失敗として扱わないことを徹底する。

---

## 2. 前提・分類の考え方

- **A. hard invariant**: 破れていたら生成物を正常成果物として扱えないもの。
  データ構造として矛盾している(あるべきフィールドが無い、参照先が存在しない、
  IDが重複している等)。**意味解釈を必要としない、機械的に判定できるもの**に
  限定する。
- **B. review invariant**: データとして保持はできるが、人間確認が必要なもの。
  「検出できたが、どう扱うべきか教材の意図を理解しないと判断できない」場合。
- **C. diagnostic/warning**: 異常とは断定できないが、監査・品質確認のため記録
  したいもの。`unresolved`・`merge_candidate`のように、**意図的に保持されている
  不確実な状態**をgateChecksが「壊れている」と誤検知してはいけない。

3分類の判断基準として、次の問いを使う。

> この条件が破れたとき、それは(a)データ構造の矛盾か、(b)意味解釈の未確定か、
> (c)単に珍しい・稀な状態の記録か。(a)はA、(b)はBまたはC、(c)はC。

参考にした既存資料(Git管理下のSSOT):

- `CLAUDE.md`(gateChecksの例5点)
- `planning/parser_design_proposal.md`(1・5-1・6-1〜6-3・7・9・10節)
- `planning/source_derived_knowledge_design_proposal.md`(7・8節)
- `planning/structurenode_recognition_survey.md`(9節)
- `planning/label_detection_prototype_validation.md`(4-3・8節)
- `planning/parser_sourcefaithful_duplication_validation.md`
- `planning/child_source_necessity_validation.md`(12節)
- Zaihyo Parser(`../Zaihyo Parser/src/cli/build-drill-csv.mjs`の`gateChecks`
  オブジェクト+AND判定パターン、`src/bookStructureMaster/anomalyDetector.mjs`の
  `severity`(info/review/error)付き一覧パターン。**アーキテクチャパターンの
  参考としてのみ確認し、財表固有の条件(`missing_answer`等)は移植していない**)

---

## 3. 既存資料からのgateChecks候補一覧(洗い出し)

| # | 候補 | 出典 |
|---|---|---|
| 1 | Derived Knowledgeが実在するSourceを参照しているか | CLAUDE.md |
| 2 | sourceRef(出典参照)が壊れていないか | CLAUDE.md |
| 3 | IDが重複していないか | CLAUDE.md |
| 4 | unknown/unresolvedが意図せず消失していないか | CLAUDE.md |
| 5 | Parser変更によって既存の正常データが壊れていないか(回帰検証) | CLAUDE.md |
| 6 | 全ContentBlockがStructureNodeの配下にあるか | parser_design_proposal.md 9節 |
| 7 | テーマ内の論点番号が1から連番で欠落がないか | structurenode_recognition_survey.md 9節 |
| 8 | (反例として明示済み)本文の論点番号が目次一覧と一致するか | 同上(**不変条件にできないと明示済み**) |
| 9 | `extracted_from_parent`: 子`sourceFaithful`が親`sourceFaithful`に部分文字列として含まれるか(包含チェック) | parser_design_proposal.md 6-3節 |
| 10 | `footnote_of_parent`: 親`sourceFaithful`に子への参照記号が存在するか(参照存在チェック) | parser_design_proposal.md 6-3節 |
| 11 | `diag.provenance.relation`ごとに検証内容を変える(メタ方針) | parser_design_proposal.md 5-1節 |
| 12 | `diag.extraction.status`5値の内部整合性(値ごとに`extractionRaw`/`sourceFaithful`の有無が対応しているか) | source_derived_knowledge_design_proposal.md 7-3節 |
| 13 | 検出安定性未解決(`diag.extraction.artifacts`)のContentBlockが子Source化の根拠にされていないか | child_source_necessity_validation.md C3・9節 |
| 14 | StructureNodeサブ項目候補がラベルブロックの区間内に出現していないか | structurenode_recognition_survey.md 4-4節、label_detection_prototype_validation.md 4-3節 |
| 15 | 決定性チェック(同一入力を2回処理して結果が一致するか) | parser_design_proposal.md 7節(Zaihyo Parser参考パターン) |
| 16 | `sourceFaithful`が`null`の場合、対応する`detectionStatus`/`diag.extraction.status`が設定されているか | source_derived_knowledge_design_proposal.md 7-3節・8節 |
| 17 | `parsed`が存在する場合、対応する`sourceFaithful`が存在するか(パイプライン依存関係) | parser_design_proposal.md 5節 |
| 18 | `contentConfidence.level`が低い/`consolidation.state`が`merge_candidate`等の状態そのものの存在 | source_derived_knowledge_design_proposal.md 5節・8節 |

---

## 4. 実データ検証(6ケース+逆方向確認)

各ケースについて、実際にNode.jsで文字列比較・構造チェックを実行して確認した
(スクラッチパッドの一時スクリプトによる。手作業の机上確認に留めず、実際に
コードを走らせて結果を得た)。

### 4-1. `extracted_from_parent`: 子`sourceFaithful`が親に含まれるケース

**清潔なケース(差額補充法、93〜96ページ、具体数値のみ)**: 親(解説全文)に子
(`繰入額：貸倒見積高600－前T/B 400＝200`)を含めて実行したところ、包含チェックは
`true`。**親を意図的に改変(400→450、子は未更新のまま)して再実行したところ、
`false`**となり、不整合を正しく検出できた。

**分数を含むケース(定額法、157〜158ページ)**: `pattern_detection_survey.md`
4-2節で確認したとおり、`80,000×１年／8年＝10,000`という子の`sourceFaithful`は
Faithful Restorationで分数記号`／`を**新たに挿入**して復元されたものである
(元のPDF上は分子・分母が視覚的に上下に分かれているだけで`／`という文字は
存在しない)。**親側の該当箇所を未復元(生の抽出テキストのまま)にした状態で
包含チェックを実行したところ、`false`になった**(子は正しい内容にもかかわらず、
親側の表現形式が異なるために不一致と判定される)。**親側の該当箇所にも同じ
復元(`／`の挿入)を適用してから再実行したところ、`true`に戻った。**

**この結果からの結論**: 包含チェックは、**親と子が同じ復元処理を経ていることが
前提**であり、この前提が崩れると、内容的には正しいデータを誤って「不整合」と
判定してしまう(false positive)。逆に、親を復元せず生の抽出テキストのまま
比較すると、本来検出すべきでない不一致を大量に生む可能性がある。**単純な
文字列包含チェックをそのままfail-closedにするのは、親子の復元処理の一貫性が
保証されない限りリスクがある**、という具体的な懸念材料が実データで確認できた。

### 4-2. `footnote_of_parent`: 親に子への参照記号が存在するケース

169ページ(テーマ8、固定資産買換)の仕訳ボックス(`※１`〜`※５`)を対象に検証した。
親(ボックス本体)の`sourceFaithful`に対し、5つの脚注それぞれの参照記号
(`※１`〜`※５`)の存在チェックを実行したところ、**全件`true`**だった。

**参照記号を1つ意図的に除去(`※１`をすべて削除、編集ミスを想定)して再実行**
したところ、**`※１`のみ`false`となり、他の4件は正しく`true`のまま**だった。
参照存在チェックは、実データの範囲では意図した検出能力(該当する参照だけを
ピンポイントで検出する)を持つことを確認できた。

**追加で分かった実データの特徴**: このボックスでは、`※１`が**借方・貸方の
両方に2回出現する**(`減価償却累計額※１`と`有形固定資産※１`)。これは1つの
脚注が2箇所から参照される実例であり、参照存在チェックは「1回でも存在すれば
true」という判定で問題なく機能する(複数回の参照を区別する必要はない)ことを
確認した。

### 4-3. `extractionRaw`と`sourceFaithful`が異なるケース

`pattern_detection_survey.md`で確認済みの3種類の崩れ方について、`diag.
extraction.status`が`captured_differs`となる典型例として整理した(架空の
`diag`オブジェクトを、実データの崩れ方に基づいて構成し、構造的整合性を確認)。

- **分数**(155ページ定額法定義式): `extractionRaw`に分断された生テキスト、
  `sourceFaithful`に`／`で復元した式。`diag.extraction.artifacts`に
  `fraction_split`。
- **指数**(186ページべき乗式): `extractionRaw`に指数が前行へ分離した生テキスト、
  `sourceFaithful`にべき乗記法で復元した式。`diag.extraction.artifacts`に
  `exponent_split`。
- **縦積み`○○○`**(52・97ページ): `extractionRaw`に1文字ずつ別行に分断された
  生テキスト、`sourceFaithful`に`○○○`とまとめた表記。この崩れ方は、既存の
  `diag.extraction.artifacts`語彙(`fraction_split`/`exponent_split`/
  `column_order_shift`)に対応する名前がまだ無いことに気づいた(**新規の
  artifact種別の命名が必要**、10節で申し送る)。

いずれのケースも、「`extractionRaw`が存在し、かつ`sourceFaithful`と異なる文字列
である」という**構造的な事実**は、`extractionRaw`/`sourceFaithful`両方の
文字列を単純比較するだけで機械的に判定できる。この判定自体に意味解釈は不要。

### 4-4. `diag.extraction.status`ごとの差(実データで確認できた範囲)

| status | 実データでの確認状況 |
|---|---|
| `captured_matches_sourceFaithful` | 確認できた。プレースホルダなしの具体的仕訳(47〜48ページ)、差額補充法の具体数値計算(93〜96ページ)など、抽出結果がそのまま忠実な表現になるケースが多数該当する |
| `captured_differs` | 確認できた。4-3節の3種類(分数・指数・縦積みプレースホルダ) |
| `not_applicable` | 確認できた。Q&A的アイコン(U+E224/U+E225、170・182ページ、`label_detection_prototype_validation.md`4-4節)のように、テキストラベルを伴わずテキスト抽出の対象にならない要素 |
| `attempted_empty` | **実データで確認できていない**。想定外の空結果というこの状態自体、今回のNo.1巻の走査範囲では遭遇しなかった |
| `not_attempted` | **実データで確認できていない**。前付け等、意図的に処理対象外とした範囲についてこの値を使う想定だが、具体例はまだ無い |

**構造的整合性チェックの候補**(実データで確認できた3値の範囲で機械的に判定
可能): `captured_matches_sourceFaithful`のとき`extractionRaw`は省略されている
べき、`captured_differs`のとき`extractionRaw`は必須、`not_applicable`のとき
`extractionRaw`・`sourceFaithful`ともに`null`であるべき。**この対応関係自体は
意味解釈を伴わない構造チェックであり、実データ(4-3節)と矛盾しなかった。**
残り2値(`attempted_empty`・`not_attempted`)については、対応するフィールドの
組み合わせルールを「未検証」として10節に残す。

### 4-5. Faithful Restorationが未安定で、子Source化判断自体をまだ行えないケース

`child_source_necessity_validation.md`のC3(155/171〜174/186ページ)で確認した
とおり、単一行ベースの素朴なパターン検出器では、1つの完結した式が抽出崩れに
よって複数の候補行であるかのように誤って検出されうる。

これをgateChecksの観点で捉え直すと、**「`diag.extraction.artifacts`に既知の
未解決アーティファクトが記録されているContentBlockが、確定した子Source化の
根拠(親子関係)として使われていないか」という構造チェック**として表現できる
ことが分かった。実データ(155ページ)で、この構造(親子関係の根拠となる
ContentBlockに`fraction_split`が未解決のまま残っている状態)を模擬的に構成し、
チェックが対象を正しく特定できることを確認した。**この判定自体は「式の意味が
正しいか」を問うものではなく、「未解決の既知artifactが残ったまま確定的な
親子関係が作られていないか」という構造的な前提条件の確認**であり、意味解釈を
伴わない。

### 4-6. StructureNode候補とラベル内部列挙が衝突するケース(研究ブロック内`➊➋`)

87ページの「研究」ブロック内部の`➊➋`(`structurenode_recognition_survey.md`
4-4節、`label_detection_prototype_validation.md`4-3節で既に確認済み)を対象に
確認した。**「あるStructureNodeサブ項目候補の行番号が、検出済みラベルブロックの
開始行〜終了行の区間内に収まっているか」という範囲重複の判定自体は、行番号の
比較だけで機械的に実行できる**(実データで該当区間・非該当区間を突き合わせた
ところ、87ページの`➊➋`のみが区間内に収まり、他の91件のサブ項目候補はいずれの
ラベル区間にも収まらないことを確認できた)。

ただし、**この重複が検出された場合に「StructureNodeのサブ項目候補から除外
すべきか」という判断は、1件の実例のみからの一般化であり、gateChecksが自動で
確定してよい段階ではない**(`structurenode_recognition_survey.md`4-4節・8節が
既に明示している限界)。したがって、**検出(構造チェック)はA寄り、その後の
扱い(除外するかどうかの確定)はB(review invariant)**、と2段階に分けて扱う
のが妥当と判断した。

### 4-7. 逆方向確認(正常データを壊してcatchできるか)

4-1・4-2節で既に実施済み(包含チェック・参照存在チェックそれぞれで、意図的な
改変を加えた場合の検出可否を確認した)。加えて、次の2件も同様の方法で確認した。

- **ID重複**: 正常な3件のContentBlock ID配列に、意図的に重複IDを1件混入させた
  ところ、重複検出ロジックは該当IDのみを正しく検出した。
- **unknown/unresolvedの消失(回帰)**: 3件の`unresolved`項目(Q&A的アイコン等)
  のうち1件が再実行後の一覧から欠落したことを想定したところ、差分比較で
  欠落した項目を正しく特定できた。**ただしこの検証には「変更前の一覧
  (ベースライン)」が必要であり、単発の実行結果だけでは判定できない**という、
  他のチェックとは性質の異なる前提条件を持つことが分かった。

---

## 5. 候補の分類結果(A/B/C)

| # | 候補 | 分類 | 根拠 |
|---|---|---|---|
| 1 | Derived Knowledgeが実在するSourceを参照しているか | **A** | 参照先の存在確認は構造チェック。意味解釈不要 |
| 2 | sourceRefが壊れていないか | **A** | 同上(1と実質同じ検証) |
| 3 | IDが重複していないか | **A** | 実データ(4-7節)で機械的検出を確認 |
| 4 | unknown/unresolvedが意図せず消失していないか | **A**(ただしベースライン比較が前提) | 実データ(4-7節)で検出を確認したが、単発実行では判定できない特殊な前提を持つ |
| 5 | Parser変更で既存の正常データが壊れていないか(回帰検証) | **A**(同上) | 4と同じ性質。内容ベースfingerprint比較が前提 |
| 6 | 全ContentBlockがStructureNodeの配下にあるか | **A** | 構造的必須条件。意味解釈不要 |
| 7 | テーマ内の論点番号が1から連番で欠落がないか | **A** | 構造チェック。ただし後述の8との対比が重要 |
| 8 | 本文論点番号が目次一覧と一致するか | **該当なし(不変条件にしない)** | 一致しないことが正常な状態であるため、不変条件として成立しない(既存資料が明示済み) |
| 9 | `extracted_from_parent`包含チェック | **B**(条件付きA) | 実データ(4-1節)でfalse positiveリスクを確認。親子の復元一貫性が保証できる場合に限りAとして運用できる可能性があるが、現時点ではB |
| 10 | `footnote_of_parent`参照存在チェック | **A** | 実データ(4-2節)で安定した検出を確認。復元処理への依存が9より小さい |
| 11 | `relation`ごとに検証内容を変える(メタ方針) | **(分類対象外、運用ルール)** | 個々の`relation`別チェックの分類(9・10)に従う。方針自体は既存資料で確定済み |
| 12 | `diag.extraction.status`5値の内部整合性 | **A**(確認できた3値の範囲) | 4-4節で構造対応関係を確認。残り2値は未検証 |
| 13 | 未解決artifactが子Source化の根拠にされていないか | **A** | 4-5節で構造チェックとして機能することを確認 |
| 14 | StructureNode候補とラベル内部列挙の衝突検出 | **A(検出)+B(除外の確定)** | 4-6節のとおり2段階。検出はA、除外判断はB |
| 15 | 決定性チェック | **A** | 意味解釈不要な純粋な手続きチェック(未実行検証だが構造的に自明) |
| 16 | `sourceFaithful`が`null`のとき`detectionStatus`等が設定されているか | **A** | 構造的必須条件 |
| 17 | `parsed`存在時に`sourceFaithful`も存在するか | **A** | パイプライン依存関係の構造チェック |
| 18 | `contentConfidence.level`低・`consolidation.state`=`merge_candidate`等の状態自体 | **C** | 意図的に保持される不確実性の記録。異常ではない |

---

## 6. 特に検討した論点への回答

### 6-1. gateChecksは「意味解釈ができているか」まで検証するのか、「構造・整合性」までか

**実データを踏まえて、「構造・整合性」までに限定するのが妥当と判断する。**
根拠:

- 実データで機械的に検証できた候補(9件、A分類)は、いずれも**参照先の存在・
  フィールドの組み合わせ・行番号の重複・ID重複・文字列の部分一致**という、
  意味を読まずに判定できる性質のものだった。
- 唯一「意味解釈っぽく見える」候補(14: 研究ブロック内`➊➋`の扱い)も、実際に
  機械的に判定できたのは「行番号の区間重複」という構造的事実の検出までであり、
  「この`➊➋`が本当にStructureNodeのサブ項目でないと確定してよいか」という
  意味の判断は、1件の実例のみでは自動化できない(4-6節)。
- `contentConfidence`や`consolidation.state`のような「意味解釈の確信度」を
  表すフィールドは、**その値自体を検証対象にしない**(C分類、18)。これらは
  意味解釈の結果を記録するフィールドであり、gateChecksが「確信度が低いのは
  おかしい」と判定してしまうと、原則4(推測しない・unknown/unresolvedとして
  保存してよい)と矛盾する。

### 6-2. fail-closedとreview routingを明確に分けられるか

**分けられる。** 例として指示された「`sourceFaithful`が空であること」と
「`sourceFaithful`は存在するが意味解釈が`unresolved`であること」は、実データの
範囲で次のように明確に区別できた。

- `sourceFaithful`が`null`なのに、対応する`detectionStatus`/`diag.extraction.
  status`が設定されていない → **構造的な欠落(A、fail-closed候補)**。
  「わからない」という状態自体を記録する仕組みが機能していないという、
  データ構造上のバグ。
- `sourceFaithful`は存在し、`diag.parseInterpretation.confidence`が`low`、
  または`consolidation.state`が`merge_candidate` → **意味解釈の確信度・
  統合判断が未確定なだけであり、データ構造としては整合している(C、diagnostic)**。
  fail-closedにしてはいけない。

この区別の基準は、「フィールドが**構造的に存在すべきなのに無い/矛盾している**か」
と「フィールドは**構造的に整合しているが、値の中身(意味解釈の結果)が
不確かである**だけか」の違いである。

### 6-3. `relation`ごとの検証ルールをどこまで一般化できるか

現時点で確認できた2種類の`relation`(`extracted_from_parent`/
`footnote_of_parent`)は、次の仮説で説明できる。

> 子が親の内容を**抜粋**したもの(内容的重複を伴う)であれば包含チェック、
> 子が親と**教材上もともと別の場所にある独立した内容**(内容的重複を伴わない)
> であれば参照存在チェック。

ただし、**これは2つの実例からの帰納にすぎない**。今回の検証で、
`extracted_from_parent`(包含チェック)には4-1節のような復元一貫性の問題が
見つかった一方、`footnote_of_parent`(参照存在チェック)は4-2節で安定して
機能した。この非対称性が「内容的重複の有無」という区分そのものに起因するのか、
それとも別の要因(`extracted_from_parent`のケースが分数のような抽出崩れを
伴いやすい、`footnote_of_parent`のケースがそうでもない、という偶然の組み合わせ)
によるのかは、**今回の2種類の実例だけでは切り分けられない**。将来
`relation`の語彙が増えた場合(例: 「一部重複+一部独立」のような中間的な関係)、
この2分類にきれいに収まる保証はなく、**一般化はまだ未確定**として扱う。

### 6-4. 文字列比較を使う場合、正規化をどこまで許容するか

実データで次の区別が見えてきた。

- **安全に許容できそうな正規化**: ラベル検出試作で既に確認済みの、文字間
  スペースの挿入(`\s*`許容)のような**空白の揺れ**。これは検出パターンの
  レベルで既に運用実績がある。
- **正規化すべきでない、または慎重であるべきもの**: `○`(U+25CB)と`〇`
  (U+3007)のような**文字そのものの違い**。これらは視覚的にほぼ同じだが、
  異なるコードポイントであり、`pattern_detection_survey.md`3-3節で「同一
  ページ内で2つの文字種が混在する」実例が確認されている。安易に同一視すると、
  原則2(原文保持)に抵触するリスクがある。
- **正規化の問題ですらない、別種の課題**: 4-1節で見つかった`／`の挿入
  (フラクション復元)は、**正規化(表記ゆれの吸収)ではなく、Faithful
  Restorationによる新規の記号導入**であり、親子で同じ復元が一貫して適用
  されているかという**別の問題**である。これは文字列比較の正規化ルールを
  いくら精密にしても解決しない。**復元処理自体の一貫性を、gateChecksとは
  別の手段(例: 同一の復元ロジック・同一のartifact辞書を親子で共有する等)で
  担保する必要がある**、というのが今回の実データからの示唆である。

---

## 7. gateChecksの責務外と判断したもの

- **どのDerived Knowledgeとして統合すべきかの判断**(`consolidation`)。
  既存設計(`parser_design_proposal.md`4-2節)で明示的にDerived Knowledge層の
  責務とされている。
- **`sourceRefs.role`(definition/application等)の割り当て**。同上。
- **子Source化するかどうかの一次判断**(Stage2/3の候補確定)。これは
  [4] Source Segmentationの責務であり、gateChecksは**確定した後の構造**
  (親子関係・`relation`)を事後検証するのみで、「候補を子Source化すべきか」
  という一次判断そのものは行わない。前回セッションのStep0〜3が混同していた
  部分を、ここで明確に切り分けた。
- **研究ブロック内`➊➋`が本当にStructureNodeのサブ項目でないかの最終確定**
  (4-6節)。検出(構造的な重複の指摘)まではgateChecksの範囲内だが、最終確定は
  レビュー(または次フェーズでのルール精緻化)の責務。
- **Faithful Restorationの書き戻し自体の実行**(自動補正か人間確認か)。
  gateChecksは書き戻し後の結果に対する事後確認のみを行う。
- **`／`等の記号の文脈依存の意味解釈**(既存設計7-7節で既にParserの通常
  処理の対象外とされている)。

---

## 8. 既存設計との整合性・食い違い

明確な矛盾は見つからなかった。ただし、`parser_design_proposal.md`6-3節・10節が
未決事項として残していた「不一致検出時にfail-closedとするか要レビューへ送るに
留めるか」という論点に対して、**具体的な懸念材料が実データで見つかった**。

- 6-3節は`extracted_from_parent`(包含チェック)を`footnote_of_parent`
  (参照存在チェック)と並列に「gateChecksで検証する2種類」として提示していた。
  今回の実データ検証(4-1節)により、**この2つは復元処理への依存度が異なり、
  `extracted_from_parent`側を安易にfail-closedにすると、親子の復元一貫性が
  崩れただけで正常なデータを誤って弾いてしまうリスクがある**ことが分かった。
  これは既存記述への反証ではなく、6-3節が「今回確定せず」としていた論点を
  埋めるための具体的な追加知見として位置づけられる。
- `diag.extraction.artifacts`の語彙(`fraction_split`/`exponent_split`/
  `column_order_shift`)に、縦積み`○○○`/`〇〇〇`の崩れ方に対応する名称が
  無いことに気づいた(4-3節)。これも既存記述との矛盾ではなく、語彙の不足
  として申し送る。

---

## 9. 未決事項

- `diag.extraction.status`の`attempted_empty`/`not_attempted`について、
  実データでの具体例がまだ無い(4-4節)。これらのフィールド整合性チェックは
  現時点では机上の設計にとどまる。
- `extracted_from_parent`の包含チェックをA(fail-closed)として運用してよい
  条件(親子の復元一貫性をどう保証するか)。現時点ではB(review invariant)に
  留めることを推奨するが、正式な結論ではない。
- `relation`の2分類(内容重複を伴う/伴わない)が、将来増える`relation`語彙にも
  一般化できるか(6-3節)。
- 縦積み`○○○`/`〇〇〇`の崩れ方に対応する`diag.extraction.artifacts`の
  新規語彙の命名。
- `diag`が複数ステージにまたがって蓄積される設計の実装可能性(`parser_design_
  proposal.md`9節に残る別項目、本検証の対象外)。
- gateChecksを実際にどのタイミングで実行するか(Parser全体の最終段階のみか、
  ステージごとに部分的にも実行するか)は、本検証では検討していない。

---

## 10. 次に検証すべきこと

本検証で、[7] Validation/Diagnosticsに残る3項目のうち「子Source化候補の
必要性判定基準」「gateChecks不変条件の具体化」の土台部分は前進した。残る
`diag`蓄積型設計の実装可能性確認は、今回明らかになった要件(`diag.extraction.
status`の5値対応、`diag.extraction.artifacts`の語彙拡張、Step0相当の未解決
artifact検出が`diag`のどのフィールドを参照するか)を踏まえると、より具体的な
検証になると考えられる。次にこれを検証するのが妥当と考えるが、最終判断は
ユーザーに委ねる。

---

以上がgateChecks不変条件の設計・小規模実データ検証の結果である。gateChecks
本実装・Parser本体実装・スキーマの正式コード化には進んでいない。この結果を
踏まえて次にどう進めるか、確認をお願いしたい。
