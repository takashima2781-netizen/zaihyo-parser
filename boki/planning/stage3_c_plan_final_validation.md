# C案 最終確認(候補レポート試作・C3型ループ・人間レビュー情報量)

`planning/stage3_parser_pipeline_redesign.md`7節で残した3点(候補一覧レポート
案の実データ試作・C3型ループの確認・人間レビューに必要な情報量の確認)を検証し、
**C案を正式採用できるかどうかの最終判断**を行った結果である。

**本ファイルは検証結果の報告のみである。** 新規実データ探索・Parser本体実装・
正式スキーマのコード化・ContentBlock候補用データモデルの正式採用・`relation`
モデルの拡張・D2の本文個別仕訳↔要約表問題の解決・Derived Knowledge生成設計・
既存planning文書の改訂には一切進んでいない。commit/pushも行っていない。

対象ケースは既存13ケースのうちA1・A2・C2・C3・D1・D2・D3(206ページ)のみを
用いた。以下の候補レポート例は、いずれもフィールド名・型を正式に確定した
ものではなく、**概念を確認するための試作**である。原文の引用は既存の
検証記録(`stage3_additional_validation.md`等)で既に扱った短い断片のみに
限定し、長文引用は行っていない。

---

## 1. 候補一覧レポート案(案3)の実データ試作

### 1-1. 試作方針

`stage3_parser_pipeline_redesign.md`2節の出力契約(F群のみ)に沿って、各候補を
次の形式で記述する。**「独立参照必要性」「子Source化すべき」「role」という
G群の結論は一切含めない。**

### 1-2. A1(定額法の設例内適用、テーマ8-2定義→テーマ8/9複数設例)

```jsonc
// 確定Source(定義式、topic直下)
{ "confirmedSourceId": "src-def-8-2",
  "blockKind": "formula_termbased",
  "textRange": { "page": "8-2該当ページ" } }

// Source候補(設例内の適用計算行、例)
{
  "candidateId": "cand-a1-app-1",
  "parentRef": { "type": "confirmed_source", "id": "src-worked-example-A" },
  "textRange": { "excerptHint": "例: 取得原価×１年／耐用年数＝当期計上額 の形の計算行" },
  "detectedPatternKind": "formula_termbased",
  "boundary": { "present": false, "form": "none" },
  "nestedCandidates": [],
  "structurallySimilarCandidates": ["cand-a1-app-2", "cand-a1-app-3", "...(pattern_detection_survey.mdで確認済みの16ページ分布)"],
  "possibleDefinitionBlock": {
    "found": true,
    "candidateRef": "src-def-8-2",
    "detectionNote": "topic直下・ラベルなしの位置に同型パターン(用語+演算子の式)を検出。対応関係(この計算が本当にこの定義の適用か)は未確認"
  },
  "contentPresence": "non_empty",
  "restorationStatus": { "resolved": true, "artifacts": [] }
}
```

### 1-3. A2(固定資産買換 ※1〜※5)

```jsonc
{
  "candidateId": "cand-a2-note1",
  "parentRef": { "type": "confirmed_source", "id": "src-journal-buy-replace-box" },
  "textRange": { "excerptHint": "※１ ..." },
  "detectedPatternKind": "calculation_formula",
  "boundary": { "present": true, "form": "explicit_symbol", "raw": "※１" },
  "nestedCandidates": [],
  "structurallySimilarCandidates": ["cand-a2-note2", "cand-a2-note3", "cand-a2-note4", "cand-a2-note5"],
  "possibleDefinitionBlock": { "found": false, "detectionNote": "各脚注は個別の算定内容。他箇所に共通の抽象定義候補は検出されず" },
  "contentPresence": "non_empty",
  "restorationStatus": { "resolved": true, "artifacts": [] },
  "boundaryBacktrackCheck": {
    "note": "親の確定Source内に「※１」という参照記号の存在を確認(gatechecks_invariant_validation.md4-2節の実データ検証と同じ性質のチェック、機械的に実行可能)",
    "found": true
  }
}
```

### 1-4. C2(差額補充法反復計算)

