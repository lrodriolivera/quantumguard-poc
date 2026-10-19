"""
QuantumGuard AI - PKI Module
X.509 (RFC 9881 ML-DSA / RFC 9909 SLH-DSA) and CMS SignedData
(RFC 9882 ML-DSA / RFC 9814 SLH-DSA) via OpenSSL 3.5+.

Signing model: a fresh end-entity key is generated per signature, certified by
the QuantumGuard CA with the signer's identity, used once and destroyed. The
same key produces both the raw detached signature and the CMS SignedData, so
every artifact in a bundle is anchored to the CA through the certificate.
"""

import base64
import logging
import os
import re
import secrets
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

OPENSSL_BIN = os.environ.get("OPENSSL_BIN", "/opt/openssl/bin/openssl")
PKI_DIR = os.environ.get("PKI_DIR", "/app/pki")
PKI_COUNTRY = os.environ.get("PKI_COUNTRY", "PY")
PKI_ORG = "Post Cuantica Lab"
PKI_OU = "QuantumGuard AI"
SIGNER_CERT_DAYS = int(os.environ.get("SIGNER_CERT_DAYS", "365"))
DEFAULT_SIGNER_NAME = "QuantumGuard Document Signer"

ALGORITHM_ALIASES = {
    "Dilithium2": "ML-DSA-44",
    "Dilithium3": "ML-DSA-65",
    "Dilithium5": "ML-DSA-87",
}


@dataclass(frozen=True)
class AlgorithmSpec:
    openssl_name: str
    oid: str
    cms_digest: str
    public_key_size: int


# CMS digests: RFC 9882 §3.3 (SHA-512 for every ML-DSA level),
# RFC 9814 §4 (SHA-256 for 128-bit SLH-DSA, SHA-512 for 192/256-bit).
ALGORITHMS = {
    "ML-DSA-44": AlgorithmSpec("mldsa44", "2.16.840.1.101.3.4.3.17", "sha512", 1312),
    "ML-DSA-65": AlgorithmSpec("mldsa65", "2.16.840.1.101.3.4.3.18", "sha512", 1952),
    "ML-DSA-87": AlgorithmSpec("mldsa87", "2.16.840.1.101.3.4.3.19", "sha512", 2592),
    "SLH-DSA-SHA2-128s": AlgorithmSpec("SLH-DSA-SHA2-128s", "2.16.840.1.101.3.4.3.20", "sha256", 32),
    "SLH-DSA-SHA2-192s": AlgorithmSpec("SLH-DSA-SHA2-192s", "2.16.840.1.101.3.4.3.22", "sha512", 48),
    "SLH-DSA-SHA2-256s": AlgorithmSpec("SLH-DSA-SHA2-256s", "2.16.840.1.101.3.4.3.24", "sha512", 64),
}

# DER-encoded OID arc 2.16.840.1.101.3.4.3 (NIST sigAlgs); last byte selects the algorithm.
_NIST_SIGALG_PREFIX = bytes.fromhex("6086480165030403")
_OID_LAST_BYTE_TO_ALGORITHM = {
    int(spec.oid.rsplit(".", 1)[1]): name for name, spec in ALGORITHMS.items()
}


class PKIError(RuntimeError):
    """Server-side PKI failure (OpenSSL error, missing CA)."""


class CertificateError(ValueError):
    """Client-supplied certificate is malformed or unsupported."""


def canonical_algorithm(algorithm: str) -> str:
    canonical = ALGORITHM_ALIASES.get(algorithm, algorithm)
    if canonical not in ALGORITHMS:
        raise ValueError(f"Unsupported algorithm: {algorithm}")
    return canonical


