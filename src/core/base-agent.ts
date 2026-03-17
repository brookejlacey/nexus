import type { AgentRole, AgentMessage, AgentStatus, AgentDecision } from '../types/index.js';
import type { MessageBus } from './message-bus.js';
import type { WalletManager } from './wallet-manager.js';
import type { Brain } from './brain.js';
import { logger } from '../utils/logger.js';

/**
 * Base class for all Nexus agents.
 * Provides message handling, wallet access, AI reasoning, and lifecycle management.
 */
export abstract class BaseAgent {
  readonly role: AgentRole;
  protected bus: MessageBus;
  protected wallet: WalletManager;
  protected brain: Brain;
  protected running = false;
  protected paused = false;
  protected lastAction = 'initialized';
  protected lastActionTime = Date.now();
  protected pnl = 0;
  private loopInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    role: AgentRole,
    bus: MessageBus,
    wallet: WalletManager,
    brain: Brain,
  ) {
    this.role = role;
    this.bus = bus;
    this.wallet = wallet;
    this.brain = brain;

    // Subscribe to messages directed at this agent
    this.bus.subscribe(role, (msg) => this.handleMessage(msg));
  }

  /** Start the agent's autonomous loop */
  async start(): Promise<void> {
    logger.info(`[${this.role.toUpperCase()}] Starting agent`);
    this.running = true;
    this.paused = false;

    await this.onStart();

    // Run the decision loop
    this.loopInterval = setInterval(async () => {
      if (!this.running || this.paused) return;
      try {
        await this.tick();
      } catch (err) {
        logger.error(`[${this.role.toUpperCase()}] Tick error:`, err);
      }
    }, this.getTickInterval());
  }

  /** Stop the agent */
  async stop(): Promise<void> {
    logger.info(`[${this.role.toUpperCase()}] Stopping agent`);
    this.running = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    await this.onStop();
  }

  /** Pause without stopping */
  pause(): void {
    this.paused = true;
    this.updateAction('paused');
    logger.info(`[${this.role.toUpperCase()}] Paused`);
  }

  /** Resume from pause */
  resume(): void {
    this.paused = false;
    this.updateAction('resumed');
    logger.info(`[${this.role.toUpperCase()}] Resumed`);
  }

  /** Get current status for dashboard */
  async getStatus(): Promise<AgentStatus> {
    const balance = await this.wallet.getBalance(this.role);
    return {
      role: this.role,
      status: this.paused ? 'paused' : this.running ? 'active' : 'error',
      walletAddress: this.wallet.getWalletInfo(this.role)?.address || '',
      balance,
      pnl: this.pnl,
      lastAction: this.lastAction,
      lastActionTime: this.lastActionTime,
    };
  }

  /** Think using the AI brain */
  protected async think(context: string, model: 'fast' | 'deep' = 'fast'): Promise<AgentDecision> {
    const decision = await this.brain.think({
      agent: this.role,
      systemPrompt: this.getSystemPrompt(),
      context,
      model,
    });

    this.bus.emitDashboard({
      type: 'agent_decision',
      data: decision,
    });

    return decision;
  }

  /** Send a message to another agent */
  protected sendMessage(message: AgentMessage): void {
    this.bus.send(message);
  }

  /** Update last action tracking */
  protected updateAction(action: string): void {
    this.lastAction = action;
    this.lastActionTime = Date.now();
  }

  /** Get recent messages for context building */
  protected getRecentMessages(limit = 20): AgentMessage[] {
    return this.bus.getHistory(this.role, limit);
  }

  // ─── Abstract methods each agent must implement ─────────────

  /** System prompt defining the agent's personality and capabilities */
  protected abstract getSystemPrompt(): string;

  /** Called once when agent starts */
  protected abstract onStart(): Promise<void>;

  /** Called once when agent stops */
  protected abstract onStop(): Promise<void>;

  /** Main decision loop — called every tick interval */
  protected abstract tick(): Promise<void>;

  /** Handle incoming messages from other agents */
  protected abstract handleMessage(message: AgentMessage): void;

  /** How often the agent's decision loop runs (ms) */
  protected abstract getTickInterval(): number;
}
