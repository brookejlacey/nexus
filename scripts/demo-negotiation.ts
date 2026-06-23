/**
 * Standalone demo of Syndex agent-to-agent negotiation.
 *
 * Drives a real multi-round loan negotiation between the Strategist
 * (borrower) and the Banker (lender) through the actual NegotiationEngine
 * and Brain. Every line of reasoning below is generated live by Claude,
 * not scripted.
 *
 * Run:  ANTHROPIC_API_KEY=... npx tsx scripts/demo-negotiation.ts
 */
import { MessageBus } from '../src/core/message-bus.js';
import { Brain } from '../src/core/brain.js';
import { NegotiationEngine } from '../src/core/negotiation-engine.js';
import type { AgentRole } from '../src/types/index.js';

// ── tiny ANSI helpers (no deps) ────────────────────────────────
const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  orange: '\x1b[38;5;166m', green: '\x1b[38;5;71m',
  blue: '\x1b[38;5;75m', gray: '\x1b[38;5;245m', white: '\x1b[97m',
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const usdt = (n: number) => `${n.toFixed(0)} USDt`;

/** Keep the first sentence of the LLM's reasoning so the demo stays tight. */
function firstSentence(text: string): string {
  const clean = text
    .replace(/^#+\s.*$/gm, '')          // drop markdown header lines
    .replace(/\*\*/g, '')               // drop bold markers
    .replace(/[—―–]/g, ' - ') // normalize em/en dashes
    .replace(/^\s*[A-Z][\w -]{0,24}:\s*/, '') // drop a leading "Label:" prefix
    .replace(/\s+/g, ' ')
    .trim();
  const end = clean.search(/[.!?](\s|$)/);
  const out = end > 0 ? clean.slice(0, end + 1) : clean;
  return out.length > 150 ? `${out.slice(0, 147)}...` : out;
}

const tag = (role: AgentRole) =>
  role === 'strategist'
    ? `${c.blue}${c.bold}STRATEGIST${c.reset}`
    : `${c.orange}${c.bold}BANKER${c.reset}`;

function rule() {
  console.log(`${c.gray}${'─'.repeat(62)}${c.reset}`);
}

async function typeLine(prefix: string, text: string) {
  process.stdout.write(`${prefix} ${c.gray}reasoning…${c.reset}`);
  await sleep(450);
  process.stdout.write('\r\x1b[2K');
  console.log(`${prefix} ${c.white}${text}${c.reset}`);
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Set ANTHROPIC_API_KEY to run the live demo.');
    process.exit(1);
  }

  const bus = new MessageBus();
  const brain = new Brain(apiKey);
  const engine = new NegotiationEngine(bus, brain);

  console.log();
  console.log(`${c.orange}${c.bold}  SYNDEX${c.reset} ${c.dim}· agent-to-agent loan negotiation${c.reset}`);
  console.log();
  console.log(`${c.gray}  The Strategist found an 11% Aave position and needs capital.`);
  console.log(`  It opens a negotiation with the Banker's lending pool.${c.reset}`);
  console.log();
  rule();

  // Strategist's opening ask: 400 USDt at 6% for 48h
  const negId = await engine.initiateNegotiation(
    'strategist',
    'banker',
    { amount: 400, interestRate: 0.045, duration: 48 },
    'Deploy into an 11% APY Aave USDt supply position',
  );

  const opening = engine.getNegotiation(negId)!.rounds[0];
  console.log();
  console.log(`${c.dim}  ${negId} · round 1${c.reset}`);
  console.log(`  ${tag('strategist')} proposes ${c.bold}${usdt(opening.terms.amount)}${c.reset} at ${c.bold}${pct(opening.terms.interestRate)}${c.reset} for ${opening.terms.duration}h`);
  await typeLine('   ', `"${firstSentence(opening.reasoning)}"`);
  await sleep(300);

  // Pool + portfolio state the agents reason over
  const pool = { poolSize: 600, utilization: 0.2, creditScore: 580 };
  const portfolio = { balance: 300, targetApy: 0.11, existingDebt: 0 };

  let resolved = false;
  let lastFromLender = true; // borrower just proposed -> lender responds next

  while (!resolved) {
    if (lastFromLender) {
      // Banker's move
      const { accept, counterTerms } = await engine.evaluateAsLender(negId, pool);
      const res = await engine.processCounter(negId, 'banker', counterTerms, accept);
      const round = engine.getNegotiation(negId)!.rounds.at(-1)!;
      console.log();
      console.log(`${c.dim}  ${negId} · round ${round.round}${c.reset}`);
      const verb = accept ? `${c.green}accepts${c.reset}` : 'counters';
      console.log(`  ${tag('banker')} ${verb} ${c.bold}${usdt(counterTerms.amount)}${c.reset} at ${c.bold}${pct(counterTerms.interestRate)}${c.reset} for ${counterTerms.duration}h`);
      await typeLine('   ', `"${firstSentence(round.reasoning)}"`);
      resolved = res.resolved;
      if (resolved && res.accepted) return announce(round.terms);
      if (resolved) return walkAway();
    } else {
      // Strategist's move
      const { accept, counterTerms } = await engine.evaluateAsBorrower(negId, portfolio);
      const res = await engine.processCounter(negId, 'strategist', counterTerms, accept);
      const round = engine.getNegotiation(negId)!.rounds.at(-1)!;
      console.log();
      console.log(`${c.dim}  ${negId} · round ${round.round}${c.reset}`);
      const verb = accept ? `${c.green}accepts${c.reset}` : 'counters';
      console.log(`  ${tag('strategist')} ${verb} ${c.bold}${usdt(counterTerms.amount)}${c.reset} at ${c.bold}${pct(counterTerms.interestRate)}${c.reset} for ${counterTerms.duration}h`);
      await typeLine('   ', `"${firstSentence(round.reasoning)}"`);
      resolved = res.resolved;
      if (resolved && res.accepted) return announce(round.terms);
      if (resolved) return walkAway();
    }
    lastFromLender = !lastFromLender;
    await sleep(300);
  }

  function announce(terms: { amount: number; interestRate: number; duration: number }) {
    console.log();
    rule();
    console.log();
    console.log(`  ${c.green}${c.bold}✓ DEAL STRUCK${c.reset}  ${c.white}${usdt(terms.amount)} at ${pct(terms.interestRate)} for ${terms.duration}h${c.reset}`);
    const spread = (portfolio.targetApy - terms.interestRate) * 100;
    console.log(`  ${c.dim}Strategist nets a ${spread.toFixed(1)}% spread over the borrow cost.${c.reset}`);
    console.log(`  ${c.dim}The interest funds the Patron, who tips creators. No human approved this.${c.reset}`);
    console.log();
  }

  function walkAway() {
    console.log();
    rule();
    console.log(`  ${c.dim}No agreement after 4 rounds. Both agents walk away. Capital stays put.${c.reset}`);
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
