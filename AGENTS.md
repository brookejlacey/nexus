# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Syndex is a self-sustaining multi-agent economic network powered by Tether WDK and the Claude API. Four autonomous agents, each with its own wallet and reasoning loop, run a small onchain economy.

## Agents

- **Syndex** (orchestrator): capital distribution, health monitoring, economics tracking.
- **Banker**: lending pool, credit scoring, Aave idle yield.
- **Strategist**: DeFi positions (Aave supply, Velora swaps, USDT0 bridge), yield accrual.
- **Patron**: Rumble creator tipping, funded by yield surplus.

## Core engines

- **MessageBus**: pub/sub inter-agent communication.
- **Brain**: Claude API reasoning, shared by all agents.
- **NegotiationEngine**: multi-round LLM-powered agent-to-agent deal-making.
- **CommandEngine**: natural-language treasury control.
- **WalletManager**: WDK integration with a simulation fallback.

## Commands

```bash
npm run dev            # Start agent runtime (tsx watch)
npm run build          # Compile TypeScript
npm run test           # Run vitest
npm run dashboard:dev  # Start Next.js dashboard on :3000
npx tsx scripts/demo-negotiation.ts   # Standalone negotiation demo
```

## Conventions

- API server runs on port 3001 (REST + WebSocket).
- WalletManager runs in simulation mode when WDK packages are not available.
- All agents extend the `BaseAgent` abstract class in `src/core/base-agent.ts`.
- Zod schemas validate all inter-agent messages in `src/types/index.ts`.
- The dashboard is a separate Next.js app in `dashboard/`.
- Interest rates are stored as decimal fractions (0.075 = 7.5%); normalize any LLM-supplied rate before use.

## Environment

Requires `ANTHROPIC_API_KEY`. See `.env.example` for all variables.
