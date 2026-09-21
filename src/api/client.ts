import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';

/**
 * Baseline client. It works on a good network and falls apart on a bad one.
 *
 * Known gaps, all of which are yours to close:
 *   - no request cancellation
 *   - no retry, no backoff, no handling of Retry-After
 *   - no de-duplication of concurrent identical requests
 *   - error information is flattened into a string
 *   - callers cannot distinguish "retry this" from "do not retry this"
 */

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.kind?.length) params.set('kind', query.kind.join(','));
  if (query.tag?.length) params.set('tag', query.tag.join(','));
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return params.toString();
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const maxAttempts = method === 'GET' || method === 'PATCH' ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (res.ok) return res.json() as Promise<T>;

    let code = 'http_error';
    let detail = res.statusText;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      detail = body?.error?.message ?? detail;
    } catch {
      // Keep the HTTP status text when the server did not send JSON.
    }
    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    const retryable = (method === 'GET' && (res.status === 503 || res.status === 429))
      || (method === 'PATCH' && res.status === 500 && code === 'write_failed');
    if (!retryable || attempt === maxAttempts - 1) {
      throw new ApiError(`${res.status}: ${detail}`, res.status, code, retryAfter);
    }
    const delay = retryAfter && Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : Math.min(1000 * 2 ** attempt, 4000) + Math.round(Math.random() * 250);
    await sleep(delay, init?.signal ?? undefined);
  }
  throw new Error('Request failed');
}

interface InFlightPage {
  path: string;
  controller: AbortController;
  promise: Promise<AssetPage>;
  subscribers: Set<symbol>;
}

const inFlightPages = new Map<string, InFlightPage>();

function removeInFlightPage(entry: InFlightPage) {
  if (inFlightPages.get(entry.path) === entry) inFlightPages.delete(entry.path);
}

function subscribeToPage(entry: InFlightPage, signal?: AbortSignal): Promise<AssetPage> {
  const token = Symbol();
  entry.subscribers.add(token);

  return new Promise<AssetPage>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      entry.subscribers.delete(token);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      if (entry.subscribers.size === 0) {
        removeInFlightPage(entry);
        entry.controller.abort('No active subscribers');
      }
      reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    entry.promise.then(
      (page) => { cleanup(); resolve(page); },
      (error: unknown) => { cleanup(); reject(error); },
    );
  });
}

export function listAssets(query: AssetQuery, signal?: AbortSignal): Promise<AssetPage> {
  const path = `/api/assets?${toSearchParams(query)}`;
  const existing = inFlightPages.get(path);
  if (existing) return subscribeToPage(existing, signal);

  const controller = new AbortController();
  const entry: InFlightPage = {
    path,
    controller,
    promise: request<AssetPage>(path, { signal: controller.signal }),
    subscribers: new Set(),
  };
  entry.promise.then(
    () => removeInFlightPage(entry),
    () => removeInFlightPage(entry),
  );
  inFlightPages.set(path, entry);
  return subscribeToPage(entry, signal);
}

export function getAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, { signal });
}

export function getAssetsByIds(ids: string[]): Promise<{ items: Asset[]; missing: string[] }> {
  // Note: the endpoint rejects more than 25 ids per call.
  return request(`/api/assets/batch?ids=${ids.join(',')}`);
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, patch }),
  });
}

export function bulkSetStatus(ids: string[], status: Asset['status']): Promise<BulkResult> {
  // Note: the endpoint rejects more than 50 ids per call.
  return request<BulkResult>('/api/assets/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
  });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
