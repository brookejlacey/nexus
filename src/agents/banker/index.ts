import { BaseAgent } from '../../core/base-agent.js';
import type { MessageBus } from '../../core/message-bus.js';
import type { WalletManager } from '../../core/wallet-manager.js';
import type { Brain } from '../../core/brain.js';
import type { NegotiationEngine } from '../../core/negotiation-engine.js';
import type { AgentMessage, Loan, CreditProfile } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * THE BANKER — Autonomous Lending Agent
 *
 * - Manages a lending pool of USDt
 * - Evaluates loan requests from other agents using LLM-based credit scoring
 * - Parks idle capital in Aave for base yield
 * - Tracks repayments and manages defaults
 * - Dynamically adjusts interest rates based on pool utilization
 */
export class BankerAgent extends BaseAgent {
  private loans: Loan[] = [];
  private creditProfiles: Map<string, CreditProfile> = new Map();
  private poolSize = 0;
  private lentOut = 0;
  private aaveDeposited = 0;
  private totalInterestEarned = 0;
  private negotiationEngine?: NegotiationEngine;

  constructor(bus: MessageBus, wallet: WalletManager, brain: Brain) {
    super('banker', bus, wallet, brain);
  }

  setNegotiationEngine(engine: NegotiationEngine): void {
    this.negotiationEngine = engine;
  }

  protected getSystemPrompt(): string {
    return `You are The Banker, an autonomous lending agent in the Syndex economic network.

ROLE: You manage a lending pool of USDt. You evaluate loan requests from other AI agents, issue loans, track repayments, and manage risk. You also park idle capital in Aave to earn base yield.

DECISION FORMAT: Always respond with JSON:
\`\`\`json
{
  "action": "approve_loan" | "deny_loan" | "supply_aave" | "withdraw_aave" | "collect_repayment" | "hold",
  "reasoning": "1-2 sentence explanation",
  "confidence": 0.0-1.0,
  "parameters": {
    "amount": number,
    "interestRate": number,
    "loanId": "string"
  }
}
\`\`\`

RISK RULES:
- Never lend more than 40% of total pool to a single borrower
- Minimum interest rate: 5% annualized
- Maximum single loan: 30% of available liquidity
- Agents with default history get higher rates or denial
- Always keep 20% of pool liquid (not in Aave or loans)

CREDIT SCORING:
- New agents start at score 500/1000
- Successful repayments increase score
- Late repayments decrease score
- Defaults severely decrease score
- Higher scores get better rates`;
  }

  protected async onStart(): Promise<void> {
    this.poolSize = await this.wallet.getBalance('banker');
    logger.info(`[BANKER] Pool initialized with ${this.poolSize} USDt`);
    this.updateAction('pool_initialized');
  }

  protected async onStop(): Promise<void> {
    logger.info(`[BANKER] Shutting down with ${this.loans.filter(l => l.status === 'active').length} active loans`);
  }

  protected getTickInterval(): number {
    return 60_000; // Every 60 seconds
  }

