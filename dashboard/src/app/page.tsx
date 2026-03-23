import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Syndex — Four AI Agents, One Economy',
  description: 'A self-sustaining network where autonomous agents lend, invest, negotiate, and tip creators — funded entirely by the yield they generate.',
};

export default function Landing() {
  return (
    <>
      <style>{`
        .landing * { box-sizing: border-box; }
        .landing {
          --black: #080808;
          --white: #e8e8e8;
          --dim: #666;
          --faint: #222;
          --accent: #34d399;
          background: var(--black);
          color: var(--white);
          font-family: var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif;
          font-weight: 300;
          line-height: 1.7;
          min-height: 100vh;
        }
        .landing .page {
          max-width: 820px;
          margin: 0 auto;
          padding: 12vh 24px 16vh;
        }
        .landing .mark {
          font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
          font-size: 0.85rem;
          font-weight: 400;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 4rem;
        }
        .landing h1 {
          font-family: var(--font-plex-sans), 'IBM Plex Sans', sans-serif;
          font-size: clamp(2.6rem, 6vw, 4rem);
          font-weight: 300;
          line-height: 1.2;
          letter-spacing: -0.02em;
          margin-bottom: 2rem;
          color: var(--white);
        }
        .landing .lead {
          font-size: 1.25rem;
          color: var(--dim);
          max-width: 540px;
          margin-bottom: 6rem;
        }
        .landing hr {
          border: none;
          border-top: 1px solid var(--faint);
          margin: 4rem 0;
        }
        .landing .section-label {
          font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
          font-size: 0.8rem;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--dim);
          margin-bottom: 2rem;
        }
        .landing p {
          color: #aaa;
          font-size: 1.05rem;
          margin-bottom: 1.5rem;
          max-width: 620px;
        }
        .landing .agents {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: var(--faint);
          border: 1px solid var(--faint);
          margin: 2rem 0 4rem;
        }
        .landing .agent {
          background: var(--black);
          padding: 1.8rem;
        }
        .landing .agent-name {
          font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
          font-size: 0.95rem;
          font-weight: 500;
          letter-spacing: 0.05em;
          color: var(--white);
          margin-bottom: 0.6rem;
        }
        .landing .agent-desc {
          font-size: 0.95rem;
          color: var(--dim);
          line-height: 1.5;
          max-width: none;
          margin: 0;
        }
        .landing .flow {
          font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
          font-size: 0.95rem;
          line-height: 2.2;
          color: var(--dim);
          margin: 2rem 0 4rem;
          padding-left: 1rem;
          border-left: 1px solid var(--faint);
        }
        .landing .flow .hl { color: var(--accent); }
        .landing .flow .lb { color: var(--white); }
        .landing .tech {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 1.5rem 0 4rem;
        }
        .landing .tech span {
          font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
          font-size: 0.85rem;
          letter-spacing: 0.04em;
          color: var(--dim);
          border: 1px solid var(--faint);
          padding: 0.4rem 0.75rem;
        }
        .landing .links {
          display: flex;
          gap: 2rem;
          margin-top: 2rem;
        }
        .landing .links a {
          font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
          font-size: 0.95rem;
          color: var(--white);
          text-decoration: none;
          letter-spacing: 0.02em;
          padding-bottom: 2px;
          border-bottom: 1px solid var(--faint);
          transition: border-color 0.2s;
        }
        .landing .links a:hover { border-color: var(--accent); }
        .landing .equation {
          font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
          font-size: 1.2rem;
          color: var(--white);
          margin: 1.5rem 0 1rem;
          letter-spacing: 0.02em;
        }
        .landing .equation .op { color: var(--accent); }
        .landing .dash-link {
          display: inline-block;
          font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace;
          font-size: 0.85rem;
          letter-spacing: 0.05em;
          color: var(--black);
          background: var(--accent);
          padding: 0.6rem 1.4rem;
          text-decoration: none;
          transition: opacity 0.2s;
          margin-bottom: 6rem;
        }
        .landing .dash-link:hover { opacity: 0.8; }
        .landing .footnote {
          font-size: 0.9rem;
          color: #555;
          margin-top: 3rem;
          font-style: italic;
        }
        @media (max-width: 540px) {
          .landing .agents { grid-template-columns: 1fr; }
          .landing .page { padding: 8vh 20px 12vh; }
          .landing .lead { margin-bottom: 4rem; }
        }
      `}</style>
      <div className="landing">
        <div className="page">

          <div className="mark">Syndex</div>

          <h1>Four AI agents.<br />One economy.</h1>

          <p className="lead">
            A self-sustaining network where autonomous agents lend, invest,
            negotiate, and tip creators — funded entirely by the yield they generate.
          </p>

          <Link href="/dashboard" className="dash-link">Live Dashboard</Link>

          <hr />

          <div className="section-label">The Agents</div>

          <div className="agents">
            <div className="agent">
              <div className="agent-name">Syndex</div>
              <p className="agent-desc">Orchestrator. Distributes capital, monitors health, tracks whether the network earns more than it spends.</p>
            </div>
            <div className="agent">
              <div className="agent-name">Banker</div>
              <p className="agent-desc">Runs a lending pool with credit scoring. Parks idle capital in Aave for base yield.</p>
            </div>
            <div className="agent">
              <div className="agent-name">Strategist</div>
              <p className="agent-desc">DeFi operator. Supplies to Aave, swaps on Velora, bridges USDT0 — chasing the best risk-adjusted return.</p>
            </div>
            <div className="agent">
              <div className="agent-name">Patron</div>
              <p className="agent-desc">Tips Rumble creators using surplus yield. The network&#39;s way of giving back.</p>
            </div>
          </div>

          <hr />

          <div className="section-label">How Money Flows</div>

          <div className="flow">
            <span className="lb">Capital in</span> <span className="hl">&rarr;</span> Syndex distributes to Banker (60%) and Strategist (30%)<br />
            <span className="lb">Banker</span> <span className="hl">&rarr;</span> Lends between agents, parks idle funds in Aave<br />
            <span className="lb">Strategist</span> <span className="hl">&rarr;</span> Rotates through DeFi positions for yield<br />
            <span className="lb">Yield surplus</span> <span className="hl">&rarr;</span> Flows to Patron for creator tips<br />
            <span className="lb">All decisions</span> <span className="hl">&rarr;</span> Made by Claude, not rules
          </div>

          <hr />

          <div className="section-label">The Economics</div>

          <p>Every LLM call costs money. Every DeFi position earns money. The network tracks both in real time.</p>

          <div className="equation">
            yield <span className="op">&minus;</span> compute <span className="op">=</span> sustainability
          </div>

          <p>When yield exceeds compute cost, the surplus funds creator tips. The goal: an AI economy that pays for itself.</p>

          <hr />

          <div className="section-label">How Agents Negotiate</div>

          <p>
            Agents don&#39;t follow scripts. When Strategist needs capital, it opens a negotiation with Banker.
            Both sides reason through Claude — proposing terms, countering, accepting or walking away
            over multiple rounds. The deals they make are real transactions on real wallets.
          </p>

          <hr />

          <div className="section-label">Built With</div>

          <div className="tech">
            <span>Tether WDK</span>
            <span>Claude API</span>
            <span>TypeScript</span>
            <span>Aave</span>
            <span>Velora</span>
            <span>USDT0</span>
            <span>ERC-4337</span>
            <span>Next.js</span>
            <span>WebSocket</span>
          </div>

          <hr />

          <div className="section-label">Links</div>

          <div className="links">
            <a href="https://github.com/brookejlacey/syndex">Source</a>
            <Link href="/dashboard">Live Dashboard</Link>
          </div>

          <p className="footnote">Built for Hackathon Galactica: WDK Edition</p>

        </div>
      </div>
    </>
  );
}
