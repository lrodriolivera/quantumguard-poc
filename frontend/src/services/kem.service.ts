import api from './api';

export const kemService = {
  async generateKeypair(algorithm: string = 'ML-KEM-768') {
    const response = await api.post('/kem/keypair/generate', { algorithm });
    return response.data;
  },

  async encapsulate(publicKey: string, algorithm: string = 'ML-KEM-768') {
    const response = await api.post('/kem/encapsulate', { public_key: publicKey, algorithm });
    return response.data;
  },

  async decapsulate(ciphertext: string, keypairId: string, algorithm: string = 'ML-KEM-768') {
    const response = await api.post('/kem/decapsulate', { ciphertext, keypair_id: keypairId, algorithm });
    return response.data;
  },

  async listAlgorithms() {
    const response = await api.get('/kem/algorithms');
    return response.data;
  },
};