  protected async tick(): Promise<void> {
    this.poolSize = await this.wallet.getBalance('banker');
    const activeLoans = this.loans.filter(l => l.status === 'active');
    const availableLiquidity = this.poolSize - this.aaveDeposited;
    const utilization = this.lentOut / (this.poolSize + this.lentOut || 1);

    // Check for overdue loans
    const now = Date.now();
    for (const loan of activeLoans) {
      if (now > loan.dueAt && loan.status === 'active') {
        logger.warn(`[BANKER] Loan ${loan.id} from ${loan.borrower} is OVERDUE`);
        this.sendMessage({
          type: 'circuit_break',
          from: 'banker',
          to: loan.borrower,
          reason: `Loan ${loan.id} overdue — requesting immediate repayment`,
          action: 'pause',
          timestamp: now,
        });
      }
    }

    // Decide what to do with idle capital
    const idleCapital = availableLiquidity - (this.poolSize * 0.2); // Keep 20% liquid
    if (idleCapital > 10) {
      const context = `
CURRENT STATE:
- Pool size: ${this.poolSize} USDt
- Lent out: ${this.lentOut} USDt
- In Aave: ${this.aaveDeposited} USDt
- Available liquidity: ${availableLiquidity} USDt
- Pool utilization: ${(utilization * 100).toFixed(1)}%
- Active loans: ${activeLoans.length}
- Idle capital (above 20% reserve): ${idleCapital.toFixed(2)} USDt
- Total interest earned: ${this.totalInterestEarned.toFixed(2)} USDt

Active Loans:
${activeLoans.map(l => `- ${l.id}: ${l.borrower} borrowed ${l.principal} at ${(l.interestRate * 100).toFixed(1)}%, due ${new Date(l.dueAt).toISOString()}`).join('\n')}

Should I deposit idle capital into Aave for base yield, or hold liquidity for potential loan requests?`;

      const decision = await this.think(context);

      if (decision.action === 'supply_aave' && idleCapital > 0) {
        const depositAmount = Math.min(idleCapital, (decision.parameters.amount as number) || idleCapital);
        await this.depositToAave(depositAmount);
      }
    }

    this.updateAction(`monitoring (${activeLoans.length} active loans, ${utilization.toFixed(0)}% utilization)`);
  }

  protected handleMessage(message: AgentMessage): void {
    switch (message.type) {
      case 'loan_request':
        this.handleLoanRequest(message);
        break;
      case 'negotiate_proposal':
        this.handleNegotiationProposal(message);
        break;
      case 'negotiate_counter':
        this.handleNegotiationCounter(message);
        break;
      case 'repayment':
        this.handleRepayment(message);
        break;
      case 'health_check':
        this.respondHealthCheck(message);
        break;
      case 'circuit_break':
        if (message.action === 'pause') this.pause();
        if (message.action === 'resume') this.resume();
        break;
    }
  }

  private async handleNegotiationProposal(msg: Extract<AgentMessage, { type: 'negotiate_proposal' }>): Promise<void> {
    if (!this.negotiationEngine) return;

    const credit = this.getCreditProfile(msg.from);
    const utilization = this.lentOut / (this.poolSize + this.lentOut || 1);

    const evaluation = await this.negotiationEngine.evaluateAsLender(msg.negotiationId, {
      poolSize: this.poolSize,
      utilization,
      creditScore: credit.score,
    });

    const result = await this.negotiationEngine.processCounter(
      msg.negotiationId,
      'banker',
      evaluation.counterTerms,
      evaluation.accept,
    );

    if (result.resolved && result.accepted && result.finalTerms) {
      // Agreement reached — issue the loan
      await this.issueLoanFromNegotiation(msg.from, result.finalTerms);
    }

    this.updateAction(result.resolved
      ? (result.accepted ? `negotiation agreed — issuing loan` : `negotiation rejected`)
      : `negotiation: countered at ${(evaluation.counterTerms.interestRate * 100).toFixed(1)}%`
    );
  }

  private async handleNegotiationCounter(msg: Extract<AgentMessage, { type: 'negotiate_counter' }>): Promise<void> {
    if (!this.negotiationEngine) return;

    if (msg.accepted) {
      // Borrower accepted our counter — issue loan
      const neg = this.negotiationEngine.getNegotiation(msg.negotiationId);
      if (neg?.finalTerms) {
        await this.issueLoanFromNegotiation(msg.from, neg.finalTerms);
      }
      return;
    }

    // Evaluate the borrower's counter
    const credit = this.getCreditProfile(msg.from);
    const utilization = this.lentOut / (this.poolSize + this.lentOut || 1);

    const evaluation = await this.negotiationEngine.evaluateAsLender(msg.negotiationId, {
      poolSize: this.poolSize,
      utilization,
      creditScore: credit.score,
    });

    const result = await this.negotiationEngine.processCounter(
      msg.negotiationId,
      'banker',
      evaluation.counterTerms,
      evaluation.accept,
    );

    if (result.resolved && result.accepted && result.finalTerms) {
      await this.issueLoanFromNegotiation(msg.from, result.finalTerms);
    }
  }

