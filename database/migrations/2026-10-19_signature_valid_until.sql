-- Signatures created before 2026-10-19 stored valid_until = signing time + 50 years,
-- unrelated to their X.509 signer certificate, which was always issued for 365 days
-- at signing time. Align valid_until with the certificate's real notAfter.
BEGIN;

UPDATE signatures
SET valid_until = "timestamp" + INTERVAL '365 days'
WHERE valid_until - "timestamp" > INTERVAL '2 years';

COMMIT;
