import React, { useLayoutEffect, useState } from 'react';
import { ChainType, PreGameStep, MapLocation, Player } from './types';
import { useWallet } from './hooks/useWallet';
import { useFaction } from './hooks/useFaction';
import { useAudio } from './hooks/useAudio';
import { apiService } from './services/api';
import { Header } from './components/Common/Header';
import { WalletModal } from './components/Wallet/WalletModal';
import { SplashScreen } from './components/PreGame/SplashScreen';
import { FactionSelection } from './components/PreGame/FactionSelection';
import { PreGameLobby } from './components/PreGame/PreGameLobby';
import { CampaignMap } from './components/Campaign/CampaignMap';
import { BattleScreen } from './components/Battle/BattleScreen';
import { AdvisorCouncil } from './components/Advisor/AdvisorCouncil';
import { AdvisorMarketplace } from './components/Marketplace/AdvisorMarketplace';
import { DefiHub } from './components/Defi/DefiHub';
import './App.css';

export const App: React.FC = () => {
  const [step, setStep] = useState<PreGameStep>('splash');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, [step]);

  // Guest player state (F2P — no wallet required)
  const [guestPlayer, setGuestPlayer] = useState<Player | null>(null);

  // Audio system
  const { playDrum, playGong, playSwordShink } = useAudio();

  // Wallet system
  const {
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

  const handleOpenCampaign = () => {
    if (!effectivePlayer) { void handleEnterF2P(); return; }
    setStep(effectivePlayer.faction_id ? 'campaign_map' : 'faction_select');
  };

  const handleOpenAdvisors = () => {
    if (!effectivePlayer) { void handleEnterF2P(); return; }
    setStep(effectivePlayer.faction_id ? 'advisor_council' : 'faction_select');
  };

  const handleOpenDex = () => {
    if (!effectivePlayer || effectivePlayer.is_guest) setIsWalletModalOpen(true);
    else setStep('defi');
  };

  const handleOpenLeaderboard = () => {
    setStep('splash');
    window.setTimeout(() => document.getElementById('leaderboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <div className="app-root min-h-screen flex flex-col selection:bg-amber-600 selection:text-white relative">
      
      {/* Ancient Header Navigation */}
      <Header
        player={effectivePlayer ?? null}
        activeStep={step}
        onOpenHome={() => setStep('splash')}
        onOpenCampaign={handleOpenCampaign}
        onOpenAdvisors={handleOpenAdvisors}
        onOpenLeaderboard={handleOpenLeaderboard}
        onOpenWalletModal={() => setIsWalletModalOpen(true)}
        onDisconnect={handleDisconnect}
        onOpenMarketplace={() => setStep('marketplace')}
        onOpenDex={handleOpenDex}
      />

      {/* Main Pre-Game Flow Routing */}
      <main className="flex-1 flex flex-col">
        {step === 'splash' && (
          <SplashScreen
            player={effectivePlayer ?? null}
            onEnterF2P={handleEnterF2P}
            onEnterWithWallet={handleEnterWithWallet}
            onOpenCampaign={handleOpenCampaign}
            onOpenAdvisors={handleOpenAdvisors}
            onOpenMarketplace={() => setStep('marketplace')}
            onOpenDex={handleOpenDex}
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
            onEnterBattle={() => setStep('campaign_map')}
            onOpenAdvisorCouncil={() => setStep('advisor_council')}
            onOpenMarketplace={() => setStep('marketplace')}
            onOpenDefiHub={handleOpenDex}
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
            onBack={() => setStep(effectivePlayer?.faction_id ? 'lobby' : 'splash')}
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

        {step === 'campaign_map' && effectivePlayer && (
          <CampaignMap
            player={effectivePlayer}
            faction={selectedFaction}
            onDeploy={(location) => {
              setSelectedLocation(location);
              setStep('battle');
            }}
            onBackToLobby={() => setStep('lobby')}
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

      <footer className="app-footer">
        <div className="app-footer-inner">
          <div className="app-footer-brand"><img src="/drum_icon.svg" alt="" /><div><strong>Hào Khí Đại Việt</strong><span>Kiêu hùng quá khứ. Kiến tạo tương lai.</span></div></div>
          <nav aria-label="Liên kết cuối trang">
            <button type="button" onClick={() => setStep('splash')}>Trang chủ</button>
            <button type="button" onClick={handleOpenCampaign}>Chiến dịch</button>
            <button type="button" onClick={() => setStep('marketplace')}>Marketplace</button>
            <button type="button" onClick={handleOpenDex}>DEX</button>
          </nav>
          <a
            href="https://github.com/duynguyen658/gamedefi"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Mở GitHub của Hào Khí Đại Việt"
            title="GitHub của Hào Khí Đại Việt"
            className="app-footer-github"
          >
            <svg viewBox="0 0 16 16" className="h-6 w-6" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 018 4.44c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </footer>

    </div>
  );
};

export default App;