```jsonc
{
  "candidateId": "cand-c2-1",
  "parentRef": { "type": "confirmed_source", "id": "src-explanation-93" },
  "textRange": { "excerptHint": "繰入額：貸倒見積高600－前T/B 400＝200" },
  "detectedPatternKind": "calculation_formula",
  "boundary": { "present": false, "form": "none" },
  "nestedCandidates": [],
  "structurallySimilarCandidates": ["cand-c2-2", "cand-c2-3", "cand-c2-4"],
  "possibleDefinitionBlock": {
    "found": false,
    "detectionNote": "topic直下・ラベルなしの位置に同型パターンは検出されず(全数走査済み、pattern_detection_survey.md12節)"
  },
  "contentPresence": "non_empty",
  "restorationStatus": { "resolved": true, "artifacts": [] }
}
```

### 1-5. C3(複数行分断式、155ページ・171〜174ページ)

```jsonc
// 155ページ(単一分数、復元後は安定)
{
  "candidateId": "cand-c3-155",
  "parentRef": { "type": "confirmed_source", "id": "src-subitem-8-2" },
  "textRange": { "excerptHint": "（取得原価－残存価額）×（１年／耐用年数）＝年間減価償却費" },
  "detectedPatternKind": "formula_termbased",
  "boundary": { "present": false, "form": "none" },
  "candidateStabilityNote": "抽出時は複数行に分断されていたため候補の個数自体が一時不安定だったが、Faithful Restoration完了により単一候補として確定",
  "contentPresence": "non_empty",
  "restorationStatus": { "resolved": true, "artifacts": [
    { "kind": "fraction_split", "stage": "extraction", "resolved": true, "note": "human_reviewedで復元済み" }
  ] }
}

// 171〜174ページ(二重分数、復元が部分的)
{
  "candidateId": "cand-c3-171",
  "parentRef": { "type": "confirmed_source", "id": "src-worked-example-月割計算" },
  "textRange": { "excerptHint": "取得原価×１年／耐用年数×６月／12月＝月割減価償却費 に相当する構造" },
  "detectedPatternKind": "formula_termbased",
  "boundary": { "present": false, "form": "none" },
  "candidateStabilityNote": "layoutモードでも一部の項が欠落する崩れが残っており、候補の範囲・内容がまだ完全には確定していない",
  "contentPresence": "non_empty",
  "restorationStatus": { "resolved": false, "artifacts": [
    { "kind": "fraction_split_compound", "stage": "extraction", "resolved": false, "note": "layoutモードでも分子側の項が欠落する場合がある(pattern_detection_survey.md4-3節)" }
  ] }
}
```

### 1-6. D1(①②③、92ページ)

```jsonc
// ①内部の式候補のみが生成される(②③は候補が生成されない、1-7節参照)
{
  "candidateId": "cand-d1-formula-in-①",
  "parentRef": {
    "type": "confirmed_source",
    "id": "src-block-①-貸倒実績率法",
    "ancestryChain": ["src-topic-5-1", "src-subitem-➊", "src-boundary-(3)", "src-boundary-①"]
  },
  "textRange": { "excerptHint": "貸倒実績率＝(ｎ)期末の債権額に対する…÷３" },
  "detectedPatternKind": "formula_termbased",
  "boundary": { "present": false, "form": "none" },
  "nestedCandidates": [],
  "structurallySimilarCandidates": [],
  "possibleDefinitionBlock": { "found": false, "detectionNote": "この式自体が定義に相当する位置にあり、反復適用箇所は今回の走査範囲で検出されず" },
  "contentPresence": "non_empty",
  "restorationStatus": { "resolved": true, "artifacts": [] }
}
```

### 1-7. D2(振出人/名宛人/指図人、77ページ)

