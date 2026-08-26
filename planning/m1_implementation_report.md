# M1実装報告(定額法1ケース: PDF → 確定Source)

`planning/m1_minimal_parser_prototype_design.md`に従い、定額法の定義式ブロック
(テーマ8-2)1件を確定Sourceとして`/output/`へ出力するところまでを実装した。
[6] Parsing・[8]候補確定フェーズ・M2(Derived Knowledge生成)・M3(開発用確認UI)
には進んでいない。**commit/pushも行っていない。**

**教材保護についての注記**: 本ファイルは実際の教材原文(具体的な式の文言・
説明文)を転載しない。式の実際の値・抽出結果はGit管理対象外(`/output/`・
`/input/`)にのみ存在する。以下の例はすべて`source_derived_knowledge_design_
proposal.md`等の既存資料と同じ方針で架空化してある。実際の値はチャット上の
別メッセージで報告する。

---

## 1. 実装したファイル

```
src/parser/
  pymupdf_extract.py         [1] Extraction補助(Python/PyMuPDF、教材原文を含まない)
  extract.mjs                [1] 上記をNodeから子プロセスとして呼ぶラッパー
  structureRecognition.mjs   [2] テーマ/論点見出し検出(最小版)
  blockDetection.mjs         [3] 用語ベース計算式パターン検出器
  sourceSegmentation.mjs     [4] F3判定ロジック(最小版)
  faithfulRestoration.mjs    [5] 既知補正の適用(fail-closed)。教材原文を含まない
  runTeigakuhoCase.mjs       [1]〜[5]を順に呼ぶオーケストレータ(このケース専用)
scripts/
  run-teigakuho-case.mjs     CLIエントリポイント
test/parser/
  structureRecognition.test.mjs         単体テスト(架空データ)
  blockDetection.test.mjs               単体テスト(架空データ)
  sourceSegmentation.test.mjs           単体テスト(架空データ)
  faithfulRestoration.test.mjs          単体テスト(架空データ)
  runTeigakuhoCase.integration.test.mjs 統合テスト(実PDFがある場合のみ実行)
```

Git管理対象外(`.gitignore`で除外済み、今回新規作成):

```
input/book1.pdf                          教材PDF本体(3節で経緯を報告)
input/corrections/teigakuho-definition.json   fraction_split補正データ(5節)
output/cases/teigakuho-definition.json        確定Source出力(6節)
```

---

## 2. 前提の食い違いと対応(実装前に発生)

設計時の想定(「PDFは`/input/`配下に配置済み」)と実際の状態が食い違っていた。
`boki-app/input/`にはPDFが存在せず、`Zaihyo Parser/input/pdf/★簿記論 No.1
基本テキスト.pdf`に存在することが分かった。設計に無理に合わせず、
`boki-app/input/book1.pdf`へコピーして進めた(既存`.gitignore`の保護範囲内、
原本の移動・削除は行っていない)。

---

## 3. 実PDFからテーマ8-2をどう特定したか

M1設計(1-1節)のとおり、ページ番号を推測で固定せず、実PDFを実際に走査して
特定した。

- PDF全体は209ページ(`structurenode_recognition_survey.md`が記録している
  全体ページ数と一致することを確認した)。
- 「テーマ」「定額法」を全ページテキストに対して検索し、テーマ8の開始位置
  (PDFページ150、目次で８-２＝減価償却であることを確認)、および本文中の
  「８-２」見出し(PDFページ155、教材内の印字ページ番号は「126」)を特定した。
- PDFページ番号(1始まり)と、教材が独自に印字しているページ番号(「－126－」)
  は一致しない(前付けページ分のオフセットがあるため)。今回の実装では
  `location.page`にPDFページ番号(155)を、`location.printedPageLabel`に
  教材印字ページ番号("126")を、それぞれ別フィールドとして保持した
  (`book1_material_survey_report.md`が指摘していた「オフセットに注意する
  必要がある」という申し送りへの対応)。

---

## 4. 各処理段階で実際に何が生成されたか

| 段階 | 実際の結果 |
|---|---|
| [1] Extraction | PDFページ150・155の2ページのみを抽出(全209ページは抽出していない)。後述4-1節の理由により、抽出ツールは設計時想定の`pdftotext`から`PyMuPDF`(Python)へ変更した |
| [2] Structure Recognition | テーマ8("有形固定資産・無形固定資産")・論点8-2("減価償却")の2件のStructureNodeのみを生成。全論点・➊➋➌等のサブ項目は生成していない |
| [3] Block Detection | 用語ベース計算式パターン検出器が、論点8-2のページ内で**3件**の候補を検出した(定額法・定率法・級数法、いずれも同一ページ内)。このうち定額法の1件のみをM1ケースの対象として選択し、残り2件は`outOfScopeDetections`として理由付きで記録した(無かったことにしない、原則4) |
| [4] Source Segmentation | 選択した1件はStructureNode(論点8-2)の直下・トップレベルであるため、F3により候補化せず即時確定Sourceとした |
| [5] Faithful Restoration | 4-2節で詳述 |

