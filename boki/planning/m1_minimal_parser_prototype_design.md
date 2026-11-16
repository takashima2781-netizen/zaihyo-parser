# M1: 最小Parserプロトタイプ 詳細設計(定額法1ケース)

本ファイルは、`planning/vertical_slice_mvp_roadmap.md`のM1(Parserから実データが
出る)の詳細設計である。**目的はM1単体を完成させることではなく、定額法1ケースを
できるだけ早くM3(開発用確認UI)で確認できる状態にすること**であるため、汎用的な
Parserを先に完成させることは意図的に避け、このケース1件を通すために必要な最小限
の実装のみを対象とする。

**本ファイルは設計のみを行う。** コード実装・commit/pushには進まない。

参照した既存資料(Git管理下のSSOT):

- `CLAUDE.md` / `SPEC.md` / `TASK.md`
- `planning/parser_design_proposal.md`(第4版・Parser正式設計)
- `planning/source_derived_knowledge_design_proposal.md`(第4版・データモデル正式設計)
- `planning/vertical_slice_mvp_roadmap.md`(M1〜M6のマイルストーン定義)
- `planning/parser_source_granularity_validation.md`(ケース2・5。定額法定義ブロックが
  Stage1で決着すること、`fraction_split`アーティファクトの実例)
- `planning/structurenode_recognition_survey.md`(見出し行検出の実データ検証結果)
- `planning/pattern_detection_survey.md`(用語ベース計算式パターン検出器の実データ検証結果)
- `planning/stage3_c_plan_final_validation.md`2節(「テーマ8-2という見出し自体は安定
  検出済み」という既存の確認事実)

---

## 0. 前提の再確認

- 対象は`planning/vertical_slice_mvp_roadmap.md`3-1節で選定した**定額法の定義式
  ブロック(テーマ8-2)1件のみ**。第2ケース(テーマ8/9への複数適用)は対象外。
- ロードマップ2節の結論どおり、M1のスコープは**[1] Extraction・[2] Structure
  Recognition・[3] Block Detection・[4] Source Segmentation・[5] Faithful
  Restoration(このケースの`fraction_split`補正のみ)・[7]の最小部分**。
  [6] Parsingと[8]候補確定フェーズは対象外(ロードマップ2-3節・2-4節の結論を
  そのまま踏襲する)。
- **今回のユーザー指示による優先順位の確認**: M1を「汎用Parserの土台」として
  作り込まない。全209ページ・全ラベル・全パターン検出器への対応は行わず、
  このケース1件が確定Sourceとして出力され、M3が読み込める状態になることを
  最優先する。

---

## 1. 処理フロー(PDF → 確定Source)

```
PDF(/input/、ユーザーが配置)
   │
   ▼
[1] Extraction
   対象ページ範囲(テーマ8-2周辺、1-1節参照)をpdftotextで抽出
   │
   ▼
[2] Structure Recognition
   抽出テキストから「テーマ8」「論点8-2」の見出し行を検出し、
   最小限のStructureNode骨格(テーマ1件+論点1件のみ)を組み立てる
   │
   ▼
[3] Block Detection
   論点8-2の配下テキストに対し、用語ベース計算式パターン検出器
   (漢字項+演算子記号)を適用し、ContentBlock候補を1件検出する
   │
   ▼
[4] Source Segmentation
   検出された候補が論点8-2の直下(トップレベル)にあることを確認し、
   F3(3-6節)により候補化せず即座に確定Sourceとする
   │
   ▼
[5] Faithful Restoration
   extractionRawとsourceFaithfulを比較し、`fraction_split`が検出された場合、
   このケース専用の既知補正(5節で詳述)を適用してsourceFaithfulを確定する
   │
   ▼
確定Source(1件、JSON)
   │
   ▼
[7](最小部分)
   diagの必須キーが揃っているかの構造チェックのみ実行(6節参照)。
   Source候補一覧レポートは「候補0件」の構造として出力する
   │
   ▼
/output/配下へ書き出し(6節でM3への受け渡し形式を定義)
```

