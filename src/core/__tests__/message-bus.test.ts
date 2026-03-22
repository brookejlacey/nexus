import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageBus } from '../message-bus.js';
import type { AgentMessage, DashboardEvent } from '../../types/index.js';

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('send', () => {
    it('delivers message to the target agent subscriber', () => {
      const handler = vi.fn();
      bus.subscribe('banker', handler);

      const msg: AgentMessage = {
        type: 'health_check',
        from: 'syndex',
        to: 'banker',
        timestamp: Date.now(),
      };

      bus.send(msg);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('delivers message to wildcard subscribers', () => {
      const handler = vi.fn();
      bus.subscribeAll(handler);

      const msg: AgentMessage = {
        type: 'health_check',
        from: 'syndex',
        to: 'banker',
        timestamp: Date.now(),
      };

      bus.send(msg);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('does not deliver to unrelated agent subscribers', () => {
      const handler = vi.fn();
      bus.subscribe('strategist', handler);

      bus.send({
        type: 'health_check',
        from: 'syndex',
        to: 'banker',
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('notifies dashboard listeners', () => {
      const dashListener = vi.fn();
      bus.addDashboardListener(dashListener);

      bus.send({
        type: 'health_check',
        from: 'syndex',
        to: 'banker',
        timestamp: Date.now(),
      });

      expect(dashListener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'message' }),
      );
    });

    it('logs messages to history', () => {
      bus.send({
        type: 'health_check',
        from: 'syndex',
        to: 'banker',
        timestamp: Date.now(),
      });

      bus.send({
        type: 'health_check',
        from: 'syndex',
        to: 'strategist',
        timestamp: Date.now(),
      });

      expect(bus.getFullLog()).toHaveLength(2);
    });
  });

  describe('getHistory', () => {
    it('returns all messages when no agent specified', () => {
      bus.send({ type: 'health_check', from: 'syndex', to: 'banker', timestamp: 1 });
      bus.send({ type: 'health_check', from: 'syndex', to: 'strategist', timestamp: 2 });
      bus.send({ type: 'health_check', from: 'syndex', to: 'patron', timestamp: 3 });

      expect(bus.getHistory()).toHaveLength(3);
    });

    it('filters by agent (from or to)', () => {
      bus.send({ type: 'health_check', from: 'syndex', to: 'banker', timestamp: 1 });
      bus.send({ type: 'health_check', from: 'banker', to: 'strategist', timestamp: 2 });
      bus.send({ type: 'health_check', from: 'syndex', to: 'patron', timestamp: 3 });

      const bankerHistory = bus.getHistory('banker');
      expect(bankerHistory).toHaveLength(2);
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        bus.send({ type: 'health_check', from: 'syndex', to: 'banker', timestamp: i });
      }

      expect(bus.getHistory(undefined, 3)).toHaveLength(3);
    });
  });

  describe('dashboard listeners', () => {
    it('adds and removes listeners correctly', () => {
      const listener = vi.fn();
      bus.addDashboardListener(listener);

      bus.emitDashboard({ type: 'alert', data: { level: 'info', message: 'test' } });
      expect(listener).toHaveBeenCalledTimes(1);

      bus.removeDashboardListener(listener);
      bus.emitDashboard({ type: 'alert', data: { level: 'info', message: 'test2' } });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
