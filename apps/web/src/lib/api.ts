import type { HealthStatus } from '@adoptafacil/contracts';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Minimal API client — calls the backend /health endpoint (walking skeleton). */
export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return (await response.json()) as HealthStatus;
}