### 1-1. 未確定事項: テーマ8-2の正確なページ範囲

`structurenode_recognition_survey.md`の全209ページ走査により、テーマ・論点の
見出し行は高精度に検出できることは確認済みだが、**本ファイル執筆時点では
テーマ8-2の具体的なページ番号を断定しない**(推測しない、原則4)。M1着手時に
以下のいずれかで特定する。

- 同ファイルの走査結果(テーマ/論点とページ番号の対応表)がまだ手元にあれば、
  そこから引く。
- 無ければ、実PDFに対して同ファイルと同じ見出し検出ロジックを軽く再実行し、
  テーマ8・論点8-2のページを特定してから、その周辺ページのみを対象に
  Extractionを絞り込む。

いずれにせよ、**全209ページを毎回抽出する必要はない**。テーマ8の開始〜テーマ9
開始前までの範囲(数ページ〜十数ページ程度)だけを対象にすれば足りる。

---

## 2. 各処理段階の入出力(最小データ)

フィールド名は`source_derived_knowledge_design_proposal.md`・
`parser_design_proposal.md`で確定済みのものをそのまま使う(3節で詳述)。

### [1] Extraction

**入力**: PDFファイルパス、対象ページ範囲(1-1節)

**出力**(ページ単位):

```jsonc
{
  "page": 999,                          // 1-1節で特定
  "text": "...(生テキスト)...",
  "tool": "pdftotext",
  "toolVersion": "4.00",                // 実行環境のバージョンをそのまま記録
  "invocation": "-layout -enc UTF-8"    // 実際に使ったオプション
}
```

`plain`/`-layout`のどちらで抽出するかは、このケース1件について両方試し、
[5]でどちらが`sourceFaithful`復元に有利かを比較する(Zaihyo Parserの
「plain抽出失敗→layout抽出成功」という複数回試行パターンを、この1ケースに
限定して踏襲する。7節)。

### [2] Structure Recognition(最小)

**入力**: [1]の対象ページのテキスト

**出力**(テーマ1件+論点1件のみ。全論点・全サブ項目は対象外):

```jsonc
{
  "type": "StructureNode", "nodeKind": "theme", "id": "theme-8",
  "label": { "number": "8", "titleRaw": "..." },
  "location": { "page": 999 }
}
{
  "type": "StructureNode", "nodeKind": "topic", "id": "topic-8-2",
  "label": { "number": "8-2", "titleRaw": "..." },
  "location": { "page": 999 },
  "parentId": "theme-8"
}
```

### [3] Block Detection(最小: 用語ベース計算式検出器のみ)

**入力**: `topic-8-2`配下のテキスト範囲

**出力**(候補、まだ確定ではない):

```jsonc
{
  "blockKindGuess": "formula_termbased",
  "extractionRaw": { "text": "...", "tool": "pdftotext", "...": "..." },
  "location": { "page": 999, "sequenceOnPage": 1 },
  "detectorId": "termBasedFormulaDetector",
  "nestedUnder": null   // トップレベル。設例等の内部ではないことを明示
}
```

### [4] Source Segmentation(最小: F3のみ)

**入力**: [3]の候補、および既に確定済みのStructureNode(`topic-8-2`)

**判定ロジック(このケースのみ)**: `nestedUnder === null`(トップレベル)かつ
`topic-8-2`の直下に位置する ⇒ F3(`parser_design_proposal.md`3-6節)により
即座に確定Sourceとする。候補一覧レポートへは計上しない。

**出力**:

```jsonc
{
  "type": "ContentBlock",
  "id": "block-teigakuho-def",
  "blockKind": "formula_termbased",
  "structureRef": "topic-8-2",
  "location": { "page": 999, "sequenceOnPage": 1 },
  "extractionRaw": { "...": "..." },
  "segmentationDecision": { "rule": "F3", "note": "トップレベルのため即時確定" }
}
```

