jest.mock('../../src/models/document.model', () => ({ Document: {} }));
jest.mock('../../src/models/signature.model', () => ({ Signature: { count: jest.fn() } }));

import { Signature } from '../../src/models/signature.model';
import {
  QuotaExceededError,
  assertWithinSignatureQuota,
  planLimits,
} from '../../src/utils/plan.utils';

const mockCount = Signature.count as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe('planLimits', () => {
  it('free/basic/pro have the expected monthly quota and invite permission', () => {
    expect(planLimits('free')).toEqual({ monthlySignatures: 5, canInviteSigners: false });
    expect(planLimits('basic')).toEqual({ monthlySignatures: 30, canInviteSigners: true });
    expect(planLimits('pro')).toEqual({ monthlySignatures: 100, canInviteSigners: true });
  });

  it('falls back to free for an unknown plan value', () => {
    expect(planLimits('enterprise')).toEqual(planLimits('free'));
  });
});

describe('assertWithinSignatureQuota', () => {
  it('passes when usage is below the limit', async () => {
    mockCount.mockResolvedValue(4);
    await expect(assertWithinSignatureQuota('user-1', 'free')).resolves.toBeUndefined();
  });

  it('throws QuotaExceededError once usage reaches the limit', async () => {
    mockCount.mockResolvedValue(5);
    await expect(assertWithinSignatureQuota('user-1', 'free')).rejects.toThrow(QuotaExceededError);
  });

  it('reports the plan-specific limit in the error', async () => {
    mockCount.mockResolvedValue(30);
    await expect(assertWithinSignatureQuota('user-1', 'basic')).rejects.toMatchObject({ limit: 30, plan: 'basic' });
  });
});
