#!/usr/bin/env node
// CLIエントリポイント: M3(開発用確認UI、閲覧のみ)をローカルで起動する。
//
// 使い方: node scripts/serve-dev-viewer.mjs
//         (ポートは環境変数 PORT で上書き可能、既定4173)
//
// /input/(教材PDF・補正データ)は一切配信しない(src/devViewer/server.mjs参照)。

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "../src/devViewer/server.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;

const server = createServer({ rootDir });
server.listen(PORT, () => {
  console.log(`M3 dev viewer: http://localhost:${PORT}/`);
});
