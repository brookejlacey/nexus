import type { MessageBus } from './message-bus.js';
import type { Brain } from './brain.js';
import type { AgentRole, Negotiation, NegotiationRound } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * NEGOTIATION ENGINE — Multi-turn agent-to-agent deal-making
 *
 * When Strategist wants a loan, instead of a simple request/approve,
 * Strategist and Banker engage in multi-round negotiations:
 *
 * Round 1: Strategist proposes terms (amount, rate, duration)
 * Round 2: Banker counters with adjusted terms
 * Round 3: Strategist accepts or counters again
 * ...up to 4 rounds, then final accept/reject
 *
 * Each round uses the LLM to reason about the other agent's proposal
 * and formulate a counter-offer. This is genuine agent-to-agent negotiation.
 */

const MAX_ROUNDS = 4;

/** Hard ceiling on any negotiated rate (100% APR). */
const MAX_RATE = 1.0;

/**
 * Coerce an LLM-supplied interest rate to a decimal fraction.
 * The model sometimes returns a percent ("7.5" meaning 7.5%) and sometimes
 * a fraction ("0.075"). Anything > 1 is read as a percent, then clamped to
 * [floor, MAX_RATE] so a single bad token can't blow up the economics.
 */
function normalizeRate(raw: unknown, fallback: number, floor = 0.05): number {
  let r = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  if (r > 1) r = r / 100;
  return Math.min(MAX_RATE, Math.max(floor, r));
}

export class NegotiationEngine {
  private negotiations: Map<string, Negotiation> = new Map();
  private bus: MessageBus;
  private brain: Brain;

  constructor(bus: MessageBus, brain: Brain) {
    this.bus = bus;
    this.brain = brain;
  }

  /** Start a new negotiation between two agents */
  async initiateNegotiation(
    borrower: AgentRole,
    lender: AgentRole,
    initialTerms: { amount: number; interestRate: number; duration: number },
    purpose: string,
  ): Promise<string> {
    const id = `NEG-${randomUUID().slice(0, 8)}`;

    const negotiation: Negotiation = {
      id,
      borrower,
      lender,
      rounds: [],
      status: 'active',
      startedAt: Date.now(),
    };

    this.negotiations.set(id, negotiation);

    // Borrower makes opening proposal
    const openingReason = await this.generateProposalReasoning(borrower, initialTerms, purpose, []);

    const round: NegotiationRound = {
      round: 1,
      proposer: borrower,
      terms: initialTerms,
      reasoning: openingReason,
      accepted: false,
      timestamp: Date.now(),
    };

    negotiation.rounds.push(round);

    // Send proposal to lender
    this.bus.send({
      type: 'negotiate_proposal',
      from: borrower,
      to: lender,
      negotiationId: id,
      round: 1,
      terms: initialTerms,
      reasoning: openingReason,
      timestamp: Date.now(),
    });

    logger.info(`[NEGOTIATE] ${id} started: ${borrower} proposes ${initialTerms.amount} USDt at ${(initialTerms.interestRate * 100).toFixed(1)}%`);

    this.bus.emitDashboard({
      type: 'alert',
      data: {
        level: 'info',
        message: `Negotiation ${id}: ${borrower} proposes loan of ${initialTerms.amount.toFixed(0)} USDt to ${lender}`,
      },
    });

    return id;
  }

  /** Process a counter-offer and decide whether to accept or counter again */
  async processCounter(
    negotiationId: string,
    responder: AgentRole,
    counterTerms: { amount: number; interestRate: number; duration: number },
    accepted: boolean,
  ): Promise<{ resolved: boolean; accepted: boolean; finalTerms?: Negotiation['finalTerms'] }> {
    const neg = this.negotiations.get(negotiationId);
    if (!neg || neg.status !== 'active') {
      return { resolved: true, accepted: false };
    }

    const currentRound = neg.rounds.length + 1;
    const counterReasoning = await this.generateCounterReasoning(
      responder,
      counterTerms,
      neg.rounds,
      accepted,
    );

    const round: NegotiationRound = {
      round: currentRound,
      proposer: responder,
      terms: counterTerms,
      reasoning: counterReasoning,
      accepted,
      timestamp: Date.now(),
    };

    neg.rounds.push(round);

    // Emit to bus
    this.bus.send({
      type: 'negotiate_counter',
      from: responder,
      to: responder === neg.borrower ? neg.lender : neg.borrower,
      negotiationId,
      round: currentRound,
      terms: counterTerms,
      reasoning: counterReasoning,
      accepted,
      timestamp: Date.now(),
    });

    if (accepted) {
      neg.status = 'agreed';
      neg.finalTerms = counterTerms;
      neg.resolvedAt = Date.now();

      logger.info(`[NEGOTIATE] ${negotiationId} AGREED at round ${currentRound}: ${counterTerms.amount} USDt at ${(counterTerms.interestRate * 100).toFixed(1)}%`);

      this.bus.emitDashboard({
        type: 'alert',
        data: {
          level: 'info',
          message: `Deal struck! ${neg.borrower} and ${neg.lender} agreed on ${counterTerms.amount.toFixed(0)} USDt at ${(counterTerms.interestRate * 100).toFixed(1)}% after ${currentRound} rounds`,
        },
      });

      this.cleanupOldNegotiations();
      return { resolved: true, accepted: true, finalTerms: counterTerms };
    }

    if (currentRound >= MAX_ROUNDS) {
      neg.status = 'rejected';
      neg.resolvedAt = Date.now();
      logger.info(`[NEGOTIATE] ${negotiationId} EXPIRED after ${MAX_ROUNDS} rounds — no agreement`);
      this.cleanupOldNegotiations();
      return { resolved: true, accepted: false };
    }

    logger.info(`[NEGOTIATE] ${negotiationId} round ${currentRound}: ${responder} counters at ${(counterTerms.interestRate * 100).toFixed(1)}%`);
    return { resolved: false, accepted: false };
  }

