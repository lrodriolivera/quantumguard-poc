"""
Regression tests for the PKI: hierarchy, signing, hybrid, revocation, TSA,
PDF embedding, KEM key custody and service authentication.
Run inside the crypto-service image (needs OpenSSL 3.5+ and liboqs):
  docker run --rm -u 0 -v $PWD/tests:/app/tests:ro --entrypoint sh <image> \
    -c "pip install -q pytest && python -m pytest -q tests"
"""

import base64
import io
import os
import subprocess
import tempfile

PKI_TMP = os.environ["PKI_DIR"]
OPENSSL = "/opt/openssl/bin/openssl"


def _openssl(*args, check=True):
    return subprocess.run([OPENSSL, *args], capture_output=True, check=check)


import oqs  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import ca  # noqa: E402
import main  # noqa: E402
import pdf_sign  # noqa: E402
import pki  # noqa: E402
import tsa  # noqa: E402

DOC = b"Contrato de prueba QuantumGuard: pagar 100 EUR"
ALL_ALGORITHMS = list(pki.ALGORITHMS)


@pytest.fixture(scope="module")
def client():
    ca.ensure_hierarchy(allow_create=True)
    with TestClient(main.app) as c:
        yield c


def sign(client, algorithm="ML-DSA-44", doc=DOC, name="Rene Carreño", email="rene@example.com",
         country="CL", hybrid="true", filename="doc.txt"):
    r = client.post(
        "/crypto/sign-x509",
        files={"file": (filename, doc)},
        data={"algorithm": algorithm, "signer_name": name, "signer_email": email,
              "country": country, "hybrid": hybrid},
    )
    assert r.status_code == 200, r.text
    return r.json()


def verify_bundle(client, signed, doc=DOC, **extra):
    data = {"cms_signature": signed["pki"]["cms_signature_b64"],
            "timestamp_token": signed["time_stamp"]["token"], **extra}
    r = client.post("/crypto/verify-bundle", files={"file": ("doc.txt", doc)}, data=data)
    assert r.status_code == 200, r.text
    return r.json()


def verify_x509(client, signature, certificate, doc=DOC, signed_at=None):
    data = {"signature": signature, "certificate": certificate}
    if signed_at:
        data["signed_at"] = signed_at
    return client.post("/crypto/verify-x509", files={"file": ("doc.txt", doc)}, data=data)


# ------------------------------------------------------------ hierarchy

def test_hierarchy_has_root_three_countries_and_tsa(client):
    assert ca.hierarchy_status() == {"root": True, "CL": True, "CO": True, "ES": True, "tsa": True}


def test_ca_keys_are_encrypted_at_rest(client):
    for authority in ca.all_authorities():
        with open(authority.key_path) as f:
            assert f.readline().strip() == "-----BEGIN ENCRYPTED PRIVATE KEY-----", authority.name
    assert not os.path.exists(os.path.join(PKI_TMP, "ca.key")), "plaintext legacy key must be removed"


def test_ca_keys_cannot_be_used_without_passphrase(client, monkeypatch):
    monkeypatch.delenv("PKI_KEY_PASSPHRASE")
    with pytest.raises(ca.PKIError):
        pki.sign_document_full(DOC, "ML-DSA-44", "x", None, "CL", False)


def test_refuses_to_create_hierarchy_when_disabled(tmp_path, monkeypatch):
    monkeypatch.setattr(ca, "PKI_DIR", str(tmp_path / "empty"))
    with pytest.raises(ca.PKIError):
        ca.ensure_hierarchy(allow_create=False)
    assert not (tmp_path / "empty" / "root").exists()


def test_legacy_ca_signatures_still_verify(client):
    legacy = ca.legacy_ca()
    with tempfile.TemporaryDirectory() as d:
        _openssl("req", "-new", "-newkey", "mldsa44", "-nodes", "-keyout", f"{d}/k", "-out", f"{d}/r",
                 "-subj", "/C=PY/CN=QuantumGuard Document Signer")
        _openssl("x509", "-req", "-in", f"{d}/r", "-CA", legacy.cert_path, "-CAkey", legacy.key_path,
                 "-passin", "env:PKI_KEY_PASSPHRASE", "-set_serial", "77", "-days", "30", "-out", f"{d}/c")
        with open(f"{d}/doc", "wb") as f:
            f.write(DOC)
        _openssl("pkeyutl", "-sign", "-rawin", "-inkey", f"{d}/k", "-in", f"{d}/doc", "-out", f"{d}/s")
        sig = base64.b64encode(open(f"{d}/s", "rb").read()).decode()
        cert = open(f"{d}/c").read()
    body = verify_x509(client, sig, cert).json()
    assert body["valid"] is True and body["chain_valid"] is True


