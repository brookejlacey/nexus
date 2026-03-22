import { BaseAgent } from '../../core/base-agent.js';
import type { MessageBus } from '../../core/message-bus.js';
import type { WalletManager } from '../../core/wallet-manager.js';
import type { Brain } from '../../core/brain.js';
import type { NegotiationEngine } from '../../core/negotiation-engine.js';
import type { AgentMessage, DeFiPosition } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * THE STRATEGIST — Autonomous DeFi Agent
 *
 * - Deploys USDt across DeFi protocols (Aave, Velora DEX, USDT0 bridges)
 * - Reasons about yield opportunities using LLM analysis
 * - Borrows from Banker when high-conviction opportunities arise
 * - Splits profits: repay debt → fund Patron → reinvest
 * - Manages risk with position limits and stop-losses
 */
export class StrategistAgent extends BaseAgent {
  private positions: DeFiPosition[] = [];
  private pendingLoan: { amount: number; purpose: string } | null = null;
  private totalYieldEarned = 0;
  private totalDeployed = 0;
  private activeLoanId: string | null = null;
  private loanDebt = 0;
  private negotiationEngine?: NegotiationEngine;
  private activeNegotiationId: string | null = null;

  constructor(bus: MessageBus, wallet: WalletManager, brain: Brain) {
    super('strategist', bus, wallet, brain);
  }

  /** Inject negotiation engine (set from index.ts after construction) */
  setNegotiationEngine(engine: NegotiationEngine): void {
    this.negotiationEngine = engine;
  }

  protected getSystemPrompt(): string {
    return `You are The Strategist, an autonomous DeFi agent in the Syndex economic network.

ROLE: You deploy USDt across DeFi protocols to maximize yield while managing risk. You can supply to Aave for lending yield, execute swaps via Velora for arbitrage, and bridge assets cross-chain via USDT0 for yield differentials.

DECISION FORMAT: Always respond with JSON:
\`\`\`json
{
  "action": "supply" | "withdraw" | "swap" | "bridge" | "rebalance" | "request_loan" | "repay_loan" | "distribute_yield" | "hold",
  "reasoning": "1-2 sentence explanation of WHY this is the best move",
  "confidence": 0.0-1.0,
  "parameters": {
    "protocol": "aave" | "velora" | "usdt0_bridge",
    "chain": "ethereum" | "arbitrum" | "polygon",
    "amount": number,
    "targetApy": number
  }
}
\`\`\`

STRATEGY RULES:
- Diversify: never put >50% in a single position
- Risk-adjusted: prefer lower-risk positions unless yield differential is >3x
- Gas-aware: factor transaction costs into yield calculations
- Borrow only when expected yield > interest rate + 2% safety margin
- Distribute yield surplus to Patron agent for creator tipping
- Always maintain 10% cash reserve for gas and emergencies

YIELD HIERARCHY:
1. Aave supply (lowest risk, ~3-8% APY)
2. Velora swaps (medium risk, variable)
3. Cross-chain arbitrage (higher risk, potentially higher return)`;
  }

  protected async onStart(): Promise<void> {
    const balance = await this.wallet.getBalance('strategist');
    logger.info(`[STRATEGIST] Starting with ${balance} USDt`);
    this.updateAction('scanning_opportunities');
  }

  protected async onStop(): Promise<void> {
    logger.info(`[STRATEGIST] Shutting down with ${this.positions.length} active positions`);
  }

  protected getTickInterval(): number {
    return 90_000; // Every 90 seconds
  }

