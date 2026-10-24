"""Fictional QA PDFs only. No real identity, bank, or university records."""
import argparse
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.utils import simpleSplit
from pypdf import PdfReader

KINDS = {
    "identity": "Fictional Identity Attachment",
    "secondary": "Fictional Secondary School Record",
    "senior-secondary": "Fictional Senior Secondary School Record",
    "material": "Synthetic Course Study Notes",
    "assignment": "Synthetic Assignment Submission",
    "certificate": "Fictional Achievement Certificate",
    "receipt": "Synthetic Manual Payment Receipt Template",
    "policy": "Synthetic Student Campus Policy",
}


def make_pdf(target, title, details=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    page = canvas.Canvas(str(target), pagesize=(595, 842))
    page.setTitle(title + " - SMOKE TEST ONLY")
    page.setAuthor("Falcon Synthetic QA Fixture")
    page.setFillColor(HexColor("#08234a"))
    page.rect(0, 718, 595, 124, fill=1, stroke=0)
    page.setFillColor(white)
    page.setFont("Helvetica-Bold", 19)
    page.drawString(42, 792, "FALCON SYNTHETIC QA DOCUMENT")
    page.setFont("Helvetica", 12)
    page.drawString(42, 758, title)
    lines = [
        "SMOKE TEST ONLY - NOT A REAL OR LEGALLY VALID DOCUMENT",
        "Fictional student: Nova Testlearner",
        "Fictional institution: Falcon Student Smoke Test University",
        "Academic year: 2026-2027; current semester: 2",
        "Program: FALCON SMOKE PROGRAM; section: S",
        "Purpose: testing the real Falcon upload, access, and workflow features.",
        "No real person, identity verification, bank transfer, or institution is represented.",
    ]
    if details:
        lines += [f"{key}: {value}" for key, value in details.items()]
    else:
        lines += ["Sample work: explain how courses, enrollments, and marks are related.",
                  "Attachments intentionally use fictional content for QA, not official evidence."]
    y = 670
    for index, line in enumerate(lines):
        page.setFont("Helvetica-Bold" if index == 0 else "Helvetica", 10)
        page.setFillColor(HexColor("#08234a"))
        for wrapped in simpleSplit(line, "Helvetica", 10, 510):
            page.drawString(42, y, wrapped)
            y -= 19
        y -= 5
    page.setStrokeColor(HexColor("#d6b65d"))
    page.line(42, 68, 553, 68)
    page.setFont("Helvetica", 9)
    page.drawString(42, 48, "Synthetic test fixture | No real credentials or personal records | Page 1 of 1")
    page.save()
    reader = PdfReader(str(target))
    if len(reader.pages) != 1 or "SMOKE TEST ONLY" not in reader.pages[0].extract_text():
        raise ValueError("Fixture PDF validation failed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt-json")
    args = parser.parse_args()
    output = Path(__file__).parent / "output" / "pdf"
    if args.receipt_json:
        metadata = json.loads(args.receipt_json)
        transaction = metadata["transactionId"]
        if not all(char in "0123456789abcdef-" for char in transaction):
            raise ValueError("Invalid receipt transaction UUID")
        make_pdf(output / f"falcon-smoke-receipt-{transaction}.pdf", "Synthetic Cleared Cheque Receipt", metadata)
    else:
        for kind, title in KINDS.items():
            make_pdf(output / f"falcon-smoke-{kind}.pdf", title)
    print("Fictional PDF fixtures generated and structurally validated; no credentials included.")
