import { createFetchTransport, TransportError, type FetchLike } from './transport';

/** Timeouts: a request that never answers must fail as a network error, not hang the controller. */
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const timeouts = { requestMs: 1000, uploadMs: 2000 };

/** A fetch that only ever settles when its signal is aborted. */
const hangingFetch: FetchLike = (_url, init) =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

describe('fetch transport timeouts', () => {
  it('aborts a GET after the request timeout and reports it as a network failure', async () => {
    const transport = createFetchTransport({ baseUrl: () => 'http://127.0.0.1:1', fetch: hangingFetch, uploadFile: async () => ({ status: 202, body: '' }), timeouts });
    const pending = transport.getJob('job-demo-001');
    const settled = pending.then(
      () => 'resolved',
      (e: unknown) => (e instanceof TransportError ? e.kind : 'other'),
    );
    await jest.advanceTimersByTimeAsync(timeouts.requestMs + 1);
    await expect(settled).resolves.toBe('network');
  });

  it('gives up waiting for an upload after the upload timeout; the outcome is then unknown (network)', async () => {
    const transport = createFetchTransport({ baseUrl: () => 'http://127.0.0.1:1', fetch: hangingFetch, uploadFile: () => new Promise(() => {}), timeouts });
    const pending = transport.createImport({ key: 'k'.repeat(8), fileName: 'statement.csv', uri: 'file:///copy' });
    const settled = pending.then(
      () => 'resolved',
      (e: unknown) => (e instanceof TransportError ? e.kind : 'other'),
    );
    await jest.advanceTimersByTimeAsync(timeouts.uploadMs + 1);
    await expect(settled).resolves.toBe('network');
  });

  it('passes an abort signal to fetch and clears the timer on a normal answer', async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchOk: FetchLike = async (_url, init) => {
      seenSignal = init?.signal;
      return { status: 404, text: async () => '' };
    };
    const transport = createFetchTransport({ baseUrl: () => 'http://127.0.0.1:1', fetch: fetchOk, uploadFile: async () => ({ status: 202, body: '' }), timeouts });
    await expect(transport.lookupByKey('k'.repeat(8))).resolves.toEqual({ kind: 'not_found' });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(timeouts.requestMs * 2);
    expect(seenSignal?.aborted).toBe(false);
  });
});

describe('Retry-After', () => {
  const withHeader = (status: number, body: string, retryAfter: string | null): FetchLike => async () => ({
    status,
    text: async () => body,
    headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? retryAfter : null) },
  });
  const make = (fetch: FetchLike) => createFetchTransport({ baseUrl: () => 'http://127.0.0.1:1', fetch, uploadFile: async () => ({ status: 202, body: '' }), timeouts });

  it('is carried on a found snapshot in milliseconds', async () => {
    const transport = make(withHeader(200, JSON.stringify({ jobId: 'job-demo-001', status: 'processing', revision: 2 }), '7'));
    await expect(transport.getJob('job-demo-001')).resolves.toMatchObject({ kind: 'found', retryAfterMs: 7000 });
  });

  it('is carried on a 404 and absent when the header is missing or not a delta-seconds value', async () => {
    await expect(make(withHeader(404, '', '2')).getJob('job-demo-001')).resolves.toEqual({ kind: 'not_found', retryAfterMs: 2000 });
    await expect(make(withHeader(404, '', null)).getJob('job-demo-001')).resolves.toEqual({ kind: 'not_found' });
    await expect(make(withHeader(404, '', 'Wed, 21 Oct 2026 07:28:00 GMT')).getJob('job-demo-001')).resolves.toEqual({ kind: 'not_found' });
  });
});