@pytest.mark.parametrize("country", ["CL", "CO", "ES"])
def test_country_selects_issuing_ca(client, country):
    signed = sign(client, country=country)
    cert = signed["pki"]["certificate"]
    assert cert["country"] == country
    assert ca.COUNTRIES[country] in cert["issuer"]
    assert signed["country"] == country


def test_unknown_country_is_400(client):
    r = client.post("/crypto/sign-x509", files={"file": ("d", DOC)}, data={"country": "PY"})
    assert r.status_code == 400


def test_countries_endpoint(client):
    codes = [c["code"] for c in client.get("/crypto/pki/countries").json()["countries"]]
    assert codes == ["CL", "CO", "ES"]


# ------------------------------------------------------------ signing / verification

@pytest.mark.parametrize("algorithm", ALL_ALGORITHMS)
def test_hybrid_roundtrip_every_algorithm(client, algorithm):
    signed = sign(client, algorithm)
    body = verify_bundle(client, signed, require_hybrid="true")
    assert body["valid"], body
    assert body["hybrid"] is True
    assert sorted(s["algorithm"] for s in body["signers"]) == sorted([algorithm, "ECDSA-P256"])
    assert body["time_stamp"]["valid"] is True


@pytest.mark.parametrize("algorithm", ALL_ALGORITHMS)
def test_public_key_is_the_certificate_key(client, algorithm):
    signed = sign(client, algorithm, hybrid="false")
    info = pki.certificate_info(signed["pki"]["signer_cert_pem"])
    assert base64.b64decode(signed["public_key"]) == info["public_key_raw"]
    assert info["algorithm"] == algorithm


def test_classical_signature_verifies_with_its_certificate(client):
    signed = sign(client)
    c = signed["classical"]
    assert c["algorithm"] == "ECDSA-P256-SHA256"
    assert pki.classical_verify(DOC, base64.b64decode(c["signature"]), c["cert_pem"])
    assert not pki.classical_verify(DOC + b"!", base64.b64decode(c["signature"]), c["cert_pem"])


def test_tampered_document_fails_bundle_and_raw(client):
    signed = sign(client)
    assert verify_bundle(client, signed, doc=DOC + b"0")["valid"] is False
    r = verify_x509(client, signed["signature"], signed["pki"]["signer_cert_pem"], doc=DOC + b"0")
    assert r.json()["valid"] is False


def test_hybrid_downgrade_is_detected(client):
    signed = sign(client, hybrid="false")
    body = verify_bundle(client, signed, require_hybrid="true")
    assert body["valid"] is False and "clásica" in body["reason"]


def test_forgery_with_attacker_key_and_self_signed_cert_is_rejected(client):
    forged_doc = b"Contrato: Rene debe 1.000.000 USD"
    with tempfile.TemporaryDirectory() as d:
        _openssl("req", "-x509", "-newkey", "mldsa44", "-nodes", "-keyout", f"{d}/k", "-out", f"{d}/c",
                 "-subj", "/C=CL/O=Post Cuantica Lab/CN=QuantumGuard CA Chile", "-days", "30")
        with open(f"{d}/doc", "wb") as f:
            f.write(forged_doc)
        _openssl("pkeyutl", "-sign", "-rawin", "-inkey", f"{d}/k", "-in", f"{d}/doc", "-out", f"{d}/s")
        _openssl("cms", "-sign", "-binary", "-md", "sha512", "-in", f"{d}/doc", "-signer", f"{d}/c",
                 "-inkey", f"{d}/k", "-outform", "DER", "-out", f"{d}/p7s")
        sig = base64.b64encode(open(f"{d}/s", "rb").read()).decode()
        cms = base64.b64encode(open(f"{d}/p7s", "rb").read()).decode()
        cert = open(f"{d}/c").read()
    body = verify_x509(client, sig, cert, doc=forged_doc).json()
    assert body["signature_valid"] is True and body["chain_valid"] is False and body["valid"] is False
    r = client.post("/crypto/verify-bundle", files={"file": ("d", forged_doc)}, data={"cms_signature": cms})
    assert r.json()["valid"] is False


def test_ca_certificate_cannot_be_used_as_signer(client):
    signed = sign(client)
    body = verify_x509(client, signed["signature"], ca.certificate_pem("CL")).json()
    assert body["valid"] is False and body["chain_valid"] is False


