import { describe, it, expect, beforeEach } from 'vitest';
import { WalletManager } from '../wallet-manager.js';

describe('WalletManager', () => {
  let wallet: WalletManager;

  beforeEach(async () => {
    wallet = new WalletManager();
    // Initialize in simulation mode (WDK not available in tests)
    await wallet.initializeWallet('banker', {
      seedPhrase: 'test seed phrase for banker agent wallet initialization only',
      chain: 'ethereum',
      rpcUrl: 'https://sepolia.drpc.org',
    });
    await wallet.initializeWallet('strategist', {
      seedPhrase: 'test seed phrase for strategist agent wallet initialization only',
      chain: 'ethereum',
      rpcUrl: 'https://sepolia.drpc.org',
    });
  });

  describe('initializeWallet', () => {
    it('creates wallet info with correct role and chain', () => {
      const info = wallet.getWalletInfo('banker');
      expect(info).toBeDefined();
      expect(info!.role).toBe('banker');
      expect(info!.chain).toBe('ethereum');
    });

    it('generates a simulated address when WDK is unavailable', () => {
      const info = wallet.getWalletInfo('banker');
      expect(info!.address).toMatch(/^0x/);
      expect(info!.address.length).toBeGreaterThan(10);
    });

    it('starts in simulation mode', () => {
      expect(wallet.isLiveMode()).toBe(false);
    });
  });

  describe('balance management', () => {
    it('setBalance and getBalance work correctly', async () => {
      wallet.setBalance('banker', 500);
      const bal = await wallet.getBalance('banker');
      expect(bal).toBe(500);
    });

    it('returns 0 for uninitialized agent', async () => {
      const bal = await wallet.getBalance('patron');
      expect(bal).toBe(0);
    });
  });

  describe('sendToAgent (simulation)', () => {
    it('transfers balance between agents', async () => {
      wallet.setBalance('banker', 1000);
      wallet.setBalance('strategist', 100);

      const result = await wallet.sendToAgent('banker', 'strategist', 200);

      expect(result.status).toBe('confirmed');
      expect(result.hash).toMatch(/^0x/);

      const bankerBal = await wallet.getBalance('banker');
      const stratBal = await wallet.getBalance('strategist');
      expect(bankerBal).toBe(800);
      expect(stratBal).toBe(300);
    });

    it('throws on insufficient balance', async () => {
      wallet.setBalance('banker', 50);

      await expect(
        wallet.sendToAgent('banker', 'strategist', 200),
      ).rejects.toThrow(/Insufficient balance/);
    });

    it('throws when target agent has no wallet', async () => {
      wallet.setBalance('banker', 1000);

      await expect(
        wallet.sendToAgent('banker', 'patron', 100),
      ).rejects.toThrow(/No wallet found/);
    });
  });

  describe('Aave simulation', () => {
    it('aaveSupply deducts from balance', async () => {
      wallet.setBalance('banker', 1000);
      const result = await wallet.aaveSupply('banker', 300);

      expect(result.status).toBe('confirmed');
      expect(result.protocol).toBe('aave');
      expect(result.amount).toBe(300);

      const bal = await wallet.getBalance('banker');
      expect(bal).toBe(700);
    });

    it('aaveWithdraw adds to balance', async () => {
      wallet.setBalance('banker', 500);
      const result = await wallet.aaveWithdraw('banker', 200);

      expect(result.status).toBe('confirmed');
      const bal = await wallet.getBalance('banker');
      expect(bal).toBe(700);
    });

    it('aaveSupply throws on insufficient balance', async () => {
      wallet.setBalance('banker', 50);
      await expect(wallet.aaveSupply('banker', 200)).rejects.toThrow();
    });

    it('aaveGetAccountData returns zeros in simulation', async () => {
      const data = await wallet.aaveGetAccountData('banker');
      expect(data.totalCollateral).toBe(0);
      expect(data.healthFactor).toBe(0);
    });
  });

  describe('Velora swap simulation', () => {
    it('executes a simulated swap with 0.3% fee', async () => {
      wallet.setBalance('strategist', 1000);
      const result = await wallet.veloraSwap('strategist', 'USDT', 'WETH', 100);

      expect(result.status).toBe('confirmed');
      expect(result.tokenInAmount).toBe(BigInt(100_000_000));
      // Output should be ~99.7% of input
      expect(Number(result.tokenOutAmount)).toBeCloseTo(99_700_000, -3);
    });

    it('throws on insufficient balance', async () => {
      wallet.setBalance('strategist', 10);
      await expect(
        wallet.veloraSwap('strategist', 'USDT', 'WETH', 100),
      ).rejects.toThrow();
    });
  });

  describe('bridge simulation', () => {
    it('executes a simulated bridge transaction', async () => {
      wallet.setBalance('strategist', 500);
      const result = await wallet.bridgeUSDT0('strategist', 'arbitrum', 100);

      expect(result.status).toBe('confirmed');
      expect(result.hash).toMatch(/^0x/);

      const bal = await wallet.getBalance('strategist');
      expect(bal).toBe(400);
    });
  });

  describe('utility methods', () => {
    it('getAllWallets returns all initialized wallets', () => {
      const all = wallet.getAllWallets();
      expect(all.size).toBe(2);
      expect(all.has('banker')).toBe(true);
      expect(all.has('strategist')).toBe(true);
    });

    it('getTokenAddress returns known addresses', () => {
      expect(wallet.getTokenAddress('ethereum', 'USDT')).toBe(
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      );
      expect(wallet.getTokenAddress('ethereum', 'FAKE')).toBeUndefined();
    });

    it('hasProtocol returns false in simulation', () => {
      expect(wallet.hasProtocol('banker', 'aave')).toBe(false);
    });
  });
});
