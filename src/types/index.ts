import { z } from 'zod';

// ─── Agent Identity ───────────────────────────────────────────────
export type AgentRole = 'nexus' | 'banker' | 'strategist' | 'patron';

export interface AgentIdentity {
  role: AgentRole;
  walletAddress: string;
  chain: string;
}

// ─── Inter-Agent Messages ─────────────────────────────────────────
export const MessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('loan_request'),
    from: z.string(),
    to: z.string(),
    amount: z.number(),
    purpose: z.string(),
    expectedReturn: z.number(),
    duration: z.number(), // hours
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('loan_response'),
    from: z.string(),
    to: z.string(),
    approved: z.boolean(),
    amount: z.number(),
    interestRate: z.number(),
    loanId: z.string(),
    reason: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('repayment'),
    from: z.string(),
    to: z.string(),
    loanId: z.string(),
    amount: z.number(),
    principal: z.number(),
    interest: z.number(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('yield_report'),
    from: z.string(),
    to: z.string(),
    totalYield: z.number(),
    positions: z.array(z.object({
      protocol: z.string(),
      chain: z.string(),
      amount: z.number(),
      apy: z.number(),
    })),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('fund_transfer'),
    from: z.string(),
    to: z.string(),
    amount: z.number(),
    purpose: z.string(),
    txHash: z.string().optional(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('tip_executed'),
    from: z.string(),
    to: z.string(),
    creator: z.string(),
    amount: z.number(),
    reason: z.string(),
    txHash: z.string().optional(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('health_check'),
    from: z.string(),
    to: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('health_response'),
    from: z.string(),
    to: z.string(),
    status: z.enum(['healthy', 'degraded', 'critical']),
    balance: z.number(),
    activePositions: z.number(),
    pnl: z.number(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('circuit_break'),
    from: z.string(),
    to: z.string(),
    reason: z.string(),
    action: z.enum(['pause', 'resume', 'liquidate']),
    timestamp: z.number(),
  }),
]);

export type AgentMessage = z.infer<typeof MessageSchema>;

// ─── Loan Tracking ───────────────────────────────────────────────
export interface Loan {
  id: string;
  borrower: AgentRole;
  lender: AgentRole;
  principal: number;
  interestRate: number; // annualized
  issuedAt: number;
  dueAt: number;
  repaidAmount: number;
  status: 'active' | 'repaid' | 'defaulted' | 'liquidated';
  purpose: string;
  txHash?: string;
}

// ─── DeFi Position ────────────────────────────────────────────────
export interface DeFiPosition {
  id: string;
  protocol: string;
  chain: string;
  type: 'supply' | 'swap' | 'bridge' | 'lp';
  asset: string;
  amount: number;
  entryPrice: number;
  currentValue: number;
  apy: number;
  openedAt: number;
  txHash?: string;
}

// ─── Credit Score ────────────────────────────────────────────────
export interface CreditProfile {
  agent: AgentRole;
  score: number; // 0-1000
  totalBorrowed: number;
  totalRepaid: number;
  defaultCount: number;
  avgRepaymentTime: number; // ms
  lastUpdated: number;
}

// ─── Tip Record ──────────────────────────────────────────────────
export interface TipRecord {
  id: string;
  creator: string;
  platform: string;
  amount: number;
  reason: string;
  fundSource: 'yield' | 'pool' | 'direct';
  timestamp: number;
  txHash?: string;
}

// ─── Network State (for dashboard) ──────────────────────────────
export interface NetworkState {
  agents: Record<AgentRole, AgentStatus>;
  loans: Loan[];
  positions: DeFiPosition[];
  tips: TipRecord[];
  totalValueLocked: number;
  totalYieldEarned: number;
  totalTipsPaid: number;
  networkHealth: 'healthy' | 'degraded' | 'critical';
  lastUpdated: number;
}

export interface AgentStatus {
  role: AgentRole;
  status: 'active' | 'paused' | 'error';
  walletAddress: string;
  balance: number;
  pnl: number;
  lastAction: string;
  lastActionTime: number;
  reasoning?: string;
}

// ─── Agent Decision ──────────────────────────────────────────────
export interface AgentDecision {
  agent: AgentRole;
  action: string;
  reasoning: string;
  confidence: number;
  parameters: Record<string, unknown>;
  timestamp: number;
}

// ─── Dashboard Events ────────────────────────────────────────────
export type DashboardEvent =
  | { type: 'state_update'; data: NetworkState }
  | { type: 'agent_decision'; data: AgentDecision }
  | { type: 'transaction'; data: { agent: AgentRole; txHash: string; description: string } }
  | { type: 'message'; data: AgentMessage }
  | { type: 'alert'; data: { level: 'info' | 'warn' | 'error'; message: string } };