  /** Generate LLM-powered reasoning for a proposal */
  private async generateProposalReasoning(
    agent: AgentRole,
    terms: { amount: number; interestRate: number; duration: number },
    purpose: string,
    history: NegotiationRound[],
  ): Promise<string> {
    const decision = await this.brain.think({
      agent,
      systemPrompt: `You are an AI agent negotiating a loan deal. Explain in 1-2 sentences why you're proposing these terms. Be strategic and concise.`,
      context: `You (${agent}) are proposing a loan:
- Amount: ${terms.amount} USDt
- Interest rate: ${(terms.interestRate * 100).toFixed(1)}%
- Duration: ${terms.duration} hours
- Purpose: ${purpose}
${history.length > 0 ? `\nPrevious rounds:\n${history.map(r => `Round ${r.round}: ${r.proposer} proposed ${(r.terms.interestRate * 100).toFixed(1)}% — "${r.reasoning}"`).join('\n')}` : ''}

Why are these terms fair? What's your leverage?`,
    });

    return decision.reasoning;
  }

  /** Generate LLM-powered counter-offer reasoning */
  private async generateCounterReasoning(
    agent: AgentRole,
    terms: { amount: number; interestRate: number; duration: number },
    history: NegotiationRound[],
    accepting: boolean,
  ): Promise<string> {
    const lastRound = history[history.length - 1];
    const decision = await this.brain.think({
      agent,
      systemPrompt: `You are an AI agent in a loan negotiation. ${accepting ? 'You are accepting the deal.' : 'You are making a counter-offer.'} Explain your reasoning in 1-2 sentences.`,
      context: `Negotiation history:
${history.map(r => `Round ${r.round}: ${r.proposer} proposed ${r.terms.amount} USDt at ${(r.terms.interestRate * 100).toFixed(1)}% for ${r.terms.duration}h — "${r.reasoning}"`).join('\n')}

${accepting
  ? `You (${agent}) are ACCEPTING the last proposal from ${lastRound.proposer}.`
  : `You (${agent}) are COUNTERING with: ${terms.amount} USDt at ${(terms.interestRate * 100).toFixed(1)}% for ${terms.duration}h`
}

Why this decision?`,
    });

    return decision.reasoning;
  }