`segmentationDecision`は正式スキーマではない(10節で後回しと明記)。「なぜ
候補化されず確定したか」をM3で見えるようにするための最小限の補足情報として、
このケース限定で残す。

### [5] Faithful Restoration(5節で詳述)

**入力**: [4]の確定ContentBlock

**出力**: 確定ContentBlockに`sourceFaithful`・`diag`を追加したもの(最終形。
6節で全体像を示す)。

### [7](最小部分)

- 確定Source側: `sourceFaithful`が非空であること、`diag.extraction.status`が
  既知の5値(`parser_design_proposal.md`7-3節相当)のいずれかであることのみ
  チェックする(hard invariantのうち、このケースに関係する最小限)。
- Source候補一覧レポート: `{ "candidates": [] }`という空配列の構造のみ出力する
  (3-8節のスキーマは今回コード化しない。構造の形だけ用意する)。

---

## 3. 今回実装するもの / 後回しにするもの

| 分類 | 対象 |
|---|---|
| **今回実装する(このケース専用)** | テーマ8開始〜テーマ9開始前までのページ範囲に絞ったExtraction / テーマ8・論点8-2の見出し行検出のみ(全テーマ・全論点・➊➋➌等のサブ項目検出は対象外) / 用語ベース計算式パターン検出器のみ(仕訳型・方程式検出器・ラベル検出系は対象外) / F3(トップレベル確定)ルールのみ(F4〜F8を含む候補評価ロジック全体は対象外) / `fraction_split`のこのケース1件分の補正 / 確定Source 1件のJSON出力 |
| **後回しにする** | 全209ページへのStructure Recognition適用 / ラベル検出系(設例/解説/留意点/参考/コラム/Q&A)全体 / 仕訳型・方程式パターン検出器 / Source候補一覧レポートの正式スキーマ(3-8節の全フィールド) / [8]候補確定フェーズ(このケースは候補が発生しないため今回は不要) / gateChecks18項目のうち今回未使用のもの / `diag`の正式スキーマ全体(今回使うキーのみ実装) / `provenance`・`relation`(親子構造が無いため今回は未使用) / [6] Parsing(2-3節の結論どおり不要) / 汎用的なFaithful Restoration自動化(既知パターン全種の自動判定) |

**判断基準**: 「このケース1件を確定Sourceにして出力するために必要か」で
线引きする。第2ケース(定額法の複数適用)や他論点で必要になるものは、
実際にそのケースに着手するタイミングで追加する(過度な先読み実装をしない)。

---

## 4. Parser設計第4版のどの部分を実装するか

