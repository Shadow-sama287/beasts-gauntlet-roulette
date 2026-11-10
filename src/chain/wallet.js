// src/chain/wallet.js — Starknet Wallet Adapter (ArgentX, Braavos, Read-only / Guest)
// Rule: Read-only calls and gas-free message signing only. No payments, no execute.

export const SEPOLIA_CHAIN_ID = '0x534e5f5345504f4c4941'; // SN_SEPOLIA
export const NETWORK_NAME = 'Starknet Sepolia';

const listeners = new Set();

function emitChange() {
  for (const cb of listeners) {
    try {
      cb(wallet.state);
    } catch (err) {
      console.error('[wallet] listener error:', err);
    }
  }
}

export const wallet = {
  state: {
    address: null,
    chainId: null,
    account: null,
    networkName: NETWORK_NAME,
    wrongNetwork: false,
    isConnected: false,
    error: null,
  },

  onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  async connect() {
    try {
      if (typeof window === 'undefined') {
        wallet.state.error = 'Browser window not available';
        emitChange();
        return { success: false, error: wallet.state.error };
      }

      const starknetObj = window.starknet || window.starknet_argentX || window.starknet_braavos;
      if (!starknetObj) {
        wallet.state.error = 'No Starknet wallet extension found (install ArgentX or Braavos for Sepolia)';
        emitChange();
        return { success: false, error: wallet.state.error };
      }

      let accounts = [];
      if (typeof starknetObj.enable === 'function') {
        accounts = await starknetObj.enable({ showModal: true });
      } else if (typeof starknetObj.request === 'function') {
        accounts = await starknetObj.request({ type: 'wallet_requestAccounts' });
      }

      const address = accounts?.[0] || starknetObj.selectedAddress || starknetObj.account?.address || null;
      const chainId = starknetObj.chainId || (starknetObj.provider && typeof starknetObj.provider.getChainId === 'function' ? await starknetObj.provider.getChainId().catch(() => null) : null);

      const isSepolia = !chainId || chainId === SEPOLIA_CHAIN_ID || chainId === 'SN_SEPOLIA' || String(chainId).toLowerCase().includes('sepolia');

      wallet.state = {
        address,
        chainId: chainId || SEPOLIA_CHAIN_ID,
        account: starknetObj.account || null,
        networkName: NETWORK_NAME,
        wrongNetwork: !isSepolia,
        isConnected: Boolean(address),
        error: null,
      };

      if (typeof starknetObj.on === 'function') {
        starknetObj.on('accountsChanged', (newAccounts) => {
          wallet.state.address = newAccounts?.[0] || null;
          wallet.state.isConnected = Boolean(wallet.state.address);
          emitChange();
        });
        starknetObj.on('networkChanged', (newChainId) => {
          wallet.state.chainId = newChainId;
          wallet.state.wrongNetwork = !(newChainId === SEPOLIA_CHAIN_ID || newChainId === 'SN_SEPOLIA' || String(newChainId).toLowerCase().includes('sepolia'));
          emitChange();
        });
      }

      emitChange();
      return { success: true, address: wallet.state.address };
    } catch (err) {
      console.warn('[wallet] Connect error:', err);
      wallet.state.error = err.message || 'Connection failed';
      emitChange();
      return { success: false, error: wallet.state.error };
    }
  },

  async disconnect() {
    wallet.state = {
      address: null,
      chainId: null,
      account: null,
      networkName: NETWORK_NAME,
      wrongNetwork: false,
      isConnected: false,
      error: null,
    };
    emitChange();
  },

  async signMessage(typedData) {
    if (!wallet.state.account) {
      throw new Error('No wallet connected to sign message');
    }
    if (typeof wallet.state.account.signMessage === 'function') {
      return await wallet.state.account.signMessage(typedData);
    }
    throw new Error('Connected account does not support signMessage');
  },
};

export function truncateAddress(addr) {
  if (!addr) return '';
  const s = String(addr);
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

