import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, listAssets } from '@/api/client';
import type { Asset, AssetQuery } from '@/lib/types';

interface State {
  items: Asset[];
  total: number;
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
}

/**
 * Baseline loader. Reviewers know this hook is wrong in several ways.
 * Replacing it wholesale is expected and encouraged.
 */
export function useAssets(query: AssetQuery) {
  const [state, setState] = useState<State>({
    items: [],
    total: 0,
    nextCursor: null,
    loading: true,
    error: null,
    hasMore: true,
  });
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [queryKey]);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    setState({ items: [], total: 0, nextCursor: null, loading: true, error: null, hasMore: true });
    listAssets({ ...debouncedQuery, cursor: undefined }, controller.signal)
      .then((page) => {
        if (currentRequest !== requestId.current) return;
        setState({
          items: page.items,
          total: page.total,
          nextCursor: page.nextCursor,
          loading: false,
          error: null,
          hasMore: Boolean(page.nextCursor),
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Something went wrong',
          hasMore: false,
        }));
      });
    return () => controller.abort('Query changed');
  }, [JSON.stringify(debouncedQuery)]);

  const loadMore = useCallback(() => {
    if (state.loading || !state.nextCursor || !state.hasMore) return;
    const controller = new AbortController();
    const currentRequest = requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    listAssets({ ...debouncedQuery, cursor: state.nextCursor }, controller.signal)
      .then((page) => {
        if (currentRequest !== requestId.current) return;
        setState((s) => ({
          ...s,
          items: [...s.items, ...page.items],
          nextCursor: page.nextCursor,
          total: page.total,
          loading: false,
          hasMore: Boolean(page.nextCursor),
        }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Could not load more assets' }));
      });
  }, [debouncedQuery, state.hasMore, state.loading, state.nextCursor]);

  const updateItem = useCallback((asset: Asset) => {
    setState((current) => ({ ...current, items: current.items.map((item) => item.id === asset.id ? asset : item) }));
  }, []);

  return { ...state, loadMore, updateItem };
}
