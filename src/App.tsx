import { useEffect, useState } from 'react';
import { bulkSetStatus } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { useAssets } from '@/features/assets/useAssets';
import { statusLabel } from '@/lib/format';
import type { AssetStatus, AssetQuery } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status')?.split(',').filter((value): value is AssetStatus => STATUSES.includes(value as AssetStatus)) ?? [];
  const sort = params.get('sort') as NonNullable<AssetQuery['sort']> | null;
  return { q: params.get('q') ?? '', status, sort: sort && SORTS.some((option) => option.value === sort) ? sort : 'updatedAt:desc' as const };
}

export function App() {
  const initial = readQuery();
  const [q, setQ] = useState(initial.q);
  const [status, setStatus] = useState<AssetStatus[]>(initial.status);
  const [sort, setSort] = useState<NonNullable<AssetQuery['sort']>>(initial.sort);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  const { items, total, loading, error, hasMore, loadMore, updateItem } = useAssets({ q, status, sort, limit: 48 });

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status.length) params.set('status', status.join(','));
    if (sort !== 'updatedAt:desc') params.set('sort', sort);
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
  }, [q, status, sort]);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => { window.removeEventListener('online', markOnline); window.removeEventListener('offline', markOffline); };
  }, []);
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setNotice(null);
    const results: Array<{ id: string; ok: boolean; code?: string; asset?: import('@/lib/types').Asset }> = [];
    try {
      for (let index = 0; index < ids.length; index += 50) {
        const result = await bulkSetStatus(ids.slice(index, index + 50), next);
        results.push(...result.results);
      }
      const failed = results.filter((result) => !result.ok);
      const codes = [...new Set(failed.map((result) => result.code).filter(Boolean))].join(', ');
      setNotice(`${results.length - failed.length} updated, ${failed.length} failed${codes ? ` (${codes})` : ''}.`);
      setSelectedIds(new Set(failed.map((result) => result.id)));
      results.forEach((result) => { if (result.ok && result.asset) updateItem(result.asset); });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Bulk update failed. Try again.');
    } finally {
      setBulkBusy(false);
    }
  }

  function handleSaved() {
    setNotice('Asset saved. Refresh the current filter to see its new sort position.');
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          className="search"
          type="search"
          placeholder="Search assets"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>

      <div className="filters">
        {STATUSES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={status.includes(s)}
              onChange={(e) =>
                setStatus((prev) =>
                  e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                )
              }
            />
            {statusLabel(s)}
          </label>
        ))}
        <span className="muted">
          {loading ? 'Loading…' : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
      </div>
      {!online && <p className="error" role="alert">You are offline. Existing results remain available; changes will resume when connected.</p>}

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
      )}

      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error} <button onClick={() => window.location.reload()}>Retry</button></p>}

      <main className="content">
        <AssetGrid
          assets={items}
          selectedIds={selectedIds}
          activeId={activeId}
          hasMore={hasMore}
          loading={loading}
          onLoadMore={loadMore}
          onToggleSelect={toggleSelect}
          onOpen={setActiveId}
        />
        {activeId && (
          <AssetDetail id={activeId} onClose={() => setActiveId(null)} onSaved={(asset) => { updateItem(asset); handleSaved(); }} />
        )}
      </main>
    </div>
  );
}