```jsonc
{
  "candidateId": "cand-d2-振出人",
  "parentRef": { "type": "confirmed_source", "id": "src-subitem-➋為替手形" },
  "textRange": { "excerptHint": "振出人 手形作成者 (借)〇〇〇×××(貸)〇〇〇×××" },
  "detectedPatternKind": "journal_pattern",
  "boundary": { "present": true, "form": "role_label", "raw": "振出人" },
  "nestedCandidates": [],
  "structurallySimilarCandidates": ["cand-d2-名宛人", "cand-d2-指図人"],
  "possibleDefinitionBlock": { "found": false, "detectionNote": "-" },
  "contentPresence": "non_empty",
  "restorationStatus": { "resolved": true, "artifacts": [] },
  "relatedExpressionRef": {
    "candidateRef": "cand-d2-summary-table",
    "relationNote": "同一ページ末尾に、振出人/名宛人/指図人という同じラベル語彙を用いた構造的に類似した表現(3行の要約)が存在する。関係の性質(親子/並列/その他)は未確定(planning/stage3_parser_pipeline_redesign.md6節の未決事項)"
  }
}
```

### 1-8. D3(206ページ、外貨建取引、境界あり・定義候補なし)

```jsonc
{
  "candidateId": "cand-d3-206-4",
  "parentRef": { "type": "confirmed_source", "id": "src-explanation-206" },
  "textRange": { "excerptHint": "※１ 帳簿価額：61,000 △1,000（修正） ＣＲ換算額：500ドル×ＣＲ120円＝60,000" },
  "detectedPatternKind": "calculation_formula",
  "boundary": { "present": true, "form": "explicit_symbol", "raw": "※１" },
  "nestedCandidates": [],
  "structurallySimilarCandidates": ["cand-d3-206-1", "cand-d3-206-3"],
  "possibleDefinitionBlock": {
    "found": false,
    "detectionNote": "topic直下・ラベルなしの位置に、外貨換算の一般形定義式は検出されず。205ページの「留意点 略号について」はHR/CRという略語の説明のみで、calculation_formula型の定義ブロックには該当しない(stage3_additional_validation.md3節)"
  },
  "contentPresence": "non_empty",
  "restorationStatus": { "resolved": true, "artifacts": [] }
}
```

**注目点**: `boundary.present = true`と`possibleDefinitionBlock.found = false`
という、互いに矛盾する印象を与える2つの事実を、**レポートは両方ともそのまま
並記するだけで、どちらが優先するかを判断していない**。これがC案の核心が
最も明確に表れる箇所である。

### 1-9. 確認結果(チェックリストへの回答)

| 確認項目 | 結果 |
|---|---|
| Parserが確定できる事実だけで候補を十分説明できるか | **概ねできた。** 7ケース全てで、既存のF群(境界・ネスト・同型パターン・抽象定義候補・復元状態)のみを使って候補を記述できた |
| G群の意味判断を混ぜずに記録できるか | **できた。** 「必要」「不要」「role」に相当するフィールドは一度も使わずに済んだ。D3(206)のような矛盾ケースも、判断を下さずに両方の事実を並記するだけで表現できた |
| 親候補・境界・ネスト・同型パターン・抽象定義候補・Faithful Restoration状態が過不足なく表現できるか | **概ね過不足なかったが、1点新たな要件が見つかった。** D1(4階層ネスト)では単一の`parentRef`だけでは階層を表現しきれず、**祖先チェーン全体(`ancestryChain`)を持たせる必要があった**。単純な親子1段のリンクだけでは多段ネストを表現できない |
| 候補レポートから元のSource位置へ追跡できるか | **できた。** `textRange`+`parentRef`(+`ancestryChain`)により、候補から確定Sourceの位置まで追跡可能 |
| ContentBlockを先に生成しなくても後工程が困らないか | **困らなかった。** 候補は確定Source(既にIDを持つ)を`parentRef`で参照するのみで、候補自体がContentBlockである必要はなかった。ただし2節で後述する制約(候補IDの安定性)が別途見つかった |

### 1-10. 試作を通じて新たに見つかった課題

1. **除外ログの必要性(D1で発見)**: D1の②③(説明文のみ・内容なし)は、
   F群だけで「そもそも候補が生成されない」と判断できたが、**その判断が
   実際に行われたという記録自体**は今回の候補レポートに含まれていない。
   後段が「②③は見落とされたのか、検討の上で除外されたのか」を区別
   できるようにするには、**「検討したが候補化しなかった」という除外
   エントリも記録する必要がある**(3節で詳述)。
