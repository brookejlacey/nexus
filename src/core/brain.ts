import Anthropic from '@anthropic-ai/sdk';
import type { AgentRole, AgentDecision } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * AI reasoning engine shared by all agents.
 * Each agent calls think() with its own system prompt and context.
 * Uses Claude Sonnet for fast decision loops, Opus for complex strategy.
 */
export class Brain {
  private client: Anthropic;
  private decisionLog: AgentDecision[] = [];

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Core reasoning function — agent describes its situation,
   * Brain returns a structured decision.
   */
  async think(params: {
    agent: AgentRole;
    systemPrompt: string;
    context: string;
    responseSchema?: Record<string, unknown>;
    model?: 'fast' | 'deep';
  }): Promise<AgentDecision> {
    const model = params.model === 'deep'
      ? 'claude-sonnet-4-20250514'
      : 'claude-sonnet-4-20250514';

    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: 2048,
        system: params.systemPrompt,
        messages: [
          {
            role: 'user',
            content: params.context,
          },
        ],
      });

      const content = response.content[0];
      const text = content.type === 'text' ? content.text : '';

      // Parse the structured response
      const decision = this.parseDecision(params.agent, text);

      const elapsed = Date.now() - startTime;
      logger.info(`[BRAIN] ${params.agent} decided: ${decision.action} (${elapsed}ms, confidence: ${decision.confidence})`);

      this.decisionLog.push(decision);
      return decision;
    } catch (err) {
      logger.error(`[BRAIN] Reasoning failed for ${params.agent}:`, err);
      return {
        agent: params.agent,
        action: 'hold',
        reasoning: 'Reasoning engine error — defaulting to safe hold',
        confidence: 0,
        parameters: {},
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Structured decision extraction with JSON parsing.
   */
  private parseDecision(agent: AgentRole, text: string): AgentDecision {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"action"[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        return {
          agent,
          action: parsed.action || 'hold',
          reasoning: parsed.reasoning || text,
          confidence: parsed.confidence || 0.5,
          parameters: parsed.parameters || parsed,
          timestamp: Date.now(),
        };
      } catch {
        // Fall through to text parsing
      }
    }

    // Fallback: extract action from text
    return {
      agent,
      action: this.extractAction(text),
      reasoning: text.slice(0, 500),
      confidence: 0.5,
      parameters: {},
      timestamp: Date.now(),
    };
  }

  private extractAction(text: string): string {
    const lower = text.toLowerCase();
    const actions = [
      'approve_loan', 'deny_loan', 'issue_loan',
      'supply', 'withdraw', 'swap', 'bridge', 'rebalance',
      'tip', 'distribute',
      'pause', 'resume', 'liquidate',
      'hold',
    ];
    return actions.find(a => lower.includes(a.replace('_', ' '))) || 'hold';
  }

  getDecisionLog(agent?: AgentRole): AgentDecision[] {
    if (agent) return this.decisionLog.filter(d => d.agent === agent);
    return [...this.decisionLog];
  }
}