def test_signing_time_outside_certificate_validity_is_invalid(client):
    signed = sign(client)
    body = verify_x509(client, signed["signature"], signed["pki"]["signer_cert_pem"],
                       signed_at="2001-01-01T00:00:00Z").json()
    assert body["signature_valid"] is True and body["valid"] is False


def test_identity_is_sanitized_against_config_injection(client):
    signed = sign(client, name="Eve $ENV::HOME\n[ext]\nbasicConstraints=CA:TRUE", email="not-an-email")
    info = pki.certificate_info(signed["pki"]["signer_cert_pem"])
    assert info["is_ca"] is False and info["email"] is None
    assert "$" not in info["common_name"] and "\n" not in info["common_name"]


def test_cms_verifies_offline_with_root_only(client):
    signed = sign(client, "ML-DSA-65")
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/s.p7s", "wb").write(base64.b64decode(signed["pki"]["cms_signature_b64"]))
        open(f"{d}/doc", "wb").write(DOC)
        open(f"{d}/root.pem", "w").write(signed["pki"]["ca_cert_pem"])
        ok = _openssl("cms", "-verify", "-binary", "-inform", "DER", "-in", f"{d}/s.p7s", "-content", f"{d}/doc",
                      "-CAfile", f"{d}/root.pem", "-purpose", "any", "-out", os.devnull, check=False)
        assert ok.returncode == 0, ok.stderr


def test_raw_signature_interoperates_with_liboqs(client):
    signed = sign(client, "ML-DSA-65")
    with oqs.Signature("ML-DSA-65") as v:
        assert v.verify(DOC, base64.b64decode(signed["signature"]), base64.b64decode(signed["public_key"]))


# ------------------------------------------------------------ revocation

def test_revocation_invalidates_signature_and_publishes_crl(client):
    signed = sign(client, country="ES")
    assert verify_bundle(client, signed)["valid"] is True
    r = client.post("/crypto/pki/revoke", data={"certificate": signed["pki"]["signer_cert_pem"],
                                                "reason": "keyCompromise"})
    assert r.status_code == 200 and r.json()["issuer"] == "ES"

    body = verify_bundle(client, signed)
    assert body["valid"] is False and body["revoked"] is True
    raw = verify_x509(client, signed["signature"], signed["pki"]["signer_cert_pem"]).json()
    assert raw["valid"] is False and raw["revoked"] is True

    crl = client.get("/crypto/pki/crl/ES.crl")
    assert crl.status_code == 200
    with tempfile.NamedTemporaryFile(suffix=".crl") as f:
        f.write(crl.content)
        f.flush()
        text = _openssl("crl", "-inform", "DER", "-in", f.name, "-noout", "-text").stdout.decode()
    assert pki.certificate_info(signed["pki"]["signer_cert_pem"])["serial"] in text.replace(":", "").upper()


def test_other_signatures_unaffected_by_revocation(client):
    signed = sign(client, country="ES")
    assert verify_bundle(client, signed)["valid"] is True


def test_revoke_rejects_foreign_certificates(client):
    with tempfile.TemporaryDirectory() as d:
        _openssl("req", "-x509", "-newkey", "mldsa44", "-nodes", "-keyout", f"{d}/k", "-out", f"{d}/c",
                 "-subj", "/CN=x", "-days", "1")
        r = client.post("/crypto/pki/revoke", data={"certificate": open(f"{d}/c").read()})
    assert r.status_code == 400


# ------------------------------------------------------------ time-stamp

def test_timestamp_token_covers_the_cms(client):
    signed = sign(client)
    token = base64.b64decode(signed["time_stamp"]["token"])
    cms = base64.b64decode(signed["pki"]["cms_signature_b64"])
    assert tsa.verify_timestamp(token, cms)["valid"] is True
    assert tsa.verify_timestamp(token, cms + b"x")["valid"] is False


def test_timestamp_parses_with_openssl_ts(client):
    signed = sign(client)
    with tempfile.NamedTemporaryFile(suffix=".tsr") as f:
        f.write(tsa.timestamp_response(base64.b64decode(signed["time_stamp"]["token"])))
        f.flush()
        out = _openssl("ts", "-reply", "-in", f.name, "-text").stdout.decode()
    assert "Status: Granted." in out and tsa.TSA_POLICY_OID in out


def test_swapped_timestamp_is_rejected(client):
    a, b = sign(client), sign(client)
    body = verify_bundle(client, a, timestamp_token=b["time_stamp"]["token"])
    assert body["valid"] is False


