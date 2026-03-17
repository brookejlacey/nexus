'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface NetworkState {
  agents: Record<string, AgentStatus>;
  loans: Loan[];
  positions: DeFiPosition[];
  tips: TipRecord[];
  totalValueLocked: number;
  totalYieldEarned: number;
  totalTipsPaid: number;
  networkHealth: 'healthy' | 'degraded' | 'critical';
  lastUpdated: number;
}

interface AgentStatus {
  role: string;
  status: 'active' | 'paused' | 'error';
  walletAddress: string;
  balance: number;
  pnl: number;
  lastAction: string;
  lastActionTime: number;
  reasoning?: string;
}

interface Loan {
  id: string;
  borrower: string;
  lender: string;
  principal: number;
  interestRate: number;
  issuedAt: number;
  dueAt: number;
  repaidAmount: number;
  status: string;
  purpose: string;
}

interface DeFiPosition {
  id: string;
  protocol: string;
  chain: string;
  type: string;
  asset: string;
  amount: number;
  currentValue: number;
  apy: number;
  openedAt: number;
}

interface TipRecord {
  id: string;
  creator: string;
  platform: string;
  amount: number;
  reason: string;
  fundSource: string;
  timestamp: number;
}

interface AgentDecision {
  agent: string;
  action: string;
  reasoning: string;
  confidence: number;
  timestamp: number;
}

interface DashboardEvent {
  type: 'state_update' | 'agent_decision' | 'transaction' | 'message' | 'alert';
  data: any;
}

export type { NetworkState, AgentStatus, Loan, DeFiPosition, TipRecord, AgentDecision };

export function useWebSocket(url: string) {
  const [state, setState] = useState<NetworkState | null>(null);
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [alerts, setAlerts] = useState<{ level: string; message: string; timestamp: number }[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg: DashboardEvent = JSON.parse(event.data);

          switch (msg.type) {
            case 'state_update':
              setState(msg.data);
              break;
            case 'agent_decision':
              setDecisions(prev => [...prev.slice(-49), msg.data]);
              break;
            case 'alert':
              setAlerts(prev => [...prev.slice(-19), { ...msg.data, timestamp: Date.now() }]);
              break;
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { state, decisions, alerts, connected };
}
