import React, { useState, useEffect } from 'react';
import { DrumOrnament } from '../Common/DrumOrnament';
import { Swords, Flame, ArrowLeft, Map } from 'lucide-react';
import { Faction, Player } from '../../types';

interface BattleTransitionProps {
  player: Player;
  faction: Faction;
  onReturnToLobby: () => void;
  onEnterCampaign: () => void;
  onPlayDrum: () => void;
}

export const BattleTransition: React.FC<BattleTransitionProps> = ({
  player,
  faction,
  onReturnToLobby,
  onEnterCampaign,
  onPlayDrum,
}) => {
  const [countdown, setCountdown] = useState<number>(3);
  const [battleLoaded, setBattleLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
        onPlayDrum();
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setBattleLoaded(true);
    }
  }, [countdown, onPlayDrum]);

  return (
    <div className="relative min-h-[calc(100vh-70px)] flex flex-col items-center justify-center p-4 text-center overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 flex items-center justify-center opacity-25 pointer-events-none">
        <DrumOrnament size={700} animate={true} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto space-y-6">
        
        {!battleLoaded ? (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 mx-auto rounded-full bg-imperial-darkred border-2 border-imperial-gold flex items-center justify-center text-imperial-gold animate-bounce">
              <Swords className="w-10 h-10" />
            </div>

            <div className="text-6xl font-black font-display text-imperial-gold">
              {countdown}
            </div>

            <h2 className="text-2xl sm:text-3xl font-display font-black text-white">
              CHIÊNG TRỐNG VANG RỜN &bull; ĐẠI QUÂN TIẾN VÀO TRẬN ĐỊA
            </h2>

            <p className="text-sm text-amber-200/90 italic font-serif">
              "Kỳ binh {faction.name} nhất tề xuất kích, bảo vệ giang sơn!"
            </p>
          </div>
        ) : (
          <div className="bg-imperial-lacquer/95 border-2 border-imperial-gold rounded-3xl p-8 gold-glow space-y-6 animate-in fade-in duration-700 text-left">
            <div className="flex items-center justify-between pb-4 border-b border-imperial-border">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-imperial-darkred border border-imperial-gold flex items-center justify-center text-imperial-gold font-display text-xl font-black">
                  {(faction.coat_of_arms ?? faction.name).charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold font-display text-white">
                    Chiến Trường Sẵn Sàng (Combat Ready)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Giai đoạn khởi động trước trận đấu của MVP đã hoàn tất thành công!
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/50 text-xs font-bold">
                Off-chain Engine Live
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-black/40 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400">Thống Soái:</span>
                <p className="font-bold text-white mt-0.5">{player.username}</p>
                <p className="font-mono text-[10px] text-slate-500 truncate">{player.wallet}</p>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400">Tộc Hệ & NFT:</span>
                <p className="font-bold text-imperial-lightgold mt-0.5">{faction.name}</p>
                <p className="font-mono text-[10px] text-emerald-400 truncate">Token: {player.nft_object_id || 'Verified'}</p>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400">Tổng Lực Lượng:</span>
                <p className="font-bold text-amber-400 mt-0.5">{player.base_power} Sức Chiến Đấu</p>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400">Binh Chủng Xung Kích:</span>
                <p className="font-bold text-cyan-300 mt-0.5">{faction.special_unit}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/60 to-black border border-red-800/40 text-xs text-slate-300 space-y-1">
              <div className="font-bold text-imperial-gold flex items-center space-x-1.5">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Trạng thái kết nối vòng lặp Gameplay:</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dữ liệu Player, Ấn tín Solana và Binh lực đã được chuyển tiếp trơn tru tới Battle Engine theo đúng biểu đồ kiến trúc mục 4 trong tài liệu FPD.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={onReturnToLobby}
                className="w-full py-3 rounded-xl bg-black/60 hover:bg-imperial-darkred/80 border border-imperial-border hover:border-imperial-gold text-slate-200 font-semibold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại Tổng Hành Dinh</span>
              </button>

              <button
                onClick={() => { onPlayDrum(); onEnterCampaign(); }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-imperial-crimson via-red-600 to-imperial-darkred hover:from-red-600 hover:to-imperial-crimson border-2 border-imperial-gold text-imperial-lightgold font-display font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg shadow-red-950/60"
              >
                <Map className="w-4 h-4" />
                <span>Vào Bản Đồ Chiến Dịch</span>
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
