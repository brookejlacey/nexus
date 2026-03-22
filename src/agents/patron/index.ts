import { BaseAgent } from '../../core/base-agent.js';
import type { MessageBus } from '../../core/message-bus.js';
import type { WalletManager } from '../../core/wallet-manager.js';
import type { Brain } from '../../core/brain.js';
import type { AgentMessage, TipRecord } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * THE PATRON — Autonomous Tipping Agent
 *
 * - Monitors Rumble creators and evaluates content quality
 * - Tips creators autonomously using USDt funded by network yields
 * - Manages a community tipping pool
 * - Smart-splits tips between creators, collaborators, and causes
 * - The "output" side of the Syndex economy — where value reaches humans
 */

interface Creator {
  id: string;
  name: string;
  platform: string;
  engagementScore: number;
  growthRate: number;
  totalTipped: number;
  lastTipped: number;
  category: string;
}

export class PatronAgent extends BaseAgent {
  private tips: TipRecord[] = [];
  private creators: Creator[] = [];
  private poolBalance = 0;
  private yieldFunding = 0;
  private totalTipped = 0;

  constructor(bus: MessageBus, wallet: WalletManager, brain: Brain) {
    super('patron', bus, wallet, brain);
    this.initializeCreators();
  }

  protected getSystemPrompt(): string {
    return `You are The Patron, an autonomous tipping agent in the Syndex economic network.

ROLE: You tip Rumble content creators using USDt. Your funding comes from DeFi yields earned by The Strategist agent. You evaluate creators based on engagement, growth trajectory, and content quality, then allocate tips intelligently.

DECISION FORMAT: Always respond with JSON:
\`\`\`json
{
  "action": "tip" | "distribute_pool" | "analyze_creators" | "hold",
  "reasoning": "1-2 sentence explanation",
  "confidence": 0.0-1.0,
  "parameters": {
    "creatorId": "string",
    "amount": number,
    "splitPercentages": { "creator": 0.8, "collaborator": 0.1, "cause": 0.1 }
  }
}
\`\`\`

TIPPING STRATEGY:
- Prioritize growing creators (high growth rate + engagement)
- Diversify tips across multiple creators
- Tip amounts proportional to creator engagement score
- Never tip the same creator more than once per hour
- Smart-split: 80% to creator, 10% to collaborators, 10% to charitable causes
- Only tip when funded — never go below 1 USDt reserve

CREATOR EVALUATION:
- Engagement score (views, comments, shares)
- Growth trajectory (is the channel growing?)
- Content consistency (regular uploads)
- Community interaction (creator responds to fans)`;
  }

  protected async onStart(): Promise<void> {
    const balance = await this.wallet.getBalance('patron');
    this.poolBalance = balance;
    logger.info(`[PATRON] Starting with ${balance} USDt tipping pool`);
    this.updateAction('monitoring_creators');
  }

  protected async onStop(): Promise<void> {
    logger.info(`[PATRON] Shutting down. Total tipped: ${this.totalTipped.toFixed(2)} USDt across ${this.tips.length} tips`);
  }

  protected getTickInterval(): number {
    return 120_000; // Every 2 minutes
  }

