import { EventEmitter } from 'events';
import type { AgentMessage, AgentRole, DashboardEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Central message bus for inter-agent communication.
 * Agents publish messages, subscribers react.
 * Dashboard receives all events for real-time visualization.
 */
export class MessageBus extends EventEmitter {
  private messageLog: AgentMessage[] = [];
  private dashboardListeners: Set<(event: DashboardEvent) => void> = new Set();

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /** Send a message from one agent to another */
  send(message: AgentMessage): void {
    this.messageLog.push(message);
    logger.info(`[BUS] ${message.from} → ${message.to}: ${message.type}`, {
      type: message.type,
      from: message.from,
      to: message.to,
    });

    // Emit to specific agent
    this.emit(`message:${message.to}`, message);
    // Emit to all listeners (nexus orchestrator monitors everything)
    this.emit('message:*', message);
    // Emit to dashboard
    this.emitDashboard({ type: 'message', data: message });
  }

  /** Subscribe an agent to receive messages */
  subscribe(agent: AgentRole, handler: (message: AgentMessage) => void): void {
    this.on(`message:${agent}`, handler);
  }

  /** Subscribe to all messages (for orchestrator) */
  subscribeAll(handler: (message: AgentMessage) => void): void {
    this.on('message:*', handler);
  }

  /** Emit a dashboard event */
  emitDashboard(event: DashboardEvent): void {
    for (const listener of this.dashboardListeners) {
      listener(event);
    }
  }

  /** Register a dashboard listener (WebSocket connection) */
  addDashboardListener(listener: (event: DashboardEvent) => void): void {
    this.dashboardListeners.add(listener);
  }

  /** Remove a dashboard listener */
  removeDashboardListener(listener: (event: DashboardEvent) => void): void {
    this.dashboardListeners.delete(listener);
  }

  /** Get message history (for agent context) */
  getHistory(agent?: AgentRole, limit = 50): AgentMessage[] {
    const messages = agent
      ? this.messageLog.filter(m => m.from === agent || m.to === agent)
      : this.messageLog;
    return messages.slice(-limit);
  }

  /** Get full log for export */
  getFullLog(): AgentMessage[] {
    return [...this.messageLog];
  }
}
