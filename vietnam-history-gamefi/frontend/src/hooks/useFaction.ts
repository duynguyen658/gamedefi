import { useState, useEffect, useCallback } from 'react';
import { Faction, Player } from '../types';
import { apiService, DEFAULT_FACTIONS } from '../services/api';
import { solanaAdapter } from '../services/solana';
import confetti from 'canvas-confetti';

export function useFaction(player: Player | null, onFactionRegistered: (factionId: number, nftId: string) => void) {
  const [factions, setFactions] = useState<Faction[]>(DEFAULT_FACTIONS);
  const [selectedFactionId, setSelectedFactionId] = useState<number>(1);
  const [isLoadingFactions, setIsLoadingFactions] = useState<boolean>(false);
  const [isMinting, setIsMinting] = useState<boolean>(false);
  const [mintStatus, setMintStatus] = useState<string>('');
  const [lastMintedNft, setLastMintedNft] = useState<{ txDigest: string; nftId: string } | null>(null);

  useEffect(() => {
    async function loadFactions() {
      setIsLoadingFactions(true);
      try {
        const list = await apiService.getFactions();
        if (list && list.length > 0) {
          setFactions(list);
          // Nếu player đã có faction_id từ trước thì gán luôn
          if (player?.faction_id) {
            setSelectedFactionId(player.faction_id);
          } else {
            setSelectedFactionId(list[0].faction_id);
          }
        }
      } catch (e) {
        console.warn('Load factions fallback:', e);
      } finally {
        setIsLoadingFactions(false);
      }
    }
    loadFactions();
  }, [player?.faction_id]);

  const selectedFaction = factions.find(f => f.faction_id === selectedFactionId) || factions[0];

  const mintFactionNft = useCallback(async (factionId: number) => {
    if (!player) throw new Error('Vui lòng kết nối ví trước khi đúc ấn tín');

    setIsMinting(true);
    setMintStatus('1/2: Đang gửi giao dịch đúc ấn tín lên mạng blockchain...');

    try {
      const adapter = solanaAdapter;
      const { tx_digest, nft_object_id } = await adapter.mintFactionNft(factionId, player.wallet);

      setMintStatus('2/2: Backend đang xác thực quyền sở hữu on-chain...');
      await apiService.registerPlayerFaction(player.wallet, {
        faction_id: factionId,
        nft_object_id,
        tx_digest,
      });

      setLastMintedNft({ txDigest: tx_digest, nftId: nft_object_id });
      onFactionRegistered(factionId, nft_object_id);

      // Pháo hoa ăn mừng lễ phong chức Tướng quân
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#D4AF37', '#8B1E0F', '#F3E5AB', '#CD7F32']
        });
      } catch {}

      setMintStatus('Đúc ấn tín thành công!');
      return { tx_digest, nft_object_id };
    } catch (err: any) {
      console.error('Lỗi khi đúc NFT:', err);
      setMintStatus(err?.message || 'Không thể đăng ký faction trên Solana.');
      throw err;
    } finally {
      setIsMinting(false);
    }
  }, [player, onFactionRegistered]);

  return {
    factions,
    selectedFactionId,
    setSelectedFactionId,
    selectedFaction,
    isLoadingFactions,
    isMinting,
    mintStatus,
    lastMintedNft,
    mintFactionNft,
  };
}
