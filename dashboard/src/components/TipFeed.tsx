'use client';

import type { TipRecord } from '@/hooks/useWebSocket';

export function TipFeed({ tips }: { tips: TipRecord[] }) {
  const sorted = [...tips].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-lg font-bold mb-4 text-yellow-400">Creator Tips</h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] italic">No tips yet — waiting for yield funding</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {sorted.map((tip) => (
            <div key={tip.id} className="flex items-center justify-between py-2 border-b border-[var(--border)]/50">
              <div>
                <p className="text-sm font-medium">{tip.creator}</p>
                <p className="text-xs text-[var(--text-secondary)]">{tip.platform} &middot; {tip.fundSource}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-bold text-yellow-400">{tip.amount.toFixed(2)} USDt</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {new Date(tip.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