| `parser_design_proposal.md`の節 | 実装するか | 実装範囲 |
|---|---|---|
| 1節・1-1節(StructureNode認識方針) | 実装する(最小) | テーマ8・論点8-2の見出し行検出のみ。「番号+タイトルという見出し行パターン検出」という**型**は`structurenode_recognition_survey.md`で検証済みのロジックをそのまま再利用し、全ラベル対応版として再設計はしない |
| 1-2節(ContentBlock検出、パターン検出系) | 実装する(最小) | 用語ベース計算式検出器のみ。`pattern_detection_survey.md`で検証済みのロジックを再利用。ラベル検出系・方程式検出器は実装しない |
| 3-1節(Stage1: 基本Source) | 実装する | このケースはStage1で決着する(3-1節の前提どおり、`parser_source_granularity_validation.md`ケース2で確認済み) |
| 3-6節(確定Sourceと候補の境界、F3) | 実装する(F3のみ) | 「トップレベルなら確定」の1条件のみ。F4〜F8の評価ロジックはこのケースでは発火しないため実装しない |
| 3-8節(Source候補一覧レポート) | 構造のみ用意 | 空配列を返すダミー出力のみ。正式スキーマのコード化は行わない |
| 4節(Parser/Derived Knowledge責務境界) | 設計方針として遵守 | Parser側の実装は「候補の検出・構造的事実の提示まで」に厳密に留め、`sourceRefs.role`等の意味判断は一切行わない(M2の責務) |
| 5節(4概念モデル) | 実装する | `extractionRaw`/`sourceFaithful`/`diag`の3つ(このケースに`parsed`は無い、2-3節参照) |
| 5-1節(親子`provenance`・`relation`) | 実装しない | このケースに親子構造が無いため対象外(第2ケースで必要になる) |
| 6-1節(自動処理/要レビューの境界) | 実装する(最小) | このケース1件の`fraction_split`を「個別確認済みノイズ補正」パターン(fail-closed)として実装する(5節で詳述) |
| 6-3節(gateChecks) | 実装する(最小) | hard invariantのうち、親子構造を前提としないもの(`sourceFaithful`非空チェック等)のみ |
| 7節(Zaihyo Parser再利用パターン) | 部分的に踏襲 | 「個別確認済みノイズ補正+fail-closed」「複数ステージへの分割」「内容ベースfingerprint(8節で詳述)」の3パターンを踏襲。CSVブリッジ等の財表固有部分は対象外 |
| 6節(6-2節 検出不能要素、[6] Parsing) | 実装しない | このケースには該当しない(検出不能要素は無い)、[6]は2-3節の結論どおり不要 |

---

## 5. Faithful Restorationで今回必要になる処理

### 5-1. 対象アーティファクト

`planning/parser_source_granularity_validation.md`ケース5で確認されているとおり、
このケースは`fraction_split`(分数の分子/分母がPDF抽出で別行に分離する崩れ)の
実例である。M1では**この1パターン・この1インスタンスのみ**に対応する。

### 5-2. 実装方針(fail-closedな個別確認済み補正)

Zaihyo Parserの`knownTextCorrections.mjs`パターン(7節)を踏襲し、**汎用的な
分数復元ロジックは作らない**。代わりに、次のようなfail-closedな仕組みとする。

```
[5] Faithful Restoration
    extractionRawが「既知のfraction_split崩れパターン」に一致するか確認する
       ├─ 一致する場合: 事前に用意した補正後テキスト(sourceFaithful)を適用し、
       │                 diag.extraction.artifacts に fraction_split を記録、
       │                 diag.faithfulReconstruction.method = "human_reviewed"
       │                 とする
       └─ 一致しない場合(想定外の崩れ方だった場合): 処理を止めて例外を投げる
           (無理に自動補正しようとしない。原則4の徹底)
```

### 5-3. 【重要】補正データ自体の教材保護

`fraction_split`の補正には「崩れた抽出結果」と「正しい忠実な表現」の両方が
必要だが、**これらはいずれも教材原文そのもの(または教材原文に由来する派生
データ)である**。CLAUDE.md原則7(有償ライセンス教材の保護)に従い、この
補正データを**ソースコードに直接書き込んでコミットしてはならない**。

したがって、次のように分離する。

- **補正の仕組み(ロジック)**: `src/`配下のコードとしてコミットしてよい
  (どのフィールドを見て、どう補正を適用するかという処理そのものは教材原文を
  含まない)。
- **補正の中身(データ)**: 教材原文を含むため、既存の`.gitignore`で除外
  済みの領域(`/input/`または`/output/`)に置く。M1では`/input/corrections/`
  のような新しいサブディレクトリを設けることを想定するが、正式なパス名は
  実装時に決める(既存の`/input/`除外ルールに含まれる限り、`.gitignore`の
  変更は不要と見込まれる)。

この分離により、「使い捨て実装にしない」(ロジックは正式な設計の型に沿う)
かつ「教材保護原則に違反しない」(データはコミットしない)の両方を満たす。

---

## 6. M3の開発用確認UIへ何を渡せば表示できるか

