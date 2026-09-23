import React from 'react';
import { Volume2, VolumeX, Wallet, LogOut, Crown, ShoppingBag, ArrowLeftRight } from 'lucide-react';
import { Player } from '../../types';

interface HeaderProps {
  player: Player | null;
  onOpenWalletModal: () => void;
  onDisconnect: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onPlayGong: () => void;
  onOpenAdvisorCouncil?: () => void;
  onOpenMarketplace?: () => void;
  onOpenDefiHub?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  player,
  onOpenWalletModal,
  onDisconnect,
  isMuted,
  onToggleMute,
  onPlayGong,
  onOpenAdvisorCouncil,
  onOpenMarketplace,
  onOpenDefiHub,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-imperial-obsidian/90 backdrop-blur-md border-b border-imperial-border/80 px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Brand & Logo */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={onPlayGong}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-imperial-darkred to-imperial-crimson p-0.5 border border-imperial-gold shadow-lg shadow-red-950/50 flex items-center justify-center">
            <span className="font-display text-imperial-gold font-black text-lg">越</span>
          </div>
          <div>
            <h1 className="font-display text-base lg:text-lg font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-imperial-lightgold via-imperial-gold to-amber-500 uppercase">
              Hào Khí Đại Việt
            </h1>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Lịch sử là Trò chơi &bull; Blockchain là Thị trường
            </p>
          </div>
        </div>

        {/* Right Actions: Advisor, Market, Sound, Wallet */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {onOpenAdvisorCouncil && (
            <button
              onClick={onOpenAdvisorCouncil}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 border border-amber-600/40 text-amber-200 text-xs font-semibold cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5 text-imperial-lightgold" />
              <span>Quân Sư</span>
            </button>
          )}

          {onOpenMarketplace && (
            <button
              onClick={onOpenMarketplace}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/50 border border-purple-600/40 text-purple-200 text-xs font-semibold cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-purple-300" />
              <span>Chợ Tướng</span>
            </button>
          )}

          {onOpenDefiHub && (
            <button
              onClick={onOpenDefiHub}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-600/40 text-emerald-200 text-xs font-semibold cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-300" />
              <span>Giao Thương</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={onToggleMute}
            className="p-2 rounded-lg bg-imperial-lacquer hover:bg-imperial-slate border border-imperial-border text-slate-300 hover:text-imperial-gold transition-colors"
            title={isMuted ? 'Bật âm thanh trận mạc' : 'Tắt âm thanh'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-imperial-gold" />}
          </button>

          {/* Wallet Action */}
          {player && !player.is_guest ? (
            <div className="flex items-center space-x-2">
              <div className="bg-imperial-lacquer/90 border border-imperial-gold/40 rounded-lg px-3 py-1.5 flex items-center space-x-2 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-imperial-lightgold flex items-center space-x-1">
                    <span>{player.username}</span>
                    <span className="text-[10px] text-amber-300 uppercase">({player.chain})</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {player.wallet.substring(0, 5)}...{player.wallet.substring(player.wallet.length - 4)}
                  </div>
                </div>
              </div>

              <button
                onClick={onDisconnect}
                className="p-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 transition-colors"
                title="Đăng xuất ví"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenWalletModal}
              className="flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-imperial-crimson to-imperial-darkred hover:from-red-600 hover:to-imperial-crimson text-imperial-lightgold border border-imperial-gold/60 font-semibold text-xs sm:text-sm shadow-md hover:shadow-red-900/40 transition-all cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              <span>{player?.is_guest ? 'Nối Ví (Tùy Chọn)' : 'Kết Nối Ví'}</span>
            </button>
          )}
        </div>

      </div>
    </header>
  );
};
