#!/bin/sh
# 学習アプリの問題データ（3科目）を Google ドライブの1つのフォルダへ、決まった名前で上書きコピーする。
# iPhone ではこのフォルダから科目ごとに「インポート → 問題データ」で選ぶ。
# 置き場所は環境変数 STUDY_DATA_DRIVE_DIR で変えられる（既定: マイドライブ/002_財表アプリ/問題データ）。
# 問題データは有償教材から作ったものなので、git には入れない（このスクリプトはコピーするだけ）。
set -eu

cd "$(dirname "$0")/.."

if [ -z "${STUDY_DATA_DRIVE_DIR:-}" ]; then
  for d in "$HOME"/Library/CloudStorage/GoogleDrive-*/マイドライブ/002_財表アプリ; do
    [ -d "$d" ] && STUDY_DATA_DRIVE_DIR="$d/問題データ" && break
  done
fi
if [ -z "${STUDY_DATA_DRIVE_DIR:-}" ]; then
  echo "Google ドライブの「002_財表アプリ」フォルダが見つかりません。STUDY_DATA_DRIVE_DIR で置き場所を指定してください。" >&2
  exit 1
fi
mkdir -p "$STUDY_DATA_DRIVE_DIR"

copy() {
  if [ -f "$1" ]; then
    cp "$1" "$STUDY_DATA_DRIVE_DIR/$2"
    echo "コピー: $2（$(du -h "$1" | cut -f1)）"
  else
    echo "見つからないので飛ばします: $1" >&2
  fi
}

copy html-v2/data/exercise_view_full.json   財表.json
copy html-v2/data/shohizei/exercise_view.json 消費税.json
copy html-v2/data/boki/exercise_view.json     簿記論.json

echo "置き場所: $STUDY_DATA_DRIVE_DIR"
