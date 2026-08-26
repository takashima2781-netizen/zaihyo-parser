import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectThemeHeading,
  detectTopicHeading,
} from "../../src/parser/structureRecognition.mjs";

// 架空のテーマ名・論点名を使う(教材原文は使わない、CLAUDE.md原則2・7)。

test("detectThemeHeading: 番号とタイトルが同一行のケース", () => {
  const page = " テーマ９９  架空引当金の学習\n\n重要度 ★★★\n本文...";
  const result = detectThemeHeading(page);
  assert.deepEqual(result, {
    nodeKind: "theme",
    number: "99",
    titleRaw: "架空引当金の学習",
  });
});

test("detectThemeHeading: 番号とタイトルが別行のケース", () => {
  const page = "テーマ９９\n架空引当金の学習\n重要度 ★★\n本文...";
  const result = detectThemeHeading(page);
  assert.deepEqual(result, {
    nodeKind: "theme",
    number: "99",
    titleRaw: "架空引当金の学習",
  });
});

test("detectThemeHeading: 見出しが無いページはnull", () => {
  assert.equal(detectThemeHeading("架空の地の文だけのページ"), null);
});

test("detectTopicHeading: 全角ハイフンの表記ゆれを吸収する", () => {
  const page = "架空の見出し\n９９－１　架空論点タイトル\n本文...";
  const result = detectTopicHeading(page);
  assert.deepEqual(result, {
    nodeKind: "topic",
    number: "99-1",
    titleRaw: "架空論点タイトル",
  });
});

test("detectTopicHeading: 半角ハイフンの表記ゆれを吸収する", () => {
  const page = "架空の見出し\n99-1 架空論点タイトル\n本文...";
  const result = detectTopicHeading(page);
  assert.deepEqual(result, {
    nodeKind: "topic",
    number: "99-1",
    titleRaw: "架空論点タイトル",
  });
});

test("detectTopicHeading: 目次一覧ページ(「このテーマの学習内容」を含む)は誤検出しない", () => {
  const page =
    "テーマ９９ 架空引当金\nこのテーマの学習内容\n９９－１\n架空論点タイトル\n";
  assert.equal(detectTopicHeading(page), null);
});