  private async issueLoanFromNegotiation(
    borrower: string,
    terms: { amount: number; interestRate: number; duration: number },
  ): Promise<void> {
    const loanId = `LOAN-${randomUUID().slice(0, 8)}`;

    try {
      const result = await this.wallet.sendToAgent('banker', borrower as any, terms.amount);

      const loan: Loan = {
        id: loanId,
        borrower: borrower as any,
        lender: 'banker',
        principal: terms.amount,
        interestRate: terms.interestRate,
        issuedAt: Date.now(),
        dueAt: Date.now() + (terms.duration * 60 * 60 * 1000),
        repaidAmount: 0,
        status: 'active',
        purpose: 'Negotiated loan',
        txHash: result.hash,
      };

      this.loans.push(loan);
      this.lentOut += terms.amount;

      const credit = this.getCreditProfile(borrower);
      credit.totalBorrowed += terms.amount;

      // Notify borrower
      this.sendMessage({
        type: 'loan_response',
        from: 'banker',
        to: borrower,
        approved: true,
        amount: terms.amount,
        interestRate: terms.interestRate,
        loanId,
        reason: `Negotiated agreement — ${terms.amount} USDt at ${(terms.interestRate * 100).toFixed(1)}% for ${terms.duration}h`,
        timestamp: Date.now(),
      });

      logger.info(`[BANKER] Negotiated loan ${loanId}: ${terms.amount} USDt to ${borrower} at ${(terms.interestRate * 100).toFixed(1)}%`);
      this.updateAction(`issued negotiated loan ${loanId}`);
    } catch (err) {
      logger.error(`[BANKER] Negotiated loan transfer failed:`, err);
    }
  }

  private async handleLoanRequest(msg: Extract<AgentMessage, { type: 'loan_request' }>): Promise<void> {
    logger.info(`[BANKER] Loan request from ${msg.from}: ${msg.amount} USDt for "${msg.purpose}"`);

    const borrowerCredit = this.getCreditProfile(msg.from);
    let availableLiquidity = this.poolSize - (this.poolSize * 0.2); // Keep 20% reserve

    // If Aave deposits exist and liquidity is insufficient, withdraw to fund the loan
    if (availableLiquidity < msg.amount && this.aaveDeposited > 0) {
      const needed = msg.amount - availableLiquidity;
      const withdrawAmount = Math.min(needed, this.aaveDeposited);
      await this.withdrawFromAave(withdrawAmount);
      this.poolSize = await this.wallet.getBalance('banker');
      availableLiquidity = this.poolSize - (this.poolSize * 0.2);
    }

    const currentExposure = this.loans
      .filter(l => l.borrower === msg.from && l.status === 'active')
      .reduce((sum, l) => sum + l.principal, 0);

    const context = `
LOAN REQUEST EVALUATION:
- Borrower: ${msg.from}
- Requested amount: ${msg.amount} USDt
- Purpose: ${msg.purpose}
- Expected return: ${msg.expectedReturn}%
- Duration: ${msg.duration} hours

BORROWER CREDIT PROFILE:
- Credit score: ${borrowerCredit.score}/1000
- Total previously borrowed: ${borrowerCredit.totalBorrowed} USDt
- Total repaid: ${borrowerCredit.totalRepaid} USDt
- Default count: ${borrowerCredit.defaultCount}
- Current exposure: ${currentExposure} USDt

POOL STATE:
- Available liquidity: ${availableLiquidity.toFixed(2)} USDt
- Current utilization: ${((this.lentOut / (this.poolSize + this.lentOut || 1)) * 100).toFixed(1)}%
- Max single loan (30% of available): ${(availableLiquidity * 0.3).toFixed(2)} USDt
- Max per-borrower (40% of pool): ${(this.poolSize * 0.4).toFixed(2)} USDt

Evaluate this loan request. Consider the borrower's credit history, the purpose and expected return, and current pool state. Set an appropriate interest rate based on risk.`;

    const decision = await this.think(context, 'deep');

    if (decision.action === 'approve_loan' || decision.action === 'issue_loan') {
      const amount = Math.min(
        msg.amount,
        availableLiquidity * 0.3, // Max 30% of available
        this.poolSize * 0.4 - currentExposure, // Max 40% total exposure per borrower
      );

      if (amount <= 0) {
        this.denyLoan(msg, 'Insufficient liquidity or exposure limit reached');
        return;
      }

      const interestRate = (decision.parameters.interestRate as number) || this.calculateInterestRate(borrowerCredit);
      await this.issueLoan(msg, amount, interestRate, decision.reasoning);
    } else {
      this.denyLoan(msg, decision.reasoning);
    }
  }

