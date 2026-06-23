# SYNDEX

**Four AI agents run a self-sustaining onchain economy that earns enough yield to pay for its own intelligence. No human approves the trades.**

Each agent holds its own wallet, its own P&L, and its own Claude-powered reasoning. They lend to each other, deploy capital into DeFi, and tip creators from the surplus. When one agent needs money from another, they do not just request and approve: they negotiate.

<p align="center">
  <img src="docs/negotiation.gif" alt="Two AI agents negotiating a loan over multiple rounds, live" width="760">
</p>

> Every line of reasoning above is generated live by Claude. Run it yourself: `npx tsx scripts/demo-negotiation.ts`

## The hero: agent-to-agent negotiation

Most "multi-agent" systems are a planner handing tasks to workers. Syndex is different. The agents have competing incentives and have to reach a deal.

When the Strategist finds a yield opportunity and needs capital, it opens a negotiation with the Banker instead of filing a request:

1. **Strategist proposes** terms (amount, rate, duration) and argues why they are fair.
2. **Banker reasons** about the proposal against its pool size, utilization, and the borrower's credit score, then accepts or counters.
3. **Strategist** evaluates the counter against its expected yield and the safety margin it needs, then accepts or counters again.
4. Up to **4 rounds**, then a final accept or walk-away.

Each turn is a real LLM call that reads the full negotiation history and formulates the next move. The Banker enforces a rate floor and a credit premium; the Strategist only borrows when the spread clears its margin. Deals get struck somewhere in the middle, exactly like a real desk. The logic lives in [`src/core/negotiation-engine.ts`](src/core/negotiation-engine.ts).

## Two more things that make it real

- **Natural-language treasury control.** Command the whole economy in plain English from a terminal: "move 200 USDt from banker to strategist", "pause the patron", "what's the yield?" Parsed and executed by the [`CommandEngine`](src/core/command-engine.ts).
- **Self-sustaining economics.** The network tracks Claude API spend against DeFi yield in real time. The goal is to earn more from yield than it burns on reasoning, so the economy literally pays for its own intelligence and tips creators from whatever is left over.

## The four agents

| Agent | Role |
|-------|------|
| **Syndex** | Orchestrator. Creates wallets, distributes capital, monitors network health and economics. |
| **Banker** | Lending pool. Credit scoring, loan issuance, parks idle capital in Aave for yield. |
| **Strategist** | DeFi engine. Aave supply, Velora swaps, cross-chain bridges, yield optimization. |
| **Patron** | Creator tipping on Rumble, funded entirely by the network's yield surplus. |

Every agent extends a single `BaseAgent` class and communicates over a pub/sub `MessageBus`. All inter-agent messages are validated by Zod schemas.

## How the money flows

```
Syndex distributes capital  ->  60% Banker / 30% Strategist / 10% Patron
        Banker parks idle USDt in Aave, lends to Strategist on request (negotiated)
        Strategist deploys to DeFi, earns yield, repays Banker with interest
        Surplus yield flows to Patron  ->  Patron tips Rumble creators autonomously
```

The network pays creators out of its own DeFi yields, with no human in the loop.

## Architecture

```
                    +--------------+
                    |   SYNDEX     |
                    | Orchestrator |
                    +------+-------+
                           |
              +------------+------------+
              |            |            |
        +-----v-----+ +----v---+ +------v---+
        |  BANKER   | | STRAT  | |  PATRON  |
        |  Lending  | |  DeFi  | | Tipping  |
        +-----------+ +--------+ +----------+
              |            |            |
              +------------+------------+
                           |
                    +------v-------+
                    |  Tether WDK  |
                    |  (Wallets)   |
                    +--------------+
```

**Stack:** Tether WDK (self-custodial, multi-chain, ERC-4337 wallets) · Claude API for per-agent reasoning · TypeScript / Node 22 runtime · Next.js + Tailwind + WebSocket dashboard.

## Run it

```bash
git clone https://github.com/brookejlacey/syndex.git
cd syndex
npm install
cp .env.example .env          # add your ANTHROPIC_API_KEY

# Watch two agents negotiate a loan, live:
npx tsx scripts/demo-negotiation.ts

# Or boot the full network + dashboard:
npm run dev                   # agent runtime + API on :3001
npm run dashboard:dev         # dashboard on :3000
```

Only `ANTHROPIC_API_KEY` is required. WDK seed phrases, RPC URLs, and starting capital are optional; see [`.env.example`](.env.example).

## Dashboard

A real-time Next.js dashboard at `http://localhost:3000`: per-agent cards (balance, P&L, last action), an SVG topology of money flows, the live loan table with credit scores, the AI decision feed with reasoning, the creator-tip feed, and a TVL / yield / tips metrics bar.

## Simulation mode

The `WalletManager` has a graceful fallback. With WDK packages installed and seed phrases configured, every operation executes onchain. Without them, the system drops into simulation mode: all agent logic, reasoning, negotiations, and economic tracking run identically, with DeFi operations simulated in-memory at representative market rates. This lets the full network be demonstrated and evaluated without live capital or testnet tokens. The `isLiveMode()` API endpoint reports which mode is active.

## WDK integration

Every agent uses Tether's WDK for wallet creation (BIP-39 seed phrases), USDt transfers, Aave lending (`wdk-protocol-lending-aave-evm`), DEX swaps (`wdk-protocol-swap-velora-evm`), cross-chain bridges (`wdk-protocol-bridge-usdt0-evm`), and gasless transactions via ERC-4337 account abstraction.

## License

Apache 2.0
