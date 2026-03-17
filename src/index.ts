import 'dotenv/config';
import { MessageBus } from './core/message-bus.js';
import { WalletManager } from './core/wallet-manager.js';
import { Brain } from './core/brain.js';
import { BankerAgent } from './agents/banker/index.js';
import { StrategistAgent } from './agents/strategist/index.js';
import { PatronAgent } from './agents/patron/index.js';
import { NexusOrchestrator } from './agents/nexus/index.js';
import { ApiServer } from './services/api-server.js';
import { logger } from './utils/logger.js';

/**
 * NEXUS — Self-Sustaining Multi-Agent Economic Network
 *
 * Boot sequence:
 * 1. Initialize shared infrastructure (bus, wallets, brain)
 * 2. Create agent wallets via WDK
 * 3. Start all agents
 * 4. Start API server for dashboard
 * 5. Nexus distributes initial capital
 * 6. Agents begin autonomous operation
 */

async function main() {
  logger.info('═══════════════════════════════════════════');
  logger.info('  NEXUS — Multi-Agent Economic Network');
  logger.info('  Powered by Tether WDK + Claude AI');
  logger.info('═══════════════════════════════════════════');

  // ─── Shared Infrastructure ──────────────────────────────────
  const bus = new MessageBus();
  const wallet = new WalletManager();
  const brain = new Brain(process.env.ANTHROPIC_API_KEY);

  // ─── Initialize Wallets ─────────────────────────────────────
  const rpcUrl = process.env.ETH_RPC_URL || 'https://sepolia.drpc.org';
  const erc4337Config = process.env.BUNDLER_URL ? {
    bundlerUrl: process.env.BUNDLER_URL,
    paymasterUrl: process.env.PAYMASTER_URL || process.env.BUNDLER_URL,
    paymasterAddress: process.env.PAYMASTER_ADDRESS || '',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  } : undefined;

  const generateSeed = async () => {
    try {
      const { default: WDK } = await import('@tetherto/wdk');
      return WDK.getRandomSeedPhrase();
    } catch {
      // Fallback for dev without WDK
      return 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    }
  };

  const seeds = {
    nexus: process.env.NEXUS_SEED || await generateSeed(),
    banker: process.env.BANKER_SEED || await generateSeed(),
    strategist: process.env.STRATEGIST_SEED || await generateSeed(),
    patron: process.env.PATRON_SEED || await generateSeed(),
  };

  logger.info('[BOOT] Initializing agent wallets...');

  await Promise.all([
    wallet.initializeWallet('nexus', { seedPhrase: seeds.nexus, chain: 'ethereum', rpcUrl, erc4337: erc4337Config }),
    wallet.initializeWallet('banker', { seedPhrase: seeds.banker, chain: 'ethereum', rpcUrl, erc4337: erc4337Config }),
    wallet.initializeWallet('strategist', { seedPhrase: seeds.strategist, chain: 'ethereum', rpcUrl, erc4337: erc4337Config }),
    wallet.initializeWallet('patron', { seedPhrase: seeds.patron, chain: 'ethereum', rpcUrl, erc4337: erc4337Config }),
  ]);

  // Set simulated initial balances for demo
  const initialCapital = parseFloat(process.env.INITIAL_CAPITAL || '1000');
  wallet.setBalance('nexus', initialCapital);

  logger.info(`[BOOT] Wallets initialized. Initial capital: ${initialCapital} USDt`);

  // ─── Create Agents ──────────────────────────────────────────
  const banker = new BankerAgent(bus, wallet, brain);
  const strategist = new StrategistAgent(bus, wallet, brain);
  const patron = new PatronAgent(bus, wallet, brain);
  const nexus = new NexusOrchestrator(bus, wallet, brain);

  // Register agents with orchestrator
  nexus.registerAgents(banker, strategist, patron);

  // ─── Start API Server ───────────────────────────────────────
  const apiPort = parseInt(process.env.WS_PORT || '3001');
  const api = new ApiServer(bus, nexus, banker, strategist, patron);
  api.start(apiPort);

  // ─── Start All Agents ───────────────────────────────────────
  logger.info('[BOOT] Starting agents...');

  // Start nexus first (it distributes capital)
  await nexus.start();

  // Wait for capital distribution, then start others
  await new Promise(resolve => setTimeout(resolve, 2000));

  await Promise.all([
    banker.start(),
    strategist.start(),
    patron.start(),
  ]);

  logger.info('═══════════════════════════════════════════');
  logger.info('  All agents running. Network is LIVE.');
  logger.info(`  Dashboard API: http://localhost:${apiPort}`);
  logger.info(`  WebSocket: ws://localhost:${apiPort}`);
  logger.info('═══════════════════════════════════════════');

  // ─── Graceful Shutdown ──────────────────────────────────────
  const shutdown = async () => {
    logger.info('\n[SHUTDOWN] Stopping all agents...');
    await Promise.all([
      patron.stop(),
      strategist.stop(),
      banker.stop(),
      nexus.stop(),
    ]);
    api.stop();
    await wallet.dispose();
    logger.info('[SHUTDOWN] Nexus network stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
