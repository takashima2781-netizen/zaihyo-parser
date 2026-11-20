"""第0層（抽出）の補助スクリプト。教材の原文は含まない（汎用の抽出処理だけ）。

指定したPDF・ページについて、PyMuPDF で次を取り出し、JSON を標準出力へ書く。
意味の解釈は一切しない。

- 行（PyMuPDF の line）ごとの文字のかたまり（span）: 文字・位置・大きさ・書体・flags
- 図形（線・四角）: 位置・線の太さ・点線かどうか
- 画像の数・ページの大きさ

使い方: python pymupdf_layout.py <pdf> <pages>   （pages は "1,2,5" または "all"）

ページの透かし（会員番号・氏名）を除くのは呼び出し側（extract.mjs）の責務。
ここで出した JSON はそのまま保存しないこと。
"""

import json
import sys

import pymupdf


def parse_pages(spec, page_count):
    if spec == "all":
        return list(range(1, page_count + 1))
    pages = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            pages.extend(range(int(a), int(b) + 1))
        elif part:
            pages.append(int(part))
    for p in pages:
        if p < 1 or p > page_count:
            raise ValueError(f"page {p} is out of range (doc has {page_count} pages)")
    return pages


def rounded(values):
    return [round(v, 2) for v in values]


def extract_page(page):
    lines = []
    text_dict = page.get_text("dict")
    # 文字ごとの左右の位置（下線・〇の印を文字に当てるのに使う）。同じ並びの rawdict から取り、
    # 文字の数が span の文字と合うときだけ付ける（span の文字そのものは dict のまま）
    raw_dict = page.get_text("rawdict")
    for block_index, block in enumerate(text_dict["blocks"]):
        if block.get("type") != 0:
            continue
        raw_block = raw_dict["blocks"][block_index] if block_index < len(raw_dict["blocks"]) else {}
        for line_index, line in enumerate(block.get("lines", [])):
            raw_lines = raw_block.get("lines", [])
            raw_line = raw_lines[line_index] if line_index < len(raw_lines) else {}
            spans = []
            for span_index, span in enumerate(line.get("spans", [])):
                if span["text"] == "":
                    continue
                out = {
                    "text": span["text"],
                    "bbox": rounded(span["bbox"]),
                    "size": round(span["size"], 2),
                    "font": span["font"],
                    "flags": span["flags"],
                }
                raw_spans = raw_line.get("spans", [])
                raw_chars = raw_spans[span_index].get("chars", []) if span_index < len(raw_spans) else []
                if "".join(c["c"] for c in raw_chars) == span["text"]:
                    out["chars"] = [[round(c["bbox"][0], 1), round(c["bbox"][2], 1)] for c in raw_chars]
                spans.append(out)
            if spans:
                lines.append(
                    {
                        "block": block_index,
                        "bbox": rounded(line["bbox"]),
                        "dir": rounded(line.get("dir", (1, 0))),
                        "spans": spans,
                    }
                )

    drawings = []
    for d in page.get_drawings():
        dashes = d.get("dashes")
        drawings.append(
            {
                "rect": rounded(d["rect"]),
                "width": round(d["width"], 2) if d.get("width") is not None else None,
                "dashed": bool(dashes) and dashes not in ("[] 0", "[] 0.0"),
                "dashes": dashes,
                "kinds": sorted({item[0] for item in d.get("items", [])}),
            }
        )

    return {
        "width": round(page.rect.width, 2),
        "height": round(page.rect.height, 2),
        "imageCount": len(page.get_images()),
        "lines": lines,
        "drawings": drawings,
    }


def main():
    if len(sys.argv) != 3:
        print("usage: pymupdf_layout.py <pdf> <pages|all>", file=sys.stderr)
        sys.exit(2)
    pdf_path, spec = sys.argv[1], sys.argv[2]
    doc = pymupdf.open(pdf_path)
    pages = parse_pages(spec, doc.page_count)
    out = {
        "tool": "pymupdf",
        "toolVersion": pymupdf.__version__,
        "invocation": 'get_text("dict") + get_drawings()',
        "pageCount": doc.page_count,
        "pages": [dict(page=p, **extract_page(doc[p - 1])) for p in pages],
    }
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
