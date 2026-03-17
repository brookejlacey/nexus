import type { AgentRole } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Manages WDK wallet instances and DeFi protocol access for all agents.
 * Each agent gets its own deterministic wallet derived from its seed phrase.
 *
 * Protocols:
 * - Aave V3 (lending): supply, withdraw, borrow, repay
 * - Velora (DEX): swaps with slippage protection
 * - USDT0 (bridge): cross-chain transfers via LayerZero
 *
 * Runs in two modes:
 * - LIVE: real WDK wallets + on-chain transactions (mainnet/testnet)
 * - SIM: simulated wallets + deterministic mock transactions (demo/dev)
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

export interface SupplyResult extends TransactionResult {
  protocol: string;
  amount: number;
  token: string;
}

export interface SwapResult extends TransactionResult {
  tokenInAmount: bigint;
  tokenOutAmount: bigint;
}

// Known token addresses per chain
const TOKENS: Record<string, Record<string, string>> = {
  ethereum: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDT0: '0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  arbitrum: {
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    USDT0: '0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  polygon: {
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  },
};

export class WalletManager {
  private wallets: Map<AgentRole, WalletInfo> = new Map();
  private balances: Map<AgentRole, number> = new Map();
  private wdkInstances: Map<AgentRole, any> = new Map();
  private configs: Map<AgentRole, WalletConfig> = new Map();
  private protocolsRegistered: Map<AgentRole, Set<string>> = new Map();
  private isLive = false;

