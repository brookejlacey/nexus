import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import type { MessageBus } from '../core/message-bus.js';
import type { NexusOrchestrator } from '../agents/nexus/index.js';
import type { BankerAgent } from '../agents/banker/index.js';
import type { StrategistAgent } from '../agents/strategist/index.js';
import type { PatronAgent } from '../agents/patron/index.js';
import type { DashboardEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * API server + WebSocket for the real-time dashboard.
 * REST endpoints for snapshots, WebSocket for live updates.
 */
export class ApiServer {
  private app = express();
  private server: http.Server;
  private wss: WebSocketServer;
  private bus: MessageBus;
  private nexus: NexusOrchestrator;
  private banker: BankerAgent;
  private strategist: StrategistAgent;
  private patron: PatronAgent;

  constructor(
    bus: MessageBus,
    nexus: NexusOrchestrator,
    banker: BankerAgent,
    strategist: StrategistAgent,
    patron: PatronAgent,
  ) {
    this.bus = bus;
    this.nexus = nexus;
    this.banker = banker;
    this.strategist = strategist;
    this.patron = patron;

    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // CORS for dashboard
    this.app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      next();
    });
  }

  private setupRoutes(): void {
    // Network state snapshot
    this.app.get('/api/state', (_req, res) => {
      res.json(this.nexus.getNetworkState());
    });

    // Individual agent status
    this.app.get('/api/agents/:role', async (req, res) => {
      const role = req.params.role;
      const state = this.nexus.getNetworkState();
      const agent = state.agents[role as keyof typeof state.agents];
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json(agent);
    });

    // Banker metrics
    this.app.get('/api/banker/metrics', (_req, res) => {
      res.json({
        ...this.banker.getPoolMetrics(),
        loans: this.banker.getLoans(),
        creditProfiles: Object.fromEntries(this.banker.getCreditProfiles()),
      });
    });

    // Strategist metrics
    this.app.get('/api/strategist/metrics', (_req, res) => {
      res.json({
        ...this.strategist.getMetrics(),
        positions: this.strategist.getPositions(),
      });
    });

    // Patron metrics
    this.app.get('/api/patron/metrics', (_req, res) => {
      res.json({
        ...this.patron.getMetrics(),
        tips: this.patron.getTips(),
        creators: this.patron.getCreators(),
      });
    });

    // Message history
    this.app.get('/api/messages', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      res.json(this.bus.getHistory(undefined, limit));
    });

    // Health check
    this.app.get('/api/health', (_req, res) => {
      const state = this.nexus.getNetworkState();
      res.json({
        status: state.networkHealth,
        agents: Object.fromEntries(
          Object.entries(state.agents).map(([k, v]) => [k, v.status])
        ),
        uptime: process.uptime(),
      });
    });
  }

  private setupWebSocket(): void {
    // Register dashboard event listener
    const broadcast = (event: DashboardEvent) => {
      const data = JSON.stringify(event);
      this.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    };

    this.bus.addDashboardListener(broadcast);

    this.wss.on('connection', (ws) => {
      logger.info('[API] Dashboard client connected');

      // Send current state immediately
      ws.send(JSON.stringify({
        type: 'state_update',
        data: this.nexus.getNetworkState(),
      }));

      ws.on('close', () => {
        logger.info('[API] Dashboard client disconnected');
      });
    });
  }

  start(port: number): void {
    this.server.listen(port, () => {
      logger.info(`[API] Server running on http://localhost:${port}`);
      logger.info(`[API] WebSocket on ws://localhost:${port}`);
    });
  }

  stop(): void {
    this.wss.close();
    this.server.close();
  }
}
