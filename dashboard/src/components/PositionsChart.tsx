'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { DeFiPosition, NetworkState } from '@/hooks/useWebSocket';

const COLORS = ['#a78bfa', '#34d399', '#fbbf24', '#f87171', '#22d3ee', '#f472b6'];

const protocolLabels: Record<string, string> = {
  aave: 'Aave V3',
  velora: 'Velora DEX',
  usdt0_bridge: 'USDT0 Bridge',
};

export function PositionsChart({ state }: { state: NetworkState }) {
  const activePositions = state.positions.filter(p => p.amount > 0);

  // Aggregate by protocol
  const byProtocol = activePositions.reduce((acc, p) => {
    const key = p.protocol;
    if (!acc[key]) acc[key] = { name: protocolLabels[key] || key, value: 0, apy: 0, count: 0 };
    acc[key].value += p.currentValue;
    acc[key].apy += p.apy;
    acc[key].count++;
    return acc;
  }, {} as Record<string, { name: string; value: number; apy: number; count: number }>);

  const pieData = Object.values(byProtocol).map(d => ({ ...d, apy: d.apy / d.count }));

  // APY comparison data
  const apyData = activePositions.map(p => ({
    name: `${protocolLabels[p.protocol] || p.protocol} (${p.chain})`,
    apy: +(p.apy * 100).toFixed(1),
    value: +p.currentValue.toFixed(2),
  }));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-lg font-bold mb-4 text-purple-400">DeFi Positions</h2>

      {activePositions.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] italic">No active positions — Strategist is scanning opportunities</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Allocation Pie */}
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-2 text-center">Capital Allocation</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a42', borderRadius: '8px' }}
                  labelStyle={{ color: '#e4e4ef' }}
                  formatter={(value: number) => [`${value.toFixed(2)} USDt`, 'Value']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 mt-1">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-[var(--text-secondary)]">{d.name}</span>
                  <span className="font-mono">{d.value.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* APY Bar Chart */}
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-2 text-center">Yield Rates (APY %)</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={apyData} layout="vertical" margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a42" />
                <XAxis type="number" tick={{ fill: '#8888a8', fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#8888a8', fontSize: 9 }} width={100} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a42', borderRadius: '8px' }}
                  formatter={(value: number) => [`${value}%`, 'APY']}
                />
                <Bar dataKey="apy" fill="#a78bfa" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Position details table */}
      {activePositions.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-secondary)] uppercase">
                <th className="pb-1 text-left">ID</th>
                <th className="pb-1 text-left">Protocol</th>
                <th className="pb-1 text-left">Chain</th>
                <th className="pb-1 text-right">Deployed</th>
                <th className="pb-1 text-right">Current</th>
                <th className="pb-1 text-right">APY</th>
                <th className="pb-1 text-right">P&L</th>
              </tr>
            </thead>
            <tbody>
              {activePositions.map(p => {
                const pnl = p.currentValue - p.amount;
                return (
                  <tr key={p.id} className="border-b border-[var(--border)]/30">
                    <td className="py-1.5 font-mono">{p.id}</td>
                    <td className="py-1.5">{protocolLabels[p.protocol] || p.protocol}</td>
                    <td className="py-1.5 capitalize">{p.chain}</td>
                    <td className="py-1.5 text-right font-mono">{p.amount.toFixed(2)}</td>
                    <td className="py-1.5 text-right font-mono">{p.currentValue.toFixed(2)}</td>
                    <td className="py-1.5 text-right font-mono text-purple-400">{(p.apy * 100).toFixed(1)}%</td>
                    <td className={`py-1.5 text-right font-mono ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
