import { BaseAgent } from '../../core/base-agent.js';
import type { MessageBus } from '../../core/message-bus.js';
import type { WalletManager } from '../../core/wallet-manager.js';
import type { Brain } from '../../core/brain.js';
import type { AgentMessage, AgentRole, NetworkState } from '../../types/index.js';
import type { BankerAgent } from '../banker/index.js';
import type { StrategistAgent } from '../strategist/index.js';
import type { PatronAgent } from '../patron/index.js';
import { logger } from '../../utils/logger.js';

/**
 * THE NEXUS — Orchestrator Meta-Agent
 *
 * - Creates and manages all agent wallets
 * - Monitors health of the entire network
 * - Routes capital between agents
 * - Circuit-breaker: can pause/resume/liquidate any agent
 * - Provides the unified network state for the dashboard
 * - Human interface via OpenClaw skill
 */
export class NexusOrchestrator extends BaseAgent {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private bankerAgent?: BankerAgent;
  private strategistAgent?: StrategistAgent;
  private patronAgent?: PatronAgent;
  private networkState: NetworkState;
  private healthCheckInterval = 0;

  constructor(bus: MessageBus, wallet: WalletManager, brain: Brain) {
    super('nexus', bus, wallet, brain);

    // Subscribe to ALL messages for monitoring
    this.bus.subscribeAll((msg) => this.monitorMessage(msg));

    this.networkState = {
      agents: {
        nexus: { role: 'nexus', status: 'active', walletAddress: '', balance: 0, pnl: 0, lastAction: 'initializing', lastActionTime: Date.now() },
        banker: { role: 'banker', status: 'active', walletAddress: '', balance: 0, pnl: 0, lastAction: 'waiting', lastActionTime: Date.now() },
        strategist: { role: 'strategist', status: 'active', walletAddress: '', balance: 0, pnl: 0, lastAction: 'waiting', lastActionTime: Date.now() },
        patron: { role: 'patron', status: 'active', walletAddress: '', balance: 0, pnl: 0, lastAction: 'waiting', lastActionTime: Date.now() },
      },
      loans: [],
      positions: [],
      tips: [],
      totalValueLocked: 0,
      totalYieldEarned: 0,
      totalTipsPaid: 0,
      networkHealth: 'healthy',
      lastUpdated: Date.now(),
    };
  }

  /** Register child agents for direct monitoring */
  registerAgents(banker: BankerAgent, strategist: StrategistAgent, patron: PatronAgent): void {
    this.bankerAgent = banker;
    this.strategistAgent = strategist;
    this.patronAgent = patron;
    this.agents.set('banker', banker);
    this.agents.set('strategist', strategist);
    this.agents.set('patron', patron);
  }

  protected getSystemPrompt(): string {
    return `You are The Nexus, the orchestrator of a multi-agent economic network.

ROLE: You monitor the health and performance of all agents (Banker, Strategist, Patron), manage capital allocation, and make strategic decisions about the network as a whole.

DECISION FORMAT: Always respond with JSON:
\`\`\`json
{
  "action": "redistribute" | "pause_agent" | "resume_agent" | "rebalance_allocations" | "circuit_break" | "hold",
  "reasoning": "explanation",
  "confidence": 0.0-1.0,
  "parameters": {
    "targetAgent": "banker" | "strategist" | "patron",
    "amount": number,
    "threshold": number
  }
}
\`\`\`

ORCHESTRATION RULES:
- Monitor all agent health responses every 2 minutes
- If any agent's balance drops below 5% of initial allocation, investigate
- If Strategist PnL goes negative by >10%, trigger circuit breaker
- Ensure Patron always has funding for tipping
- Rebalance allocations if utilization is highly skewed
- Default allocation: 60% Banker, 30% Strategist, 10% Patron`;
  }

  protected async onStart(): Promise<void> {
    const balance = await this.wallet.getBalance('nexus');
    logger.info(`[NEXUS] Orchestrator starting with ${balance} USDt`);

    // Distribute initial capital to agents
    if (balance > 0) {
      await this.distributeInitialCapital(balance);
    }

    this.updateAction('orchestrating');
  }

  protected async onStop(): Promise<void> {
    logger.info(`[NEXUS] Orchestrator shutting down`);
  }

  protected getTickInterval(): number {
    return 30_000; // Every 30 seconds — fastest loop for monitoring
  }

  protected async tick(): Promise<void> {
    this.healthCheckInterval++;

    // Update network state from all agents
    await this.updateNetworkState();

    // Broadcast state to dashboard
    this.bus.emitDashboard({
      type: 'state_update',
      data: this.networkState,
    });

    // Health checks every 2 minutes (4 ticks)
    if (this.healthCheckInterval % 4 === 0) {
      await this.runHealthChecks();
    }

    // Strategic review every 5 minutes (10 ticks)
    if (this.healthCheckInterval % 10 === 0) {
      await this.strategicReview();
    }
  }

  protected handleMessage(message: AgentMessage): void {
    switch (message.type) {
      case 'health_response':
        this.processHealthResponse(message);
        break;
      case 'tip_executed':
        this.processTipNotification(message);
        break;
      case 'circuit_break':
        if (message.action === 'pause') this.pause();
        break;
    }
  }

  /** Monitor ALL messages flowing through the bus */
  private monitorMessage(message: AgentMessage): void {
    // Log significant events
    if (message.type === 'loan_request' || message.type === 'loan_response') {
      logger.info(`[NEXUS] Observed: ${message.from} → ${message.to}: ${message.type}`);
    }
  }