### 4-1. 抽出ツールの変更(設計との食い違い、報告)

M1設計は`pdftotext`(poppler)を想定していたが、この実装環境の`pdftotext`は
CJK用CMapデータ(Adobe-Japan1)を欠いており、**日本語部分が正しく抽出できない
(空白・文字化けになる)ことを確認した**(英字部分は抽出できるが、日本語が
すべて欠落する)。

これは無視できない食い違いだったため、無理に`pdftotext`へ合わせず、この
環境で正しく日本語を抽出できることを確認済みの`PyMuPDF`(Python、
バージョン1.28.2)へ抽出ツールを変更した。

**この変更がParser設計第4版と矛盾しない理由**: `parser_design_proposal.md`
7-1節が「抽出方法自体がプロジェクトの中で変化してきた実績がある」ことを
明記しており、`extractionRaw.tool`/`toolVersion`/`invocation`は元々ツールの
変化を前提としたフィールド設計になっている。今回もこれらのフィールドに
実際に使ったツール(`pymupdf`・`1.28.2`・`get_text(sort=True)`)をそのまま
記録しており、データモデル自体への変更は発生していない。

**`get_text(sort=True)`を選んだ理由**: PyMuPDFの既定(座標ソートなし)の
抽出では、分数のようにページ上で縦に積まれたテキストが実際の文脈から
遠く離れた位置(ページ末尾)に、複数の式の分数がまとめて出力されてしまう
ことを実データで確認した。`sort=True`(座標に基づく読み順ソート)を使うと、
各式の分子/分母がその式の直前/直後の行として現れ、`parser_source_
granularity_validation.md`ケース5が説明していた「分子/分母が別行に分離する」
という想定どおりの、扱いやすい`fraction_split`の形になることを確認した。

---

## 5. fraction_splitをどう復元したか

- 対象の式は、抽出結果上で**分子に相当する行が式の直前の行、分母に相当する
  行が式の直後の行**として分離していた(想定どおりの`fraction_split`)。
- `input/corrections/teigakuho-definition.json`(Git管理対象外)に、この
  1件専用の補正データ(期待される断片のリスト・補正後の忠実な表現)を配置した。
- `faithfulRestoration.mjs`は、抽出結果がこの補正データの期待断片をすべて
  含んでいることを確認したうえで補正を適用する(fail-closed)。期待断片が
  一致しなければ処理を止めて例外を投げる設計とし、実際に単体テストで
  この異常系(架空データ)を確認済み。
- 復元後は、分子・分母を「／」で結んだ1行の式として`sourceFaithful`に
  格納した(既存の設計案が示していた表記方針と同じ形)。

架空化した例(実際の値ではない): 抽出結果が
`"１架空単位\n（架空項Ａ－架空項Ｂ）×      ＝架空額\n架空全体単位"`
のように分離していた場合、`"（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額"`
という1行に復元する、という処理を実装した。**実際の式の値は本ファイルには
書かない**(教材保護、上記注記参照)。

---

## 6. 確定Sourceの出力結果

`/output/cases/teigakuho-definition.json`(Git管理対象外)に、次の構造で
1件出力した(フィールド名は`source_derived_knowledge_design_proposal.md`・
`parser_design_proposal.md`の確定済みフィールド名をそのまま使用。実際の
テキスト値は架空化して示す)。

```jsonc
{
  "case": "teigakuho-definition",
  "generatedAt": "(ISO日時)",
  "structureContext": {
    "theme": { "id": "theme-8", "label": { "number": "8", "titleRaw": "(テーマ8のタイトル)" } },
    "topic": { "id": "topic-8-2", "label": { "number": "8-2", "titleRaw": "(論点8-2のタイトル)" } }
  },
  "block": {
    "type": "ContentBlock",
    "id": "block-teigakuho-def",
    "blockKind": "formula_termbased",
    "structureRef": "topic-8-2",
    "location": { "page": 155, "printedPageLabel": "126", "sequenceOnPage": 1 },
    "extractionRaw": { "text": "(抽出生データ。分数が分離した状態)", "tool": "pymupdf", "toolVersion": "1.28.2", "invocation": "get_text(sort=True)" },
    "sourceFaithful": "(復元後の忠実な表現。／で分数を表記)",
    "diag": {
      "extraction": { "status": "captured_differs", "artifacts": [{ "kind": "fraction_split", "stage": "extraction", "resolved": true, "note": "..." }] },
      "faithfulReconstruction": { "performed": true, "method": "human_reviewed", "confidence": "high" }
    },
    "segmentationDecision": { "confirmed": true, "rule": "F3", "note": "トップレベル(既に確定済みのStructureNodeの直下)のため即時確定" },
    "detection": { "detectorId": "termBasedFormulaDetector", "precedingHeading": "(直前のサブ項目見出し)" }
  },
  "candidateReport": { "candidates": [] },
  "outOfScopeDetections": [
    { "precedingHeading": "(定率法の見出し)", "reason": "このM1ケース(定額法)の対象外。次フェーズ以降の別ケースとして扱う" },
    { "precedingHeading": null, "reason": "同上(級数法。7節で後述する軽微な既知の限界により見出しラベルが空になっている)" }
  ]
}
```

