-- Firma simple: sobres de firma con firmantes externos sin cuenta (P0),
-- OTP por correo, y el plan del dueño de la cuenta (cuota de firmas/mes).
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_status VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS envelopes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country VARCHAR(2) NOT NULL,
    algorithm VARCHAR(100) NOT NULL,
    hybrid BOOLEAN NOT NULL DEFAULT true,
    mode VARCHAR(20) NOT NULL DEFAULT 'parallel', -- 'parallel' | 'sequential'
    status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft' | 'sent' | 'completed' | 'voided'
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS envelope_signers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    envelope_id UUID NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    signature_id UUID REFERENCES signatures(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    order_index INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|notified|viewed|otp_verified|signed|declined
    access_token_hash VARCHAR(64) NOT NULL,
    access_token_expires_at TIMESTAMP NOT NULL,
    otp_code_hash VARCHAR(64),
    otp_sent_at TIMESTAMP,
    otp_expires_at TIMESTAMP,
    otp_attempts INTEGER NOT NULL DEFAULT 0,
    otp_verified_at TIMESTAMP,
    notified_at TIMESTAMP,
    declined_at TIMESTAMP,
    decline_reason TEXT,
    signed_at TIMESTAMP,
    verified_ip VARCHAR(64),
    verified_user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_envelope_signers_token_hash ON envelope_signers (access_token_hash);
CREATE INDEX IF NOT EXISTS idx_envelope_signers_envelope_id ON envelope_signers (envelope_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_owner_user_id ON envelopes (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_document_id ON envelopes (document_id);

CREATE TRIGGER update_envelopes_updated_at BEFORE UPDATE ON envelopes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_envelope_signers_updated_at BEFORE UPDATE ON envelope_signers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
