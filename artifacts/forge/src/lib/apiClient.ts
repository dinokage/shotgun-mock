// src/lib/apiClient.ts
const API_BASE_URL = 'http://localhost:8000/api/v1';

const getAuthHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    const authStorage = localStorage.getItem('forge-auth');
    if (authStorage) {
      const { state } = JSON.parse(authStorage);
      if (state && state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
      }
    }
  } catch (e) {}
  return headers;
};

export const apiClient = {
  get: async (endpoint: string) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`API GET request failed: ${response.statusText}`);
    }
    return response.json();
  },
  post: async (endpoint: string, data?: any) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      throw new Error(`API POST request failed: ${response.statusText}`);
    }
    return response.json();
  },
  put: async (endpoint: string, data?: any) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      throw new Error(`API PUT request failed: ${response.statusText}`);
    }
    return response.json();
  },
};