  /** Banker evaluates a proposal and decides to accept or counter */
  async evaluateAsLender(
    negotiationId: string,
    poolState: { poolSize: number; utilization: number; creditScore: number },
  ): Promise<{ accept: boolean; counterTerms: { amount: number; interestRate: number; duration: number } }> {
    const neg = this.negotiations.get(negotiationId);
    if (!neg) throw new Error(`Negotiation ${negotiationId} not found`);

    const lastRound = neg.rounds[neg.rounds.length - 1];
    const proposed = lastRound.terms;

    const decision = await this.brain.think({
      agent: neg.lender,
      systemPrompt: `You are The Banker evaluating a loan proposal in a multi-round negotiation. You must respond with JSON:
\`\`\`json
{
  "action": "accept" | "counter",
  "reasoning": "why",
  "confidence": 0.0-1.0,
  "parameters": {
    "amount": number,
    "interestRate": number,
    "duration": number
  }
}
\`\`\`

RULES:
- Minimum rate: 5%
- For credit scores <600, add 2-3% premium
- If this is round 3+, be more willing to compromise
- Never lend more than 30% of pool
- Converge toward a deal — don't just reject everything`,
      context: `PROPOSAL FROM ${neg.borrower} (round ${lastRound.round}):
- Amount: ${proposed.amount} USDt
- Rate: ${(proposed.interestRate * 100).toFixed(1)}%
- Duration: ${proposed.duration}h
- Their reasoning: "${lastRound.reasoning}"

YOUR STATE:
- Pool size: ${poolState.poolSize.toFixed(2)} USDt
- Utilization: ${(poolState.utilization * 100).toFixed(1)}%
- Borrower credit score: ${poolState.creditScore}/1000

NEGOTIATION HISTORY:
${neg.rounds.map(r => `Round ${r.round}: ${r.proposer} → ${(r.terms.interestRate * 100).toFixed(1)}% on ${r.terms.amount} USDt`).join('\n')}

Round ${neg.rounds.length + 1} of ${MAX_ROUNDS}. ${neg.rounds.length >= MAX_ROUNDS - 1 ? 'LAST CHANCE — accept or walk away.' : 'Counter or accept?'}`,
      model: 'deep',
    });

    if (decision.action === 'accept') {
      return { accept: true, counterTerms: proposed };
    }

    return {
      accept: false,
      counterTerms: {
        amount: (decision.parameters.amount as number) || proposed.amount,
        interestRate: normalizeRate(decision.parameters.interestRate, proposed.interestRate * 1.1),
        duration: (decision.parameters.duration as number) || proposed.duration,
      },
    };
  }

  /** Strategist evaluates a counter-offer */
  async evaluateAsBorrower(
    negotiationId: string,
    portfolioState: { balance: number; targetApy: number; existingDebt: number },
  ): Promise<{ accept: boolean; counterTerms: { amount: number; interestRate: number; duration: number } }> {
    const neg = this.negotiations.get(negotiationId);
    if (!neg) throw new Error(`Negotiation ${negotiationId} not found`);

    const lastRound = neg.rounds[neg.rounds.length - 1];
    const proposed = lastRound.terms;

    const decision = await this.brain.think({
      agent: neg.borrower,
      systemPrompt: `You are The Strategist evaluating a lender's counter-offer. Respond with JSON:
\`\`\`json
{
  "action": "accept" | "counter",
  "reasoning": "why",
  "confidence": 0.0-1.0,
  "parameters": {
    "amount": number,
    "interestRate": number,
    "duration": number
  }
}
\`\`\`

RULES:
- Only borrow if expected yield > interest rate + 2% safety margin
- Prefer longer durations (more time to earn)
- If round 3+, be willing to compromise on rate
- A deal is better than no deal if the math works`,
      context: `COUNTER-OFFER FROM ${neg.lender} (round ${lastRound.round}):
- Amount: ${proposed.amount} USDt
- Rate: ${(proposed.interestRate * 100).toFixed(1)}%
- Duration: ${proposed.duration}h
- Their reasoning: "${lastRound.reasoning}"

YOUR STATE:
- Balance: ${portfolioState.balance.toFixed(2)} USDt
- Target DeFi APY: ${(portfolioState.targetApy * 100).toFixed(1)}%
- Existing debt: ${portfolioState.existingDebt.toFixed(2)} USDt
- Spread (target APY - offered rate): ${((portfolioState.targetApy - proposed.interestRate) * 100).toFixed(1)}%

NEGOTIATION HISTORY:
${neg.rounds.map(r => `Round ${r.round}: ${r.proposer} → ${(r.terms.interestRate * 100).toFixed(1)}% on ${r.terms.amount} USDt`).join('\n')}

Round ${neg.rounds.length + 1} of ${MAX_ROUNDS}. ${neg.rounds.length >= MAX_ROUNDS - 1 ? 'LAST CHANCE — accept or walk away.' : 'Counter or accept?'}`,
      model: 'deep',
    });

    if (decision.action === 'accept') {
      return { accept: true, counterTerms: proposed };
    }

    return {
      accept: false,
      counterTerms: {
        amount: (decision.parameters.amount as number) || proposed.amount,
        interestRate: normalizeRate(decision.parameters.interestRate, proposed.interestRate * 0.95),
        duration: (decision.parameters.duration as number) || proposed.duration,
      },
    };
  }

  /** Remove completed/rejected negotiations older than 1 hour when map exceeds 100 entries */
  private cleanupOldNegotiations(): void {
    if (this.negotiations.size <= 100) return;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, neg] of this.negotiations) {
      if ((neg.status === 'agreed' || neg.status === 'rejected') && neg.resolvedAt && neg.resolvedAt < oneHourAgo) {
        this.negotiations.delete(id);
      }
    }
  }

  getNegotiations(): Negotiation[] {
    return [...this.negotiations.values()];
  }

  getNegotiation(id: string): Negotiation | undefined {
    return this.negotiations.get(id);
  }
}