`planning/vertical_slice_mvp_roadmap.md`5-1節が要求する表示順(PDF元データ→
抽出結果→sourceFaithful→確定Source→Derived Knowledge候補)のうち、**M1が
担当するのは最初の4段階**(Derived Knowledge候補はM2の責務)。

### 6-1. 出力ファイル

M1完了時点で、`/output/`配下(既存`.gitignore`で除外済み)に、このケース
1件分の確定Sourceを**1つのJSONファイル**として書き出す。

```jsonc
// /output/cases/teigakuho-definition.json (パス名は仮)
{
  "case": "teigakuho-definition",
  "structureContext": {
    "theme": { "id": "theme-8", "label": { "number": "8", "titleRaw": "..." } },
    "topic": { "id": "topic-8-2", "label": { "number": "8-2", "titleRaw": "..." } }
  },
  "block": {
    "id": "block-teigakuho-def",
    "blockKind": "formula_termbased",
    "location": { "page": 999, "sequenceOnPage": 1 },
    "extractionRaw": { "text": "...", "tool": "pdftotext", "toolVersion": "...", "invocation": "..." },
    "sourceFaithful": "...",
    "diag": {
      "extraction": { "status": "captured_differs", "artifacts": [
        { "kind": "fraction_split", "stage": "extraction", "resolved": true, "note": "..." }
      ]},
      "faithfulReconstruction": { "performed": true, "method": "human_reviewed", "confidence": "high" }
    },
    "segmentationDecision": { "rule": "F3", "note": "トップレベルのため即時確定" }
  },
  "candidateReport": { "candidates": [] }
}
```

このJSON 1ファイルが、**M3が読み込むべき唯一の入力**である。M3自体の実装
(HTML+JSON読み込み)はM1のスコープ外(10節)だが、M3が迷わず実装できるよう、
このファイル1つに必要な情報を集約しておく。

### 6-2. なぜ1ファイルに集約するか

M3は「デザイン・汎用性より確認できることを優先する」という要件
(ロードマップ5-1節)であるため、複数ファイル・API・DBを介さず、**静的JSON
1ファイルをブラウザ側でfetchして表示するだけ**という最小構成にできるように
設計する。M2完了後は、この同じファイルへ`derivedKnowledgeCandidate`フィールド
を追記する形で拡張すればよく、M3側の読み込みロジックを作り直す必要はない
(見込み)。

---

## 7. 最小限必要なファイル構成

既存のリポジトリ構成(`package.json`が`"type": "module"`・依存ゼロ・
`node --test`のみ)を踏襲し、外部ライブラリを追加しない。

```
boki-app/
├── input/                          既存.gitignore対象。PDF本体をここに配置(要ユーザー作業)
│   └── corrections/                (新設・要.gitignore確認)このケース専用のfraction_split補正データ
│       └── teigakuho-definition.json
├── output/                         既存.gitignore対象。生成物
│   └── cases/
│       └── teigakuho-definition.json   6節のM3向け出力
├── src/
│   └── parser/
│       ├── extract.mjs             [1] pdftotextラッパー(ページ範囲指定・plain/layout切替)
│       ├── structureRecognition.mjs [2] テーマ/論点見出し行検出(最小版)
│       ├── blockDetection.mjs      [3] 用語ベース計算式パターン検出器
│       ├── sourceSegmentation.mjs  [4] F3判定ロジック(最小版)
│       ├── faithfulRestoration.mjs [5] fraith_split補正の適用(fail-closed)
│       └── runTeigakuhoCase.mjs    上記5段階を順に呼ぶオーケストレータ(このケース専用)
├── scripts/
│   └── run-teigakuho-case.mjs      CLIエントリポイント(node scripts/run-teigakuho-case.mjs)
├── test/
│   ├── smoke.test.mjs              既存
│   └── parser/
│       ├── structureRecognition.test.mjs   架空データによる単体テスト
│       ├── blockDetection.test.mjs         架空データによる単体テスト
│       ├── faithfulRestoration.test.mjs    架空データによる単体テスト+fail-closed動作の確認
│       └── runTeigakuhoCase.integration.test.mjs  実PDFがある場合のみ実行(8節で詳述)
├── CLAUDE.md / SPEC.md / TASK.md / planning/   既存(変更しない)
└── package.json                     既存(変更なし、依存追加なし)
```

