'use client';

import { clsx } from 'clsx';
import type { AgentStatus } from '@/hooks/useWebSocket';

const roleConfig: Record<string, { label: string; icon: string; color: string; glowClass: string }> = {
  nexus: { label: 'NEXUS', icon: '⬡', color: 'text-cyan-400', glowClass: 'glow-blue' },
  banker: { label: 'BANKER', icon: '🏦', color: 'text-green-400', glowClass: 'glow-green' },
  strategist: { label: 'STRATEGIST', icon: '📊', color: 'text-purple-400', glowClass: 'glow-purple' },
  patron: { label: 'PATRON', icon: '💝', color: 'text-yellow-400', glowClass: 'glow-yellow' },
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  error: 'bg-red-500',
};

export function AgentCard({ agent }: { agent: AgentStatus }) {
  const config = roleConfig[agent.role] || roleConfig.nexus;
  const timeSince = Math.round((Date.now() - agent.lastActionTime) / 1000);

  return (
    <div className={clsx(
      'rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition-all hover:bg-[var(--bg-card-hover)]',
      config.glowClass,
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{config.icon}</span>
          <h3 className={clsx('font-bold text-lg tracking-wider', config.color)}>
            {config.label}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className={clsx('w-2 h-2 rounded-full animate-pulse-dot', statusColors[agent.status])} />
          <span className="text-xs text-[var(--text-secondary)] uppercase">{agent.status}</span>
        </div>
      </div>

      {/* Balance */}
      <div className="mb-3">
        <p className="text-xs text-[var(--text-secondary)] mb-1">Balance</p>
        <p className="text-2xl font-mono font-bold">{agent.balance.toFixed(2)} <span className="text-sm text-[var(--text-secondary)]">USDt</span></p>
      </div>

      {/* PnL */}
      <div className="mb-3">
        <p className="text-xs text-[var(--text-secondary)] mb-1">P&L</p>
        <p className={clsx('text-lg font-mono font-semibold', agent.pnl >= 0 ? 'text-green-400' : 'text-red-400')}>
          {agent.pnl >= 0 ? '+' : ''}{agent.pnl.toFixed(4)} USDt
        </p>
      </div>

      {/* Last Action */}
      <div className="pt-3 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--text-secondary)] mb-1">Last Action ({timeSince}s ago)</p>
        <p className="text-sm truncate">{agent.lastAction}</p>
      </div>

      {/* Wallet */}
      <div className="mt-2">
        <p className="text-xs text-[var(--text-secondary)] font-mono truncate">
          {agent.walletAddress.slice(0, 10)}...{agent.walletAddress.slice(-8)}
        </p>
      </div>
    </div>
  );
}
