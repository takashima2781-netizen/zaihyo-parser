# 消費税法（shohizei/）

消費税法の教材PDF（TAC）を解析し、教材の構造を失わずに中間データ（教材構造）へ変換する。
最上位の `CLAUDE.md` の原則（原文を失わない・推測しない・unknown を残す・問題形式を固定しない）に従う。
設計の経緯は WISHLIST の W-5 と、調査・設計レポート（`work/shohizei/design-report-2026-11-16.md`、git 対象外）。

## 層

| 層 | 中身 | 場所 |
|---|---|---|
| 第0層 抽出 | ページの行・文字のかたまり（位置・大きさ・書体）・図形（点線の枠） | `src/extract/`（PyMuPDF） |
| 第1層 教材構造 | トレーニング: 回 → 問題（問題文・解答・解答への道・シート参照）<br>理論マスター: テーマ → 理論 → 項目 → (1) → ① → イ → (ｲ) | `src/training/`、`src/theory/` |
| 第2層 Exercise View | 学習アプリ（`../html-v2/`）用の問題データ。`meta.subject: "shohizei"` を付ける | 未着手 |

共通の部品は `src/common/`（行の整理・分数の復元）、書き出し前の検査は `src/gateChecks/`。

## 決まり

- **教材は有償。** PDF と、抽出・生成したデータは git に入れない（`input/`・`output/`・`work/` は `.gitignore` 済み）。
  テストは教材の原文を使わず、型だけをまねた作り物のデータで書く。
- **透かし（会員番号・氏名）は抽出の直後に取り除く**（`src/extract/extract.mjs`）。どの中間データにも残さない。
  検査（`gateChecks`）が透かしの文字を見つけたら、何も書き出さずに止まる。
- 原文の行（`text`）は書き換えない。分数の復元・文字の大きさの区分などは `segments` など別の欄に持つ。
- 型に当てはまらないものは `unknown`、決めきれなかったものは `unresolved` に理由の名前つきで残す。
- 問い方（`formCandidates`）は指示文の言い回しを根拠（`evidence`）に付けた候補であり、決定ではない。

## 動かし方

教材PDFを `input/pdf/` に置く（名前は `training-basic-1-problem.pdf` / `-answer.pdf` / `-sheet.pdf`、`theory-master.pdf`）。

```bash
npm run training -- training-basic-1   # → output/training-basic-1.structure.json と .summary.json
npm run theory -- 1                    # → output/theory-master-theme1.structure.json と .summary.json
npm test
```

Python は 環境変数 `SHOHIZEI_PYTHON_BIN` → `~/.venvs/study-drill/bin/python`（Python 3.12・PyMuPDF 1.28.2）→ `python` の順に探す。
