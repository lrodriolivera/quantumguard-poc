-- QuantumGuard AI Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    plan VARCHAR(20) NOT NULL DEFAULT 'free',
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    stripe_subscription_status VARCHAR(30),
    plan_renews_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    original_path VARCHAR(1000),
    signed_path VARCHAR(1000),
    status VARCHAR(50) DEFAULT 'uploaded',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'free',
    max_users INTEGER DEFAULT 5,
    max_documents INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Organizations (many-to-many)
CREATE TABLE IF NOT EXISTS user_organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, organization_id)
);

-- Signatures table
CREATE TABLE IF NOT EXISTS signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    algorithm VARCHAR(100) NOT NULL,
    public_key TEXT NOT NULL,
    signature_data TEXT NOT NULL,
    document_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP,
    quantum_safe BOOLEAN DEFAULT true,
    signature_size INTEGER,
    signer_cert TEXT,
    cms_signature TEXT,
    country VARCHAR(2),
    cert_serial VARCHAR(64),
    issuer_cert TEXT,
    hybrid BOOLEAN DEFAULT false,
    classical_algorithm VARCHAR(50),
    classical_signature TEXT,
    classical_cert TEXT,
    timestamp_token TEXT,
    timestamp_time TIMESTAMP,
    signed_pdf_path TEXT,
    signed_pdf_hash VARCHAR(64),
    revoked_at TIMESTAMP,
    revocation_reason VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Signing envelopes: a document routed to one or more signers (self or external)
CREATE TABLE IF NOT EXISTS envelopes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country VARCHAR(2) NOT NULL,
    algorithm VARCHAR(100) NOT NULL,
    hybrid BOOLEAN NOT NULL DEFAULT true,
    mode VARCHAR(20) NOT NULL DEFAULT 'parallel',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- External signers on an envelope, identified by a single-use token (never
-- an account): hashed like a password so a DB leak cannot replay the link.
CREATE TABLE IF NOT EXISTS envelope_signers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    envelope_id UUID NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    signature_id UUID REFERENCES signatures(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    order_index INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
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

-- Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_signatures_document_id ON signatures(document_id);
CREATE INDEX idx_signatures_timestamp ON signatures(timestamp);
CREATE INDEX idx_envelopes_owner_user_id ON envelopes(owner_user_id);
CREATE INDEX idx_envelopes_document_id ON envelopes(document_id);
CREATE INDEX idx_envelope_signers_envelope_id ON envelope_signers(envelope_id);
CREATE UNIQUE INDEX idx_envelope_signers_token_hash ON envelope_signers(access_token_hash);
CREATE INDEX idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX idx_user_organizations_org_id ON user_organizations(organization_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_envelopes_updated_at BEFORE UPDATE ON envelopes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_envelope_signers_updated_at BEFORE UPDATE ON envelope_signers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