2. **候補ID安定性の要件(D1で発見)**: 多段ネストを扱うには、単一の
   `parentRef`ではなく祖先チェーン全体を持たせる必要がある。これ自体は
   出力契約の追加項目で対応でき、新しいデータモデルを要する変更ではない。

---

## 2. C3型ループの確認

### 2-1. トレース対象

155ページ(単一分数、最終的に完全復元)と171〜174ページ(二重分数、部分
復元にとどまる)の2パターンをトレースする。

### 2-2. 155ページ(完全復元パターン)

```
[1] Extraction
    plain: 9行以上に分断(pattern_detection_survey.md4-2節)
    layout: 分子側は1行に復元、分母(耐用年数)は次行に残る
    → diag.extraction.attempts = [
         {tool:"pdftotext-plain", outcome:"severely_fragmented"},
         {tool:"pdftotext-layout", outcome:"partially_recovered(numerator_only)"}
       ]  (既存diag方式D、diag_accumulation_validation.md採用済み)

[2] Structure Recognition
    影響なし(テーマ8-2という見出し自体は安定検出済み)

[3] Block Detection
    layoutモードのテキストに対し単一行ベースの検出器を素朴に適用すると、
    「分子行」「分母行」という2つの候補行が別々に検出されるリスクがある
    (既存の指摘どおり)。

[4] Source Segmentation(初回、暫定)
    F4 = false(diag.extraction.artifacts に fraction_split, resolved:false)
    → **候補を安全側に倒して、断片全体(分子行〜分母行の連続する範囲)を
       1つの暫定候補としてグルーピングする**(細分化しない)。
    → candidateId = "cand-c3-155" を発行。candidateStabilityNote =
       "境界未確定、復元待ち" を付与。textRangeは断片全体を覆う広めの範囲。

[5] Faithful Restoration
    既知パターン(fraction_split)に対する復元ルールを適用、人間確認
    (既存6-1節の運用方針どおり)。
    結果: sourceFaithful = "（取得原価－残存価額）×（１年／耐用年数）＝
          年間減価償却費"(単一の完結式として復元)。
    diag.extraction.artifacts[0].resolved = true に更新。

[4'] Source Segmentation(再評価)
    復元結果を受け、断片が実際には単一の完結式だったことが確定する。
    → **candidateId "cand-c3-155" はそのまま維持**(初回に断片全体を
       広くグルーピングしておいたため、内容の更新のみで済み、IDの
       分割・統合は発生しない)。candidateStabilityNoteを"stable"に更新。

[6] Parsing
    sourceFaithful確定後、parsed構造(structure.tokens相当)を暫定的に
    生成可能(ただし正式なDK化はまだ先)。

[7] Validation/Diagnostics
    候補一覧レポートへ、確定した安定候補として出力。

[8] 候補確定フェーズ
    resolved:true という安定した状態を前提に判断できる。
```

### 2-3. 171〜174ページ(部分復元パターン)

```
[1]〜[3] 同様(ただし二重分数のため、layoutモードでも分子側の項が
    欠落する崩れが確認されている、pattern_detection_survey.md4-3節)

[4] 初回、暫定候補として断片全体を広くグルーピング。F4=false。

[5] Faithful Restoration
    既知の復元ルール(fraction_split_compound相当)を適用するが、
    **一部の項が依然として欠落したまま**(既知ルールでは解決しきれない)。
    diag_accumulation_validation.md5-2節の方針どおり、3値目
    (partially_resolved等)は導入せず、**resolved:falseのまま、
    noteに「部分的にしか復元できていない」事実だけを記録する**。

[4'] Source Segmentation(再評価)
    resolved が依然falseのため、候補は**「まだ確定していない」状態の
    まま**[7]へ引き渡される。ここで無理に確定させようとしない。

[7] Validation/Diagnostics
    候補一覧レポートへ、`resolved:false`+`candidateStabilityNote`付きで
    出力する。**この状態のまま[8]へ渡してよい**(既存原則4「推測しない」
    と整合。無理に確定候補として扱わず、不確実な状態のまま保持する)。

[8] 候補確定フェーズ
    レビュアーは`resolved:false`を見て「Restoration待ち」と判断し、
    最終的な必要性判断を保留する。
```

