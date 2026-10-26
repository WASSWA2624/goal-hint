"""Check editable documents and render internal QA PDFs with bundled Poppler."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import zipfile

from docx import Document
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdftoppm", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((ROOT / ".work/document-manifest.json").read_text(encoding="utf-8"))
    report = []
    def check(entry):
        path = ROOT / entry["path"]
        doc = Document(path)
        assert doc.paragraphs[0].style.name == "Title", path
        with zipfile.ZipFile(path) as z:
            assert b"documentProtection" not in z.read("word/settings.xml"), path
            if path.stem.startswith("11-"):
                assert b"w:hyperlink" in z.read("word/document.xml"), path
        qa = ROOT / ".work/qa" / path.stem
        pdf = qa / (path.stem + ".pdf")
        reader = PdfReader(pdf)
        assert len(reader.pages) == entry["planned_pages"], (path.name, len(reader.pages), entry["planned_pages"])
        for number, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            assert len(text.strip()) > 250, (path.name, number, "Unexpected near-empty page")
        # Remove only obsolete numbered page images after a document shrinks.
        for old_image in qa.glob("page-*.png"):
            suffix = old_image.stem.removeprefix("page-")
            if suffix.isdigit() and int(suffix) > len(reader.pages):
                old_image.unlink()
        subprocess.run([str(args.pdftoppm), "-scale-to", "1600", "-png", str(pdf), str(qa / "page")], check=True, capture_output=True)
        pages = sorted(qa.glob("page-*.png"))
        assert len(pages) == len(reader.pages), path
        for image in pages:
            with Image.open(image) as img:
                assert min(img.size) > 900, image
        return {"document": entry["path"], "pages": len(reader.pages), "editable": True, "page_images": len(pages)}
    with ThreadPoolExecutor(max_workers=4) as pool:
        report = list(pool.map(check, manifest))
    (ROOT / ".work/qa-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"documents": len(report), "pages": sum(item["pages"] for item in report), "checks": report}, indent=2))


if __name__ == "__main__":
    main()
