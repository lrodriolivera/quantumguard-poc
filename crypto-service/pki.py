"""
QuantumGuard AI - Signing PKI
X.509 (RFC 9881 ML-DSA / RFC 9909 SLH-DSA) and CMS SignedData
(RFC 9882 ML-DSA / RFC 9814 SLH-DSA) via OpenSSL 3.5+.

Per signature, fresh end-entity keys are certified by the issuing CA of the
chosen country, used once and destroyed:
  - a post-quantum key (ML-DSA / SLH-DSA), always;
  - an ECDSA P-256 key when hybrid signing is requested.
Both sign the same document inside one CMS SignedData; a hybrid signature is
only valid when every SignerInfo verifies, so it stays secure as long as
either algorithm is unbroken.
"""

import base64
import logging
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

import ca as ca_module
import der
from ca import PASSIN, PKIError, run_openssl

logger = logging.getLogger(__name__)

DEFAULT_SIGNER_NAME = "QuantumGuard Document Signer"
SIGNER_CERT_DAYS = int(os.environ.get("SIGNER_CERT_DAYS", "365"))
CLASSICAL_ALGORITHM = "ECDSA-P256"
CLASSICAL_SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256"

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

_NIST_SIGALG_PREFIX = bytes.fromhex("6086480165030403")
_OID_LAST_BYTE_TO_ALGORITHM = {int(s.oid.rsplit(".", 1)[1]): n for n, s in ALGORITHMS.items()}
_EC_PUBLIC_KEY_OID = "1.2.840.10045.2.1"
_P256_OID = "1.2.840.10045.3.1.7"


class CertificateError(ValueError):
    """Client-supplied certificate is malformed or unsupported."""


def canonical_algorithm(algorithm: str) -> str:
    canonical = ALGORITHM_ALIASES.get(algorithm, algorithm)
    if canonical not in ALGORITHMS:
        raise ValueError(f"Unsupported algorithm: {algorithm}")
    return canonical


def get_openssl_version() -> str:
    return run_openssl("version").stdout.decode().strip()


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


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


# ------------------------------------------------------------
# Certificate parsing
# ------------------------------------------------------------

def parse_spki(spki_der: bytes) -> tuple:
    """Return (algorithm, raw_public_key) for ML-DSA / SLH-DSA / ECDSA P-256 keys."""
    try:
        tag, pos, _ = der.header(spki_der, 0)
        if tag != 0x30:
            raise CertificateError("SPKI is not a SEQUENCE")
        tag, alg_start, alg_len = der.header(spki_der, pos)
        alg_items = der.children(spki_der, alg_start, alg_len)
        if tag != 0x30 or not alg_items or alg_items[0][0] != 0x06:
            raise CertificateError("Malformed SPKI algorithm")
        key_oid = alg_items[0][1]
        tag, bits_start, bits_len = der.header(spki_der, alg_start + alg_len)
        if tag != 0x03 or spki_der[bits_start] != 0x00:
            raise CertificateError("Malformed public key BIT STRING")
        raw = spki_der[bits_start + 1:bits_start + bits_len]
    except der.DERError as e:
        raise CertificateError(f"Malformed SubjectPublicKeyInfo: {e}") from e

    if len(key_oid) == 9 and key_oid.startswith(_NIST_SIGALG_PREFIX):
        algorithm = _OID_LAST_BYTE_TO_ALGORITHM.get(key_oid[-1])
        if not algorithm:
            raise CertificateError("Unsupported post-quantum key OID")
        if len(raw) != ALGORITHMS[algorithm].public_key_size:
            raise CertificateError("Public key size does not match its algorithm")
        return algorithm, raw
    if der.decode_oid(key_oid) == _EC_PUBLIC_KEY_OID:
        curve = alg_items[1][1] if len(alg_items) > 1 and alg_items[1][0] == 0x06 else b""
        if not curve or der.decode_oid(curve) != _P256_OID:
            raise CertificateError("Only ECDSA P-256 classical keys are supported")
        return CLASSICAL_ALGORITHM, raw
    raise CertificateError("Certificate key is not ML-DSA, SLH-DSA or ECDSA P-256")


