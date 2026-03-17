'use client';

import { useWebSocket } from '@/hooks/useWebSocket';
import { AgentCard } from '@/components/AgentCard';
import { FlowDiagram } from '@/components/FlowDiagram';
import { MetricsBar } from '@/components/MetricsBar';
import { ActivityFeed } from '@/components/ActivityFeed';
import { LoanTable } from '@/components/LoanTable';
import { TipFeed } from '@/components/TipFeed';
import { PositionsChart } from '@/components/PositionsChart';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export default function Dashboard() {
  const { state, decisions, alerts, connected } = useWebSocket(WS_URL);

  return (
    <div className="min-h-screen p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-cyan-400">NEXUS</span>
            <span className="text-[var(--text-secondary)] font-normal text-lg ml-3">Multi-Agent Economic Network</span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Self-sustaining AI agents earning, lending, and tipping — powered by Tether WDK
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${connected ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
            <div className={`w-2 h-2 rounded-full animate-pulse-dot ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs font-medium">{connected ? 'LIVE' : 'CONNECTING'}</span>
          </div>
        </div>
      </header>

      {!state ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-pulse">⬡</div>
            <p className="text-[var(--text-secondary)]">Connecting to Nexus network...</p>
            <p className="text-xs text-[var(--text-secondary)] mt-2">Make sure the agent runtime is running on port 3001</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.slice(-3).map((alert, i) => (
                <div key={i} className={`px-4 py-2 rounded-lg border text-sm ${
                  alert.level === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-400' :
                  alert.level === 'warn' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' :
                  'border-blue-500/30 bg-blue-500/10 text-blue-400'
                }`}>
                  {alert.message}
                </div>
              ))}
            </div>
          )}

          {/* Top metrics */}
          <MetricsBar state={state} />

          {/* Agent cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(['nexus', 'banker', 'strategist', 'patron'] as const).map(role => (
              <AgentCard key={role} agent={state.agents[role]} />
            ))}
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column — Flow + Positions + Loans */}
            <div className="lg:col-span-2 space-y-6">
              <FlowDiagram state={state} />
              <PositionsChart state={state} />
              <LoanTable loans={state.loans} />
            </div>

            {/* Right column — Activity + Tips */}
            <div className="space-y-6">
              <ActivityFeed decisions={decisions} />
              <TipFeed tips={state.tips} />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-[var(--border)] text-center text-xs text-[var(--text-secondary)]">
        NEXUS — Built for Hackathon Galactica: WDK Edition 1 | Powered by Tether WDK + Claude AI + OpenClaw
      </footer>
    </div>
  );
}