  private async issueLoan(
    msg: Extract<AgentMessage, { type: 'loan_request' }>,
    amount: number,
    interestRate: number,
    reasoning: string,
  ): Promise<void> {
    const loanId = `LOAN-${randomUUID().slice(0, 8)}`;

    // Execute the transfer
    try {
      const result = await this.wallet.sendToAgent('banker', msg.from as any, amount);

      const loan: Loan = {
        id: loanId,
        borrower: msg.from as any,
        lender: 'banker',
        principal: amount,
        interestRate,
        issuedAt: Date.now(),
        dueAt: Date.now() + (msg.duration * 60 * 60 * 1000),
        repaidAmount: 0,
        status: 'active',
        purpose: msg.purpose,
        txHash: result.hash,
      };

      this.loans.push(loan);
      this.lentOut += amount;

      // Update credit profile
      const credit = this.getCreditProfile(msg.from);
      credit.totalBorrowed += amount;
      credit.lastUpdated = Date.now();

      logger.info(`[BANKER] Loan ${loanId} APPROVED: ${amount} USDt to ${msg.from} at ${(interestRate * 100).toFixed(1)}%`);

      this.sendMessage({
        type: 'loan_response',
        from: 'banker',
        to: msg.from,
        approved: true,
        amount,
        interestRate,
        loanId,
        reason: reasoning,
        timestamp: Date.now(),
      });

      this.updateAction(`issued loan ${loanId}: ${amount} USDt to ${msg.from}`);
    } catch (err) {
      logger.error(`[BANKER] Loan transfer failed:`, err);
      this.denyLoan(msg, 'Transfer execution failed');
    }
  }

  private denyLoan(
    msg: Extract<AgentMessage, { type: 'loan_request' }>,
    reason: string,
  ): void {
    logger.info(`[BANKER] Loan DENIED for ${msg.from}: ${reason}`);

    this.sendMessage({
      type: 'loan_response',
      from: 'banker',
      to: msg.from,
      approved: false,
      amount: 0,
      interestRate: 0,
      loanId: '',
      reason,
      timestamp: Date.now(),
    });
  }

  private handleRepayment(msg: Extract<AgentMessage, { type: 'repayment' }>): void {
    const loan = this.loans.find(l => l.id === msg.loanId);
    if (!loan) {
      logger.warn(`[BANKER] Unknown loan ID: ${msg.loanId}`);
      return;
    }

    loan.repaidAmount += msg.amount;
    this.lentOut -= msg.principal;
    this.totalInterestEarned += msg.interest;
    this.pnl += msg.interest;

    const totalOwed = loan.principal * (1 + loan.interestRate * (loan.dueAt - loan.issuedAt) / (365.25 * 24 * 60 * 60 * 1000));
    if (loan.repaidAmount >= totalOwed * 0.99) { // 1% tolerance
      loan.status = 'repaid';
      logger.info(`[BANKER] Loan ${loan.id} FULLY REPAID by ${loan.borrower}`);
    }

    // Update credit score
    const credit = this.getCreditProfile(msg.from);
    credit.totalRepaid += msg.amount;
    credit.score = Math.min(1000, credit.score + 25); // Reward repayment
    credit.lastUpdated = Date.now();

    this.updateAction(`received repayment: ${msg.amount} USDt from ${msg.from} (loan ${msg.loanId})`);
  }

