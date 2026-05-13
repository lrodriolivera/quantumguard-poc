-- QuantumGuard AI - Demo Seed Data
-- Run this script to populate the database with demo data

-- Demo Users
INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
VALUES
  ('demo-user-001', 'demo@quantumguard.ai', '$2b$10$demopasswordhash123456789', 'Demo', 'Usuario', 'user', NOW(), NOW()),
  ('demo-admin-001', 'admin@quantumguard.ai', '$2b$10$adminpasswordhash12345678', 'Admin', 'QuantumGuard', 'admin', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Demo Organization
INSERT INTO organizations (id, name, description, created_at, updated_at)
VALUES
  ('demo-org-001', 'Empresa Demo S.A.', 'Organizacion de demostracion para QuantumGuard AI', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Link Users to Organization
INSERT INTO user_organizations (user_id, organization_id, role, joined_at)
VALUES
  ('demo-user-001', 'demo-org-001', 'member', NOW()),
  ('demo-admin-001', 'demo-org-001', 'admin', NOW())
ON CONFLICT DO NOTHING;

-- Demo Documents (pre-signed for quick demo)
INSERT INTO documents (id, user_id, filename, original_name, mime_type, size, file_hash, status, created_at, updated_at)
VALUES
  ('demo-doc-001', 'demo-user-001', 'contrato_firmado.txt', 'Contrato de Servicios', 'text/plain', 1500, 'abc123hash', 'signed', NOW() - INTERVAL '2 days', NOW()),
  ('demo-doc-002', 'demo-user-001', 'factura_firmada.txt', 'Factura Enero 2026', 'text/plain', 1200, 'def456hash', 'signed', NOW() - INTERVAL '1 day', NOW()),
  ('demo-doc-003', 'demo-user-001', 'nda_pendiente.txt', 'Acuerdo NDA', 'text/plain', 2000, 'ghi789hash', 'pending', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Demo Signatures
INSERT INTO signatures (id, document_id, algorithm, public_key, signature_data, timestamp, quantum_safe, created_at)
VALUES
  ('demo-sig-001', 'demo-doc-001', 'ML-DSA-44', 'demo_public_key_base64_encoded', 'demo_signature_data_base64', NOW() - INTERVAL '2 days', true, NOW() - INTERVAL '2 days'),
  ('demo-sig-002', 'demo-doc-002', 'ML-DSA-65', 'demo_public_key_base64_encoded', 'demo_signature_data_base64', NOW() - INTERVAL '1 day', true, NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- Demo Audit Logs
INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
VALUES
  (gen_random_uuid(), 'demo-user-001', 'DOCUMENT_SIGNED', 'document', 'demo-doc-001', '{"algorithm": "ML-DSA-44", "success": true}', '127.0.0.1', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'demo-user-001', 'DOCUMENT_SIGNED', 'document', 'demo-doc-002', '{"algorithm": "ML-DSA-65", "success": true}', '127.0.0.1', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'demo-user-001', 'DOCUMENT_UPLOADED', 'document', 'demo-doc-003', '{"filename": "nda_pendiente.txt"}', '127.0.0.1', NOW())
ON CONFLICT DO NOTHING;

-- Verify data was inserted
SELECT 'Users:', COUNT(*) FROM users;
SELECT 'Documents:', COUNT(*) FROM documents;
SELECT 'Signatures:', COUNT(*) FROM signatures;
SELECT 'Audit Logs:', COUNT(*) FROM audit_logs;
