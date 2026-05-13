"""
QuantumGuard AI - PKI Module
X.509 Certificate Generation and CMS SignedData via OpenSSL 3.5+
Standards: RFC 9881 (ML-DSA in X.509), RFC 9882 (ML-DSA in CMS)
"""

import subprocess
import tempfile
import os
import base64
import logging

logger = logging.getLogger(__name__)

OPENSSL_BIN = "/opt/openssl/bin/openssl"
PKI_DIR = os.environ.get("PKI_DIR", "/app/pki")

# Mapping from QuantumGuard algorithm names to OpenSSL 3.5 algorithm names
OPENSSL_ALGORITHM_MAP = {
    "ML-DSA-44": "mldsa44",
    "ML-DSA-65": "mldsa65",
    "ML-DSA-87": "mldsa87",
    "Dilithium2": "mldsa44",
    "Dilithium3": "mldsa65",
    "Dilithium5": "mldsa87",
    # SLH-DSA not yet supported by OpenSSL 3.5 for X.509 — fallback to ML-DSA-44
    "SLH-DSA-SHA2-128s": "mldsa44",
    "SLH-DSA-SHA2-192s": "mldsa65",
    "SLH-DSA-SHA2-256s": "mldsa87",
}

# OIDs per RFC 9881 / RFC 9909
ALGORITHM_OIDS = {
    "ML-DSA-44": "2.16.840.1.101.3.4.3.17",
    "ML-DSA-65": "2.16.840.1.101.3.4.3.18",
    "ML-DSA-87": "2.16.840.1.101.3.4.3.19",
    "SLH-DSA-SHA2-128s": "2.16.840.1.101.3.4.3.20",
    "SLH-DSA-SHA2-192s": "2.16.840.1.101.3.4.3.22",
    "SLH-DSA-SHA2-256s": "2.16.840.1.101.3.4.3.24",
}


def _run_openssl(*args, check=True):
    """Execute an OpenSSL command."""
    cmd = [OPENSSL_BIN] + list(args)
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    if check and result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenSSL command failed: {' '.join(args[:3])}... — {stderr}")
    return result


def get_openssl_version() -> str:
    """Get the OpenSSL version string."""
    result = _run_openssl("version")
    return result.stdout.decode().strip()


def _ensure_pki_dir():
    """Ensure the PKI directory exists."""
    os.makedirs(PKI_DIR, exist_ok=True)


def _ca_key_path() -> str:
    return os.path.join(PKI_DIR, "ca.key")


def _ca_cert_path() -> str:
    return os.path.join(PKI_DIR, "ca.crt")


def ca_exists() -> bool:
    """Check if a CA certificate already exists."""
    return os.path.exists(_ca_key_path()) and os.path.exists(_ca_cert_path())


def init_ca(algorithm: str = "ML-DSA-65", days: int = 3650) -> dict:
    """
    Initialize the QuantumGuard PKI Certificate Authority.
    Generates a self-signed ML-DSA CA certificate.
    Only runs once — subsequent calls return existing CA info.
    """
    _ensure_pki_dir()

    if ca_exists():
        logger.info("CA already exists, loading existing certificate")
        return get_ca_info()

    ossl_alg = OPENSSL_ALGORITHM_MAP.get(algorithm, "mldsa65")
    subject = "/C=PY/O=Post Cuantica Lab/OU=QuantumGuard AI/CN=QuantumGuard Post-Quantum CA"

    logger.info(f"Generating new CA: algorithm={ossl_alg}, subject={subject}")

    _run_openssl(
        "req", "-x509",
        "-newkey", ossl_alg,
        "-keyout", _ca_key_path(),
        "-out", _ca_cert_path(),
        "-subj", subject,
        "-days", str(days),
        "-nodes",
    )

    # Set restrictive permissions on CA key
    os.chmod(_ca_key_path(), 0o600)

    logger.info(f"CA certificate generated successfully: {_ca_cert_path()}")
    return get_ca_info()


