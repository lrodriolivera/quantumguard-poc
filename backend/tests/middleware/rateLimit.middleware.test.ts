import { rateLimit } from '../../src/middleware/rateLimit.middleware';

function call(limiter: ReturnType<typeof rateLimit>, req: any) {
  const res: any = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  const next = jest.fn();
  limiter(req, res, next);
  return { blocked: res.status.mock.calls.some((c: any[]) => c[0] === 429), next };
}

describe('rateLimit', () => {
  it('keeps separate counters per limiter', () => {
    const a = rateLimit({ name: 'test-a', windowMs: 60000, maxRequests: 1 });
    const b = rateLimit({ name: 'test-b', windowMs: 60000, maxRequests: 1 });
    const req = { ip: '203.0.113.1', headers: {}, socket: {} };

    expect(call(a, req).blocked).toBe(false);
    expect(call(b, req).blocked).toBe(false);
    expect(call(a, req).blocked).toBe(true);
  });

  it('cannot be evaded by rotating X-Forwarded-For', () => {
    const limiter = rateLimit({ name: 'test-xff', windowMs: 60000, maxRequests: 2 });
    const results = [1, 2, 3].map((i) =>
      call(limiter, { ip: '198.51.100.7', headers: { 'x-forwarded-for': `10.0.0.${i}` }, socket: {} }),
    );
    expect(results.map((r) => r.blocked)).toEqual([false, false, true]);
  });
});
