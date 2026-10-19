import api from './api';
import type {
  CreateEnvelopeRequest,
  Envelope,
  PublicSignerInfo,
} from '../types';

/** Owner side (authenticated): create and track signing requests. */
export const envelopeService = {
  async createEnvelope(payload: CreateEnvelopeRequest): Promise<Envelope> {
    const response = await api.post('/envelopes', payload);
    return response.data.envelope;
  },

  async listEnvelopes(): Promise<Envelope[]> {
    const response = await api.get('/envelopes');
    return response.data.envelopes;
  },

  async getEnvelope(id: string): Promise<Envelope> {
    const response = await api.get(`/envelopes/${id}`);
    return response.data.envelope;
  },

  async voidEnvelope(id: string): Promise<void> {
    await api.post(`/envelopes/${id}/void`);
  },
};

/**
 * Public signing link (no account): identified only by the token in the
 * URL. Uses the same axios instance as the rest of the app — it attaches a
 * bearer token when one happens to be in storage, which these endpoints
 * simply ignore, and otherwise sends none.
 */
export const signLinkService = {
  async getSigner(token: string): Promise<PublicSignerInfo> {
    const response = await api.get(`/sign/${token}`);
    return response.data;
  },

  async requestOtp(token: string): Promise<{ expires_in_seconds: number }> {
    const response = await api.post(`/sign/${token}/otp`);
    return response.data;
  },

  async verifyOtp(token: string, code: string): Promise<void> {
    await api.post(`/sign/${token}/otp/verify`, { code });
  },

  async sign(token: string): Promise<{ envelope_status: string }> {
    const response = await api.post(`/sign/${token}/sign`);
    return response.data;
  },

  async decline(token: string, reason?: string): Promise<void> {
    await api.post(`/sign/${token}/decline`, reason ? { reason } : {});
  },
};
