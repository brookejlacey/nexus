import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Brain } from '../brain.js';

// Mock the Anthropic SDK — provide a working response for success tests
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

describe('Brain', () => {
  let brain: Brain;

  beforeEach(() => {
    mockCreate.mockReset();
    brain = new Brain('test-api-key');
  });

  describe('think', () => {
    it('returns a fallback decision on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API unavailable'));

      const decision = await brain.think({
        agent: 'banker',
        systemPrompt: 'You are a test agent.',
        context: 'Test context',
      });

      expect(decision.agent).toBe('banker');
      expect(decision.action).toBe('hold');
      expect(decision.confidence).toBe(0);
      expect(decision.reasoning).toContain('error');
    });

    it('parses a JSON response correctly', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '```json\n{"action": "approve_loan", "reasoning": "Good credit history", "confidence": 0.9, "parameters": {"amount": 200}}\n```',
        }],
      });

      const decision = await brain.think({
        agent: 'banker',
        systemPrompt: 'You are a banker.',
        context: 'Evaluate loan request',
      });

      expect(decision.agent).toBe('banker');
      expect(decision.action).toBe('approve_loan');
      expect(decision.confidence).toBe(0.9);
      expect(decision.reasoning).toBe('Good credit history');
    });

    it('logs successful decisions to the decision log', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '```json\n{"action": "supply", "reasoning": "Good APY", "confidence": 0.8, "parameters": {}}\n```',
        }],
      });

      await brain.think({
        agent: 'strategist',
        systemPrompt: 'Test',
        context: 'Test',
      });

      const log = brain.getDecisionLog('strategist');
      expect(log).toHaveLength(1);
      expect(log[0].agent).toBe('strategist');
      expect(log[0].action).toBe('supply');
    });

    it('extracts action from plain text when no JSON', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'I recommend we hold for now since the market is volatile.',
        }],
      });

      const decision = await brain.think({
        agent: 'strategist',
        systemPrompt: 'Test',
        context: 'Test',
      });

      expect(decision.action).toBe('hold');
      expect(decision.confidence).toBe(0.5);
    });
  });

  describe('getDecisionLog', () => {
    it('returns empty array when no decisions exist', () => {
      expect(brain.getDecisionLog()).toEqual([]);
    });

    it('filters by agent role', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '```json\n{"action": "hold", "reasoning": "waiting", "confidence": 0.5, "parameters": {}}\n```',
        }],
      });

      await brain.think({ agent: 'banker', systemPrompt: '', context: '' });
      await brain.think({ agent: 'strategist', systemPrompt: '', context: '' });
      await brain.think({ agent: 'banker', systemPrompt: '', context: '' });

      const bankerLog = brain.getDecisionLog('banker');
      expect(bankerLog).toHaveLength(2);
      expect(bankerLog.every(d => d.agent === 'banker')).toBe(true);

      const allLog = brain.getDecisionLog();
      expect(allLog).toHaveLength(3);
    });
  });
});