  protected async tick(): Promise<void> {
    const balance = await this.wallet.getBalance('strategist');
    const activePositions = this.positions.filter(p => p.amount > 0);

    // Simulate yield accrual on existing positions
    this.accrueYield();

    const cashReserve = balance * 0.1;
    const deployable = balance - cashReserve - this.totalDeployed;

    const context = `
CURRENT STATE:
- Cash balance: ${balance.toFixed(2)} USDt
- Total deployed: ${this.totalDeployed.toFixed(2)} USDt
- Deployable capital (after 10% reserve): ${deployable.toFixed(2)} USDt
- Total yield earned: ${this.totalYieldEarned.toFixed(4)} USDt
- Outstanding loan debt: ${this.loanDebt.toFixed(2)} USDt
- Active positions: ${activePositions.length}

POSITIONS:
${activePositions.map(p => `- ${p.id}: ${p.protocol} on ${p.chain} | ${p.amount.toFixed(2)} USDt | APY: ${(p.apy * 100).toFixed(1)}% | Current value: ${p.currentValue.toFixed(2)}`).join('\n') || 'None'}

AVAILABLE OPPORTUNITIES:
- Aave Ethereum: ~4.2% APY on USDt supply
- Aave Arbitrum: ~5.8% APY on USDt supply (lower gas)
- Aave Polygon: ~3.9% APY on USDt supply
- Velora: Various swap opportunities with ~0.3% per trade
- Cross-chain bridge: USDT0 bridge yield differentials ~0.5-1.5%

RECENT MESSAGES:
${this.getRecentMessages(5).map(m => `${m.from}: ${m.type}`).join('\n')}

What should I do? Consider deploying idle capital, rebalancing positions, borrowing for opportunities, or distributing earned yield.`;

    const decision = await this.think(context);

    switch (decision.action) {
      case 'supply':
        await this.executeSupply(decision);
        break;
      case 'withdraw':
        await this.executeWithdraw(decision);
        break;
      case 'request_loan':
        await this.requestLoan(decision);
        break;
      case 'repay_loan':
        await this.repayLoan();
        break;
      case 'distribute_yield':
        await this.distributeYield();
        break;
      case 'rebalance':
        await this.rebalance(decision);
        break;
      case 'hold':
        this.updateAction('holding — monitoring opportunities');
        break;
    }
  }

  protected handleMessage(message: AgentMessage): void {
    switch (message.type) {
      case 'loan_response':
        this.handleLoanResponse(message);
        break;
      case 'fund_transfer':
        this.handleFundTransfer(message);
        break;
      case 'negotiate_counter':
        this.handleNegotiationCounter(message);
        break;
      case 'health_check':
        this.respondHealthCheck(message);
        break;
      case 'circuit_break':
        if (message.action === 'pause') this.pause();
        if (message.action === 'resume') this.resume();
        if (message.action === 'liquidate') this.liquidateAll();
        break;
    }
  }

  private async handleNegotiationCounter(msg: Extract<AgentMessage, { type: 'negotiate_counter' }>): Promise<void> {
    if (!this.negotiationEngine || msg.negotiationId !== this.activeNegotiationId) return;

    if (msg.accepted) {
      // Banker accepted our terms — deal is done, loan will be issued via loan_response
      logger.info(`[STRATEGIST] Negotiation ${msg.negotiationId} — Banker accepted!`);
      this.activeNegotiationId = null;
      return;
    }

    // Evaluate the counter-offer
    const balance = await this.wallet.getBalance('strategist');
    const evaluation = await this.negotiationEngine.evaluateAsBorrower(msg.negotiationId, {
      balance,
      targetApy: 0.058,
      existingDebt: this.loanDebt,
    });

    const result = await this.negotiationEngine.processCounter(
      msg.negotiationId,
      'strategist',
      evaluation.counterTerms,
      evaluation.accept,
    );

    if (result.resolved) {
      this.activeNegotiationId = null;
      if (result.accepted && result.finalTerms) {
        this.updateAction(`negotiation agreed: ${result.finalTerms.amount} USDt at ${(result.finalTerms.interestRate * 100).toFixed(1)}%`);
      } else {
        this.updateAction(`negotiation failed — no deal reached`);
      }
    } else {
      this.updateAction(`negotiation round ${msg.round + 1}: countered at ${(evaluation.counterTerms.interestRate * 100).toFixed(1)}%`);
    }
  }

  private async executeSupply(decision: { parameters: Record<string, unknown> }): Promise<void> {
    const protocol = (decision.parameters.protocol as string) || 'aave';
    const chain = (decision.parameters.chain as string) || 'arbitrum';
    const amount = (decision.parameters.amount as number) || 0;

    if (amount <= 0) return;

    const balance = await this.wallet.getBalance('strategist');
    const actualAmount = Math.min(amount, balance * 0.9); // Keep 10% reserve

    if (actualAmount < 1) return;

    // Execute via WDK Aave protocol (real or simulated)
    try {
      const result = await this.wallet.aaveSupply('strategist', actualAmount, 'USDT');
      logger.info(`[STRATEGIST] Supplied ${actualAmount} USDt to ${protocol} on ${chain}: tx=${result.hash}`);
    } catch (err) {
      logger.error(`[STRATEGIST] Supply failed:`, err);
      return;
    }

    const position: DeFiPosition = {
      id: `POS-${randomUUID().slice(0, 8)}`,
      protocol,
      chain,
      type: 'supply',
      asset: 'USDt',
      amount: actualAmount,
      entryPrice: 1.0,
      currentValue: actualAmount,
      apy: this.getEstimatedApy(protocol, chain),
      openedAt: Date.now(),
    };

    this.positions.push(position);
    this.totalDeployed += actualAmount;

    this.updateAction(`supplied ${actualAmount.toFixed(2)} USDt to ${protocol} on ${chain}`);
    this.bus.emitDashboard({
      type: 'transaction',
      data: {
        agent: 'strategist',
        txHash: `sim-${position.id}`,
        description: `Supplied ${actualAmount.toFixed(2)} USDt to ${protocol} on ${chain} (${(position.apy * 100).toFixed(1)}% APY)`,
      },
    });
  }

