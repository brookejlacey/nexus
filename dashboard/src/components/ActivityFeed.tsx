'use client';

import { clsx } from 'clsx';
import type { AgentDecision } from '@/hooks/useWebSocket';

const agentColors: Record<string, string> = {
  nexus: 'text-cyan-400',
  banker: 'text-green-400',
  strategist: 'text-purple-400',
  patron: 'text-yellow-400',
};

export function ActivityFeed({ decisions }: { decisions: AgentDecision[] }) {
  const sorted = [...decisions].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-lg font-bold mb-4 text-[var(--text-primary)]">Agent Decisions</h2>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {sorted.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)] italic">Waiting for agent decisions...</p>
        )}

        {sorted.map((d, i) => (
          <div key={`${d.timestamp}-${i}`} className="border-l-2 border-[var(--border)] pl-3 py-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx('text-xs font-bold uppercase', agentColors[d.agent] || 'text-gray-400')}>
                {d.agent}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {new Date(d.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                {d.action}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                ({(d.confidence * 100).toFixed(0)}%)
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{d.reasoning}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