### 2-4. 個別の問いへの回答

| 問い | 回答 |
|---|---|
| Restoration前には何が未確定なのか | 候補の**個数・境界そのもの**(1つの完結式か、複数の断片候補か)、および`sourceFaithful`の内容 |
| Restoration後にどの事実が更新されるのか | `restorationStatus.resolved`、`sourceFaithful`本体、`candidateStabilityNote`。**場合によっては候補の個数・境界自体**(誤って複数候補として検出されていたものが、復元後に1つへ統合される可能性) |
| 同じ候補IDを維持できるのか | **条件付きで維持できる。** [4]の初回段階で断片全体を広く(粗く)グルーピングしておけば、復元後は内容の更新のみで済み、IDを維持できる。**もし初回に断片を細かく複数候補として先に発行してしまった場合は、復元後に統合・破棄が必要になる**。したがって、**「不安定な候補は広くグルーピングし、細分化は復元完了後に行う」という運用方針が望ましい**(今回のトレースで新たに得られた具体的な実装指針) |
| 候補を作り直す必要があるのか | 上記の方針(広いグルーピング)を採用すれば、基本的に作り直しは不要(内容の更新のみ)。ただし細分化を早まった場合は作り直しが必要になる |
| diagのattempt履歴と候補一覧レポートの責務が混ざらないか | **混ざらない。** `diag.extraction.attempts`(何回・どのツールで試行したか)は確定Source/候補の**内部情報**として保持され、候補一覧レポート側は`restorationStatus.resolved`という**要約された最終状態**だけを持てば足りる。候補一覧レポートがattempts履歴の詳細まで複製する必要はなく、既存のdiag方式D(状態は名前空間、履歴は配列)と自然に整合する |
| 無限ループや循環依存にならないか | **ならない。** [4]⇔[5]の反復は、Faithful Restorationの試行回数に上限がある限り有限(既存6-1節「fail-closedな適用、想定外の出現数で例外停止する」という運用方針により、無制限の自動再試行はそもそも想定されていない)。人間確認が必須になった時点でループは終了し、その時点の状態(`resolved:true`または`false`のまま)で[7]/[8]へ進む |

### 2-5. 既存7段階の順序表現についての明示的な指摘

**既存7段階の「直列パイプライン」という表現は、C3型のケースについては
不自然である。** [4] Source Segmentation → [5] Faithful Restoration という
一方向の順序では、**候補の境界確定自体が[5]の結果に依存する**という
依存関係を正しく表現できない。

**望ましい表現**: 確定Source・安定した候補は[1]→[7]の直列パイプラインで
問題なく処理できるが、**復元が不安定な候補についてのみ、[4]⇔[5]がローカルな
サブループを形成する**、という構造として明示すべきである。既存7段階という
段階数・直列性を無理に維持するより、**この局所的な反復構造を明示的にモデル化
する**方が実装可能性の観点で自然である。

---

## 3. 人間レビューに必要な情報量の確認

1節の候補レポートのみを見て、レビュアーが次の5分類のいずれかを判断できるかを
確認した。

| ケース | レポートから読み取れる状況 | 判断できる分類 | 判断に十分な情報だったか |
|---|---|---|---|
| A1 | 境界なし、抽象定義候補あり(対応関係は未確認)、復元済み | DK側の判断待ち | 十分。同型候補リストにより反復範囲も把握できる |
| A2 | 明示境界(※N)、親への参照存在確認済み、抽象定義候補なし(各脚注が個別内容) | Source化する方向で検討(ただし最終判断はDK側) | 十分 |
| C2 | 境界なし、抽象定義候補なし、同型候補4件 | DK側の判断待ち(型の反復か独立事例か) | 十分。まさにこの区別のために作られた候補である |
| C3(155) | 復元済み、安定 | (候補確定フェーズへ進める状態) | 十分 |
| C3(171-174) | 未解決、部分復元 | Restoration待ち | 十分、判断は一意に定まる |
| D1(①内部の式) | 4階層ネスト、抽象定義候補なし(反復適用が検出されない) | DK側の判断待ち、またはその他の理由で保留(反復が見られないため急ぎ確定不要) | **一部不足**(下記) |
| D2 | 役割ラベル境界(新形式)、要約表への参照あり(関係性未定義) | 独立参照についてはDK側の判断待ち、要約表との関係は「その他の理由で保留」 | 十分だが、要約表側の内容を別途参照する必要がある(cross-reference自体は機能する) |
| D3(206) | 境界あり+抽象定義候補なし(矛盾) | 判断が割れることを前提に、人間が個別に判断(保留可) | 十分。矛盾がそのまま提示されることで、レビュアーは安易な機械的結論に頼らず個別判断せざるを得ない |

