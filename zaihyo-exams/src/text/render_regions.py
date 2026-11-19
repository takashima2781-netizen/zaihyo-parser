"""テキストの図・表の範囲を画像（JPEG）にする補助スクリプト。教材の原文は含まない。

使い方: python render_regions.py <pdf> <jobs.json> <scale> <quality>
  jobs.json: [{"id": "...", "page": 23, "rect": [x0, y0, x1, y1]}, ...]
出力（標準出力）: [{"id": "...", "width": W, "height": H, "jpegBase64": "..."}, ...]

透かし（会員番号・氏名）が入った行の範囲は、画像にする前に白く塗りつぶす。
塗りつぶしはメモリ上のページにだけ行い、PDFファイルは書き換えない。
"""

import base64
import json
import re
import sys

import pymupdf

WATERMARK = re.compile(r"会員番\s*[：:]|氏\s*名\s*[：:]")


def watermark_rects(page):
    rects = []
    blocks = page.get_text("dict")["blocks"]
    for block in blocks:
        if block.get("type") != 0:
            continue
        text = "".join(s["text"] for line in block.get("lines", []) for s in line.get("spans", []))
        if WATERMARK.search(text):
            rects.append(pymupdf.Rect(block["bbox"]))
    return rects


def main():
    pdf_path, jobs_path, scale, quality = sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4])
    with open(jobs_path, encoding="utf-8") as f:
        jobs = json.load(f)
    doc = pymupdf.open(pdf_path)
    masked = set()
    out = []
    for job in jobs:
        page = doc[job["page"] - 1]
        if job["page"] not in masked:
            for r in watermark_rects(page):
                page.draw_rect(r + (-2, -2, 2, 2), color=(1, 1, 1), fill=(1, 1, 1), overlay=True)
            masked.add(job["page"])
        clip = pymupdf.Rect(job["rect"]) + (-3, -3, 3, 3)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip)
        data = pix.tobytes("jpeg", jpg_quality=quality)
        out.append({"id": job["id"], "width": pix.width, "height": pix.height, "jpegBase64": base64.b64encode(data).decode("ascii")})
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
