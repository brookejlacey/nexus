import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NegotiationEngine } from '../negotiation-engine.js';
import { MessageBus } from '../message-bus.js';
import { Brain } from '../brain.js';

// Mock Brain to avoid API calls
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '```json\n{"action": "accept", "reasoning": "Good deal", "confidence": 0.8, "parameters": {"amount": 200, "interestRate": 0.08, "duration": 24}}\n```' }],
      }),
    },
  })),
}));

describe('NegotiationEngine', () => {
  let engine: NegotiationEngine;
  let bus: MessageBus;
  let brain: Brain;

  beforeEach(() => {
    bus = new MessageBus();
    brain = new Brain('test-key');
    engine = new NegotiationEngine(bus, brain);
  });

  describe('initiateNegotiation', () => {
    it('creates a negotiation with a unique ID', async () => {
      const id = await engine.initiateNegotiation(
        'strategist',
        'banker',
        { amount: 200, interestRate: 0.06, duration: 24 },
        'DeFi yield farming',
      );

      expect(id).toMatch(/^NEG-/);
      const neg = engine.getNegotiation(id);
      expect(neg).toBeDefined();
      expect(neg!.borrower).toBe('strategist');
      expect(neg!.lender).toBe('banker');
      expect(neg!.status).toBe('active');
      expect(neg!.rounds).toHaveLength(1);
    });

    it('sends a proposal message on the bus', async () => {
      const handler = vi.fn();
      bus.subscribe('banker', handler);

      await engine.initiateNegotiation(
        'strategist',
        'banker',
        { amount: 200, interestRate: 0.06, duration: 24 },
        'yield farming',
      );

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'negotiate_proposal',
          from: 'strategist',
          to: 'banker',
        }),
      );
    });
  });

  describe('processCounter', () => {
    it('resolves when accepted', async () => {
      const id = await engine.initiateNegotiation(
        'strategist',
        'banker',
        { amount: 200, interestRate: 0.06, duration: 24 },
        'yield',
      );

      const result = await engine.processCounter(
        id,
        'banker',
        { amount: 200, interestRate: 0.08, duration: 24 },
        true,
      );

      expect(result.resolved).toBe(true);
      expect(result.accepted).toBe(true);
      expect(result.finalTerms).toEqual({ amount: 200, interestRate: 0.08, duration: 24 });

      const neg = engine.getNegotiation(id);
      expect(neg!.status).toBe('agreed');
    });

    it('continues when not accepted and under max rounds', async () => {
      const id = await engine.initiateNegotiation(
        'strategist',
        'banker',
        { amount: 200, interestRate: 0.06, duration: 24 },
        'yield',
      );

      const result = await engine.processCounter(
        id,
        'banker',
        { amount: 200, interestRate: 0.10, duration: 24 },
        false,
      );

      expect(result.resolved).toBe(false);
      expect(result.accepted).toBe(false);
    });

    it('expires after max rounds without agreement', async () => {
      const id = await engine.initiateNegotiation(
        'strategist',
        'banker',
        { amount: 200, interestRate: 0.06, duration: 24 },
        'yield',
      );

      // Rounds 2, 3, 4 (round 1 is the initial proposal)
      await engine.processCounter(id, 'banker', { amount: 200, interestRate: 0.10, duration: 24 }, false);
      await engine.processCounter(id, 'strategist', { amount: 200, interestRate: 0.07, duration: 24 }, false);

      const result = await engine.processCounter(
        id,
        'banker',
        { amount: 200, interestRate: 0.09, duration: 24 },
        false,
      );

      expect(result.resolved).toBe(true);
      expect(result.accepted).toBe(false);

      const neg = engine.getNegotiation(id);
      expect(neg!.status).toBe('rejected');
    });
  });

  describe('rate normalization', () => {
    it('coerces a percent-style counter rate (7.5) to a fraction (0.075)', async () => {
      // The LLM sometimes returns interestRate as a percent rather than a
      // decimal. Without normalization, "7.5" becomes 750% APR.
      vi.spyOn(brain, 'think').mockResolvedValue({
        agent: 'banker',
        action: 'counter',
        reasoning: 'Credit risk premium applies',
        confidence: 0.7,
        parameters: { amount: 400, interestRate: 7.5, duration: 48 },
        timestamp: 0,
      });

      const id = await engine.initiateNegotiation(
        'strategist',
        'banker',
        { amount: 400, interestRate: 0.045, duration: 48 },
        'yield',
      );

      const { accept, counterTerms } = await engine.evaluateAsLender(id, {
        poolSize: 600,
        utilization: 0.2,
        creditScore: 580,
      });

      expect(accept).toBe(false);
      expect(counterTerms.interestRate).toBeCloseTo(0.075);
      expect(counterTerms.interestRate).toBeLessThanOrEqual(1.0);
    });

    it('clamps an absurd rate to the 100% ceiling', async () => {
      vi.spyOn(brain, 'think').mockResolvedValue({
        agent: 'banker',
        action: 'counter',
        reasoning: 'broken',
        confidence: 0.5,
        parameters: { amount: 400, interestRate: 1200, duration: 48 },
        timestamp: 0,
      });

      const id = await engine.initiateNegotiation(
        'strategist',
        'banker',
        { amount: 400, interestRate: 0.045, duration: 48 },
        'yield',
      );

      const { counterTerms } = await engine.evaluateAsLender(id, {
        poolSize: 600,
        utilization: 0.2,
        creditScore: 580,
      });

      expect(counterTerms.interestRate).toBe(1.0);
    });
  });

  describe('getNegotiations', () => {
    it('returns all negotiations', async () => {
      await engine.initiateNegotiation('strategist', 'banker', { amount: 100, interestRate: 0.06, duration: 12 }, 'a');
      await engine.initiateNegotiation('strategist', 'banker', { amount: 200, interestRate: 0.07, duration: 24 }, 'b');

      expect(engine.getNegotiations()).toHaveLength(2);
    });
  });
});