def _parse_openssl_date(value: str) -> datetime:
    return datetime.strptime(value.strip(), "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)


def certificate_info(cert_pem: str) -> dict:
    if "-----BEGIN CERTIFICATE-----" not in (cert_pem or ""):
        raise CertificateError("Certificate must be PEM encoded")
    with tempfile.TemporaryDirectory() as tmpdir:
        cert_path = os.path.join(tmpdir, "cert.pem")
        with open(cert_path, "w") as f:
            f.write(cert_pem)
        fields = run_openssl(
            "x509", "-in", cert_path, "-noout",
            "-subject", "-issuer", "-serial", "-startdate", "-enddate",
            "-nameopt", "RFC2253,-esc_msb",
            "-ext", "basicConstraints,subjectAltName",
            check=False,
        )
        if fields.returncode != 0:
            raise CertificateError("Certificate could not be parsed")
        pub = run_openssl("x509", "-in", cert_path, "-noout", "-pubkey", check=False)
        if pub.returncode != 0:
            raise CertificateError("Certificate public key could not be read")
        pub_pem = os.path.join(tmpdir, "pub.pem")
        with open(pub_pem, "wb") as f:
            f.write(pub.stdout)
        spki = run_openssl("pkey", "-pubin", "-in", pub_pem, "-outform", "DER").stdout
        algorithm, raw_public_key = parse_spki(spki)

    text = fields.stdout.decode("utf-8", errors="replace")
    values = dict(
        line.split("=", 1) for line in text.splitlines()
        if "=" in line and line.split("=", 1)[0] in ("subject", "issuer", "serial", "notBefore", "notAfter")
    )
    subject = values.get("subject", "").strip()
    email_match = re.search(r"email:([^\s,]+)", text)
    cn_match = re.search(r"(?:^|,)CN=([^,]+)", subject)
    country_match = re.search(r"(?:^|,)C=([A-Z]{2})", subject)
    return {
        "subject": subject,
        "issuer": values.get("issuer", "").strip(),
        "serial": values.get("serial", "").strip(),
        "common_name": cn_match.group(1) if cn_match else None,
        "email": email_match.group(1) if email_match else None,
        "country": country_match.group(1) if country_match else None,
        "not_before": _parse_openssl_date(values["notBefore"]),
        "not_after": _parse_openssl_date(values["notAfter"]),
        "is_ca": "CA:TRUE" in text,
        "algorithm": algorithm,
        "public_key_raw": raw_public_key,
    }


def certificate_summary(info: dict) -> dict:
    return {
        "subject": info["subject"],
        "issuer": info["issuer"],
        "serial": info["serial"],
        "common_name": info["common_name"],
        "email": info["email"],
        "country": info["country"],
        "not_before": info["not_before"].isoformat(),
        "not_after": info["not_after"].isoformat(),
        "algorithm": info["algorithm"],
    }


def split_pem_certificates(pem: str) -> List[str]:
    return re.findall(r"-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----\n?", pem, flags=re.S)


# ------------------------------------------------------------
# Chain and revocation
# ------------------------------------------------------------

def verify_certificate_chain(cert_pem: str, at_time: Optional[datetime] = None) -> Dict[str, Optional[bool]]:
    """Check that cert_pem chains to a QuantumGuard trust anchor and is not revoked.

    The chain is evaluated at the signing time when known (otherwise without a
    validity-window check); revocation is evaluated against current CRLs.
    """
    anchors = ca_module.trust_anchors_path()
    intermediates = ca_module.intermediates_path()
    with tempfile.TemporaryDirectory() as tmpdir:
        cert_path = os.path.join(tmpdir, "cert.pem")
        with open(cert_path, "w") as f:
            f.write(cert_pem)
        time_args = ["-attime", str(int(at_time.timestamp()))] if at_time else ["-no_check_time"]
        chain = run_openssl(
            "verify", "-CAfile", anchors, "-untrusted", intermediates, *time_args, cert_path, check=False,
        )
        if chain.returncode != 0:
            return {"chain_valid": False, "revoked": None}
        crls = ca_module.crl_bundle_path()
        revocation = run_openssl(
            "verify", "-CAfile", anchors, "-untrusted", intermediates,
            "-CRLfile", crls, "-crl_check_all", "-no_check_time", cert_path, check=False,
        )
    if revocation.returncode == 0:
        return {"chain_valid": True, "revoked": False}
    output = (revocation.stdout + revocation.stderr).decode("utf-8", errors="replace")
    if "certificate revoked" in output:
        return {"chain_valid": True, "revoked": True}
    logger.warning(f"Revocation status unavailable: {output.strip()[-200:]}")
    return {"chain_valid": True, "revoked": None}


# ------------------------------------------------------------
# Signing
# ------------------------------------------------------------

def _signer_config(common_name: str, email: Optional[str], country: str,
                   issuer: ca_module.CertificateAuthority) -> str:
    san = f"subjectAltName = email:{email}\n" if email else ""
    return (
        "[req]\nprompt = no\ndistinguished_name = dn\nutf8 = yes\nstring_mask = utf8only\n"
        "[dn]\n"
        f"C = {country}\nO = {ca_module.PKI_ORG}\nOU = {ca_module.PKI_OU}\nCN = {common_name}\n"
        "[ext]\n"
        "basicConstraints = critical,CA:FALSE\n"
        "keyUsage = critical,digitalSignature,nonRepudiation\n"
        "subjectKeyIdentifier = hash\n"
        "authorityKeyIdentifier = keyid,issuer\n"
        f"crlDistributionPoints = URI:{issuer.crl_url}\n"
        f"authorityInfoAccess = caIssuers;URI:{issuer.cert_url}\n"
        f"{san}"
    )


def _issue_signer_cert(tmpdir: str, prefix: str, keygen: List[str], config: str,
                       issuer: ca_module.CertificateAuthority) -> tuple:
    cfg = os.path.join(tmpdir, f"{prefix}.cnf")
    key = os.path.join(tmpdir, f"{prefix}.key")
    csr = os.path.join(tmpdir, f"{prefix}.csr")
    crt = os.path.join(tmpdir, f"{prefix}.crt")
    with open(cfg, "w", encoding="utf-8") as f:
        f.write(config)
    run_openssl("req", "-new", *keygen, "-nodes", "-keyout", key, "-out", csr, "-config", cfg)
    os.chmod(key, 0o600)
    run_openssl(
        "x509", "-req", "-in", csr, "-CA", issuer.cert_path, "-CAkey", issuer.key_path, *PASSIN,
        "-set_serial", ca_module._serial(), "-days", str(SIGNER_CERT_DAYS),
        "-extfile", cfg, "-extensions", "ext", "-out", crt,
        env_passphrase=True,
    )
    return key, crt


def _read(path: str, mode: str = "r"):
    with open(path, mode) as f:
        return f.read()


def sign_document_full(
    document_bytes: bytes,
    algorithm: str = "ML-DSA-44",
    signer_name: Optional[str] = None,
    signer_email: Optional[str] = None,
    country: str = ca_module.DEFAULT_COUNTRY,
    hybrid: bool = True,
    pdf_to_embed: Optional[bytes] = None,
) -> dict:
    canonical = canonical_algorithm(algorithm)
    spec = ALGORITHMS[canonical]
    issuer = ca_module.issuing_ca(country)
    config = _signer_config(
        sanitize_common_name(signer_name), sanitize_email(signer_email), country, issuer,
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        doc = os.path.join(tmpdir, "document.bin")
        with open(doc, "wb") as f:
            f.write(document_bytes)

        pq_key, pq_crt = _issue_signer_cert(tmpdir, "pq", ["-newkey", spec.openssl_name], config, issuer)
        pq_sig = os.path.join(tmpdir, "pq.sig")
        # Pure ML-DSA / SLH-DSA over the full message, empty context (FIPS 204/205).
        run_openssl("pkeyutl", "-sign", "-rawin", "-inkey", pq_key, "-in", doc, "-out", pq_sig)

        signer_args = ["-signer", pq_crt, "-inkey", pq_key]
        classical = None
        ec_paths = None
        if hybrid:
            ec_key, ec_crt = _issue_signer_cert(
                tmpdir, "ec", ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256"], config, issuer,
            )
            ec_sig = os.path.join(tmpdir, "ec.sig")
            run_openssl("pkeyutl", "-sign", "-rawin", "-digest", "sha256", "-inkey", ec_key, "-in", doc, "-out", ec_sig)
            signer_args += ["-signer", ec_crt, "-inkey", ec_key]
            classical = {"signature_raw": _read(ec_sig, "rb"), "cert_pem": _read(ec_crt)}
            ec_paths = {"key": ec_key, "cert": ec_crt}

        cms_path = os.path.join(tmpdir, "signature.p7s")
        run_openssl(
            "cms", "-sign", "-binary", "-cades", "-md", spec.cms_digest,
            "-in", doc, *signer_args, "-certfile", issuer.cert_path,
            "-outform", "DER", "-out", cms_path,
        )
        signature_raw = _read(pq_sig, "rb")
        signer_cert_pem = _read(pq_crt)
        cms_der = _read(cms_path, "rb")

        signed_pdf = None
        if pdf_to_embed is not None:
            import pdf_sign
            signed_pdf = pdf_sign.sign_pdf(
                pdf_to_embed, sanitize_common_name(signer_name),
                {"key": pq_key, "cert": pq_crt}, ec_paths, issuer.cert_path, spec.cms_digest, tmpdir,
            )
    # Ephemeral signer private keys are gone with tmpdir.

    check = cms_verify_document(document_bytes, cms_der)
    if not check["valid"] or len(check["signers"]) != (2 if hybrid else 1):
        raise PKIError("Self-check failed: freshly created CMS signature does not verify")

    info = certificate_info(signer_cert_pem)
    if classical:
        classical["info"] = certificate_info(classical["cert_pem"])

    logger.info(
        f"PKI signing complete: algorithm={canonical}, country={country}, hybrid={hybrid}, "
        f"raw={len(signature_raw)}B, cms={len(cms_der)}B, serial={info['serial']}"
    )
    return {
        "algorithm": canonical,
        "oid": spec.oid,
        "cms_digest": spec.cms_digest,
        "country": country,
        "signature_raw": signature_raw,
        "public_key_raw": info["public_key_raw"],
        "cms_der": cms_der,
        "signer_cert_pem": signer_cert_pem,
        "issuer_cert_pem": _read(issuer.cert_path),
        "root_cert_pem": _read(ca_module.root_ca().cert_path),
        "certificate": info,
        "classical": classical,
        "signed_pdf": signed_pdf,
    }


def cms_verify_document(document_bytes: bytes, cms_der: bytes, at_time: Optional[datetime] = None) -> dict:
    """Verify every SignerInfo of a detached CMS against the document and our trust anchors.

    Returns per-signer certificate details and revocation status; valid only
    when all signers verify, chain to a QuantumGuard anchor and none is revoked.
    """
    anchors = ca_module.trust_anchors_path()
    intermediates = ca_module.intermediates_path()
    with tempfile.TemporaryDirectory() as tmpdir:
        doc = os.path.join(tmpdir, "document.bin")
        sig = os.path.join(tmpdir, "signature.p7s")
        signers_out = os.path.join(tmpdir, "signers.pem")
        with open(doc, "wb") as f:
            f.write(document_bytes)
        with open(sig, "wb") as f:
            f.write(cms_der)
        time_args = ["-attime", str(int(at_time.timestamp()))] if at_time else ["-no_check_time"]
        result = run_openssl(
            "cms", "-verify", "-binary", "-inform", "DER",
            "-in", sig, "-content", doc,
            "-CAfile", anchors, "-certfile", intermediates, "-purpose", "any", *time_args,
            "-signer", signers_out, "-out", os.devnull,
            check=False,
        )
        signer_pems = split_pem_certificates(_read(signers_out)) if os.path.exists(signers_out) else []

    if result.returncode != 0:
        return {"valid": False, "cms_valid": False, "revoked": None, "signers": []}

    signers = []
    any_revoked = False
    for pem in signer_pems:
        info = certificate_info(pem)
        status = verify_certificate_chain(pem)
        any_revoked = any_revoked or bool(status["revoked"])
        signers.append({
            **certificate_summary(info),
            "revoked": status["revoked"],
            "post_quantum": info["algorithm"] in ALGORITHMS,
            "certificate_pem": pem,
        })
    has_pq = any(s["post_quantum"] for s in signers)
    return {
        "valid": has_pq and not any_revoked,
        "cms_valid": True,
        "revoked": any_revoked,
        "signers": signers,
    }


def classical_verify(document_bytes: bytes, signature: bytes, cert_pem: str) -> bool:
    with tempfile.TemporaryDirectory() as tmpdir:
        doc, sig, crt, pub = (os.path.join(tmpdir, n) for n in ("doc", "sig", "crt.pem", "pub.pem"))
        with open(doc, "wb") as f:
            f.write(document_bytes)
        with open(sig, "wb") as f:
            f.write(signature)
        with open(crt, "w") as f:
            f.write(cert_pem)
        run_openssl("x509", "-in", crt, "-pubkey", "-noout", "-out", pub)
        result = run_openssl(
            "pkeyutl", "-verify", "-rawin", "-digest", "sha256", "-pubin", "-inkey", pub,
            "-in", doc, "-sigfile", sig, check=False,
        )
        return result.returncode == 0
