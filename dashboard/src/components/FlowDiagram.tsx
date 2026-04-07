'use client';

import type { NetworkState } from '@/hooks/useWebSocket';

/**
 * Visual representation of money flowing between agents.
 * Shows the Syndex network topology with live transaction flows.
 */
export function FlowDiagram({ state }: { state: NetworkState }) {
  const agents = state.agents ?? {};

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="text-lg font-bold mb-4 text-cyan-400">Network Topology</h2>

      <svg viewBox="0 0 600 300" className="w-full h-64">
        {/* Connection lines */}
        <line x1="300" y1="60" x2="150" y2="180" stroke="#22d3ee" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" className="animate-flow" />
        <line x1="300" y1="60" x2="300" y2="180" stroke="#22d3ee" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" className="animate-flow" />
        <line x1="300" y1="60" x2="450" y2="180" stroke="#22d3ee" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" className="animate-flow" />

        {/* Banker → Strategist (loans) */}
        <line x1="150" y1="180" x2="300" y2="180" stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />

        {/* Strategist → Patron (yield) */}
        <line x1="300" y1="180" x2="450" y2="180" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />

        {/* Strategist → Banker (repayment) */}
        <line x1="300" y1="195" x2="150" y2="195" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />

        {/* Syndex node */}
        <circle cx="300" cy="50" r="30" fill="#1a1a2e" stroke="#22d3ee" strokeWidth="2" />
        <text x="300" y="45" textAnchor="middle" fill="#22d3ee" fontSize="10" fontWeight="bold">SYNDEX</text>
        <text x="300" y="60" textAnchor="middle" fill="#8888a8" fontSize="8">
          {(agents.syndex?.balance ?? 0).toFixed(0)} USDt
        </text>

        {/* Banker node */}
        <circle cx="150" cy="180" r="28" fill="#1a1a2e" stroke="#34d399" strokeWidth="2" />
        <text x="150" y="175" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">BANKER</text>
        <text x="150" y="190" textAnchor="middle" fill="#8888a8" fontSize="8">
          {(agents.banker?.balance ?? 0).toFixed(0)} USDt
        </text>

        {/* Strategist node */}
        <circle cx="300" cy="180" r="28" fill="#1a1a2e" stroke="#a78bfa" strokeWidth="2" />
        <text x="300" y="175" textAnchor="middle" fill="#a78bfa" fontSize="10" fontWeight="bold">STRAT</text>
        <text x="300" y="190" textAnchor="middle" fill="#8888a8" fontSize="8">
          {(agents.strategist?.balance ?? 0).toFixed(0)} USDt
        </text>

        {/* Patron node */}
        <circle cx="450" cy="180" r="28" fill="#1a1a2e" stroke="#fbbf24" strokeWidth="2" />
        <text x="450" y="175" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">PATRON</text>
        <text x="450" y="190" textAnchor="middle" fill="#8888a8" fontSize="8">
          {(agents.patron?.balance ?? 0).toFixed(0)} USDt
        </text>

        {/* Flow labels */}
        <text x="210" y="170" textAnchor="middle" fill="#34d399" fontSize="7" opacity="0.8">loans</text>
        <text x="380" y="170" textAnchor="middle" fill="#a78bfa" fontSize="7" opacity="0.8">yield</text>
        <text x="210" y="210" textAnchor="middle" fill="#fbbf24" fontSize="7" opacity="0.6">repay</text>

        {/* Creators output */}
        <text x="450" y="240" textAnchor="middle" fill="#fbbf24" fontSize="8" opacity="0.6">↓ tips → creators</text>

        {/* DeFi input */}
        <text x="300" y="240" textAnchor="middle" fill="#a78bfa" fontSize="8" opacity="0.6">↕ DeFi protocols</text>
      </svg>

      {/* Legend */}
      <div className="flex gap-6 justify-center mt-2 text-xs text-[var(--text-secondary)]">
        <span><span className="text-green-400">●</span> Lending</span>
        <span><span className="text-purple-400">●</span> Yield</span>
        <span><span className="text-yellow-400">●</span> Tipping</span>
        <span><span className="text-cyan-400">●</span> Orchestration</span>
      </div>
    </div>
  );
}
