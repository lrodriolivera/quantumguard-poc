-- Hybrid signatures, country CAs, RFC 3161 time-stamps, embedded PDF signatures and revocation.
BEGIN;

ALTER TABLE signatures ADD COLUMN IF NOT EXISTS country VARCHAR(2);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS cert_serial VARCHAR(64);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS issuer_cert TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS hybrid BOOLEAN DEFAULT false;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS classical_algorithm VARCHAR(50);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS classical_signature TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS classical_cert TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS timestamp_token TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS timestamp_time TIMESTAMP;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signed_pdf_path TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signed_pdf_hash VARCHAR(64);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_signatures_signature_data_md5 ON signatures (md5(signature_data));

COMMIT;