**このケース専用の名前(`runTeigakuhoCase.mjs`等)を関数名・ファイル名に
そのまま使う。** 汎用的な`runPipeline(caseConfig)`のような抽象化は、2つ目の
ケース(第2ケース、または`journal_pattern`ケース)に着手する時点で初めて
必要性を判断する(過度な先読み抽象化をしない、CLAUDE.mdの一般原則)。

---

## 8. テスト方法

### 8-1. 制約: 教材原文をテストコードにもコミットできない

CLAUDE.md原則7により、**テストコード(Gitにコミットされる)の中に実際の
教材原文や、それを一意に復元できる情報を書いてはならない**。したがって、
次の2種類のテストを分離する。

### 8-2. 単体テスト(コミット可能、架空データ使用)

`structureRecognition.mjs`・`blockDetection.mjs`・`faithfulRestoration.mjs`の
ロジックは、`source_derived_knowledge_design_proposal.md`が一貫して使っている
「架空の例」(実在しない勘定科目・数値・論点名)を入力にした単体テストで検証する。
例:

- 見出し行検出: `"８−２　架空の論点タイトル"`のような架空文字列で、番号・
  タイトルが正しく分離できるかを確認する。
- 計算式パターン検出: `"（架空項Ａ－架空項Ｂ）×架空率＝架空額"`のような
  架空の式で、用語ベース計算式として検出されるかを確認する。
- Faithful Restoration: 架空の分数分断パターン(例: `"架空額×  １年\n５年  ＝結果"`)
  を人工的に作り、`fraction_split`として検出され、fail-closedな補正が正しく
  適用される(または既知パターンに一致しない場合に例外を投げる)ことを確認する。

これらは**実際の定額法の式そのものではない**ため、無制限にコミットしてよい。

### 8-3. 統合テスト(ローカル限定、実PDFがある場合のみ実行)

`runTeigakuhoCase.integration.test.mjs`は、`/input/`に実PDFが存在する場合のみ
実行し、存在しない場合は`test.skip`する(CI環境やPDFを持たない環境でも
落ちないようにする)。

**アサーションは構造的性質のみに限定し、実際の教材原文を期待値として埋め込まない。**

- `sourceFaithful`が`null`でも空文字でもないこと
- `sourceFaithful`に分数を示す `／` が含まれること(構造的性質。文言そのものは
  検証しない)
- `diag.extraction.status`が既知の5値のいずれかであること
- `location.page`が1-1節で特定した想定ページ範囲内であること
- `structureRef`が`topic-8-2`を指していること

この方式であれば、テストコード自体は教材原文を含まずコミットでき、実データでの
動作確認はローカル環境(PDFを持つ環境)でのみ機能する。

### 8-4. 回帰確認(任意)

`parser_design_proposal.md`7節の「内容ベースのfingerprint比較」パターンを
踏襲し、`/output/cases/teigakuho-definition.json`のハッシュ値をローカルの
gitignore対象ファイルに保存しておき、Parser改修後に同じ入力から同じ結果が
再現するかを確認できるようにしてもよい(必須ではない、余力があれば)。

---

## 9. M1完了条件

以下をすべて満たした時点でM1完了とする。

1. `node scripts/run-teigakuho-case.mjs`を実行すると、`/output/cases/
   teigakuho-definition.json`が1件生成される(実PDFが`/input/`に存在する
   ことが前提)。
2. 生成された`sourceFaithful`が、`fraction_split`補正後の忠実な表現になって
   いる(分数が正しく`／`を用いた形で復元されている)。