# ------------------------------------------------------------ PDF

def _pdf() -> bytes:
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 750, "Contrato PDF")
    c.save()
    return buf.getvalue()


def test_pdf_gets_embedded_hybrid_signatures_and_timestamp(client):
    signed = sign(client, doc=_pdf(), filename="c.pdf")
    pdf = base64.b64decode(signed["signed_pdf"])
    result = pdf_sign.verify_pdf(pdf)
    assert result["valid"] is True, result
    assert result["hybrid"] is True and result["timestamp"]
    assert [s["type"] for s in result["signatures"]] == ["signature", "signature", "timestamp"]
    endpoint = client.post("/crypto/pdf/verify", files={"file": ("s.pdf", pdf)}).json()
    assert endpoint["valid"] is True


def test_pdf_modified_after_signing_is_invalid(client):
    signed = sign(client, doc=_pdf(), filename="c.pdf", hybrid="false")
    pdf = base64.b64decode(signed["signed_pdf"]) + b"\n%% appended after signing\n"
    result = pdf_sign.verify_pdf(pdf)
    assert result["valid"] is False and "modificado" in result["reason"]


def test_pdf_content_tampering_is_invalid(client):
    signed = sign(client, doc=_pdf(), filename="c.pdf", hybrid="false")
    pdf = bytearray(base64.b64decode(signed["signed_pdf"]))
    i = pdf.index(b"Contrato PDF")
    pdf[i:i + 8] = b"Contrata"
    assert pdf_sign.verify_pdf(bytes(pdf))["valid"] is False


def test_unsigned_pdf_is_reported(client):
    result = pdf_sign.verify_pdf(_pdf())
    assert result["valid"] is False and result["signatures"] == []


# ------------------------------------------------------------ input validation

@pytest.mark.parametrize("path,data", [
    ("/crypto/sign-x509", {"algorithm": "RSA-2048"}),
    ("/crypto/sign-x509", {"hybrid": "maybe"}),
    ("/crypto/verify", {"signature": "!!!", "public_key": "AAAA", "algorithm": "ML-DSA-44"}),
    ("/crypto/verify", {"signature": "AAAA", "public_key": "AAAA", "algorithm": "ML-DSA-44"}),
    ("/crypto/verify-x509", {"signature": "AAAA", "certificate": "not a cert"}),
    ("/crypto/verify-bundle", {"cms_signature": "%%%"}),
    ("/crypto/verify-cms", {"cms_signature": "%%%"}),
    ("/crypto/pdf/verify", {}),
])
def test_invalid_input_returns_400(client, path, data):
    r = client.post(path, files={"file": ("d", DOC)}, data=data)
    assert r.status_code == 400, r.text


def test_metadata_sizes_match_fips(client):
    algs = client.get("/crypto/algorithms").json()["algorithms"]
    assert algs["ML-DSA-65"]["signature_size_bytes"] == 3309
    assert algs["ML-DSA-87"]["signature_size_bytes"] == 4627


# ------------------------------------------------------------ KEM key custody

def test_kem_secret_key_never_leaves_the_service(client):
    kp = client.post("/crypto/kem/keypair/generate", data={"algorithm": "ML-KEM-768"}).json()
    assert "secret_key" not in kp and kp["keypair_id"]
    enc = client.post("/crypto/kem/encapsulate", data={"public_key": kp["public_key"],
                                                       "algorithm": "ML-KEM-768"}).json()
    dec = client.post("/crypto/kem/decapsulate", data={"ciphertext": enc["ciphertext"],
                                                       "keypair_id": kp["keypair_id"],
                                                       "algorithm": "ML-KEM-768"}).json()
    assert dec["shared_secret"] == enc["shared_secret"]


def test_kem_unknown_keypair_id_is_400(client):
    r = client.post("/crypto/kem/decapsulate", data={"ciphertext": "AAAA", "keypair_id": "nope",
                                                     "algorithm": "ML-KEM-768"})
    assert r.status_code == 400


# ------------------------------------------------------------ service authentication

def test_service_token_is_enforced(client, monkeypatch):
    monkeypatch.setattr(main, "SERVICE_TOKEN", "s3cret")
    assert client.get("/health").status_code == 200
    assert client.get("/crypto/pki/countries").status_code == 401
    assert client.get("/crypto/pki/countries", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/crypto/pki/countries", headers={"Authorization": "Bearer s3cret"}).status_code == 200