  private async executeWithdraw(decision: { parameters: Record<string, unknown> }): Promise<void> {
    const positionId = decision.parameters.positionId as string;
    const position = this.positions.find(p => p.id === positionId);
    if (!position || position.amount <= 0) return;

    const withdrawn = position.currentValue;
    const originalAmount = position.amount;
    const profit = withdrawn - originalAmount;

    position.amount = 0;
    position.currentValue = 0;
    this.totalDeployed -= originalAmount;
    this.totalYieldEarned += profit;
    this.pnl += profit;

    this.updateAction(`withdrew ${withdrawn.toFixed(2)} USDt from ${position.protocol} (profit: ${profit.toFixed(4)})`);
  }

  private async requestLoan(decision: { parameters: Record<string, unknown> }): Promise<void> {
    if (this.activeLoanId || this.activeNegotiationId) {
      logger.info(`[STRATEGIST] Already have active loan/negotiation, skipping`);
      return;
    }

    const amount = (decision.parameters.amount as number) || 100;
    const targetApy = (decision.parameters.targetApy as number) || 0.06;
    const purpose = `Deploy to DeFi at expected ${(targetApy * 100).toFixed(1)}% APY`;

    // Use negotiation engine if available — multi-round deal-making
    if (this.negotiationEngine) {
      const proposedRate = Math.max(0.05, targetApy * 0.6); // Start low
      const negId = await this.negotiationEngine.initiateNegotiation(
        'strategist', 'banker',
        { amount, interestRate: proposedRate, duration: 24 },
        purpose,
      );
      this.activeNegotiationId = negId;
      this.updateAction(`negotiating loan: proposed ${amount} USDt at ${(proposedRate * 100).toFixed(1)}%`);
      return;
    }

    // Fallback: simple loan request
    this.pendingLoan = { amount, purpose };
    this.sendMessage({
      type: 'loan_request',
      from: 'strategist',
      to: 'banker',
      amount,
      purpose,
      expectedReturn: targetApy * 100,
      duration: 24,
      timestamp: Date.now(),
    });

    this.updateAction(`requested ${amount} USDt loan from Banker`);
  }

  private handleLoanResponse(msg: Extract<AgentMessage, { type: 'loan_response' }>): void {
    if (msg.approved) {
      this.activeLoanId = msg.loanId;
      this.loanDebt = msg.amount * (1 + msg.interestRate);
      logger.info(`[STRATEGIST] Loan ${msg.loanId} APPROVED: ${msg.amount} USDt at ${(msg.interestRate * 100).toFixed(1)}%`);
      this.updateAction(`loan approved — deploying borrowed capital`);
    } else {
      logger.info(`[STRATEGIST] Loan DENIED: ${msg.reason}`);
      this.pendingLoan = null;
      this.updateAction(`loan denied — continuing with own capital`);
    }
  }

  private handleFundTransfer(msg: Extract<AgentMessage, { type: 'fund_transfer' }>): void {
    logger.info(`[STRATEGIST] Received ${msg.amount} USDt from ${msg.from}: ${msg.purpose}`);
  }

