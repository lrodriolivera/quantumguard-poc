/**
 * Public PKI routes: trust anchors, issuing CA certificates and CRLs, so
 * third parties can verify QuantumGuard signatures without an account.
 */

import { Router, Request, Response } from 'express';
import { cryptoService } from '../services/crypto.service';

const router = Router();
const PUBLIC_NAMES = new Set(['root', 'legacy', 'tsa', 'CL', 'CO', 'ES']);

function parseName(file: string, extension: string): string | null {
  if (!file.endsWith(extension)) return null;
  const name = file.slice(0, -extension.length);
  return PUBLIC_NAMES.has(name) ? name : null;
}

async function proxy(res: Response, load: () => Promise<void>): Promise<void> {
  try {
    await load();
  } catch (error: any) {
    const status = error?.response?.status === 404 ? 404 : 503;
    res.status(status).json({ error: status === 404 ? 'Not Found' : 'Service Unavailable' });
  }
}

router.get('/countries', (_req: Request, res: Response) =>
  proxy(res, async () => {
    res.set('Cache-Control', 'public, max-age=3600').json(await cryptoService.listCountries());
  }),
);

router.get('/ca', (_req: Request, res: Response) =>
  proxy(res, async () => {
    const trust = await cryptoService.getTrustMaterial();
    res.set('Cache-Control', 'public, max-age=3600').json({
      root: trust.root_pem,
      issuing: trust.issuing_pem,
      tsa: trust.tsa_pem,
      legacy: trust.legacy_pem,
    });
  }),
);

router.get('/ca/:file', (req: Request, res: Response) => {
  const name = parseName(req.params.file, '.crt');
  if (!name) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  return proxy(res, async () => {
    res.set('Cache-Control', 'public, max-age=86400').type('application/x-pem-file')
      .send(await cryptoService.getCaFile(name));
  });
});

router.get('/crl/:file', (req: Request, res: Response) => {
  const name = parseName(req.params.file, '.crl');
  if (!name || name === 'tsa') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  return proxy(res, async () => {
    res.set('Cache-Control', 'public, max-age=3600').type('application/pkix-crl')
      .send(await cryptoService.getCrl(name));
  });
});

export default router;