### 3-1. 見つかった不足情報の分類

**D1のケースで、レポートが①内部の式のみを提示し、②③がそもそも候補として
出てこないことについて、レビュアーが「なぜ②③が無いのか」を確認する
手段がレポート単体にはなかった。** これを踏まえ、不足情報を2種類に分類する。

**A. Parserが機械的事実として追加できる情報(不足分)**

1. **除外ログ**: 「検討したが候補化されなかった領域」を、理由(パターン
   検出器が一致しなかった/内容が空だった等、F群の否定形)付きで記録する。
   これはF群の事実(検出結果の有無)をそのまま記録するだけであり、意味
   判断を新たに追加するものではない。
2. **検出器の既知/新規フラグ**: D2の役割ラベルのように、検出器語彙に
   新規追加したパターンで見つかった候補には、「既知の安定した検出器か、
   今回新たに追加された検出器か」を明示するフラグを付与する。これも
   検出処理自体のメタ情報であり、機械的に付与できる。
3. **同型候補の分布集計**: `structurallySimilarCandidates`のリストに加え、
   分布範囲(何ページ・何テーマにわたるか)の集計値を明示する。既存の
   リストからレビュアーが手動で導出できる情報だが、集計済みで提示した
   方がレビューの負荷を下げられる。

**B. Parserでは取得すべきでない意味情報(引き続き除外を維持すべきもの)**

1. 「この候補は独立参照が必要かどうか」という結論そのもの
2. 「この候補がどのDerived Knowledgeのapplication/exampleに相当するか」
   というrole相当の情報
3. D2の「本文個別仕訳と要約表が同一情報の言い換えである」という確証的な
   結論(構造的類似の事実提示に留めるべきで、今回もそのように扱えた)
4. C2型の「型の反復として扱うべきか、独立事例として扱うべきか」という
   意味づけ

**結論**: 見つかった不足はいずれもA分類(機械的事実の追加)であり、**B分類
(意味情報)へ踏み込む必要のある不足は見つからなかった**。これはC案の
出力契約(F群のみ)が、今回の7ケースの範囲では意味判断を要求せずに
レビュー可能な情報量を提供できていたことの裏付けになる。

---

## 4. 統合評価

| 論点 | 評価 |
|---|---|
| 候補一覧レポート方式は成立するか | **成立する。** 7ケース全てでG群を混入させずに記述でき、D3(206)のような矛盾も無理に解決せず提示できた。ただし除外ログ・検出器フラグ・分布集計という3点の拡張が望ましい |
| ContentBlock生成前の候補管理で問題ないか | **問題ない。** 候補は確定Sourceへの参照(`parentRef`/`ancestryChain`)だけで後段まで機能した。DKが未確定候補を直接参照できない(既存gateChecks原則により自然に防止される)という制約も、既存設計と矛盾しない |
| C3型の循環問題は解消できるか | **完全な"解消"ではないが、実装可能な形にモデル化できる。** [4]⇔[5]をローカルなサブループとして明示すれば、既存の7段階という骨格を大きく崩さずに扱える。無限ループにはならない(Restoration試行回数の上限という既存運用方針に依存する条件付きの結論) |
| Parser出力契約は十分か | **概ね十分だが、3点の拡張(3-1節A分類)を伴う。** これらはいずれも新しいデータモデルを要さず、既存のF群の枠内での拡張である |
| Parserと後段の責務境界は維持できるか | **維持できる。** 7ケース×3つの検証(レポート試作・ループトレース・レビュー模擬)を通じて、G群相当の判断が一度もParser側の出力に紛れ込まなかった |