  async initializeWallet(role: AgentRole, config: WalletConfig): Promise<WalletInfo> {
    logger.info(`[WALLET] Initializing ${role} wallet on ${config.chain}`);
    this.configs.set(role, config);
    this.protocolsRegistered.set(role, new Set());

    try {
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

        // Register DeFi protocols
        await this.registerProtocols(wdk, config.chain, role);
      }

      const account = await wdk.getAccount(config.chain, 0);
      const address = await account.getAddress();

      this.wdkInstances.set(role, wdk);
      this.isLive = true;

      const walletInfo: WalletInfo = { address, chain: config.chain, role };
      this.wallets.set(role, walletInfo);
      this.balances.set(role, 0);

      logger.info(`[WALLET] ${role} wallet initialized (LIVE): ${address}`);
      return walletInfo;
    } catch (err) {
      logger.warn(`[WALLET] WDK unavailable, using simulation mode for ${role}: ${(err as Error).message}`);
      const address = this.generateSimAddress(role);
      const walletInfo: WalletInfo = { address, chain: config.chain, role };
      this.wallets.set(role, walletInfo);
      this.balances.set(role, 0);
      return walletInfo;
    }
  }

  /** Register Aave, Velora, and USDT0 bridge protocols on a WDK instance */
  private async registerProtocols(wdk: any, chain: string, role: AgentRole): Promise<void> {
    const registered = this.protocolsRegistered.get(role)!;

    try {
      const aaveMod = await import('@tetherto/wdk-protocol-lending-aave-evm');
      (wdk as any).registerProtocol(chain, 'aave', aaveMod.default);
      registered.add('aave');
      logger.info(`[WALLET] ${role}: Aave lending protocol registered on ${chain}`);
    } catch (err) {
      logger.warn(`[WALLET] ${role}: Aave registration failed: ${(err as Error).message}`);
    }

    try {
      const veloraMod = await import('@tetherto/wdk-protocol-swap-velora-evm');
      (wdk as any).registerProtocol(chain, 'velora', veloraMod.default, {
        swapMaxFee: 200000000000000n, // 0.0002 ETH max fee
      });
      registered.add('velora');
      logger.info(`[WALLET] ${role}: Velora swap protocol registered on ${chain}`);
    } catch (err) {
      logger.warn(`[WALLET] ${role}: Velora registration failed: ${(err as Error).message}`);
    }

    try {
      const bridgeMod = await import('@tetherto/wdk-protocol-bridge-usdt0-evm');
      (wdk as any).registerProtocol(chain, 'usdt0', bridgeMod.default, {
        bridgeMaxFee: 100000000000000n, // 0.0001 ETH max fee
      });
      registered.add('usdt0');
      logger.info(`[WALLET] ${role}: USDT0 bridge protocol registered on ${chain}`);
    } catch (err) {
      logger.warn(`[WALLET] ${role}: USDT0 bridge registration failed: ${(err as Error).message}`);
    }
  }

  // ─── Balance ──────────────────────────────────────────────

  async getBalance(role: AgentRole): Promise<number> {
    const wdk = this.wdkInstances.get(role);
    const config = this.configs.get(role);

    if (wdk && config) {
      try {
        const account = await wdk.getAccount(config.chain, 0);
        const balance = await account.getBalance();
        const balNum = Number(balance) / 1e6;
        this.balances.set(role, balNum);
        return balNum;
      } catch {
        // Fall through to cached
      }
    }
    return this.balances.get(role) || 0;
  }

  // ─── Transfers ────────────────────────────────────────────

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
        const amountBigInt = BigInt(Math.round(amount * 1e6));

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

        const currentBalance = this.balances.get(from) || 0;
        this.balances.set(from, currentBalance - amount);

        return { hash: result.hash, fee: result.fee, status: 'confirmed' };
      } catch (err) {
        logger.error(`[WALLET] Transaction failed for ${from}:`, err);
        throw err;
      }
    }

    return this.simulateTransaction(from, toAddress, amount);
  }

  async sendToAgent(from: AgentRole, to: AgentRole, amount: number): Promise<TransactionResult> {
    const toWallet = this.wallets.get(to);
    if (!toWallet) throw new Error(`No wallet found for agent ${to}`);

    const result = await this.sendTransaction(from, toWallet.address, amount);

    // Update both cached balances (sendTransaction already deducted from sender)
    const toBal = this.balances.get(to) || 0;
    this.balances.set(to, toBal + amount);

    return result;
  }

  // ─── Aave Lending Protocol ────────────────────────────────

  async aaveSupply(role: AgentRole, amount: number, token = 'USDT'): Promise<SupplyResult> {
    const wdk = this.wdkInstances.get(role);
    const config = this.configs.get(role);
    const chain = config?.chain || 'ethereum';
    const tokenAddress = TOKENS[chain]?.[token];

    if (wdk && this.protocolsRegistered.get(role)?.has('aave') && tokenAddress) {
      try {
        const account = await wdk.getAccount(chain, 0);
        const aave = account.getLendingProtocol('aave');
        const amountBigInt = BigInt(Math.round(amount * 1e6));

        // Quote first
        const quote = await aave.quoteSupply({ token: tokenAddress, amount: amountBigInt });
        logger.info(`[AAVE] ${role} supply quote: fee=${quote.fee}`);

        // Approve token spending
        await account.approve?.({ token: tokenAddress, amount: amountBigInt, spender: 'aave' });

        // Execute supply
        const result = await aave.supply({ token: tokenAddress, amount: amountBigInt });

        const currentBal = this.balances.get(role) || 0;
        this.balances.set(role, currentBal - amount);

        logger.info(`[AAVE] ${role} supplied ${amount} ${token}: tx=${result.hash}`);
        return { ...result, status: 'confirmed', protocol: 'aave', amount, token };
      } catch (err) {
        logger.error(`[AAVE] ${role} supply failed:`, err);
        throw err;
      }
    }

    // Simulation mode
    return this.simulateAaveSupply(role, amount, token);
  }

  async aaveWithdraw(role: AgentRole, amount: number, token = 'USDT'): Promise<SupplyResult> {
    const wdk = this.wdkInstances.get(role);
    const config = this.configs.get(role);
    const chain = config?.chain || 'ethereum';
    const tokenAddress = TOKENS[chain]?.[token];

    if (wdk && this.protocolsRegistered.get(role)?.has('aave') && tokenAddress) {
      try {
        const account = await wdk.getAccount(chain, 0);
        const aave = account.getLendingProtocol('aave');
        const amountBigInt = BigInt(Math.round(amount * 1e6));

        const result = await aave.withdraw({ token: tokenAddress, amount: amountBigInt });

        const currentBal = this.balances.get(role) || 0;
        this.balances.set(role, currentBal + amount);

        logger.info(`[AAVE] ${role} withdrew ${amount} ${token}: tx=${result.hash}`);
        return { ...result, status: 'confirmed', protocol: 'aave', amount, token };
      } catch (err) {
        logger.error(`[AAVE] ${role} withdraw failed:`, err);
        throw err;
      }
    }

    return this.simulateAaveWithdraw(role, amount, token);
  }

  async aaveGetAccountData(role: AgentRole): Promise<{
    totalCollateral: number;
    totalDebt: number;
    availableBorrows: number;
    healthFactor: number;
  }> {
    const wdk = this.wdkInstances.get(role);
    const config = this.configs.get(role);

    if (wdk && this.protocolsRegistered.get(role)?.has('aave')) {
      try {
        const account = await wdk.getAccount(config!.chain, 0);
        const aave = account.getLendingProtocol('aave');
        const data = await aave.getAccountData();
        return {
          totalCollateral: Number(data.totalCollateralBase) / 1e8,
          totalDebt: Number(data.totalDebtBase) / 1e8,
          availableBorrows: Number(data.availableBorrowsBase) / 1e8,
          healthFactor: Number(data.healthFactor) / 1e18,
        };
      } catch (err) {
        logger.warn(`[AAVE] ${role} getAccountData failed:`, err);
      }
    }

    return { totalCollateral: 0, totalDebt: 0, availableBorrows: 0, healthFactor: 0 };
  }

  // ─── Velora Swap Protocol ─────────────────────────────────

  async veloraSwap(
    role: AgentRole,
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<SwapResult> {
    const wdk = this.wdkInstances.get(role);
    const config = this.configs.get(role);
    const chain = config?.chain || 'ethereum';
    const tokenInAddr = TOKENS[chain]?.[tokenIn];
    const tokenOutAddr = TOKENS[chain]?.[tokenOut];

    if (wdk && this.protocolsRegistered.get(role)?.has('velora') && tokenInAddr && tokenOutAddr) {
      try {
        const account = await wdk.getAccount(chain, 0);
        const velora = account.getSwapProtocol('velora');
        const amountBigInt = BigInt(Math.round(amountIn * 1e6));

        // Quote
        const quote = await velora.quoteSwap({
          tokenIn: tokenInAddr,
          tokenOut: tokenOutAddr,
          tokenInAmount: amountBigInt,
        });
        logger.info(`[VELORA] ${role} swap quote: ${amountIn} ${tokenIn} → ~${Number(quote.tokenOutAmount) / 1e6} ${tokenOut}`);

        // Approve
        await account.approve?.({ token: tokenInAddr, amount: amountBigInt, spender: 'velora' });

        // Execute
        const result = await velora.swap({
          tokenIn: tokenInAddr,
          tokenOut: tokenOutAddr,
          tokenInAmount: amountBigInt,
        });

        logger.info(`[VELORA] ${role} swapped: tx=${result.hash}`);
        return { ...result, status: 'confirmed' };
      } catch (err) {
        logger.error(`[VELORA] ${role} swap failed:`, err);
        throw err;
      }
    }

    return this.simulateSwap(role, tokenIn, tokenOut, amountIn);
  }

  // ─── USDT0 Bridge Protocol ───────────────────────────────

  async bridgeUSDT0(
    role: AgentRole,
    targetChain: string,
    amount: number,
    recipientAddress?: string,
  ): Promise<TransactionResult> {
    const wdk = this.wdkInstances.get(role);
    const config = this.configs.get(role);
    const chain = config?.chain || 'ethereum';
    const tokenAddress = TOKENS[chain]?.USDT0 || TOKENS[chain]?.USDT;

    if (wdk && this.protocolsRegistered.get(role)?.has('usdt0') && tokenAddress) {
      try {
        const account = await wdk.getAccount(chain, 0);
        const bridge = account.getBridgeProtocol('usdt0');
        const amountBigInt = BigInt(Math.round(amount * 1e6));
        const recipient = recipientAddress || await account.getAddress();

        // Quote
        const quote = await bridge.quoteBridge({
          targetChain,
          recipient,
          token: tokenAddress,
          amount: amountBigInt,
        });
        logger.info(`[BRIDGE] ${role} bridge quote: ${amount} USDt → ${targetChain}, bridgeFee=${quote.bridgeFee}`);

        // Approve
        await account.approve?.({ token: tokenAddress, amount: amountBigInt, spender: 'usdt0' });

        // Execute
        const result = await bridge.bridge({
          targetChain,
          recipient,
          token: tokenAddress,
          amount: amountBigInt,
        });

        logger.info(`[BRIDGE] ${role} bridged ${amount} USDt to ${targetChain}: tx=${result.hash}`);
        return { hash: result.hash, fee: result.fee, status: 'confirmed' };
      } catch (err) {
        logger.error(`[BRIDGE] ${role} bridge failed:`, err);
        throw err;
      }
    }

    return this.simulateTransaction(role, `bridge:${targetChain}`, amount);
  }

  // ─── Accessors ────────────────────────────────────────────

  getWalletInfo(role: AgentRole): WalletInfo | undefined {
    return this.wallets.get(role);
  }

  getAllWallets(): Map<AgentRole, WalletInfo> {
    return new Map(this.wallets);
  }

  setBalance(role: AgentRole, amount: number): void {
    this.balances.set(role, amount);
  }

  getWdkInstance(role: AgentRole): any {
    return this.wdkInstances.get(role);
  }

  getTokenAddress(chain: string, token: string): string | undefined {
    return TOKENS[chain]?.[token];
  }

  isLiveMode(): boolean {
    return this.isLive;
  }

  hasProtocol(role: AgentRole, protocol: string): boolean {
    return this.protocolsRegistered.get(role)?.has(protocol) || false;
  }

  async dispose(): Promise<void> {
    for (const [role, wdk] of this.wdkInstances) {
      try {
        if (wdk.dispose) await wdk.dispose();
        logger.info(`[WALLET] Disposed ${role} wallet`);
      } catch {
        // Best effort
      }
    }
    this.wdkInstances.clear();
  }

  // ─── Simulation Helpers ───────────────────────────────────

  private getChainId(chain: string): number {
    const ids: Record<string, number> = {
      ethereum: 1, sepolia: 11155111,
      arbitrum: 42161, 'arbitrum-sepolia': 421614,
      polygon: 137, 'polygon-amoy': 80002,
    };
    return ids[chain] || 11155111;
  }

  private generateSimAddress(role: AgentRole): string {
    const bytes: Record<AgentRole, string> = {
      nexus: 'A1E0', banker: 'B4CE', strategist: 'C7A1', patron: 'D3F9',
    };
    const s = bytes[role] || '0000';
    return `0x${s}${Math.random().toString(16).slice(2, 38)}${s}`;
  }

  private simulateTransaction(from: AgentRole, _to: string, amount: number): TransactionResult {
    const bal = this.balances.get(from) || 0;
    if (bal < amount) throw new Error(`Insufficient balance: ${bal.toFixed(2)} < ${amount.toFixed(2)}`);
    this.balances.set(from, bal - amount);
    const hash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`;
    logger.info(`[SIM] ${from} sent ${amount.toFixed(2)} USDt → tx: ${hash}`);
    return { hash, fee: 0n, status: 'confirmed' };
  }

  private simulateAaveSupply(role: AgentRole, amount: number, token: string): SupplyResult {
    const bal = this.balances.get(role) || 0;
    if (bal < amount) throw new Error(`Insufficient balance for Aave supply`);
    this.balances.set(role, bal - amount);
    const hash = `0xaave${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    logger.info(`[SIM-AAVE] ${role} supplied ${amount.toFixed(2)} ${token}: tx=${hash}`);
    return { hash, fee: 0n, status: 'confirmed', protocol: 'aave', amount, token };
  }

  private simulateAaveWithdraw(role: AgentRole, amount: number, token: string): SupplyResult {
    const bal = this.balances.get(role) || 0;
    this.balances.set(role, bal + amount);
    const hash = `0xaave${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    logger.info(`[SIM-AAVE] ${role} withdrew ${amount.toFixed(2)} ${token}: tx=${hash}`);
    return { hash, fee: 0n, status: 'confirmed', protocol: 'aave', amount, token };
  }

  private simulateSwap(role: AgentRole, tokenIn: string, tokenOut: string, amountIn: number): SwapResult {
    const bal = this.balances.get(role) || 0;
    if (bal < amountIn) throw new Error(`Insufficient balance for swap`);
    this.balances.set(role, bal - amountIn * 0.003); // 0.3% fee
    const hash = `0xswap${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    const outAmount = BigInt(Math.round(amountIn * 0.997 * 1e6));
    logger.info(`[SIM-VELORA] ${role} swapped ${amountIn.toFixed(2)} ${tokenIn} → ${tokenOut}: tx=${hash}`);
    return {
      hash, fee: 0n, status: 'confirmed',
      tokenInAmount: BigInt(Math.round(amountIn * 1e6)),
      tokenOutAmount: outAmount,
    };
  }
}
