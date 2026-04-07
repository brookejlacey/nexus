# SYNDEX — Self-Sustaining Multi-Agent Economic Network

**Hackathon Galáctica: WDK Edition 1 Submission**

SYNDEX is an autonomous network of AI agents that form a self-sustaining micro-economy. Each agent has its own Tether WDK wallet, its own P&L, and its own AI-powered decision-making logic. The agents earn revenue from DeFi, lend to each other, and tip content creators — all without human intervention.

### Legend-Tier Features

- **Agent-to-Agent Negotiation** — When Strategist needs a loan, agents engage in multi-round LLM-powered negotiations. Each side reasons about the other's proposal and formulates counter-offers across up to 4 rounds until a deal is struck.
- **Natural Language Treasury Control** — Humans command the economy in plain English via a CLI terminal: "move 200 USDt from banker to strategist", "pause the patron", "what's the yield?"
- **Self-Sustaining Economics** — Real-time tracking of AI compute costs vs DeFi yield. The network's goal is to earn more from DeFi than it spends on Claude API reasoning — paying for its own intelligence.

## Architecture

```
                    ┌──────────────┐
                    │   SYNDEX     │
                    │ Orchestrator │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌─────▼────┐
        │  BANKER   │ │ STRAT  │ │  PATRON  │
        │  Lending  │ │  DeFi  │ │ Tipping  │
        └───────────┘ └────────┘ └──────────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼───────┐
                    │  Tether WDK  │
                    │  (Wallets)   │
                    └──────────────┘
```

### Agents

| Agent | Track | Role |
|-------|-------|------|
| **Syndex** | Agent Wallets | Orchestrator — creates wallets, distributes capital, monitors health |
| **Banker** | Lending Bot | Autonomous lending — credit scoring, loan issuance, Aave idle yield |
| **Strategist** | Autonomous DeFi | Yield optimization — Aave supply, Velora swaps, cross-chain bridges |
| **Patron** | Tipping Bot | Creator tipping on Rumble — funded by DeFi yield surplus |

### Money Flow

1. Syndex creates WDK wallets for all agents
2. Initial capital distributed: 60% Banker, 30% Strategist, 10% Patron
3. Banker parks idle capital in Aave, lends to Strategist on request
4. Strategist deploys to DeFi, earns yield, repays Banker with interest
5. Surplus yield flows to Patron
6. Patron tips Rumble creators autonomously
7. **The network literally pays creators from its own DeFi yields**

## Tech Stack

- **Wallets**: Tether WDK (self-custodial, multi-chain, ERC-4337)
- **AI Reasoning**: Claude API (Anthropic) — each agent has its own reasoning chain
- **Agent Framework**: OpenClaw integration via custom skill
- **Dashboard**: Next.js + Tailwind + WebSocket real-time updates
- **Runtime**: Node.js 22+ / TypeScript

## Quick Start

### Prerequisites

- Node.js 22+
- Anthropic API key
- WDK API key (optional, for indexer)

### Setup

```bash
# Clone
git clone https://github.com/brookejlacey/syndex.git
cd syndex

# Install dependencies
npm install
cd dashboard && npm install && cd ..

# Configure
cp .env.example .env
# Edit .env with your API keys

# Start agent runtime
npm run dev

# In another terminal, start dashboard
npm run dashboard:dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for agent reasoning |
| `SYNDEX_SEED` | No | WDK seed phrase for Syndex wallet (auto-generated if not set) |
| `BANKER_SEED` | No | WDK seed phrase for Banker wallet |
| `STRATEGIST_SEED` | No | WDK seed phrase for Strategist wallet |
| `PATRON_SEED` | No | WDK seed phrase for Patron wallet |
| `WDK_API_KEY` | No | WDK Indexer API key |
| `ETH_RPC_URL` | No | Ethereum/Sepolia RPC endpoint |
| `INITIAL_CAPITAL` | No | Starting capital in USDt (default: 1000) |

## Dashboard

Real-time visualization at `http://localhost:3000`:

- **Agent cards** — status, balance, P&L, last action for each agent
- **Network topology** — SVG visualization of money flows between agents
- **Loan table** — active/repaid loans with credit scoring
- **Activity feed** — live AI decision log with reasoning
- **Tip feed** — creator tips funded by DeFi yields
- **Metrics bar** — TVL, yield earned, tips distributed

## OpenClaw Integration

Install the Syndex skill on your OpenClaw instance (Mac Mini):

```bash
cp -r openclaw-skill ~/.openclaw/skills/syndex-network
```

Then interact via WhatsApp/Telegram/Slack:
- `/syndex status` — full network state
- `/syndex banker` — lending pool metrics
- `/syndex strategist` — DeFi positions
- `/syndex patron` — tip history

## WDK Integration

Every agent uses Tether's WDK for:
- **Wallet creation** — self-custodial, BIP-39 seed phrases
- **Token transfers** — USDt between agents
- **Aave lending** — supply/withdraw via `wdk-protocol-lending-aave-evm`
- **DEX swaps** — via `wdk-protocol-swap-velora-evm`
- **Cross-chain bridges** — via `wdk-protocol-bridge-usdt0-evm`
- **ERC-4337** — gasless transactions via account abstraction

### Simulation Mode

The WalletManager is built with a graceful fallback architecture. When WDK packages are available and configured with seed phrases, all operations execute onchain. When WDK packages are unavailable (e.g. beta access), the system automatically falls back to simulation mode — all agent logic, AI reasoning, negotiations, and economic tracking run identically, with DeFi operations simulated in-memory using representative market rates. This allows the full agent network to be demonstrated and evaluated without requiring live capital or testnet tokens. The `isLiveMode()` API endpoint reports which mode is active.

## Judging Criteria Alignment

| Criteria | How Syndex Delivers |
|----------|-------------------|
| Agent Intelligence | 4 independent LLM-powered agents with distinct reasoning chains and decision logic |
| WDK Integration | Every agent has its own WDK wallet; real USDt flows via lending, swaps, bridges |
| Technical Execution | Clean TypeScript architecture, modular agent system, real-time WebSocket dashboard |
| Agentic Payment Design | Agent-to-agent lending, yield-funded tipping, conditional payment flows |
| Originality | Multi-agent economy — agents earn their own operating costs, forming a self-sustaining network |
| Polish & Ship-ability | Production-ready dashboard, OpenClaw integration, comprehensive API |

## Third-Party Services & APIs

- **Anthropic Claude API** — AI reasoning for agent decisions
- **Tether WDK** — Wallet operations, DeFi protocols
- **Aave V3** (via WDK) — Lending/supply protocol
- **Velora** (via WDK) — DEX aggregator
- **USDT0** (via WDK) — Cross-chain bridge
- **OpenClaw** — Agent framework for human interface

## License

Apache 2.0