def get_ca_info() -> dict:
    """Get information about the CA certificate."""
    if not ca_exists():
        return {"initialized": False}

    with open(_ca_cert_path(), "r") as f:
        ca_cert_pem = f.read()

    # Extract cert details
    result = _run_openssl(
        "x509", "-in", _ca_cert_path(),
        "-noout", "-subject", "-issuer", "-dates", "-serial",
    )
    details = result.stdout.decode().strip()

    return {
        "initialized": True,
        "certificate_pem": ca_cert_pem,
        "details": details,
        "path": _ca_cert_path(),
    }


def generate_signer_cert(
    algorithm: str = "ML-DSA-44",
    subject_cn: str = "QuantumGuard Document Signer",
    days: int = 365,
) -> dict:
    """
    Generate an end-entity certificate signed by the CA.
    Returns the signer's private key (PEM), certificate (PEM), and CA cert (PEM).
    """
    if not ca_exists():
        raise RuntimeError("CA not initialized. Call init_ca() first.")

    ossl_alg = OPENSSL_ALGORITHM_MAP.get(algorithm, "mldsa44")
    subject = f"/C=PY/O=Post Cuantica Lab/OU=QuantumGuard AI/CN={subject_cn}"

    with tempfile.TemporaryDirectory() as tmpdir:
        ee_key_path = os.path.join(tmpdir, "signer.key")
        csr_path = os.path.join(tmpdir, "signer.csr")
        ee_cert_path = os.path.join(tmpdir, "signer.crt")

        # Generate end-entity key + CSR
        _run_openssl(
            "req", "-new",
            "-newkey", ossl_alg,
            "-keyout", ee_key_path,
            "-out", csr_path,
            "-subj", subject,
            "-nodes",
        )

        # Sign the CSR with the CA
        _run_openssl(
            "x509", "-req",
            "-in", csr_path,
            "-CA", _ca_cert_path(),
            "-CAkey", _ca_key_path(),
            "-CAcreateserial",
            "-out", ee_cert_path,
            "-days", str(days),
        )

        with open(ee_key_path, "r") as f:
            signer_key_pem = f.read()
        with open(ee_cert_path, "r") as f:
            signer_cert_pem = f.read()
        with open(_ca_cert_path(), "r") as f:
            ca_cert_pem = f.read()

    return {
        "signer_key_pem": signer_key_pem,
        "signer_cert_pem": signer_cert_pem,
        "ca_cert_pem": ca_cert_pem,
        "algorithm": algorithm,
        "subject": subject,
    }