  private async repayLoan(): Promise<void> {
    if (!this.activeLoanId || this.loanDebt <= 0) return;

    const balance = await this.wallet.getBalance('strategist');
    const repayAmount = Math.min(this.loanDebt, balance * 0.5);

    if (repayAmount < 1) return;

    try {
      await this.wallet.sendToAgent('strategist', 'banker', repayAmount);

      const interest = repayAmount - (repayAmount / (1 + 0.08)); // Approximate interest portion
      const principal = repayAmount - interest;

      this.sendMessage({
        type: 'repayment',
        from: 'strategist',
        to: 'banker',
        loanId: this.activeLoanId,
        amount: repayAmount,
        principal,
        interest,
        timestamp: Date.now(),
      });

      this.loanDebt -= repayAmount;
      if (this.loanDebt <= 0.01) {
        this.activeLoanId = null;
        this.loanDebt = 0;
      }

      this.updateAction(`repaid ${repayAmount.toFixed(2)} USDt to Banker`);
    } catch (err) {
      logger.error(`[STRATEGIST] Repayment failed:`, err);
    }
  }

  private async distributeYield(): Promise<void> {
    // Send surplus yield to Patron for creator tipping
    const distributableYield = this.totalYieldEarned * 0.3; // 30% of yield goes to tipping
    if (distributableYield < 0.5) return;

    try {
      await this.wallet.sendToAgent('strategist', 'patron', distributableYield);

      this.sendMessage({
        type: 'fund_transfer',
        from: 'strategist',
        to: 'patron',
        amount: distributableYield,
        purpose: `Yield distribution for creator tipping (30% of ${this.totalYieldEarned.toFixed(2)} earned)`,
        timestamp: Date.now(),
      });

      this.totalYieldEarned -= distributableYield;
      this.updateAction(`distributed ${distributableYield.toFixed(2)} USDt yield to Patron`);
    } catch (err) {
      logger.error(`[STRATEGIST] Yield distribution failed:`, err);
    }
  }

  private async rebalance(_decision: { parameters: Record<string, unknown> }): Promise<void> {
    // Move capital from low-yield to high-yield positions
    const activePositions = this.positions.filter(p => p.amount > 0);
    if (activePositions.length < 2) return;

    activePositions.sort((a, b) => a.apy - b.apy);
    const lowest = activePositions[0];
    const highest = activePositions[activePositions.length - 1];

    if (highest.apy - lowest.apy > 0.02) { // >2% differential
      const moveAmount = lowest.amount * 0.5;
      lowest.amount -= moveAmount;
      lowest.currentValue -= moveAmount;
      highest.amount += moveAmount;
      highest.currentValue += moveAmount;

      this.updateAction(`rebalanced ${moveAmount.toFixed(2)} USDt from ${lowest.protocol}→${highest.protocol}`);
    }
  }

  private accrueYield(): void {
    for (const pos of this.positions) {
      if (pos.amount <= 0) continue;
      // Accrue yield per tick (APY / ticks per year)
      const ticksPerYear = (365.25 * 24 * 60 * 60 * 1000) / this.getTickInterval();
      const yieldPerTick = pos.apy / ticksPerYear;
      const earned = pos.amount * yieldPerTick;
      pos.currentValue += earned;
      this.totalYieldEarned += earned;
      this.pnl += earned;
    }
  }

  private getEstimatedApy(protocol: string, chain: string): number {
    const rates: Record<string, Record<string, number>> = {
      aave: { ethereum: 0.042, arbitrum: 0.058, polygon: 0.039 },
      velora: { ethereum: 0.03, arbitrum: 0.035, polygon: 0.025 },
    };
    return rates[protocol]?.[chain] || 0.04;
  }

  private async liquidateAll(): Promise<void> {
    logger.warn(`[STRATEGIST] LIQUIDATING all positions`);
    for (const pos of this.positions) {
      pos.amount = 0;
      pos.currentValue = 0;
    }
    this.totalDeployed = 0;
    this.updateAction('LIQUIDATED all positions');
  }

  private respondHealthCheck(msg: Extract<AgentMessage, { type: 'health_check' }>): void {
    this.sendMessage({
      type: 'health_response',
      from: 'strategist',
      to: msg.from,
      status: this.paused ? 'degraded' : 'healthy',
      balance: this.totalDeployed,
      activePositions: this.positions.filter(p => p.amount > 0).length,
      pnl: this.pnl,
      timestamp: Date.now(),
    });
  }

  /** Public accessors for dashboard */
  getPositions(): DeFiPosition[] {
    return [...this.positions];
  }

  getMetrics() {
    return {
      totalDeployed: this.totalDeployed,
      totalYieldEarned: this.totalYieldEarned,
      loanDebt: this.loanDebt,
      activePositions: this.positions.filter(p => p.amount > 0).length,
      avgApy: this.positions.reduce((sum, p) => sum + p.apy, 0) / (this.positions.length || 1),
    };
  }
}
