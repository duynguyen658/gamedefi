import { useState, useEffect, useCallback } from 'react';
import { ChainType, Player, WalletVerifyRequest } from '../types';
import { apiService, SessionExpiredError } from '../services/api';
import { solanaAdapter, type SolanaWalletKind } from '../services/solana';

const STORAGE_KEY = 'vnhistory_gamefi_player_session';

export function useWallet() {
  const [chain, setChain] = useState<ChainType>('solana');
  const [address, setAddress] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [authStep, setAuthStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const onExpired = () => {
      if (!localStorage.getItem(STORAGE_KEY)) return;
      setPlayer(null);
      setAddress(null);
      setSessionExpired(true);
      setError('Phiên đăng nhập đã hết hạn. Hãy kết nối ví lại.');
      localStorage.removeItem(STORAGE_KEY);
      apiService.clearAccessToken();
    };
    window.addEventListener('gamefi:session-expired', onExpired);
    return () => window.removeEventListener('gamefi:session-expired', onExpired);
  }, []);

  // Khôi phục session nếu có
  useEffect(() => {
    let active = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.wallet && parsed?.chain === 'solana' && parsed?.access_token) {
          setPlayer(parsed);
          setAddress(parsed.wallet);
          setChain(parsed.chain);
          apiService.setAccessToken(parsed.access_token);
          void apiService.getCurrentSession().then((current) => {
            if (!active || localStorage.getItem(STORAGE_KEY) !== saved) return;
            setPlayer(current);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
          }).catch((reason) => {
            if (!active || localStorage.getItem(STORAGE_KEY) !== saved) return;
            if (reason instanceof SessionExpiredError) {
              setPlayer(null);
              setAddress(null);
              setSessionExpired(true);
              setError(reason.message);
              localStorage.removeItem(STORAGE_KEY);
              apiService.clearAccessToken();
            } else {
              setError('Chưa thể kiểm tra phiên đăng nhập. Hãy thử lại khi kết nối ổn định.');
            }
          });
        } else {
          localStorage.removeItem(STORAGE_KEY);
          apiService.clearAccessToken();
        }
      }
    } catch (e) {
      console.warn('Failed to restore session:', e);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!player || player.is_guest) return;
    const keepSessionAlive = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await apiService.getCurrentSession();
      } catch (reason) {
        if (reason instanceof SessionExpiredError) {
          window.dispatchEvent(new Event('gamefi:session-expired'));
        }
      }
    };
    const timer = window.setInterval(() => { void keepSessionAlive(); }, 10 * 60 * 1000);
    const onVisible = () => { void keepSessionAlive(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [player?.wallet, player?.access_token, player?.is_guest]);

  const connectAndAuth = useCallback(async (selectedChain: ChainType, walletKind: SolanaWalletKind) => {
    setIsConnecting(true);
    setError(null);
    setSessionExpired(false);
    setChain(selectedChain);

    try {
      setAuthStep('1/3: Kết nối ví...');
      const adapter = solanaAdapter;
      adapter.selectWallet(walletKind);
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
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
    apiService.clearAccessToken();
    setSessionExpired(false);
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
    sessionExpired,
    connectAndAuth,
    updatePlayerFaction,
    disconnect,
  };
}