  private respondHealthCheck(msg: Extract<AgentMessage, { type: 'health_check' }>): void {
    const activeLoans = this.loans.filter(l => l.status === 'active').length;
    this.sendMessage({
      type: 'health_response',
      from: 'banker',
      to: msg.from,
      status: this.paused ? 'degraded' : 'healthy',
      balance: this.poolSize,
      activePositions: activeLoans,
      pnl: this.pnl,
      timestamp: Date.now(),
    });
  }

  private getCreditProfile(agent: string): CreditProfile {
    if (!this.creditProfiles.has(agent)) {
      this.creditProfiles.set(agent, {
        agent: agent as any,
        score: 500,
        totalBorrowed: 0,
        totalRepaid: 0,
        defaultCount: 0,
        avgRepaymentTime: 0,
        lastUpdated: Date.now(),
      });
    }
    return this.creditProfiles.get(agent)!;
  }

  private calculateInterestRate(credit: CreditProfile): number {
    // Base rate 8%, adjusted by credit score
    const baseRate = 0.08;
    const creditAdjustment = (500 - credit.score) / 5000; // ±10% swing
    const utilAdjustment = (this.lentOut / (this.poolSize || 1)) * 0.05; // Higher util = higher rate
    return Math.max(0.05, baseRate + creditAdjustment + utilAdjustment);
  }

  private async depositToAave(amount: number): Promise<void> {
    try {
      const result = await this.wallet.aaveSupply('banker', amount, 'USDT');
      this.aaveDeposited += amount;

      this.bus.emitDashboard({
        type: 'transaction',
        data: {
          agent: 'banker',
          txHash: result.hash,
          description: `Supplied ${amount.toFixed(2)} USDt to Aave V3 (idle capital yield)`,
        },
      });

      this.updateAction(`deposited ${amount.toFixed(2)} USDt to Aave V3`);
    } catch (err) {
      logger.error(`[BANKER] Aave deposit failed:`, err);
    }
  }

  private async withdrawFromAave(amount: number): Promise<void> {
    try {
      const withdrawAmount = Math.min(amount, this.aaveDeposited);
      if (withdrawAmount <= 0) return;

      const result = await this.wallet.aaveWithdraw('banker', withdrawAmount, 'USDT');
      this.aaveDeposited -= withdrawAmount;

      this.bus.emitDashboard({
        type: 'transaction',
        data: {
          agent: 'banker',
          txHash: result.hash,
          description: `Withdrew ${withdrawAmount.toFixed(2)} USDt from Aave V3`,
        },
      });

      this.updateAction(`withdrew ${withdrawAmount.toFixed(2)} USDt from Aave V3`);
    } catch (err) {
      logger.error(`[BANKER] Aave withdraw failed:`, err);
    }
  }

  /** Public accessors for dashboard */
  getLoans(): Loan[] {
    return [...this.loans];
  }

  getCreditProfiles(): Map<string, CreditProfile> {
    return new Map(this.creditProfiles);
  }

  getPoolMetrics() {
    return {
      poolSize: this.poolSize,
      lentOut: this.lentOut,
      aaveDeposited: this.aaveDeposited,
      utilization: this.lentOut / (this.poolSize + this.lentOut || 1),
      totalInterestEarned: this.totalInterestEarned,
      activeLoans: this.loans.filter(l => l.status === 'active').length,
    };
  }
}