  protected async tick(): Promise<void> {
    this.poolBalance = await this.wallet.getBalance('patron');

    if (this.poolBalance < 1) {
      this.updateAction('waiting for yield funding (balance < 1 USDt)');
      return;
    }

    // Simulate creator activity updates
    this.updateCreatorMetrics();

    const topCreators = [...this.creators]
      .sort((a, b) => b.engagementScore * b.growthRate - a.engagementScore * a.growthRate)
      .slice(0, 5);

    const recentTips = this.tips.slice(-10);
    const recentlyTipped = new Set(
      recentTips
        .filter(t => Date.now() - t.timestamp < 3600_000) // Last hour
        .map(t => t.creator)
    );

    const context = `
CURRENT STATE:
- Tipping pool balance: ${this.poolBalance.toFixed(2)} USDt
- Yield funding received: ${this.yieldFunding.toFixed(2)} USDt total
- Total tips distributed: ${this.totalTipped.toFixed(2)} USDt
- Tips given: ${this.tips.length}

TOP CREATORS (by engagement × growth):
${topCreators.map(c => `- ${c.name} (${c.platform}): engagement=${c.engagementScore.toFixed(0)}, growth=${(c.growthRate * 100).toFixed(1)}%, category=${c.category}, totalTipped=${c.totalTipped.toFixed(2)}, ${recentlyTipped.has(c.id) ? 'RECENTLY TIPPED' : 'available'}`).join('\n')}

RECENT TIPS:
${recentTips.map(t => `- ${t.creator}: ${t.amount.toFixed(2)} USDt (${t.reason}) [${new Date(t.timestamp).toISOString()}]`).join('\n') || 'None yet'}

BUDGET: With ${this.poolBalance.toFixed(2)} USDt available, suggested tip range is ${(this.poolBalance * 0.05).toFixed(2)}-${(this.poolBalance * 0.15).toFixed(2)} USDt per tip.

Who should I tip next and how much? Consider engagement, growth, and recency.`;

    const decision = await this.think(context);

    if (decision.action === 'tip') {
      await this.executeTip(decision);
    } else if (decision.action === 'distribute_pool') {
      await this.distributePool(decision);
    }
  }

