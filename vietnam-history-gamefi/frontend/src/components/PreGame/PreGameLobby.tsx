import React, { useState, useEffect } from 'react';
import { Army, Faction, Player } from '../../types';
import { Swords, Users, Play, CheckCircle2, RefreshCw, ChevronRight, Compass, Crown, ShoppingBag, ArrowLeftRight } from 'lucide-react';
import { apiService } from '../../services/api';

interface PreGameLobbyProps {
  player: Player;
  faction: Faction;
  onChangeFaction: () => void;
  onEnterBattle: () => void;
  onOpenAdvisorCouncil: () => void;
  onOpenMarketplace: () => void;
  onOpenDefiHub: () => void;
  onPlayDrum: () => void;
  onPlayGong: () => void;
  onPlaySword: () => void;
}

export const PreGameLobby: React.FC<PreGameLobbyProps> = ({
  player,
  faction,
  onChangeFaction,
  onEnterBattle,
  onOpenAdvisorCouncil,
  onOpenMarketplace,
  onOpenDefiHub,
  onPlayDrum,
  onPlayGong,
  onPlaySword,
}) => {
  const [army, setArmy] = useState<Army | null>(null);

  useEffect(() => {
    async function loadArmy() {
      const a = await apiService.getPlayerArmy(player.wallet);
      setArmy(a);
    }
    loadArmy();
  }, [player.wallet]);

  const handleLaunch = () => {
    onPlaySword();
    onPlayGong();
    onEnterBattle();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Top Welcome Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-imperial-lacquer border border-imperial-gold/60 text-imperial-lightgold text-xs font-semibold tracking-wide uppercase mb-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Sảnh Tiền Trạm &bull; Sẵn Sàng Xuất Kích</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-imperial-lightgold to-yellow-500">
          Tổng Hành Dinh Tướng Quân
        </h2>
        <p className="text-sm text-slate-300 mt-2 max-w-xl mx-auto">
          Binh mã đã tề tựu dưới cờ lệnh triều đại {faction.name}. Hãy kiểm tra binh lực, hội ý quân sư và sẵn sàng xuất quân vào trận địa.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Left Column: Commander Profile & Faction Badge */}
        <div className="bg-imperial-lacquer/90 border border-imperial-gold/60 rounded-2xl p-6 gold-glow flex flex-col justify-between corner-ornament">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-imperial-darkred to-imperial-crimson p-1 border-2 border-imperial-gold shadow-lg flex items-center justify-center">
                <Crown className="w-8 h-8 text-imperial-gold" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-imperial-gold tracking-widest">
                  Thống Lĩnh Quân Đoàn
                </span>
                <h3 className="text-lg font-bold text-white font-display">
                  {player.username}
                </h3>
                <div className="text-xs text-slate-400 font-mono">
                  {player.wallet.substring(0, 6)}...{player.wallet.substring(player.wallet.length - 4)}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-imperial-border/80 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Triều đại phụng sự:</span>
                <span className="font-bold text-amber-300 font-display">{faction.name}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Chế độ trải nghiệm:</span>
                <span className="font-bold uppercase text-emerald-400">
                  {player.is_guest ? 'Miễn Phí (F2P)' : 'Có Nối Ví'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Quân hàm thống soái:</span>
                <span className="font-bold text-white">Cấp {player.level} (Đô Đốc)</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Lương thảo & Ngân khố:</span>
                <span className="font-bold text-amber-300 font-mono">
                  🌾 {player.rice || 5000} &bull; 🪙 {player.gold || 10000}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-6">
            <button
              onClick={() => { onPlayDrum(); onOpenAdvisorCouncil(); }}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 text-imperial-lightgold text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md"
            >
              <Crown className="w-4 h-4 text-imperial-gold" />
              <span>Hội Đồng Quân Sư</span>
            </button>

            <button
              onClick={() => { onPlayDrum(); onChangeFaction(); }}
              className="w-full py-2 px-3 rounded-xl bg-black/40 hover:bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Đổi Triều Đại Khác</span>
            </button>
          </div>
        </div>

        {/* Center Column: Army Stats & Equipped Advisor */}
        <div className="bg-imperial-lacquer/90 border border-imperial-border rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-imperial-gold" />
                <h3 className="font-display text-base font-bold text-white">
                  Binh Lực & Tướng Cố Vấn
                </h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                Off-chain Engine
              </span>
            </div>

            {/* Combat Power */}
            <div className="bg-gradient-to-r from-red-950/50 to-amber-950/40 border border-imperial-gold/40 rounded-xl p-4 mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Lực Lượng Tác Chiến (Combat Power)
                </div>
                <div className="text-3xl font-black font-mono text-imperial-lightgold mt-0.5">
                  {army?.total_power || player.base_power} <span className="text-sm font-normal text-amber-300">Điểm</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-imperial-darkred/80 border border-imperial-gold/60 flex items-center justify-center text-imperial-gold">
                <Swords className="w-5 h-5" />
              </div>
            </div>

            {/* Equipped Advisor Snapshot */}
            <div className="bg-amber-950/30 border border-amber-600/40 rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-amber-300 uppercase flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5" />
                  <span>Tướng Cố Vấn Chỉ Huy:</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40">
                  Kích Hoạt
                </span>
              </div>
              <div className="text-sm font-bold text-white font-display">
                {army?.equipped_advisor_name || 'Đã phân bổ tướng bản triều'}
              </div>
            </div>

            {/* Troops Breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="bg-black/30 p-2 rounded-lg border border-slate-800 flex justify-between">
                <span>Trường Thương:</span>
                <span className="font-mono font-bold text-white">{army?.spearmen_count || 100}</span>
              </div>
              <div className="bg-black/30 p-2 rounded-lg border border-slate-800 flex justify-between">
                <span>Cung Thủ:</span>
                <span className="font-mono font-bold text-white">{army?.archers_count || 60}</span>
              </div>
              <div className="bg-black/30 p-2 rounded-lg border border-slate-800 flex justify-between">
                <span>Kỵ Binh:</span>
                <span className="font-mono font-bold text-white">{army?.cavalry_count || 30}</span>
              </div>
              <div className="bg-black/30 p-2 rounded-lg border border-slate-800 flex justify-between">
                <span>Chiến Tượng:</span>
                <span className="font-mono font-bold text-white">{army?.elephants_count || 5}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 text-center">
            Chiến thuật & Tướng Cố Vấn quyết định thắng bại, không phải số tiền chi trên blockchain.
          </div>
        </div>

        {/* Right Column: Battle Modes & Actions */}
        <div className="bg-gradient-to-b from-imperial-darkred/40 via-imperial-lacquer to-imperial-obsidian border border-imperial-gold/60 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Compass className="w-5 h-5 text-amber-400" />
              <h3 className="font-display text-base font-bold text-white">
                Mục Tiêu Chiến Dịch
              </h3>
            </div>

            <div className="space-y-3 mb-6">
              <div className="p-3 rounded-xl bg-black/40 border border-slate-800 hover:border-imperial-gold/40 transition-colors">
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span>Trận 1: Đại Chiến Bạch Đằng Giang</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Sẵn sàng</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Cắm cọc gỗ bọc sắt, phục kích thủy quân Nguyên Mông khi triều rút.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-slate-800 hover:border-imperial-gold/40 transition-colors">
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span>Trận 2: Rạch Gầm – Xoài Mút</span>
                  <span className="text-[10px] text-amber-400 font-mono">Chiến dịch</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Đại phá liên quân Xiêm La trên sông Tiền bằng chiến thuật hỏa công.
                </p>
              </div>
            </div>
          </div>

          {/* Launch & Marketplace Actions */}
          <div className="space-y-3">
            <button
              onClick={handleLaunch}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-imperial-crimson via-red-600 to-imperial-darkred hover:from-red-600 hover:to-imperial-crimson text-imperial-lightgold font-display font-black text-base uppercase tracking-wider border-2 border-imperial-gold shadow-2xl shadow-red-950/80 hover:scale-[1.02] transition-all flex items-center justify-center space-x-3 cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Xuất Quân Vào Chiến Trường</span>
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => { onPlayDrum(); onOpenMarketplace(); }}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-950/50 hover:bg-purple-900/40 text-purple-200 font-semibold text-xs border border-purple-600/50 flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Mở Chợ Tướng Cố Vấn (Marketplace)</span>
            </button>

            <button
              onClick={() => { onPlayDrum(); onOpenDefiHub(); }}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/40 text-emerald-200 font-semibold text-xs border border-emerald-600/50 flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Mở Khu Giao Thương (DEX)</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
