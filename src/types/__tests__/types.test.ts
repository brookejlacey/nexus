import { describe, it, expect } from 'vitest';
import { MessageSchema } from '../index.js';

describe('MessageSchema (Zod validation)', () => {
  it('validates a valid loan_request message', () => {
    const msg = {
      type: 'loan_request',
      from: 'strategist',
      to: 'banker',
      amount: 200,
      purpose: 'DeFi yield',
      expectedReturn: 0.12,
      duration: 24,
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('validates a valid loan_response message', () => {
    const msg = {
      type: 'loan_response',
      from: 'banker',
      to: 'strategist',
      approved: true,
      amount: 200,
      interestRate: 0.08,
      loanId: 'LOAN-001',
      reason: 'Good credit',
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('validates a valid fund_transfer message', () => {
    const msg = {
      type: 'fund_transfer',
      from: 'syndex',
      to: 'banker',
      amount: 600,
      purpose: 'Initial capital distribution',
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('validates a negotiate_proposal message', () => {
    const msg = {
      type: 'negotiate_proposal',
      from: 'strategist',
      to: 'banker',
      negotiationId: 'NEG-abc123',
      round: 1,
      terms: {
        amount: 200,
        interestRate: 0.06,
        duration: 24,
      },
      reasoning: 'Fair rate for yield farming',
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('validates a human_command message', () => {
    const msg = {
      type: 'human_command',
      from: 'human',
      to: 'syndex',
      command: 'show status',
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid message type', () => {
    const msg = {
      type: 'invalid_type',
      from: 'syndex',
      to: 'banker',
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('rejects a loan_request missing required fields', () => {
    const msg = {
      type: 'loan_request',
      from: 'strategist',
      to: 'banker',
      // missing amount, purpose, expectedReturn, duration
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('validates a circuit_break message with valid action enum', () => {
    const msg = {
      type: 'circuit_break',
      from: 'syndex',
      to: 'patron',
      reason: 'Emergency shutdown',
      action: 'liquidate',
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('rejects a circuit_break with invalid action', () => {
    const msg = {
      type: 'circuit_break',
      from: 'syndex',
      to: 'patron',
      reason: 'test',
      action: 'destroy',
      timestamp: Date.now(),
    };

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});
