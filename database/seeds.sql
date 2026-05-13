-- QuantumGuard AI Database Seeds
-- Test data for development and testing

-- Insert test users
INSERT INTO users (id, email, password_hash, first_name, last_name, is_active)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'alice@quantumguard.ai', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Alice', 'Smith', true),
  ('550e8400-e29b-41d4-a716-446655440002', 'bob@quantumguard.ai', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Bob', 'Johnson', true),
  ('550e8400-e29b-41d4-a716-446655440003', 'carol@quantumguard.ai', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Carol', 'Williams', true)
ON CONFLICT (id) DO NOTHING;

-- Password for all test users: "quantum2025"

-- Insert test organizations
INSERT INTO organizations (id, name, domain, plan, max_users, max_documents, is_active)
VALUES
  ('660e8400-e29b-41d4-a716-446655440001', 'QuantumGuard Inc', 'quantumguard.ai', 'enterprise', 100, 10000, true),
  ('660e8400-e29b-41d4-a716-446655440002', 'Acme Corp', 'acme.com', 'pro', 50, 5000, true),
  ('660e8400-e29b-41d4-a716-446655440003', 'StartupXYZ', 'startupxyz.io', 'free', 5, 100, true)
ON CONFLICT (id) DO NOTHING;

-- Link users to organizations
INSERT INTO user_organizations (user_id, organization_id, role, joined_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', 'admin', NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440001', 'member', NOW()),
  ('550e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440002', 'admin', NOW())
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Insert test documents
INSERT INTO documents (id, user_id, filename, file_size, mime_type, file_hash, original_path, status, created_at)
VALUES
  (
    '770e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    'contract_2025.pdf',
    524288,
    'application/pdf',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '/uploads/contract_2025.pdf',
    'uploaded',
    NOW() - INTERVAL '5 days'
  ),
  (
    '770e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440001',
    'legal_agreement.docx',
    1048576,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b866',
    '/uploads/legal_agreement.docx',
    'signed',
    NOW() - INTERVAL '3 days'
  ),
  (
    '770e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440002',
    'invoice_Q1_2025.xlsx',
    262144,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'b3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b877',
    '/uploads/invoice_Q1_2025.xlsx',
    'uploaded',
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT (id) DO NOTHING;

-- Insert test signatures
INSERT INTO signatures (id, document_id, algorithm, public_key, signature_data, document_hash, timestamp, valid_until, quantum_safe, signature_size, created_at)
VALUES
  (
    '880e8400-e29b-41d4-a716-446655440001',
    '770e8400-e29b-41d4-a716-446655440002',
    'Dilithium2',
    'MIIDCjCCAfKgAwIBAgIBATANBgkqhkiG9w0BAQsFADAP...',
    'U2lnbmF0dXJlRGF0YUV4YW1wbGVGb3JUZXN0aW5nUHVycG9zZXNPbmx5...',
    'a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b866',
    NOW() - INTERVAL '3 days',
    NOW() + INTERVAL '50 years',
    true,
    2420,
    NOW() - INTERVAL '3 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Insert audit log entries
INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    '660e8400-e29b-41d4-a716-446655440001',
    'document.upload',
    'document',
    '770e8400-e29b-41d4-a716-446655440001',
    '192.168.1.100',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    '{"filename": "contract_2025.pdf", "size": 524288}',
    NOW() - INTERVAL '5 days'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440001',
    '660e8400-e29b-41d4-a716-446655440001',
    'document.sign',
    'document',
    '770e8400-e29b-41d4-a716-446655440002',
    '192.168.1.100',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    '{"algorithm": "Dilithium2", "quantum_safe": true}',
    NOW() - INTERVAL '3 days'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    '660e8400-e29b-41d4-a716-446655440001',
    'document.upload',
    'document',
    '770e8400-e29b-41d4-a716-446655440003',
    '192.168.1.101',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    '{"filename": "invoice_Q1_2025.xlsx", "size": 262144}',
    NOW() - INTERVAL '1 day'
  );

-- Summary
SELECT
  (SELECT COUNT(*) FROM users) as users_count,
  (SELECT COUNT(*) FROM organizations) as organizations_count,
  (SELECT COUNT(*) FROM documents) as documents_count,
  (SELECT COUNT(*) FROM signatures) as signatures_count,
  (SELECT COUNT(*) FROM audit_logs) as audit_logs_count;