実際の値(教材原文を含む)はチャット上の別メッセージで報告する。

---

## 7. テスト結果

```
npm test
ℹ tests 19
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

- 単体テスト14件(`structureRecognition`・`blockDetection`・
  `sourceSegmentation`・`faithfulRestoration`): すべて架空データのみを使用。
- 統合テスト1件(`runTeigakuhoCase.integration.test.mjs`): 実PDFが
  `/input/book1.pdf`に存在したため実行され、成功した。アサーションは
  構造的性質のみ(`sourceFaithful`が非空であること、「／」を含むこと、
  `diag.extraction.status`が`captured_differs`であること、`location.page`が
  155であること等)に限定し、実際の教材原文を期待値として埋め込んでいない。
  PDFが無い環境ではこのテストは自動的にskipされる設計。
- 既存のsmoke.test.mjs 2件も引き続き成功。

---

## 8. Parser設計第4版との整合性

`m1_minimal_parser_prototype_design.md`4節の対応表どおりに実装した。
矛盾は生じていない。特に確認できた点:

- `extractionRaw`/`sourceFaithful`/`diag`の4概念モデル(`parsed`は今回
  対象外)を実データで保持できた。
- `diag.extraction.status`の値語彙(`captured_differs`)を実際に使用した。
- F3(3-6節)による確定ルールが、実データ(トップレベルの独立した計算式)に
  対してそのまま適用できた。
- 6-1節の「個別確認済みノイズ補正・fail-closed」という運用方針を、実データの
  異常系(期待断片の不一致)込みで実装・テストできた。
- 4節(Parser/Derived Knowledge責務境界)のとおり、`sourceRefs.role`等の
  意味判断は一切実装していない。

**唯一の食い違いは4-1節で報告した抽出ツールの変更であり、これはフィールド
設計(7-1節が抽出方法の変化を前提としている)と矛盾しない環境起因の実装判断
である。**

---

## 9. M3開発用確認UIへそのまま進める状態か

**進める状態にあると判断する。** `/output/cases/teigakuho-definition.json`
1ファイルに、`vertical_slice_mvp_roadmap.md`5-1節が要求する表示順のうち
M1が担当する4段階(PDF元データの位置情報→抽出結果→sourceFaithful→確定Source)
がすべて揃っている。M3本体(JSON読み込み+表示のみの最小HTML)は未実装。

---

## 10. 実装して分かった新しい問題・未決事項

1. **抽出ツールの変更(4-1節)**: `pdftotext`ではなく`PyMuPDF`を採用した。
   今後別のケース・別の環境でParserを動かす場合、同じCJK CMap問題が
   起きうる。恒久的な対応(poppler-data導入等)を取るか、PyMuPDFを正式な
   採用ツールとするかは未決定。
2. **実行環境の`python3`エイリアス問題**: この環境の`python3`はWindows
   Storeのスタブを指しており実際には動作しない。`python`(実体)を使う
   必要がある。`extract.mjs`は`BOKI_PYTHON_BIN`環境変数で上書き可能にして
   あるが、正式な運用方法(READMEへの注記等)は未決。
3. **precedingHeadingが空になる既知の軽微な制限**: `blockDetection.mjs`の
   直前見出し探索範囲(6行分)が、級数法の候補では1行分足りず、
   `precedingHeading`が`null`になった(6節`outOfScopeDetections`の2件目)。
   このケース自体はM1のスコープ外(定額法のみが対象)のため実害はないが、
   将来このロジックを他のケースへ広げる際は、探索範囲またはロジック自体を
   見直す必要がある。
4. **同一ページに複数の計算式が存在する実態を確認**: テーマ8-2には定額法・
   定率法・級数法の3つの計算式が同一ページに存在した。今回は
   `precedingHeading`(直前のサブ項目見出し)による選別で対応したが、
   これは今回のケース固有の対応であり、汎用的な「この式はどの技術か」の
   判定ロジックではない(意図的に汎用化していない、`m1_minimal_parser_
   prototype_design.md`3節の方針どおり)。
5. **`location.printedPageLabel`は正式設計にない補足フィールド**: PDFページ
   番号と教材印字ページ番号の食い違い(3節)に対応するため、`location`へ
   このM1実装限定で追加した。正式スキーマ化するかどうかは未決事項として
   次フェーズへ持ち越す。
6. **`outOfScopeDetections`は正式スキーマにない診断フィールド**: Source候補
   一覧レポート(3-8節)とは意味が異なる(G群の判断待ちではなく、単に今回の
   ケースの対象外という事実)ため、`candidateReport`とは別のフィールドとして
   出力した。この区別が今後も有効かは、次のケースに着手する際に再確認する
   必要がある。

以上がM1(定額法1ケースの確定Source生成)の実装報告である。M2(Derived
Knowledge生成)・M3(開発用確認UI)にはまだ進んでいない。commit/pushも
行っていない。この内容についてユーザー確認を得たうえで、次工程へ進む。
