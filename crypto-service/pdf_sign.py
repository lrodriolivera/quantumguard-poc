"""
QuantumGuard AI - Signatures embedded in the PDF itself.

Each signature is an incremental update holding one CMS SignedData with a
single SignerInfo, as ISO 32000 requires:
  1. QuantumGuard-PQC    ML-DSA / SLH-DSA
  2. QuantumGuard-ECDSA  ECDSA P-256 (hybrid only; covers revision 1 too)
  3. QuantumGuard-TSA    RFC 3161 document time-stamp (/DocTimeStamp)
pyHanko lays out the incremental updates; OpenSSL produces the CMS because
pyHanko's crypto backend has no ML-DSA.
"""

import io
import os
import re
from typing import List, Optional

from asn1crypto import cms
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign import fields
from pyhanko.sign.signers.pdf_byterange import DocumentTimestamp, SignatureObject
from pyhanko.sign.signers.pdf_signer import PdfCMSEmbedder, SigIOSetup, SigObjSetup

import pki
import tsa
from ca import run_openssl

_BYTERANGE_RE = re.compile(rb"/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]")
_TSTINFO_OID_DER = bytes.fromhex("060b2a864886f70d0109100104")
PLACEHOLDER_BYTES = 80000


def _embed(pdf: bytes, field_name: str, make_cms, timestamp: bool = False, name: Optional[str] = None) -> bytes:
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    fields.append_signature_field(writer, fields.SigFieldSpec(sig_field_name=field_name))
    embedder = PdfCMSEmbedder().write_cms(field_name=field_name, writer=writer)
    next(embedder)
    placeholder = (
        DocumentTimestamp(bytes_reserved=PLACEHOLDER_BYTES)
        if timestamp
        else SignatureObject(
            bytes_reserved=PLACEHOLDER_BYTES,
            subfilter=fields.SigSeedSubFilter.ADOBE_PKCS7_DETACHED,
            name=name,
        )
    )
    embedder.send(SigObjSetup(sig_placeholder=placeholder))
    prepared, output = embedder.send(SigIOSetup(md_algorithm="sha512", in_place=False))
    buf = output.getvalue()
    signed_bytes = buf[:prepared.reserved_region_start] + buf[prepared.reserved_region_end:]
    embedder.send(cms.ContentInfo.load(make_cms(signed_bytes)))
    return output.getvalue()


def _cms_single_signer(content: bytes, key: str, cert: str, issuer_cert: str, digest: str, tmpdir: str) -> bytes:
    doc = os.path.join(tmpdir, "pdf-range.bin")
    out = os.path.join(tmpdir, "pdf-sig.p7s")
    with open(doc, "wb") as f:
        f.write(content)
    run_openssl(
        "cms", "-sign", "-binary", "-cades", "-md", digest, "-in", doc,
        "-signer", cert, "-inkey", key, "-certfile", issuer_cert,
        "-outform", "DER", "-out", out,
    )
    with open(out, "rb") as f:
        return f.read()


def sign_pdf(pdf: bytes, signer_name: str, pq: dict, classical: Optional[dict], issuer_cert: str,
             digest: str, tmpdir: str, field_suffix: str = "") -> bytes:
    """pq / classical: {"key": path, "cert": path} of the ephemeral signer keys.

    field_suffix keeps signature field names unique when stacking several
    signers' signatures onto the same PDF via incremental updates (multi-signer
    envelopes) — otherwise the second signer's fields would collide with the
    first signer's.
    """
    pdf = _embed(
        pdf, f"QuantumGuard-PQC{field_suffix}",
        lambda data: _cms_single_signer(data, pq["key"], pq["cert"], issuer_cert, digest, tmpdir),
        name=signer_name,
    )
    if classical:
        pdf = _embed(
            pdf, f"QuantumGuard-ECDSA{field_suffix}",
            lambda data: _cms_single_signer(data, classical["key"], classical["cert"], issuer_cert, "sha256", tmpdir),
            name=signer_name,
        )
    return _embed(pdf, f"QuantumGuard-TSA{field_suffix}", lambda data: tsa.create_timestamp(data)["token"], timestamp=True)


def _signatures_in(pdf: bytes) -> List[dict]:
    found, seen = [], set()
    for match in _BYTERANGE_RE.finditer(pdf):
        a, b, c, d = (int(x) for x in match.groups())
        if (a, b, c, d) in seen or a != 0 or c + d > len(pdf) or pdf[a + b:a + b + 1] != b"<" or pdf[c - 1:c] != b">":
            continue
        seen.add((a, b, c, d))
        contents = bytes.fromhex(pdf[a + b + 1:c - 1].decode("ascii"))
        found.append({
            "byte_range": [a, b, c, d],
            "signed_content": pdf[a:a + b] + pdf[c:c + d],
            "contents": contents,
            "covers_whole_file": c + d == len(pdf),
            "is_timestamp": _TSTINFO_OID_DER in contents[:64],
        })
    return sorted(found, key=lambda s: s["byte_range"][2] + s["byte_range"][3])


def verify_pdf(pdf: bytes) -> dict:
    signatures = _signatures_in(pdf)
    if not signatures:
        return {"valid": False, "reason": "El PDF no contiene firmas QuantumGuard embebidas", "signatures": []}

    results, timestamp = [], None
    for sig in signatures:
        if sig["is_timestamp"]:
            ts = tsa.verify_timestamp(sig["contents"], sig["signed_content"])
            timestamp = ts
            results.append({"type": "timestamp", "valid": ts["valid"],
                            "gen_time": ts["gen_time"].isoformat() if ts.get("gen_time") else None})
            continue
        check = pki.cms_verify_document(sig["signed_content"], sig["contents"])
        signer = check["signers"][0] if check["signers"] else None
        results.append({
            "type": "signature",
            "valid": check["cms_valid"] and not check["revoked"],
            "revoked": check["revoked"],
            "algorithm": signer["algorithm"] if signer else None,
            "post_quantum": bool(signer and signer["post_quantum"]),
            "signer": {k: v for k, v in signer.items() if k != "certificate_pem"} if signer else None,
        })

    sig_results = [r for r in results if r["type"] == "signature"]
    pq_ok = any(r["valid"] and r["post_quantum"] for r in sig_results)
    all_ok = all(r["valid"] for r in results)
    untouched = signatures[-1]["covers_whole_file"]
    reason = None
    if not untouched:
        reason = "El PDF fue modificado después de la última firma"
    elif any(r.get("revoked") for r in sig_results):
        reason = "Una de las firmas fue revocada"
    elif not all_ok:
        reason = "Una de las firmas embebidas no es válida"
    elif not pq_ok:
        reason = "El PDF no contiene una firma post-cuántica válida"
    return {
        "valid": pq_ok and all_ok and untouched,
        "reason": reason,
        "hybrid": any(r["valid"] and not r["post_quantum"] for r in sig_results) and pq_ok,
        "timestamp": (timestamp["gen_time"].isoformat() if timestamp and timestamp["valid"] else None),
        "signatures": results,
    }