---

## 5. 結論: C案の採否

**② 一部修正すれば正式採用できる**

理由:

- C案自体、および候補一覧レポート方式(案3)に、**新しい深刻な問題は見つ
  からなかった**。7ケースの試作・トレース・模擬レビューのいずれも、
  既存の懸念(3節・7節で挙げていたもの)を上回る新規の障害を示さなかった。
- 一方で、**具体的な3つの拡張が必要であることが分かった**(除外ログ・
  検出器の既知/新規フラグ・同型候補の分布集計)。これらはF群の範囲内の
  拡張であり、新しいデータモデルやG群の混入を伴わない。
- C3型ループについても、既存7段階の直列表現を「確定Source/安定候補は
  直列、不安定候補は[4]⇔[5]のローカルループ」という形に明示的に修正
  すれば、実装可能性の懸念は解消できる。

したがって、**追加の実データ検証(③)は不要**であり、**C案自体の見直し(④)
も不要**と判断する。②(一部修正)の内容は、5-1節に変更点一覧として示す。

### 5-1. 正式採用時の`parser_design_proposal.md`変更点一覧(まだ変更はしない)

| 節 | 変更内容 |
|---|---|
| 1節(Parser全体の責務分割案) | [4] Source Segmentationの説明を「候補を確定する」から「(a)機械的自明ケースの確定 (b)候補パッケージングまで」に変更。[7]の後に新設[8]候補確定フェーズ(Parser外、人間レビュー/DK層)を追記 |
| 2節(各段階の入出力表) | [4]の出力列を「確定Source+Source候補(F群の事実付き)」に変更。[5]の入力列に「Source候補」を追加。[7]の出力列に「候補一覧レポート」を追加 |
| 3節(Source粒度の設計案) | Stage2/3の説明を「候補の検出・パッケージングまで」に変更。3-5節の「候補を実際に子Source化する必要があるかどうかの判断基準」という記述を、[8]候補確定フェーズの責務として明確に切り出す |
| 4節(Parser/DK責務境界) | 4-1節に「候補の検出・パッケージングまで」を明記。4-2節に「候補を確定Sourceとして子Source化するかどうかの判断」を、既存の「role割り当て」等と並ぶDK層/人間レビューの責務として追加 |
| 5節(4概念モデルとの対応) | 確定Source・Source候補の両方に対する適用方針を追記(候補段階でも`sourceFaithful`/`parsed`を暫定的に生成しうることを明記) |
| 5-1節(親子Source重複) | 親子構造は[8]で確定した後に正式生成される、という確定タイミングを明記 |
| 6-3節(gateChecks) | 「候補一覧の構造的完全性」(除外ログの網羅性等)もgateChecksの検証対象になりうる旨を追記 |
| 9節(検証事項) | 「候補確定フェーズ([8])の詳細設計」「D2のrelation拡張」を、Stage3の残る未着手項目として追記 |
| 10節(未決事項) | 「候補一覧レポートの正式構造」「[4]⇔[5]のローカルループの実装方式」「候補ID安定化方針(粗いグルーピング推奨)」を追加 |

**この変更点一覧はまだ`parser_design_proposal.md`へ反映していない。** 反映の
実施はユーザー承認を得てから行う。

---

## 6. 今回意図的に扱わなかった事項(明示)

ユーザー指示どおり、以下には進んでいない。

- 新しい教材ケースの探索
- Parser本体の実装
- 正式スキーマのコード化
- ContentBlock候補用の新データモデルの正式採用
- `relation`モデルの拡張
- D2の本文個別仕訳↔要約表問題の解決(6節、`stage3_parser_pipeline_
  redesign.md`6節の未決事項のまま維持)
- Derived Knowledge生成設計への深入り
- 既存planning文書の改訂
- commit / push

---

以上がC案の最終確認結果である。新規実データ探索・Parser本体実装・正式
スキーマのコード化・既存planning文書の改訂には進んでいない。この結果を
踏まえ、C案(一部修正を伴う)を正式採用してParser設計の改訂に進むかどうか、
確認をお願いしたい。