3. `diag.extraction.status`・`diag.extraction.artifacts`・
   `diag.faithfulReconstruction`が、3節・5節で定義した最小フィールドを
   満たしている。
4. `segmentationDecision.rule === "F3"`であり、候補化されずに確定Sourceと
   なった経緯が記録されている。
5. `candidateReport.candidates`が空配列として出力されている(構造の形だけ
   検証、3-8節)。
6. 8-2節の単体テストがすべて通る(`npm test`)。
7. 8-3節の統合テストが、実PDFがある環境で通る(無い環境ではskipされ、
   落ちない)。
8. 4節の対応表に記載した「実装する」項目が実装され、「実装しない」項目に
   手を広げていない(スコープの逸脱がない)。

**Derived Knowledge候補の生成(M2)・開発用確認UI本体(M3)はM1完了条件に含めない**
(10節で明確に分離する)。

---

## 10. M1完了後、M3で実データを確認できるまでに追加で必要な作業

M1(9節の完了条件)を満たしても、それだけではM3(開発用確認UI)は動かない。
追加で必要な作業を明示する。

| 作業 | 内容 | 備考 |
|---|---|---|
| M3本体の実装 | `/output/cases/teigakuho-definition.json`をfetchして、6-1節の内容を画面に表示するだけの最小HTML(+最小限のJS)。ローカルサーバは`node --test`と同様、Node標準機能(`node:http`等)で最小限のもので足りる可能性が高い(要検討・追加ライブラリ導入は避ける方針) | ロードマップ5-1節のとおりデザイン・操作は不要 |
| M2の一部(任意) | ロードマップ1-1節のとおり、M3は「Knowledge候補が無い状態」でも一部表示できるため、M2を待たずにM3本体の実装に着手してよい。M2完了後に`derivedKnowledgeCandidate`フィールドを追記する形でJSONを拡張し、M3側の表示を1項目追加する | M1→M3を最短で通す場合、M2を後回しにして先にM3のガワだけ通す選択肢もある(ユーザー判断) |
| PDFの配置確認 | `/input/`に実PDFが存在することを確認する(現在の作業環境には無い) | 9節の完了条件1の前提。無い場合はM1のコード実装自体は進められるが、実データでの検証ができない |
| テーマ8-2の正確なページ特定 | 1-1節のとおり、既存の走査結果または簡易な再走査で特定する | M1着手時に最初に行う小タスク |
| 5-3節の補正データ配置 | `/input/corrections/`(または実装時に決める同等のgitignore対象パス)に、`fraction_split`の補正データを配置する | ソースコードとは分離してコミット対象外にする |

**M3を最短で見せるための推奨順序**: 1-1節(ページ特定)→ M1の[1]〜[5]実装
→ M1完了条件(9節)達成 → M3本体の最小実装(このJSON1件を表示するだけ)。
M2(Derived Knowledge候補生成)は、M3のガワが動くことを確認した後、同じJSON
ファイルへの追記という形で並行・後続して進めることができる。

---

## 未決事項(この設計では判断しない)

- テーマ8-2の正確なページ番号(1-1節、実装着手時に特定)。
- `plain`/`-layout`のどちらの抽出モードを最終的に採用するか(2節、実データで
  比較してから決める)。
- M3を静的HTML(file://直接オープン)にするか、`node:http`による最小ローカル
  サーバにするか(10節、ブラウザのfetch/CORS制約次第で判断する)。
- `/input/corrections/`のディレクトリ名・配置(5-3節、実装時に確定する。
  既存`.gitignore`の`/input/`ルールに含まれる限り追加の除外設定は不要と
  見込まれるが、実装時に`.gitignore`の記述で本当にカバーされているかを
  再確認する)。

以上がM1(最小Parserプロトタイプ)の詳細設計である。この内容についてユーザー
確認を得たうえで、コード実装(`src/parser/`配下)へ進む。
