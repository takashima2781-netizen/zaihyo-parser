"""[1] Extraction の実行補助スクリプト。

このファイルは教材原文を一切含まない(汎用的な抽出ロジックのみ)。
pdftotext(poppler)がこの実行環境ではCJKのCMapデータ(Adobe-Japan1)を
欠いており日本語を抽出できないため、代替としてPyMuPDFを使用する
(`planning/m1_implementation_report.md`参照、正式な設計変更ではなく
環境起因のツール差し替え)。

指定したPDFファイル・ページ番号のリストに対し、`get_text(sort=True)`
(座標に基づく読み順ソート)でテキストを抽出し、ページごとの結果を
JSON配列としてstdoutへ出力する。意味解釈は一切行わない。
"""

import json
import sys

import pymupdf


def extract_pages(pdf_path, page_numbers):
    doc = pymupdf.open(pdf_path)
    tool_version = pymupdf.__version__
    invocation = "get_text(sort=True)"

    results = []
    for page_number in page_numbers:
        if page_number < 1 or page_number > doc.page_count:
            raise ValueError(
                f"page {page_number} is out of range (doc has {doc.page_count} pages)"
            )
        page = doc[page_number - 1]
        text = page.get_text(sort=True)
        results.append(
            {
                "page": page_number,
                "text": text,
                "tool": "pymupdf",
                "toolVersion": tool_version,
                "invocation": invocation,
            }
        )
    return results


def main():
    # Windows環境ではsys.stdoutの既定エンコーディングがcp932等になる場合があり、
    # 教材原文に含まれる記号(丸囲み文字等)でUnicodeEncodeErrorが起きうるため、
    # 明示的にUTF-8へ切り替える。
    sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) < 3:
        print(
            "usage: pymupdf_extract.py <pdf_path> <page_number>[,<page_number>...]",
            file=sys.stderr,
        )
        sys.exit(2)

    pdf_path = sys.argv[1]
    page_numbers = [int(p) for p in sys.argv[2].split(",")]

    results = extract_pages(pdf_path, page_numbers)
    json.dump(results, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
