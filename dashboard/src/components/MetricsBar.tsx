'use client';

import { clsx } from 'clsx';
import type { NetworkState } from '@/hooks/useWebSocket';

export function MetricsBar({ state }: { state: NetworkState }) {
  const metrics = [
    {
      label: 'Total Value Locked',
      value: `${state.totalValueLocked.toFixed(2)} USDt`,
      color: 'text-cyan-400',
    },
    {
      label: 'Yield Earned',
      value: `+${state.totalYieldEarned.toFixed(4)} USDt`,
      color: 'text-green-400',
    },
    {
      label: 'Tips Distributed',
      value: `${state.totalTipsPaid.toFixed(2)} USDt`,
      color: 'text-yellow-400',
    },
    {
      label: 'Active Loans',
      value: state.loans.filter(l => l.status === 'active').length.toString(),
      color: 'text-green-400',
    },
    {
      label: 'DeFi Positions',
      value: state.positions.filter(p => p.amount > 0).length.toString(),
      color: 'text-purple-400',
    },
    {
      label: 'Network Health',
      value: state.networkHealth.toUpperCase(),
      color: state.networkHealth === 'healthy' ? 'text-green-400' :
             state.networkHealth === 'degraded' ? 'text-yellow-400' : 'text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-center">
          <p className="text-xs text-[var(--text-secondary)] mb-1">{m.label}</p>
          <p className={clsx('text-lg font-mono font-bold', m.color)}>{m.value}</p>
        </div>
      ))}
    </div>
  );
}
