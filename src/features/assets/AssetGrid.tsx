import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useRef, useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

interface CardProps {
  asset: Asset;
  selected: boolean;
  active: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

const AssetCard = memo(function AssetCard({ asset, selected, active, onToggleSelect, onOpen }: CardProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(!asset.hasThumbnail);
  return (
    <article className={`card${selected ? ' card--selected' : ''}${active ? ' card--active' : ''}`}>
      <button className="card__open" onClick={() => onOpen(asset.id)} aria-label={`Open ${asset.name}`}>
        {thumbnailFailed ? (
          <div className="card__thumb card__thumb--missing" aria-hidden="true">No preview</div>
        ) : (
          <img className="card__thumb" src={thumbnailUrl(asset.id)} alt="" loading="lazy" onError={() => setThumbnailFailed(true)} />
        )}
        <span className="card__body">
          <span className="card__name">{asset.name}</span>
          <span className="muted">{asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}</span>
          <span className={`pill pill--${asset.status}`}>{statusLabel(asset.status)}</span>
        </span>
      </button>
      <input type="checkbox" className="card__check" checked={selected} aria-label={`Select ${asset.name}`} onChange={() => onToggleSelect(asset.id)} />
    </article>
  );
});

export function AssetGrid({ assets, selectedIds, activeId, hasMore, loading, onLoadMore, onToggleSelect, onOpen }: Props) {
  const [columns, setColumns] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(assets.length / columns) + (hasMore ? 1 : 0);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 274,
    overscan: 3,
  });

  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const updateColumns = () => setColumns(Math.max(1, Math.floor(element.clientWidth / 232)));
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const last = virtualizer.getVirtualItems().at(-1);
    if (last && last.index >= rowCount - 2 && hasMore && !loading) onLoadMore();
  }, [virtualizer.getVirtualItems(), rowCount, hasMore, loading, onLoadMore]);

  if (assets.length === 0 && !loading) return <div className="empty"><p>Nothing matches these filters.</p><p className="muted">Clear the search box or widen the filters.</p></div>;

  return (
    <div className="grid" ref={scrollRef}>
      <div className="grid__measure" ref={measureRef}>
        <div className="grid__virtual" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const rowAssets = assets.slice(row.index * columns, (row.index + 1) * columns);
            if (rowAssets.length === 0) return <div className="grid__loading" key={row.key}>Loading more…</div>;
            return (
              <div className="grid__row" key={row.key} style={{ transform: `translateY(${row.start}px)` }}>
                {rowAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    selected={selectedIds.has(asset.id)}
                    active={activeId === asset.id}
                    onToggleSelect={onToggleSelect}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
