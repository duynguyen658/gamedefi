import React, { useState, useEffect } from 'react';
import { ChainType, PreGameStep, MapLocation, PlayerResources, Player } from './types';
import { useWallet } from './hooks/useWallet';
import { useFaction } from './hooks/useFaction';
import { useAudio } from './hooks/useAudio';
import { apiService } from './services/api';
import { Header } from './components/Common/Header';
import { WalletModal } from './components/Wallet/WalletModal';
import { SplashScreen } from './components/PreGame/SplashScreen';
import { FactionSelection } from './components/PreGame/FactionSelection';
import { PreGameLobby } from './components/PreGame/PreGameLobby';
import { BattleTransition } from './components/PreGame/BattleTransition';
import { CampaignMap } from './components/Campaign/CampaignMap';
import { BattleScreen } from './components/Battle/BattleScreen';
import { AdvisorCouncil } from './components/Advisor/AdvisorCouncil';
import { AdvisorMarketplace } from './components/Marketplace/AdvisorMarketplace';
import { DefiHub } from './components/Defi/DefiHub';

export const App: React.FC = () => {
  const [step, setStep] = useState<PreGameStep>('splash');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [serverOnline, setServerOnline] = useState<boolean>(true);
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);
  const [resources] = useState<PlayerResources>({ rice: 4500, gold: 12800, morale: 85 });

  // Guest player state (F2P — no wallet required)
  const [guestPlayer, setGuestPlayer] = useState<Player | null>(null);

  // Audio system
  const { isMuted, toggleMute, playDrum, playGong, playSwordShink } = useAudio();

  // Wallet system
  const {
    chain,
    setChain,
    player,
    isConnected,
    isConnecting,
    authStep,
    error: walletError,
    connectAndAuth,
    updatePlayerFaction,
    disconnect,
  } = useWallet();

  // Faction system
  const {
    factions,
    selectedFactionId,
    setSelectedFactionId,
    selectedFaction,
    isMinting,
    mintStatus,
    mintFactionNft,
  } = useFaction(player, updatePlayerFaction);

  // The effective player is either the wallet-connected player or the guest player
  const effectivePlayer = player || guestPlayer;

  // Check Backend health on mount
  useEffect(() => {
    async function check() {
      const ok = await apiService.checkHealth();
      setServerOnline(ok);
    }
    check();
  }, []);

  // F2P: Guest login — no wallet needed
  const handleEnterF2P = async () => {
    try {
      const p = await apiService.guestLogin();
      setGuestPlayer(p as unknown as Player);
      setStep('faction_select');
    } catch {
      // Fallback: create a minimal guest player locally if API is down
      setGuestPlayer({
        wallet: `guest_${Date.now()}`,
        chain: 'solana',
        username: 'Khách',
        faction_id: null,
        nft_object_id: null,
        is_guest: true,
        level: 1,
        base_power: 1200,
        rice: 500,
        gold: 200,
        morale: 80,
      });
      setStep('faction_select');
    }
  };

  // Wallet: open connect modal
  const handleEnterWithWallet = () => {
    setIsWalletModalOpen(true);
  };

  // After wallet connection succeeds
  const handleConnectWallet = async (chosenChain: ChainType) => {
    const p = await connectAndAuth(chosenChain);
    if (p.faction_id) {
      setStep('lobby');
    } else {
      setStep('faction_select');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setGuestPlayer(null);
    setStep('splash');
  };

  return (
    <div className="min-h-screen bg-imperial-obsidian text-slate-100 flex flex-col selection:bg-amber-600 selection:text-white relative">
      
      {/* Ancient Header Navigation */}
      <Header
        chain={chain}
        onSelectChain={(c) => setChain(c)}
        player={effectivePlayer ?? null}
        onOpenWalletModal={() => setIsWalletModalOpen(true)}
        onDisconnect={handleDisconnect}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onPlayGong={playGong}
        serverOnline={serverOnline}
        onOpenAdvisorCouncil={() => setStep('advisor_council')}
        onOpenMarketplace={() => setStep('marketplace')}
        onOpenDefiHub={() => {
          if (!effectivePlayer || effectivePlayer.is_guest) setIsWalletModalOpen(true);
          else setStep('defi');
        }}
      />

      {/* Main Pre-Game Flow Routing */}
      <main className="flex-1 flex flex-col">
        {step === 'splash' && (
          <SplashScreen
            onEnterF2P={handleEnterF2P}
            onEnterWithWallet={handleEnterWithWallet}
            onSelectChain={(c) => setChain(c)}
            chain={chain}
            onPlayDrum={playDrum}
            onPlayGong={playGong}
          />
        )}

        {step === 'faction_select' && (
          <FactionSelection
            factions={factions}
            selectedFactionId={selectedFactionId}
            onSelectFactionId={(id) => setSelectedFactionId(id)}
            selectedFaction={selectedFaction}
            player={effectivePlayer ?? null}
            isMinting={isMinting}
            mintStatus={mintStatus}
            onMintFaction={mintFactionNft}
            onProceedToLobby={() => setStep('lobby')}
            onBackToSplash={() => setStep('splash')}
            onPlayDrum={playDrum}
            onPlayGong={playGong}
            onPlaySword={playSwordShink}
            onUpdatePlayer={(p) => {
              if (!player) setGuestPlayer(p as unknown as Player);
              else if (p.faction_id != null) updatePlayerFaction(p.faction_id, p.nft_object_id ?? '');
            }}
          />
        )}

        {step === 'lobby' && effectivePlayer && (
          <PreGameLobby
            player={effectivePlayer}
            faction={selectedFaction}
            onChangeFaction={() => setStep('faction_select')}
            onEnterBattle={() => setStep('battle_transition')}
            onOpenAdvisorCouncil={() => setStep('advisor_council')}
            onOpenMarketplace={() => setStep('marketplace')}
            onOpenDefiHub={() => setStep('defi')}
            onPlayDrum={playDrum}
            onPlayGong={playGong}
            onPlaySword={playSwordShink}
          />
        )}

        {step === 'advisor_council' && effectivePlayer && (
          <AdvisorCouncil
            player={effectivePlayer}
            faction={selectedFaction}
            onBack={() => setStep(effectivePlayer.faction_id ? 'lobby' : 'splash')}
            onOpenMarketplace={() => setStep('marketplace')}
            onPlayDrum={playDrum}
            onPlaySword={playSwordShink}
          />
        )}

        {step === 'marketplace' && (
          <AdvisorMarketplace
            player={effectivePlayer ?? null}
            onBack={() => setStep(effectivePlayer?.faction_id ? 'lobby' : 'advisor_council')}
            onOpenWalletModal={() => setIsWalletModalOpen(true)}
            onPlayDrum={playDrum}
            onPlaySword={playSwordShink}
          />
        )}

        {step === 'defi' && effectivePlayer && (
          <DefiHub
            player={effectivePlayer}
            onBack={() => setStep(effectivePlayer.faction_id ? 'lobby' : 'splash')}
            onPlayDrum={playDrum}
          />
        )}

        {step === 'battle_transition' && effectivePlayer && (
          <BattleTransition
            player={effectivePlayer}
            faction={selectedFaction}
            onReturnToLobby={() => setStep('lobby')}
            onEnterCampaign={() => setStep('campaign_map')}
            onPlayDrum={playDrum}
          />
        )}

        {step === 'campaign_map' && effectivePlayer && (
          <CampaignMap
            player={effectivePlayer}
            faction={selectedFaction}
            resources={resources}
            onDeploy={(location) => {
              setSelectedLocation(location);
              setStep('battle');
            }}
            onBackToLobby={() => setStep('lobby')}
            onPlayDrum={playDrum}
            onPlayGong={playGong}
          />
        )}

        {step === 'battle' && effectivePlayer && selectedLocation && (
          <BattleScreen
            player={effectivePlayer}
            faction={selectedFaction}
            location={selectedLocation}
            onExitBattle={() => setStep('campaign_map')}
            onPlayDrum={playDrum}
            onPlaySword={playSwordShink}
            onPlayGong={playGong}
          />
        )}
      </main>

      {/* Solana Wallet Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        onConnect={handleConnectWallet}
        isConnecting={isConnecting}
        authStep={authStep}
        error={walletError}
        onPlayDrum={playDrum}
        onPlayGong={playGong}
      />

      {/* Ancient Imperial Footer */}
      <footer className="w-full border-t border-imperial-border/60 bg-imperial-lacquer/80 backdrop-blur-sm py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-cinzel text-imperial-lightgold font-bold">Hào Khí Đại Việt</span>
            {' '}— Lịch sử là Trò chơi. Blockchain là Thị trường.
          </div>
          <div className="flex items-center space-x-4 text-[11px] text-slate-400">
            <span>Gameplay • Chiến thuật • Lịch sử</span>
            <span>&bull;</span>
            <span>Tướng Cố Vấn • Chợ On-Chain</span>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default App;
