import { useState, useEffect, useCallback } from 'react';
import { ChainType, Player, WalletVerifyRequest } from '../types';
import { apiService } from '../services/api';
import { solanaAdapter } from '../services/solana';

const STORAGE_KEY = 'vnhistory_gamefi_player_session';

export function useWallet() {
  const [chain, setChain] = useState<ChainType>('solana');
  const [address, setAddress] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [authStep, setAuthStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Khôi phục session nếu có
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.wallet && parsed?.chain === 'solana' && parsed?.access_token) {
          setPlayer(parsed);
          setAddress(parsed.wallet);
          setChain(parsed.chain);
          apiService.setAccessToken(parsed.access_token);
        } else {
          localStorage.removeItem(STORAGE_KEY);
          apiService.clearAccessToken();
        }
      }
    } catch (e) {
      console.warn('Failed to restore session:', e);
    }
  }, []);

  const connectAndAuth = useCallback(async (selectedChain: ChainType) => {
    setIsConnecting(true);
    setError(null);
    setChain(selectedChain);

    try {
      setAuthStep('1/3: Kết nối ví...');
      const adapter = solanaAdapter;
      const walletAddress = await adapter.connect();
      setAddress(walletAddress);

      setAuthStep('2/3: Lấy Nonce & Ký xác thực mật mã...');
      const { nonce, message } = await apiService.getNonce(selectedChain, walletAddress);
      
      const signature = await adapter.signMessage(message);

      setAuthStep('3/3: Xác thực tài khoản Tướng quân...');
      const verifyPayload: WalletVerifyRequest = {
        chain: selectedChain,
        wallet: walletAddress,
        nonce,
        message,
        signature,
      };

      const playerResult = await apiService.verifyWallet(verifyPayload);
      setPlayer(playerResult);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(playerResult));
      setAuthStep('');
      return playerResult;
    } catch (err: any) {
      setPlayer(null);
      setAddress(null);
      localStorage.removeItem(STORAGE_KEY);
      apiService.clearAccessToken();
      console.error('Lỗi xác thực ví:', err);
      setError(err?.message || 'Không thể kết nối hoặc xác thực ví.');
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const updatePlayerFaction = useCallback((factionId: number, nftObjectId: string) => {
    if (!player) return;
    const updated = {
      ...player,
      faction_id: factionId,
      nft_object_id: nftObjectId,
    };
    setPlayer(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [player]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setPlayer(null);
    localStorage.removeItem(STORAGE_KEY);
    apiService.clearAccessToken();
  }, []);

  return {
    chain,
    setChain,
    address,
    player,
    isConnected: !!player,
    isConnecting,
    authStep,
    error,
    connectAndAuth,
    updatePlayerFaction,
    disconnect,
  };
}