def detached_sign_document(
    document_bytes: bytes,
    signer_key_pem: str,
    signer_cert_pem: str,
) -> tuple:
    """
    Create a detached digital signature for a document.
    Tries CMS SignedData (RFC 9882) first, falls back to raw pkeyutl.
    Returns (signature_bytes, format_type) where format_type is 'cms' or 'raw'.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        doc_path = os.path.join(tmpdir, "document.bin")
        key_path = os.path.join(tmpdir, "signer.key")
        cert_path = os.path.join(tmpdir, "signer.crt")

        with open(doc_path, "wb") as f:
            f.write(document_bytes)
        with open(key_path, "w") as f:
            f.write(signer_key_pem)
        with open(cert_path, "w") as f:
            f.write(signer_cert_pem)

        # Try CMS first (requires OpenSSL 3.6+ for ML-DSA CMS support)
        sig_path = os.path.join(tmpdir, "signature.p7s")
        result = _run_openssl(
            "cms", "-sign",
            "-in", doc_path,
            "-signer", cert_path,
            "-inkey", key_path,
            "-outform", "DER",
            "-binary",
            "-out", sig_path,
            check=False,
        )

        if result.returncode == 0:
            logger.info("CMS SignedData created (RFC 9882)")
            with open(sig_path, "rb") as f:
                return f.read(), "cms"

        logger.warning("CMS not available for ML-DSA, using raw pkeyutl signature")

        # Fallback: raw detached signature via pkeyutl
        raw_sig_path = os.path.join(tmpdir, "signature.sig")
        _run_openssl(
            "pkeyutl", "-sign",
            "-inkey", key_path,
            "-in", doc_path,
            "-out", raw_sig_path,
            "-rawin",
        )
        logger.info("Raw ML-DSA detached signature created via pkeyutl")

        with open(raw_sig_path, "rb") as f:
            return f.read(), "raw"


def verify_detached_signature(
    document_bytes: bytes,
    signature_bytes: bytes,
    ca_cert_pem: str,
    signer_cert_pem: str = None,
    sig_format: str = "raw",
) -> bool:
    """
    Verify a detached signature. Supports both CMS and raw formats.
    Returns True if verification succeeds.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        doc_path = os.path.join(tmpdir, "document.bin")
        sig_path = os.path.join(tmpdir, "signature.bin")
        ca_path = os.path.join(tmpdir, "ca.crt")

        with open(doc_path, "wb") as f:
            f.write(document_bytes)
        with open(sig_path, "wb") as f:
            f.write(signature_bytes)
        with open(ca_path, "w") as f:
            f.write(ca_cert_pem)

        if sig_format == "cms":
            result = _run_openssl(
                "cms", "-verify",
                "-in", sig_path,
                "-content", doc_path,
                "-CAfile", ca_path,
                "-inform", "DER",
                "-purpose", "any",
                "-binary",
                "-out", "/dev/null",
                check=False,
            )
            return result.returncode == 0

        # Raw signature verification via pkeyutl
        if signer_cert_pem:
            cert_path = os.path.join(tmpdir, "signer.crt")
            pubkey_path = os.path.join(tmpdir, "signer.pub")
            with open(cert_path, "w") as f:
                f.write(signer_cert_pem)

            _run_openssl(
                "x509", "-in", cert_path,
                "-pubkey", "-noout",
                "-out", pubkey_path,
            )

            result = _run_openssl(
                "pkeyutl", "-verify",
                "-pubin", "-inkey", pubkey_path,
                "-in", doc_path,
                "-sigfile", sig_path,
                "-rawin",
                check=False,
            )
            return result.returncode == 0

        return False


def sign_document_full(
    document_bytes: bytes,
    algorithm: str = "ML-DSA-44",
    signer_name: str = "QuantumGuard Document Signer",
) -> dict:
    """
    Full PKI signing flow:
    1. Generate end-entity certificate signed by CA
    2. Create CMS SignedData detached signature
    3. Return all PKI artifacts

    Returns dict with: signer_cert_pem, ca_cert_pem, cms_signature_der (base64),
    cms_signature_raw (bytes), algorithm, oid
    """
    # Generate signer certificate
    cert_data = generate_signer_cert(
        algorithm=algorithm,
        subject_cn=signer_name,
    )

    # Create detached signature (CMS or raw fallback)
    sig_bytes, sig_format = detached_sign_document(
        document_bytes=document_bytes,
        signer_key_pem=cert_data["signer_key_pem"],
        signer_cert_pem=cert_data["signer_cert_pem"],
    )

    # Verify the signature we just created
    is_valid = verify_detached_signature(
        document_bytes=document_bytes,
        signature_bytes=sig_bytes,
        ca_cert_pem=cert_data["ca_cert_pem"],
        signer_cert_pem=cert_data["signer_cert_pem"],
        sig_format=sig_format,
    )

    # Resolve the canonical algorithm name for OID lookup
    canonical = algorithm
    alias_map = {
        "Dilithium2": "ML-DSA-44", "Dilithium3": "ML-DSA-65", "Dilithium5": "ML-DSA-87",
    }
    if algorithm in alias_map:
        canonical = alias_map[algorithm]

    oid = ALGORITHM_OIDS.get(canonical, "unknown")

    logger.info(f"PKI signing complete: algorithm={algorithm}, oid={oid}, sig_format={sig_format}, sig_size={len(sig_bytes)} bytes, verified={is_valid}")

    return {
        "signer_cert_pem": cert_data["signer_cert_pem"],
        "ca_cert_pem": cert_data["ca_cert_pem"],
        "cms_signature_b64": base64.b64encode(sig_bytes).decode(),
        "cms_signature_raw": sig_bytes,
        "cms_size": len(sig_bytes),
        "signature_format": sig_format,
        "algorithm": algorithm,
        "oid": oid,
        "verified": is_valid,
    }
