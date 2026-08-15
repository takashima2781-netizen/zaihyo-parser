# 参考資料: 友人から受け取った Project-Template の README

## 出典・経緯(メタ情報)

- 受領日: 2026-08-15
- 受領経路: 友人からテキストで共有された
- 対象: `Chou-enuhack/Project-Template` というGitHubリポジトリのREADME本文と
  される文章(本人談)
- **重要な注記**: このリポジトリ自体(実ファイル)へのアクセスはこちらから
  試みたが確認できていない(`git clone`・`git ls-remote`・Web参照のいずれも
  404)。したがって、以下の本文はあくまで「友人から渡されたテキスト」であり、
  実際のリポジトリの内容・最新状態と一致するかは未検証。
- 用途: boki-appの初期構築にあたり、ファイル構成・設計思想の**アイデアの
  参考**として利用した。CLAUDE.md/SPEC.md/TASK.mdの3ファイル構成という
  発想はここから着想を得ているが、各ファイルの実際の中身(このREADMEで
  言及されている `.claude/rules/` 4本、Playwright用hooks 3本、
  `project-init` スキルなど)は実体を確認できていないため、boki-appでは
  複製せず、必要になった時点でCLAUDE.mdの原則とZaihyo Parserの実績を
  根拠に新規設計する方針とした。詳細は
  `planning/boki-app-integration-proposal.md` および該当セッションの
  やり取りを参照。
- 原文は要約・改変せず、受け取ったテキストをそのまま保持する。

---

## 本文(受領テキストそのまま)

# Project-Template

Claude Code でプロジェクトを始めるためのテンプレートリポジトリ。新規プロジェクトの土台になるファイル一式を最初から揃えてある。

## 使い方

### 新規プロジェクトを始める

GitHub の「Use this template」ボタンか、CLI で:

```bash
gh repo create my-new-project --template Chou-enuhack/Project-Template --private --clone
cd my-new-project
claude
```

### 初期セットアップ

`claude` を起動したら、以下を順に対応:

1. **`CLAUDE.md` の `{{穴埋め}}` を埋める** — 目的・性格・技術スタック・規約
2. **`SPEC.md` の要件・スコープを書く**
3. **`.claude/settings.json` の `enabledPlugins`** を必要なプラグインだけに調整
4. 必要なら **`CLAUDE.local.md.example`** を `CLAUDE.local.md` にコピーして個人指示を書く
5. 必要なら **`.mcp.json.example`** を `.mcp.json` にコピーして MCP 設定

## ファイル構成

```
.
├── CLAUDE.md                           ← プロジェクトの心臓部（穴埋め式）
├── CLAUDE.local.md.example             ← 個人指示の雛形
├── SPEC.md                             ← 仕様書テンプレ（独自）
├── TASK.md                             ← タスクリストテンプレ（独自）
├── README.md                           ← 本ファイル
├── .gitignore                          ← .local.* / .env を除外
├── .mcp.json.example                   ← MCP 切替の雛形
├── .worktreeinclude                    ← worktree に持ち越すファイル指定
└── .claude/
    ├── README.md                       ← .claude/ の構造説明（永続版）
    ├── settings.json                   ← チーム共有設定
    ├── settings.local.json.example     ← 個人 override 雛形
    ├── hooks/                          ← Playwright 用スクリプト3本を同梱
    ├── skills/                         ← スキル（project-init を同梱）
    │   └── project-init/SKILL.md
    ├── agents/                         ← カスタムサブエージェント
    ├── commands/                       ← スラッシュコマンド
    ├── rules/                          ← ルール4本(coding-style/commit-pr/testing/ui)
    ├── output-styles/                  ← 応答スタイル定義
    ├── plugins/                        ← プラグイン管理
    └── agent-memory/                   ← subagent 永続メモリ
```

フォルダ構造は Claude Code 公式の標準構造（[code.claude.com/docs/ja/claude-directory](https://code.claude.com/docs/ja/claude-directory) 参照）に準拠。そのうえで `SPEC.md` / `TASK.md`、`.claude/hooks/`（Playwright スクリプト3本）、`.claude/rules/`（4ルール）、`project-init` スキルをこのテンプレ独自に同梱している。

> 注: `.claude/settings.json` の `enabledPlugins` は作者のマーケットプレイス（`fujimaru-claude-skills` 等）導入を前提に有効化している。別環境で複製して使う場合は、未登録のプラグインを各自で調整すること。

## 設計思想

- **静的テンプレ × 動的補完なし** — 対話スキルではなくファイル群で完結
- **チーム共有 vs 個人** — `.local.md` / `.local.json` で個人 override、git は除外
- **公式構造に準拠** — フォルダ構成は Claude Code 公式に従い、独自項目は `SPEC.md` / `TASK.md` のみに限定
- **project-init スキルを同梱** — 複製直後に `/project-init` で対話初期化できる

## カスタマイズ

このテンプレ自体を改善したい場合は本リポジトリ（Chou-enuhack/Project-Template）にPR/コミット。新プロジェクトを始めるたびに最新のベースが取れる。
