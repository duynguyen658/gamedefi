import React, { useState } from 'react';
import { ArrowLeftRight, Crown, LogOut, Menu, Shield, ShoppingBag, Trophy, Wallet, X } from 'lucide-react';
import { Player, PreGameStep } from '../../types';
import './Header.css';

interface HeaderProps {
  player: Player | null;
  activeStep: PreGameStep;
  onOpenHome: () => void;
  onOpenCampaign: () => void;
  onOpenAdvisors: () => void;
  onOpenMarketplace: () => void;
  onOpenDex: () => void;
  onOpenLeaderboard: () => void;
  onOpenWalletModal: () => void;
  onDisconnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  player,
  activeStep,
  onOpenHome,
  onOpenCampaign,
  onOpenAdvisors,
  onOpenMarketplace,
  onOpenDex,
  onOpenLeaderboard,
  onOpenWalletModal,
  onDisconnect,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const connected = Boolean(player && !player.is_guest);
  const nav = [
    { label: 'Trang chủ', action: onOpenHome, active: activeStep === 'splash', Icon: Shield },
    { label: 'Chiến dịch', action: onOpenCampaign, active: ['faction_select', 'lobby', 'campaign_map', 'battle'].includes(activeStep), Icon: Shield },
    { label: 'Tướng lĩnh', action: onOpenAdvisors, active: activeStep === 'advisor_council', Icon: Crown },
    { label: 'Marketplace', action: onOpenMarketplace, active: activeStep === 'marketplace', Icon: ShoppingBag },
    { label: 'DEX', action: onOpenDex, active: activeStep === 'defi', Icon: ArrowLeftRight },
    { label: 'Bảng xếp hạng', action: onOpenLeaderboard, active: false, Icon: Trophy },
  ];

  const navigate = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <header className="portal-header">
      <div className="portal-header-inner">
        <button type="button" className="portal-brand" onClick={() => navigate(onOpenHome)} aria-label="Về trang chủ Hào Khí Đại Việt">
          <img src="/drum_icon.svg" alt="" />
          <span>Hào Khí <strong>Đại Việt</strong></span>
        </button>
        <nav className="portal-desktop-nav" aria-label="Điều hướng chính">
          {nav.map(({ label, action, active }) => <button type="button" key={label} onClick={() => navigate(action)} aria-current={active ? 'page' : undefined}>{label}</button>)}
        </nav>
        <div className="portal-header-actions">
          <span className="portal-network" title="Mạng thử nghiệm Solana">● <span>Solana Devnet</span></span>
          {connected && player ? (
            <div className="portal-account">
              <span title={player.wallet}><Wallet aria-hidden="true" /> <strong>{player.username}</strong></span>
              <button type="button" onClick={onDisconnect} title="Ngắt kết nối ví" aria-label="Ngắt kết nối ví"><LogOut aria-hidden="true" /></button>
            </div>
          ) : (
            <button type="button" className="portal-connect" onClick={onOpenWalletModal}><Wallet aria-hidden="true" /><span>{player?.is_guest ? 'Nối ví' : 'Kết nối ví'}</span></button>
          )}
          <button type="button" className="portal-menu-trigger" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
        </div>
      </div>
      {menuOpen && <nav className="portal-mobile-nav" aria-label="Điều hướng di động">
        {nav.map(({ label, action, active, Icon }) => <button type="button" key={label} onClick={() => navigate(action)} aria-current={active ? 'page' : undefined}><Icon aria-hidden="true" />{label}</button>)}
      </nav>}
    </header>
  );
};
