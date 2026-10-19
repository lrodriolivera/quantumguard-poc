"""
QuantumGuard AI - RFC 3161 Time-Stamp Authority signed with ML-DSA-65.

OpenSSL's `ts` module signs through PKCS#7, which has no ML-DSA support, so
the TSTInfo is encoded here and wrapped by `openssl cms -sign -cades` with
eContentType id-ct-TSTInfo: that is exactly a TimeStampToken (RFC 3161 §2.4.2)
carrying the ESSCertIDv2 signing-certificate attribute required by RFC 5816.
"""

import hashlib
import os
import secrets
import tempfile
from datetime import datetime, timezone
from typing import Optional

import ca as ca_module
import der
from ca import PASSIN, PKIError, run_openssl

ID_CT_TSTINFO = "1.2.840.113549.1.9.16.1.4"
SHA512_OID = "2.16.840.1.101.3.4.2.3"
# 2.25.<UUID> arc (ITU-T X.667): a policy identifier that needs no registration.
TSA_POLICY_OID = "2.25.226345021373212837925004958349616582513"


def _tst_info(message_imprint: bytes, serial: int, gen_time: datetime) -> bytes:
    return der.sequence(
        der.integer(1),
        der.oid(TSA_POLICY_OID),
        der.sequence(der.sequence(der.oid(SHA512_OID)), der.octet_string(message_imprint)),
        der.integer(serial),
        der.generalized_time(gen_time.strftime("%Y%m%d%H%M%SZ")),
        der.sequence(der.integer(1)),  # accuracy: 1 second
    )


def create_timestamp(data: bytes) -> dict:
    """Time-stamp the SHA-512 of data. Returns the DER TimeStampToken and its fields."""
    paths = ca_module.tsa_paths()
    if not os.path.exists(paths["key"]):
        raise PKIError("TSA not initialized")
    gen_time = datetime.now(timezone.utc).replace(microsecond=0)
    serial = secrets.randbits(127) | (1 << 126)
    tst = _tst_info(hashlib.sha512(data).digest(), serial, gen_time)
    with tempfile.TemporaryDirectory() as tmpdir:
        tst_path = os.path.join(tmpdir, "tstinfo.der")
        token_path = os.path.join(tmpdir, "token.der")
        with open(tst_path, "wb") as f:
            f.write(tst)
        run_openssl(
            "cms", "-sign", "-binary", "-nodetach", "-cades", "-md", "sha512",
            "-econtent_type", ID_CT_TSTINFO,
            "-in", tst_path, "-signer", paths["cert"], "-inkey", paths["key"], *PASSIN,
            "-outform", "DER", "-out", token_path,
            env_passphrase=True,
        )
        with open(token_path, "rb") as f:
            token = f.read()
    return {"token": token, "gen_time": gen_time, "serial": format(serial, "X")}


def timestamp_response(token: bytes) -> bytes:
    """Wrap a token in a granted TimeStampResp (the .tsr format OpenSSL prints)."""
    return der.sequence(der.sequence(der.integer(0)), token)


def parse_tst_info(tst: bytes) -> dict:
    tag, start, length = der.header(tst, 0)
    items = der.children(tst, start, length)
    if tag != 0x30 or len(items) < 5 or items[0] != (0x02, b"\x01"):
        raise der.DERError("not a TSTInfo v1")
    imprint_items = der.children(items[2][1], 0, len(items[2][1]))
    hash_alg = der.children(imprint_items[0][1], 0, len(imprint_items[0][1]))[0][1]
    gen_time = datetime.strptime(items[4][1].decode("ascii"), "%Y%m%d%H%M%SZ").replace(tzinfo=timezone.utc)
    return {
        "policy": der.decode_oid(items[1][1]),
        "hash_algorithm": der.decode_oid(hash_alg),
        "message_imprint": imprint_items[1][1],
        "serial": items[3][1].hex().upper().lstrip("0") or "0",
        "gen_time": gen_time,
    }


def verify_timestamp(token: bytes, data: bytes) -> dict:
    """Verify a TimeStampToken: TSA signature and chain, EKU timeStamping, and imprint over data."""
    anchors = ca_module.trust_anchors_path()
    with tempfile.TemporaryDirectory() as tmpdir:
        token_path = os.path.join(tmpdir, "token.der")
        out_path = os.path.join(tmpdir, "tstinfo.der")
        with open(token_path, "wb") as f:
            f.write(token)
        result = run_openssl(
            "cms", "-verify", "-binary", "-inform", "DER", "-in", token_path,
            "-CAfile", anchors, "-purpose", "timestampsign", "-no_check_time",
            "-out", out_path,
            check=False,
        )
        if result.returncode != 0 or not os.path.exists(out_path):
            return {"valid": False, "gen_time": None, "reason": "TSA signature or certificate is not trusted"}
        with open(out_path, "rb") as f:
            tst = f.read()
    try:
        info = parse_tst_info(tst)
    except (der.DERError, ValueError, IndexError):
        return {"valid": False, "gen_time": None, "reason": "Malformed TSTInfo"}
    if info["hash_algorithm"] != SHA512_OID:
        return {"valid": False, "gen_time": info["gen_time"], "reason": "Unsupported imprint algorithm"}
    imprint_ok = info["message_imprint"] == hashlib.sha512(data).digest()
    return {
        "valid": imprint_ok,
        "gen_time": info["gen_time"],
        "serial": info["serial"],
        "policy": info["policy"],
        "reason": None if imprint_ok else "The time-stamp does not cover this signature",
    }


def maybe_verify_timestamp(token: Optional[bytes], data: bytes) -> Optional[dict]:
    return verify_timestamp(token, data) if token else None