  private async distributeInitialCapital(totalCapital: number): Promise<void> {
    const allocations = {
      banker: totalCapital * 0.60,
      strategist: totalCapital * 0.30,
      patron: totalCapital * 0.10,
    };

    for (const [role, amount] of Object.entries(allocations)) {
      try {
        await this.wallet.sendToAgent('nexus', role as AgentRole, amount);

        this.sendMessage({
          type: 'fund_transfer',
          from: 'nexus',
          to: role,
          amount,
          purpose: `Initial capital allocation (${role === 'banker' ? '60%' : role === 'strategist' ? '30%' : '10%'})`,
          timestamp: Date.now(),
        });

        logger.info(`[NEXUS] Allocated ${amount.toFixed(2)} USDt to ${role}`);
      } catch (err) {
        logger.error(`[NEXUS] Failed to allocate to ${role}:`, err);
      }
    }

    this.updateAction(`distributed ${totalCapital.toFixed(2)} USDt across agents`);
  }

  private async updateNetworkState(): Promise<void> {
    // Update agent statuses
    for (const [role, agent] of this.agents) {
      try {
        this.networkState.agents[role] = await agent.getStatus();
      } catch {
        this.networkState.agents[role].status = 'error';
      }
    }

    // Update Nexus own status
    const nexusBalance = await this.wallet.getBalance('nexus');
    this.networkState.agents.nexus = {
      role: 'nexus',
      status: 'active',
      walletAddress: this.wallet.getWalletInfo('nexus')?.address || '',
      balance: nexusBalance,
      pnl: this.pnl,
      lastAction: this.lastAction,
      lastActionTime: this.lastActionTime,
    };

    // Aggregate metrics
    if (this.bankerAgent) {
      this.networkState.loans = this.bankerAgent.getLoans();
    }
    if (this.strategistAgent) {
      this.networkState.positions = this.strategistAgent.getPositions();
      this.networkState.totalYieldEarned = this.strategistAgent.getMetrics().totalYieldEarned;
    }
    if (this.patronAgent) {
      this.networkState.tips = this.patronAgent.getTips();
      this.networkState.totalTipsPaid = this.patronAgent.getMetrics().totalTipped;
    }

    // Calculate TVL
    this.networkState.totalValueLocked = Object.values(this.networkState.agents)
      .reduce((sum, a) => sum + a.balance, 0);

    // Determine network health
    const statuses = Object.values(this.networkState.agents).map(a => a.status);
    if (statuses.some(s => s === 'error')) {
      this.networkState.networkHealth = 'critical';
    } else if (statuses.some(s => s === 'paused')) {
      this.networkState.networkHealth = 'degraded';
    } else {
      this.networkState.networkHealth = 'healthy';
    }

    this.networkState.lastUpdated = Date.now();
  }

  private async runHealthChecks(): Promise<void> {
    for (const role of ['banker', 'strategist', 'patron'] as AgentRole[]) {
      this.sendMessage({
        type: 'health_check',
        from: 'nexus',
        to: role,
        timestamp: Date.now(),
      });
    }
  }

  private processHealthResponse(msg: Extract<AgentMessage, { type: 'health_response' }>): void {
    if (msg.status === 'critical') {
      logger.error(`[NEXUS] CRITICAL: ${msg.from} reports critical status!`);
      this.bus.emitDashboard({
        type: 'alert',
        data: {
          level: 'error',
          message: `Agent ${msg.from} is in CRITICAL state. Balance: ${msg.balance}, PnL: ${msg.pnl}`,
        },
      });
    }
  }

  private processTipNotification(msg: Extract<AgentMessage, { type: 'tip_executed' }>): void {
    logger.info(`[NEXUS] Tip executed: ${msg.amount.toFixed(2)} USDt to ${msg.creator}`);
  }

  private async strategicReview(): Promise<void> {
    const context = `
NETWORK STATE REVIEW:
${Object.entries(this.networkState.agents).map(([role, a]) =>
  `- ${role}: status=${a.status}, balance=${a.balance.toFixed(2)}, pnl=${a.pnl.toFixed(4)}, lastAction="${a.lastAction}"`
).join('\n')}

METRICS:
- Total Value Locked: ${this.networkState.totalValueLocked.toFixed(2)} USDt
- Total Yield Earned: ${this.networkState.totalYieldEarned.toFixed(4)} USDt
- Total Tips Paid: ${this.networkState.totalTipsPaid.toFixed(2)} USDt
- Active Loans: ${this.networkState.loans.filter(l => l.status === 'active').length}
- Active DeFi Positions: ${this.networkState.positions.filter(p => p.amount > 0).length}
- Network Health: ${this.networkState.networkHealth}

Is any intervention needed? Consider rebalancing, circuit breaking, or capital redistribution.`;

    const decision = await this.think(context);

    if (decision.action === 'circuit_break') {
      const target = decision.parameters.targetAgent as AgentRole;
      this.sendMessage({
        type: 'circuit_break',
        from: 'nexus',
        to: target,
        reason: decision.reasoning,
        action: 'pause',
        timestamp: Date.now(),
      });
    } else if (decision.action === 'redistribute') {
      const target = decision.parameters.targetAgent as AgentRole;
      const amount = decision.parameters.amount as number;
      if (target && amount > 0) {
        try {
          await this.wallet.sendToAgent('nexus', target, amount);
          this.sendMessage({
            type: 'fund_transfer',
            from: 'nexus',
            to: target,
            amount,
            purpose: `Strategic reallocation: ${decision.reasoning}`,
            timestamp: Date.now(),
          });
        } catch (err) {
          logger.error(`[NEXUS] Redistribution failed:`, err);
        }
      }
    }
  }

  /** Get full network state (for API/dashboard) */
  getNetworkState(): NetworkState {
    return { ...this.networkState };
  }
}
