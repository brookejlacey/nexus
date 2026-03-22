# Syndex

Self-sustaining multi-agent economic network powered by Tether WDK + Claude AI.

## Architecture

4 autonomous agents with independent WDK wallets:
- **Syndex** (orchestrator) — capital distribution, health monitoring, economics tracking
- **Banker** — lending pool, credit scoring, Aave idle yield
- **Strategist** — DeFi positions (Aave supply, Velora swaps, USDT0 bridge), yield accrual
- **Patron** — Rumble creator tipping funded by yield surplus

Core engines:
- **MessageBus** — pub/sub inter-agent communication
- **Brain** — Claude API reasoning (shared by all agents)
- **NegotiationEngine** — multi-round LLM-powered agent-to-agent deal-making
- **CommandEngine** — natural language treasury control
- **WalletManager** — WDK integration with simulation fallback

## Commands

```bash
npm run dev          # Start agent runtime (tsx watch)
npm run build        # Compile TypeScript
npm run test         # Run vitest
npm run dashboard:dev  # Start Next.js dashboard on :3000
```

## Key Details

- API server runs on port 3001 (REST + WebSocket)
- WalletManager runs in simulation mode when WDK packages aren't available
- All agents extend `BaseAgent` abstract class in `src/core/base-agent.ts`
- Zod schemas validate all inter-agent messages in `src/types/index.ts`
- Dashboard is a separate Next.js app in `dashboard/`
- OpenClaw skill definition in `openclaw-skill/SKILL.md`

## Environment

Requires `ANTHROPIC_API_KEY`. See `.env.example` for all variables.
