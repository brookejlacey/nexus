import type { AgentRole } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Manages WDK wallet instances for all agents.
 * Each agent gets its own deterministic wallet derived from its seed phrase.
 *
 * In production, this uses @tetherto/wdk directly.
 * For testnet development, we use Sepolia with ERC-4337 for gasless USDt transactions.
 */

export interface WalletConfig {
  seedPhrase: string;
  chain: string;
  rpcUrl: string;
  erc4337?: {
    bundlerUrl: string;
    paymasterUrl: string;
    paymasterAddress: string;
    entryPointAddress: string;
  };
}

export interface WalletInfo {
  address: string;
  chain: string;
  role: AgentRole;
}

export interface TransactionResult {
  hash: string;
  fee: bigint;
  status: 'confirmed' | 'pending' | 'failed';
}

export class WalletManager {
  private wallets: Map<AgentRole, WalletInfo> = new Map();
  private balances: Map<AgentRole, number> = new Map();
  private wdkInstances: Map<AgentRole, any> = new Map();
  private configs: Map<AgentRole, WalletConfig> = new Map();

  async initializeWallet(role: AgentRole, config: WalletConfig): Promise<WalletInfo> {
    logger.info(`[WALLET] Initializing ${role} wallet on ${config.chain}`);

    this.configs.set(role, config);

    try {
      // Dynamic import WDK — allows graceful fallback in dev
      const { default: WDK } = await import('@tetherto/wdk');
      const wdk = new WDK(config.seedPhrase);

      if (config.chain === 'ethereum' || config.chain === 'arbitrum' || config.chain === 'polygon') {
        if (config.erc4337) {
          const mod = await import('@tetherto/wdk-wallet-evm-erc-4337');
          (wdk as any).registerWallet(config.chain, mod.default, {
            chainId: this.getChainId(config.chain),
            provider: config.rpcUrl,
            bundlerUrl: config.erc4337.bundlerUrl,
            paymasterUrl: config.erc4337.paymasterUrl,
            paymasterAddress: config.erc4337.paymasterAddress,
            entryPointAddress: config.erc4337.entryPointAddress,
          });
        } else {
          const mod = await import('@tetherto/wdk-wallet-evm');
          (wdk as any).registerWallet(config.chain, mod.default, {
            provider: config.rpcUrl,
          });
        }
      }

      const account = await wdk.getAccount(config.chain, 0);
      const address = await account.getAddress();

      this.wdkInstances.set(role, wdk);

      const walletInfo: WalletInfo = { address, chain: config.chain, role };
      this.wallets.set(role, walletInfo);
      this.balances.set(role, 0);

      logger.info(`[WALLET] ${role} wallet initialized: ${address}`);
      return walletInfo;
    } catch (err) {
      // Fallback for development without WDK packages installed
      logger.warn(`[WALLET] WDK not available, using simulated wallet for ${role}`);
      const address = this.generateSimAddress(role);
      const walletInfo: WalletInfo = { address, chain: config.chain, role };
      this.wallets.set(role, walletInfo);
      this.balances.set(role, 0);
      return walletInfo;
    }
  }

  async getBalance(role: AgentRole): Promise<number> {
    const wdk = this.wdkInstances.get(role);
    const config = this.configs.get(role);

    if (wdk && config) {
      try {
        const account = await wdk.getAccount(config.chain, 0);
        const balance = await account.getBalance();
        const balNum = Number(balance) / 1e6; // USDt has 6 decimals
        this.balances.set(role, balNum);
        return balNum;
      } catch {
        // Fall through to cached
      }
    }

    return this.balances.get(role) || 0;
  }

  async sendTransaction(
    from: AgentRole,
    toAddress: string,
    amount: number,
    tokenAddress?: string,
  ): Promise<TransactionResult> {
    const wdk = this.wdkInstances.get(from);
    const config = this.configs.get(from);

    if (wdk && config) {
      try {
        const account = await wdk.getAccount(config.chain, 0);
        const amountBigInt = BigInt(Math.round(amount * 1e6)); // USDt 6 decimals

        let result;
        if (tokenAddress) {
          result = await account.transfer({
            token: tokenAddress,
            recipient: toAddress,
            amount: amountBigInt,
          });
        } else {
          result = await account.sendTransaction({
            recipient: toAddress,
            value: amountBigInt,
          });
        }

        // Update cached balance
        const currentBalance = this.balances.get(from) || 0;
        this.balances.set(from, currentBalance - amount);

        return {
          hash: result.hash,
          fee: result.fee,
          status: 'confirmed',
        };
      } catch (err) {
        logger.error(`[WALLET] Transaction failed for ${from}:`, err);
        throw err;
      }
    }

    // Simulated transaction for development
    return this.simulateTransaction(from, toAddress, amount);
  }

  async sendToAgent(from: AgentRole, to: AgentRole, amount: number): Promise<TransactionResult> {
    const toWallet = this.wallets.get(to);
    if (!toWallet) throw new Error(`No wallet found for agent ${to}`);

    const result = await this.sendTransaction(from, toWallet.address, amount);

    // Update both balances
    const fromBal = this.balances.get(from) || 0;
    const toBal = this.balances.get(to) || 0;
    this.balances.set(from, fromBal - amount);
    this.balances.set(to, toBal + amount);

    return result;
  }

  getWalletInfo(role: AgentRole): WalletInfo | undefined {
    return this.wallets.get(role);
  }

  getAllWallets(): Map<AgentRole, WalletInfo> {
    return new Map(this.wallets);
  }

  /** Set balance directly (for simulation/testing) */
  setBalance(role: AgentRole, amount: number): void {
    this.balances.set(role, amount);
  }

  getWdkInstance(role: AgentRole): any {
    return this.wdkInstances.get(role);
  }

  async dispose(): Promise<void> {
    for (const [role, wdk] of this.wdkInstances) {
      try {
        if (wdk.dispose) await wdk.dispose();
        logger.info(`[WALLET] Disposed ${role} wallet`);
      } catch {
        // Best effort cleanup
      }
    }
    this.wdkInstances.clear();
  }

  private getChainId(chain: string): number {
    const chainIds: Record<string, number> = {
      ethereum: 1,
      sepolia: 11155111,
      arbitrum: 42161,
      'arbitrum-sepolia': 421614,
      polygon: 137,
      'polygon-amoy': 80002,
    };
    return chainIds[chain] || 11155111; // default to Sepolia
  }

  private generateSimAddress(role: AgentRole): string {
    const roleBytes: Record<AgentRole, string> = {
      nexus: 'AAAA',
      banker: 'BBBB',
      strategist: 'CCCC',
      patron: 'DDDD',
    };
    const suffix = roleBytes[role] || '0000';
    return `0x${suffix}${'0'.repeat(36)}${suffix}`;
  }

  private simulateTransaction(
    from: AgentRole,
    _toAddress: string,
    amount: number,
  ): TransactionResult {
    const fromBal = this.balances.get(from) || 0;
    if (fromBal < amount) {
      throw new Error(`Insufficient balance: ${fromBal} < ${amount}`);
    }
    this.balances.set(from, fromBal - amount);

    const hash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    logger.info(`[WALLET-SIM] ${from} sent ${amount} USDt → tx: ${hash}`);
    return { hash, fee: 0n, status: 'confirmed' };
  }
}
