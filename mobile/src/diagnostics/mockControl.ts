import type { ServerStatus } from '@/import/types';

/**
 * Test control of the kit's mock server (`/__test/*`). Not part of the production architecture:
 * used by the diagnostics screen in dev builds and by integration tests.
 */
export type ScenarioMode = 'happy' | 'lost_ack' | 'stale_status' | 'delete_failure';
export const SCENARIOS: ScenarioMode[] = ['happy', 'lost_ack', 'stale_status', 'delete_failure'];

export interface MockState {
  mode: ScenarioMode;
  stats: { createRequests: number; newJobs: number; duplicateHits: number; acceptedBytes: number; deleteRequests: number };
  jobs: { jobId: string; status: ServerStatus; revision: number }[];
}

export interface MockControl {
  setScenario(mode: ScenarioMode): Promise<void>;
  reset(): Promise<void>;
  state(): Promise<MockState>;
}

export function createMockControl(baseUrl: () => string): MockControl {
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl().replace(/\/+$/, '')}${path}`, init);
    if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
    return response;
  };
  return {
    async setScenario(mode) {
      await call('/__test/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
    },
    async reset() {
      await call('/__test/reset', { method: 'POST' });
    },
    state: async () => (await call('/__test/state')).json() as Promise<MockState>,
  };
}
