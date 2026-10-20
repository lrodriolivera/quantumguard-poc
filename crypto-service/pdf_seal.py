"""
QuantumGuard AI - PDF Visual Seal
Adds a post-quantum signature visual seal to PDF documents.
The original PDF is preserved intact for CAdES verification.
"""

import io
import logging
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
import qrcode

logger = logging.getLogger(__name__)


def _generate_qr(data: str, size: int = 150) -> io.BytesIO:
    """Generate a QR code image as bytes."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def _create_seal_overlay(
    page_width: float,
    page_height: float,
    algorithm: str,
    algorithm_display: str,
    document_hash: str,
    signed_at: str,
    valid_until: str,
    signature_id: str,
    oid: str = "",
    nist_standard: str = "",
    verify_base_url: str = "https://app.postcuantica.io/verificar",
) -> io.BytesIO:
    """
    Create a PDF page with only the visual seal overlay.
    This will be merged on top of the last page of the original PDF.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_width, page_height))

    # Seal dimensions and position (bottom-right)
    seal_w = 190 * mm
    seal_h = 58 * mm
    margin = 10 * mm
    x = page_width - seal_w - margin
    y = margin

    # Background with rounded rectangle
    c.saveState()
    c.setFillColor(HexColor("#F0F9FF"))
    c.setStrokeColor(HexColor("#0369A1"))
    c.setLineWidth(1.5)
    c.roundRect(x, y, seal_w, seal_h, 6, fill=1, stroke=1)

    # Top accent bar
    c.setFillColor(HexColor("#0369A1"))
    c.roundRect(x, y + seal_h - 14 * mm, seal_w, 14 * mm, 6, fill=1, stroke=0)
    # Cover bottom corners of accent bar
    c.rect(x, y + seal_h - 14 * mm, seal_w, 8 * mm, fill=1, stroke=0)

    # Title in accent bar
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 5 * mm, y + seal_h - 8 * mm, "FIRMADO DIGITALMENTE - POST-CUANTICO")
    c.setFont("Helvetica", 7)
    c.drawString(x + 5 * mm, y + seal_h - 12 * mm, "QuantumGuard AI - Post Cuantica Lab")

    # Content area
    c.setFillColor(HexColor("#1E3A5F"))
    line_y = y + seal_h - 19 * mm
    line_h = 3.2 * mm
    font_size = 6.5

    def draw_field(label, value, bold_value=False):
        nonlocal line_y
        c.setFont("Helvetica-Bold", font_size)
        c.drawString(x + 5 * mm, line_y, label)
        c.setFont("Helvetica-Bold" if bold_value else "Helvetica", font_size)
        c.drawString(x + 32 * mm, line_y, str(value))
        line_y -= line_h

    draw_field("Algoritmo:", algorithm_display, bold_value=True)
    draw_field("Estandar:", nist_standard or "NIST FIPS 204/205")
    if oid:
        draw_field("OID:", oid)
    draw_field("Hash SHA-3-256:", document_hash[:32] + "...")
    draw_field("Firmado:", _format_date(signed_at))
    draw_field("Valido hasta:", _format_date(valid_until))
    draw_field("ID Firma:", signature_id[:16] + "...")

    # Quantum-safe badge
    c.setFillColor(HexColor("#059669"))
    badge_x = x + seal_w - 42 * mm
    badge_y = y + 3 * mm
    c.roundRect(badge_x, badge_y, 37 * mm, 6 * mm, 3, fill=1, stroke=0)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 6)
    c.drawCentredString(badge_x + 18.5 * mm, badge_y + 2 * mm, "QUANTUM-SAFE | 50+ YEARS")

    # QR Code
    qr_data = f"{verify_base_url}/{signature_id}?hash={document_hash[:16]}"
    qr_buf = _generate_qr(qr_data, size=100)
    qr_img = ImageReader(qr_buf)
    qr_size = 15 * mm
    c.drawImage(qr_img, x + seal_w - qr_size - 4 * mm, y + 10 * mm, qr_size, qr_size)

    # QR label
    c.setFillColor(HexColor("#64748B"))
    c.setFont("Helvetica", 4.5)
    c.drawCentredString(x + seal_w - qr_size / 2 - 4 * mm, y + 9 * mm, "Verificar firma")

    c.restoreState()
    c.save()
    buf.seek(0)
    return buf


def _format_date(date_str: str) -> str:
    """Format an ISO date string to a readable format."""
    try:
        if isinstance(date_str, datetime):
            return date_str.strftime("%d/%m/%Y %H:%M UTC")
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M UTC")
    except Exception:
        return str(date_str)[:19]


def add_seal_to_pdf(
    pdf_bytes: bytes,
    algorithm: str,
    algorithm_display: str,
    document_hash: str,
    signed_at: str,
    valid_until: str,
    signature_id: str,
    oid: str = "",
    nist_standard: str = "",
    verify_base_url: str = "https://app.postcuantica.io/verificar",
) -> bytes:
    """
    Add a visual quantum signature seal to a PDF document.
    Returns the sealed PDF as bytes.
    The original PDF is NOT modified — this creates a new copy.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()

        # Copy all pages
        for i, page in enumerate(reader.pages):
            if i == len(reader.pages) - 1:
                # Add seal overlay to the last page
                page_width = float(page.mediabox.width)
                page_height = float(page.mediabox.height)

                seal_pdf = _create_seal_overlay(
                    page_width=page_width,
                    page_height=page_height,
                    algorithm=algorithm,
                    algorithm_display=algorithm_display,
                    document_hash=document_hash,
                    signed_at=signed_at,
                    valid_until=valid_until,
                    signature_id=signature_id,
                    oid=oid,
                    nist_standard=nist_standard,
                    verify_base_url=verify_base_url,
                )
                seal_reader = PdfReader(seal_pdf)
                page.merge_page(seal_reader.pages[0])

            writer.add_page(page)

        # Copy metadata
        if reader.metadata:
            writer.add_metadata(reader.metadata)

        output = io.BytesIO()
        writer.write(output)
        sealed_bytes = output.getvalue()

        logger.info(f"PDF seal added: {len(pdf_bytes)} -> {len(sealed_bytes)} bytes")
        return sealed_bytes

    except Exception as e:
        logger.error(f"Failed to add PDF seal: {e}")
        # Return original if seal fails
        return pdf_bytes