  protected handleMessage(message: AgentMessage): void {
    switch (message.type) {
      case 'fund_transfer':
        this.handleFundTransfer(message);
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

  private handleFundTransfer(msg: Extract<AgentMessage, { type: 'fund_transfer' }>): void {
    this.yieldFunding += msg.amount;
    // Don't manually add to poolBalance — tick() reads the canonical wallet balance
    logger.info(`[PATRON] Received ${msg.amount.toFixed(2)} USDt yield funding from ${msg.from}`);
    this.updateAction(`received ${msg.amount.toFixed(2)} USDt yield funding`);
  }

  private async executeTip(decision: { parameters: Record<string, unknown>; reasoning: string }): Promise<void> {
    const creatorId = decision.parameters.creatorId as string;
    const amount = (decision.parameters.amount as number) || this.poolBalance * 0.1;
    const creator = this.creators.find(c => c.id === creatorId);

    if (!creator) {
      // Tip the highest-engagement untipped creator
      const available = this.creators
        .filter(c => Date.now() - c.lastTipped > 3600_000)
        .sort((a, b) => b.engagementScore - a.engagementScore);
      if (available.length === 0) return;
      return this.executeTipToCreator(available[0], Math.min(amount, this.poolBalance * 0.1), decision.reasoning);
    }

    await this.executeTipToCreator(creator, amount, decision.reasoning);
  }

  private async executeTipToCreator(creator: Creator, amount: number, reason: string): Promise<void> {
    if (this.poolBalance - amount < 1) {
      logger.info(`[PATRON] Skipping tip — would drop below 1 USDt reserve`);
      return;
    }

    const splits = {
      creator: amount * 0.8,
      collaborator: amount * 0.1,
      cause: amount * 0.1,
    };

    // In production: send via WDK to creator's Rumble wallet
    // For now, simulate the transaction
    const tipId = `TIP-${randomUUID().slice(0, 8)}`;
    const txHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;

    const tip: TipRecord = {
      id: tipId,
      creator: creator.name,
      platform: creator.platform,
      amount: splits.creator,
      reason: `${reason} | Growth: ${(creator.growthRate * 100).toFixed(1)}% | Engagement: ${creator.engagementScore.toFixed(0)}`,
      fundSource: this.yieldFunding > 0 ? 'yield' : 'pool',
      timestamp: Date.now(),
      txHash,
    };

    this.tips.push(tip);
    this.poolBalance -= amount;
    this.totalTipped += amount;
    creator.totalTipped += splits.creator;
    creator.lastTipped = Date.now();

    logger.info(`[PATRON] Tipped ${creator.name}: ${splits.creator.toFixed(2)} USDt (+ ${splits.collaborator.toFixed(2)} collab + ${splits.cause.toFixed(2)} cause)`);

    this.sendMessage({
      type: 'tip_executed',
      from: 'patron',
      to: 'syndex',
      creator: creator.name,
      amount,
      reason,
      txHash,
      timestamp: Date.now(),
    });

    this.bus.emitDashboard({
      type: 'transaction',
      data: {
        agent: 'patron',
        txHash,
        description: `Tipped ${creator.name} ${splits.creator.toFixed(2)} USDt on ${creator.platform}`,
      },
    });

    this.updateAction(`tipped ${creator.name}: ${splits.creator.toFixed(2)} USDt`);
  }

  private async distributePool(decision: { parameters: Record<string, unknown> }): Promise<void> {
    // Distribute across multiple creators at once
    const topCreators = [...this.creators]
      .filter(c => Date.now() - c.lastTipped > 3600_000)
      .sort((a, b) => b.engagementScore * b.growthRate - a.engagementScore * a.growthRate)
      .slice(0, 3);

    const totalBudget = Math.min(this.poolBalance * 0.3, (decision.parameters.amount as number) || this.poolBalance * 0.3);
    const perCreator = totalBudget / topCreators.length;

    for (const creator of topCreators) {
      await this.executeTipToCreator(creator, perCreator, 'Pool distribution to top creators');
    }
  }

  private respondHealthCheck(msg: Extract<AgentMessage, { type: 'health_check' }>): void {
    this.sendMessage({
      type: 'health_response',
      from: 'patron',
      to: msg.from,
      status: this.paused ? 'degraded' : this.poolBalance > 1 ? 'healthy' : 'degraded',
      balance: this.poolBalance,
      activePositions: 0,
      pnl: -this.totalTipped, // Patron's "PnL" is negative — it's an output node
      timestamp: Date.now(),
    });
  }

  /** Initialize with simulated Rumble creators */
  private initializeCreators(): void {
    this.creators = [
      { id: 'cr1', name: 'TechTalks', platform: 'Rumble', engagementScore: 850, growthRate: 0.15, totalTipped: 0, lastTipped: 0, category: 'technology' },
      { id: 'cr2', name: 'CryptoDaily', platform: 'Rumble', engagementScore: 920, growthRate: 0.22, totalTipped: 0, lastTipped: 0, category: 'crypto' },
      { id: 'cr3', name: 'IndieGameDev', platform: 'Rumble', engagementScore: 650, growthRate: 0.35, totalTipped: 0, lastTipped: 0, category: 'gaming' },
      { id: 'cr4', name: 'OpenSourceHour', platform: 'Rumble', engagementScore: 580, growthRate: 0.28, totalTipped: 0, lastTipped: 0, category: 'opensource' },
      { id: 'cr5', name: 'DeFiExplained', platform: 'Rumble', engagementScore: 780, growthRate: 0.18, totalTipped: 0, lastTipped: 0, category: 'defi' },
      { id: 'cr6', name: 'BuildInPublic', platform: 'Rumble', engagementScore: 720, growthRate: 0.42, totalTipped: 0, lastTipped: 0, category: 'startup' },
      { id: 'cr7', name: 'AIEngineering', platform: 'Rumble', engagementScore: 890, growthRate: 0.31, totalTipped: 0, lastTipped: 0, category: 'ai' },
      { id: 'cr8', name: 'WebDevMastery', platform: 'Rumble', engagementScore: 670, growthRate: 0.12, totalTipped: 0, lastTipped: 0, category: 'webdev' },
    ];
  }

  /** Simulate creator metric changes */
  private updateCreatorMetrics(): void {
    for (const creator of this.creators) {
      // Slight random fluctuation in engagement
      creator.engagementScore *= 0.98 + Math.random() * 0.04;
      creator.growthRate *= 0.95 + Math.random() * 0.1;
    }
  }

  /** Public accessors for dashboard */
  getTips(): TipRecord[] {
    return [...this.tips];
  }

  getCreators(): Creator[] {
    return [...this.creators];
  }

  getMetrics() {
    return {
      poolBalance: this.poolBalance,
      yieldFunding: this.yieldFunding,
      totalTipped: this.totalTipped,
      tipCount: this.tips.length,
      uniqueCreatorsTipped: new Set(this.tips.map(t => t.creator)).size,
    };
  }
}