def _run_openssl(*args, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run([OPENSSL_BIN, *args], capture_output=True, timeout=60)
    if check and result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise PKIError(f"OpenSSL {args[0]} failed: {stderr}")
    return result


def get_openssl_version() -> str:
    return _run_openssl("version").stdout.decode().strip()


def _ca_key_path() -> str:
    return os.path.join(PKI_DIR, "ca.key")


def _ca_cert_path() -> str:
    return os.path.join(PKI_DIR, "ca.crt")


def ca_exists() -> bool:
    return os.path.exists(_ca_key_path()) and os.path.exists(_ca_cert_path())


def _read_ca_cert() -> str:
    with open(_ca_cert_path(), "r") as f:
        return f.read()


def init_ca(algorithm: str = "ML-DSA-65", days: int = 3650, allow_create: bool = True) -> dict:
    """Load the CA, creating it only when explicitly allowed.

    In production a missing CA means a lost volume: generating a new one would
    silently orphan every certificate already issued, so we refuse instead.
    """
    if ca_exists():
        logger.info("CA already exists, loading existing certificate")
        return get_ca_info()

    if not allow_create:
        raise PKIError(
            f"CA not found in {PKI_DIR} and PKI_AUTO_INIT_CA is disabled. "
            "Restore ca.key/ca.crt from backup."
        )

    os.makedirs(PKI_DIR, exist_ok=True)
    spec = ALGORITHMS[canonical_algorithm(algorithm)]
    subject = f"/C={PKI_COUNTRY}/O={PKI_ORG}/OU={PKI_OU}/CN=QuantumGuard Post-Quantum CA"
    logger.warning(f"Generating NEW CA: algorithm={spec.openssl_name}, subject={subject}")

    _run_openssl(
        "req", "-x509",
        "-newkey", spec.openssl_name,
        "-keyout", _ca_key_path(),
        "-out", _ca_cert_path(),
        "-subj", subject,
        "-days", str(days),
        "-addext", "basicConstraints=critical,CA:TRUE",
        "-addext", "keyUsage=critical,keyCertSign,cRLSign",
        "-nodes",
    )
    os.chmod(_ca_key_path(), 0o600)
    return get_ca_info()


def get_ca_info() -> dict:
    if not ca_exists():
        return {"initialized": False}
    result = _run_openssl(
        "x509", "-in", _ca_cert_path(),
        "-noout", "-subject", "-issuer", "-dates", "-serial",
    )
    return {
        "initialized": True,
        "certificate_pem": _read_ca_cert(),
        "details": result.stdout.decode().strip(),
        "path": _ca_cert_path(),
    }


# ------------------------------------------------------------
# Identity sanitisation (values end up in an OpenSSL config file)
# ------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def sanitize_common_name(name: Optional[str]) -> str:
    cleaned = re.sub(r"[^\w .,'@\-]", "", name or "", flags=re.UNICODE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()[:64]
    return cleaned or DEFAULT_SIGNER_NAME


def sanitize_email(email: Optional[str]) -> Optional[str]:
    email = (email or "").strip()
    return email if len(email) <= 254 and _EMAIL_RE.match(email) else None


def _signer_openssl_config(common_name: str, email: Optional[str]) -> str:
    san = f"subjectAltName = email:{email}\n" if email else ""
    return (
        "[req]\n"
        "prompt = no\n"
        "distinguished_name = dn\n"
        "utf8 = yes\n"
        "string_mask = utf8only\n"
        "[dn]\n"
        f"C = {PKI_COUNTRY}\n"
        f"O = {PKI_ORG}\n"
        f"OU = {PKI_OU}\n"
        f"CN = {common_name}\n"
        "[ext]\n"
        "basicConstraints = critical,CA:FALSE\n"
        "keyUsage = critical,digitalSignature,nonRepudiation\n"
        "subjectKeyIdentifier = hash\n"
        "authorityKeyIdentifier = keyid,issuer\n"
        f"{san}"
    )


def _random_serial() -> str:
    # 127-bit positive serial (RFC 5280 §4.1.2.2: <= 20 octets, positive).
    return "0x" + format(secrets.randbits(127) | (1 << 126), "x")


# ------------------------------------------------------------
# Certificate parsing
# ------------------------------------------------------------

def _der_header(buf: bytes, pos: int) -> tuple:
    """Return (tag, content_start, content_length) of the DER element at pos."""
    tag = buf[pos]
    length = buf[pos + 1]
    pos += 2
    if length & 0x80:
        n = length & 0x7F
        length = int.from_bytes(buf[pos:pos + n], "big")
        pos += n
    return tag, pos, length


def parse_spki(spki_der: bytes) -> tuple:
    """Extract (canonical_algorithm, raw_public_key) from a PQC SubjectPublicKeyInfo."""
    try:
        tag, pos, _ = _der_header(spki_der, 0)
        if tag != 0x30:
            raise CertificateError("SPKI is not a SEQUENCE")
        tag, alg_start, alg_len = _der_header(spki_der, pos)
        if tag != 0x30:
            raise CertificateError("SPKI algorithm is not a SEQUENCE")
        tag, oid_start, oid_len = _der_header(spki_der, alg_start)
        oid = spki_der[oid_start:oid_start + oid_len]
        if tag != 0x06 or len(oid) != 9 or not oid.startswith(_NIST_SIGALG_PREFIX):
            raise CertificateError("Certificate key is not ML-DSA / SLH-DSA")
        algorithm = _OID_LAST_BYTE_TO_ALGORITHM.get(oid[-1])
        if not algorithm:
            raise CertificateError("Unsupported post-quantum key OID")
        tag, bits_start, bits_len = _der_header(spki_der, alg_start + alg_len)
        if tag != 0x03 or spki_der[bits_start] != 0x00:
            raise CertificateError("Malformed public key BIT STRING")
        raw = spki_der[bits_start + 1:bits_start + bits_len]
    except IndexError as e:
        raise CertificateError("Truncated SubjectPublicKeyInfo") from e
    if len(raw) != ALGORITHMS[algorithm].public_key_size:
        raise CertificateError("Public key size does not match its algorithm")
    return algorithm, raw


def _parse_openssl_date(value: str) -> datetime:
    return datetime.strptime(value.strip(), "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)


def certificate_info(cert_pem: str) -> dict:
    """Parse a PEM certificate into the fields verification needs."""
    if "-----BEGIN CERTIFICATE-----" not in (cert_pem or ""):
        raise CertificateError("Certificate must be PEM encoded")
    with tempfile.TemporaryDirectory() as tmpdir:
        cert_path = os.path.join(tmpdir, "cert.pem")
        spki_path = os.path.join(tmpdir, "spki.der")
        with open(cert_path, "w") as f:
            f.write(cert_pem)

        fields = _run_openssl(
            "x509", "-in", cert_path, "-noout",
            "-subject", "-issuer", "-serial", "-startdate", "-enddate",
            "-nameopt", "RFC2253,-esc_msb",
            "-ext", "basicConstraints,subjectAltName",
            check=False,
        )
        if fields.returncode != 0:
            raise CertificateError("Certificate could not be parsed")
        pub = _run_openssl("x509", "-in", cert_path, "-noout", "-pubkey", check=False)
        if pub.returncode != 0:
            raise CertificateError("Certificate public key could not be read")
        pub_pem = os.path.join(tmpdir, "pub.pem")
        with open(pub_pem, "wb") as f:
            f.write(pub.stdout)
        _run_openssl("pkey", "-pubin", "-in", pub_pem, "-outform", "DER", "-out", spki_path)
        with open(spki_path, "rb") as f:
            algorithm, raw_public_key = parse_spki(f.read())

    text = fields.stdout.decode("utf-8", errors="replace")
    values = dict(
        line.split("=", 1) for line in text.splitlines()
        if "=" in line and line.split("=", 1)[0] in ("subject", "issuer", "serial", "notBefore", "notAfter")
    )
    email_match = re.search(r"email:([^\s,]+)", text)
    cn_match = re.search(r"(?:^|,)CN=([^,]+)", values.get("subject", ""))
    return {
        "subject": values.get("subject", "").strip(),
        "issuer": values.get("issuer", "").strip(),
        "serial": values.get("serial", "").strip(),
        "common_name": cn_match.group(1) if cn_match else None,
        "email": email_match.group(1) if email_match else None,
        "not_before": _parse_openssl_date(values["notBefore"]),
        "not_after": _parse_openssl_date(values["notAfter"]),
        "is_ca": "CA:TRUE" in text,
        "algorithm": algorithm,
        "public_key_raw": raw_public_key,
    }


def verify_certificate_chain(cert_pem: str, at_time: Optional[datetime] = None) -> bool:
    """True if cert_pem was issued by the QuantumGuard CA.

    Without a trusted signing time we skip the validity window check; callers
    report the window separately so an expired signer cert does not invalidate
    signatures made while it was in force.
    """
    if not ca_exists():
        raise PKIError("CA not initialized")
    with tempfile.TemporaryDirectory() as tmpdir:
        cert_path = os.path.join(tmpdir, "cert.pem")
        with open(cert_path, "w") as f:
            f.write(cert_pem)
        time_args = ["-attime", str(int(at_time.timestamp()))] if at_time else ["-no_check_time"]
        result = _run_openssl(
            "verify", "-CAfile", _ca_cert_path(), *time_args, cert_path, check=False,
        )
        return result.returncode == 0


# ------------------------------------------------------------
# Signing
# ------------------------------------------------------------

def generate_signer_cert(algorithm: str, signer_name: str, signer_email: Optional[str]) -> dict:
    if not ca_exists():
        raise PKIError("CA not initialized")
    spec = ALGORITHMS[canonical_algorithm(algorithm)]
    common_name = sanitize_common_name(signer_name)
    email = sanitize_email(signer_email)

    with tempfile.TemporaryDirectory() as tmpdir:
        cfg_path = os.path.join(tmpdir, "signer.cnf")
        key_path = os.path.join(tmpdir, "signer.key")
        csr_path = os.path.join(tmpdir, "signer.csr")
        cert_path = os.path.join(tmpdir, "signer.crt")
        with open(cfg_path, "w", encoding="utf-8") as f:
            f.write(_signer_openssl_config(common_name, email))

        _run_openssl(
            "req", "-new", "-newkey", spec.openssl_name, "-nodes",
            "-keyout", key_path, "-out", csr_path, "-config", cfg_path,
        )
        _run_openssl(
            "x509", "-req", "-in", csr_path,
            "-CA", _ca_cert_path(), "-CAkey", _ca_key_path(),
            "-set_serial", _random_serial(),
            "-days", str(SIGNER_CERT_DAYS),
            "-extfile", cfg_path, "-extensions", "ext",
            "-out", cert_path,
        )
        with open(key_path, "r") as f:
            signer_key_pem = f.read()
        with open(cert_path, "r") as f:
            signer_cert_pem = f.read()

    return {"signer_key_pem": signer_key_pem, "signer_cert_pem": signer_cert_pem}


def _sign_with_key(document_bytes: bytes, signer_key_pem: str, signer_cert_pem: str, digest: str) -> tuple:
    """Return (raw_signature, cms_der) produced by the same signer key."""
    with tempfile.TemporaryDirectory() as tmpdir:
        doc_path = os.path.join(tmpdir, "document.bin")
        key_path = os.path.join(tmpdir, "signer.key")
        cert_path = os.path.join(tmpdir, "signer.crt")
        raw_path = os.path.join(tmpdir, "signature.sig")
        cms_path = os.path.join(tmpdir, "signature.p7s")
        with open(doc_path, "wb") as f:
            f.write(document_bytes)
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(signer_key_pem)
        with open(cert_path, "w") as f:
            f.write(signer_cert_pem)

        # Pure ML-DSA / SLH-DSA over the full message, empty context (FIPS 204/205).
        _run_openssl("pkeyutl", "-sign", "-rawin", "-inkey", key_path, "-in", doc_path, "-out", raw_path)
        _run_openssl(
            "cms", "-sign", "-binary", "-md", digest,
            "-in", doc_path, "-signer", cert_path, "-inkey", key_path,
            "-outform", "DER", "-out", cms_path,
        )
        with open(raw_path, "rb") as f:
            raw_signature = f.read()
        with open(cms_path, "rb") as f:
            cms_der = f.read()
    return raw_signature, cms_der


def sign_document_full(
    document_bytes: bytes,
    algorithm: str = "ML-DSA-44",
    signer_name: Optional[str] = None,
    signer_email: Optional[str] = None,
) -> dict:
    canonical = canonical_algorithm(algorithm)
    spec = ALGORITHMS[canonical]
    cert = generate_signer_cert(canonical, signer_name or DEFAULT_SIGNER_NAME, signer_email)
    raw_signature, cms_der = _sign_with_key(
        document_bytes, cert["signer_key_pem"], cert["signer_cert_pem"], spec.cms_digest,
    )
    # The signer private key goes out of scope here and is never persisted.
    info = certificate_info(cert["signer_cert_pem"])

    if not cms_verify_document(document_bytes, cms_der):
        raise PKIError("Self-check failed: freshly created CMS signature does not verify")

    logger.info(
        f"PKI signing complete: algorithm={canonical}, oid={spec.oid}, "
        f"raw={len(raw_signature)}B, cms={len(cms_der)}B, serial={info['serial']}"
    )
    return {
        "algorithm": canonical,
        "oid": spec.oid,
        "cms_digest": spec.cms_digest,
        "signature_raw": raw_signature,
        "public_key_raw": info["public_key_raw"],
        "cms_der": cms_der,
        "signer_cert_pem": cert["signer_cert_pem"],
        "ca_cert_pem": _read_ca_cert(),
        "certificate": info,
    }


def cms_verify_document(document_bytes: bytes, cms_der: bytes) -> bool:
    """Verify a detached CMS SignedData against the document and the QuantumGuard CA."""
    if not ca_exists():
        raise PKIError("CA not initialized")
    with tempfile.TemporaryDirectory() as tmpdir:
        doc_path = os.path.join(tmpdir, "document.bin")
        sig_path = os.path.join(tmpdir, "signature.p7s")
        with open(doc_path, "wb") as f:
            f.write(document_bytes)
        with open(sig_path, "wb") as f:
            f.write(cms_der)
        result = _run_openssl(
            "cms", "-verify", "-binary", "-inform", "DER",
            "-in", sig_path, "-content", doc_path,
            "-CAfile", _ca_cert_path(), "-purpose", "any", "-no_check_time",
            "-out", os.devnull,
            check=False,
        )
        return result.returncode == 0


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()
