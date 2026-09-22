import React from 'react';
import { Faction } from '../../types';
import { Shield, Zap, Swords, Award, Sparkles, CheckCircle2 } from 'lucide-react';

interface FactionCardProps {
  faction: Faction;
  isSelected: boolean;
  onSelect: (faction: Faction) => void;
  onPlayDrum: () => void;
}

export const FactionCard: React.FC<FactionCardProps> = ({
  faction,
  isSelected,
  onSelect,
  onPlayDrum,
}) => {
  const handleClick = () => {
    onPlayDrum();
    onSelect(faction);
  };

  const getRarityBadge = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return {
          bg: 'bg-gradient-to-r from-amber-500 to-yellow-300 text-black font-extrabold',
          border: 'border-yellow-300 shadow-lg shadow-yellow-500/40',
          label: 'Huyền Thoại (Legendary)'
        };
      case 'epic':
        return {
          bg: 'bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold',
          border: 'border-purple-400 shadow-md shadow-purple-600/30',
          label: 'Sử Thi (Epic)'
        };
      case 'rare':
        return {
          bg: 'bg-gradient-to-r from-blue-600 to-cyan-400 text-white font-semibold',
          border: 'border-cyan-400 shadow-md shadow-cyan-600/30',
          label: 'Hiếm (Rare)'
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-stone-600 to-stone-400 text-white font-medium',
          border: 'border-stone-400',
          label: 'Phổ Thông (Common)'
        };
    }
  };

  const rarityInfo = getRarityBadge(faction.rarity);

  return (
    <div
      onClick={handleClick}
      className={`group relative rounded-2xl p-5 cursor-pointer transition-all duration-300 border flex flex-col justify-between overflow-hidden text-left select-none ${
        isSelected
          ? 'bg-gradient-to-b from-imperial-darkred/90 via-imperial-lacquer to-imperial-obsidian border-imperial-gold gold-glow scale-[1.03] z-10'
          : 'bg-imperial-lacquer/80 hover:bg-imperial-slate/80 border-imperial-border hover:border-imperial-gold/60 opacity-90 hover:opacity-100 hover:-translate-y-1'
      }`}
    >
      {/* Top selection indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 z-20 flex items-center space-x-1 px-2 py-0.5 rounded-full bg-imperial-gold text-black text-[11px] font-black shadow-md">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>ĐANG CHỌN</span>
        </div>
      )}

      {/* Coat of Arms watermark */}
      <div className="absolute -right-3 -top-3 text-7xl font-serif text-white/[0.04] group-hover:text-imperial-gold/[0.08] transition-colors pointer-events-none select-none">
        {(faction.coat_of_arms ?? faction.name).charAt(0)}
      </div>

      <div>
        {/* Header: Rarity & Era */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[10px] uppercase px-2.5 py-0.5 rounded-full border ${rarityInfo.bg} ${rarityInfo.border}`}>
            {rarityInfo.label}
          </span>
          <span className="text-xs font-mono text-imperial-lightgold/80 bg-black/40 px-2 py-0.5 rounded border border-imperial-border">
            {faction.historical_era}
          </span>
        </div>

        {/* Faction Name & Motto */}
        <div className="mt-2 mb-3">
          <h3 className="text-xl sm:text-2xl font-cinzel font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-imperial-lightgold to-yellow-500">
            {faction.name}
          </h3>
          <p className="text-xs italic text-amber-200/70 line-clamp-1 mt-0.5">
            "{faction.motto}"
          </p>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 mb-4">
          {faction.description}
        </p>

        {/* Special Unit */}
        <div className="bg-black/40 rounded-xl p-2.5 border border-slate-800 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-imperial-gold font-bold flex items-center space-x-1 mb-1">
            <Sparkles className="w-3 h-3" />
            <span>Binh Chủng Trấn Phái:</span>
          </div>
          <div className="text-xs font-medium text-slate-200">
            {faction.special_unit}
          </div>
        </div>
      </div>

      {/* Military Modifiers (PDF Page 14) */}
      <div className="space-y-2 pt-3 border-t border-imperial-border/80">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Chỉ Số Tác Chiến:</span>
          <span className="text-[10px] text-imperial-lightgold">Off-chain Engine</span>
        </div>

        {/* Attack Bonus */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <Swords className="w-3.5 h-3.5 text-red-400" />
            <span>Sức Tấn Công</span>
          </div>
          <span className="font-bold font-mono text-red-400">+{faction.attack_bonus ?? 0}%</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-red-600 to-amber-500 h-full rounded-full"
            style={{ width: `${Math.min(100, (faction.attack_bonus ?? 0) * 2.8)}%` }}
          />
        </div>

        {/* Defense Bonus */}
        <div className="flex items-center justify-between text-xs mt-1.5">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span>Phòng Thủ Trận Địa</span>
          </div>
          <span className="font-bold font-mono text-blue-400">+{faction.defense_bonus ?? 0}%</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full rounded-full"
            style={{ width: `${Math.min(100, (faction.defense_bonus ?? 0) * 2.8)}%` }}
          />
        </div>

        {/* Movement Bonus */}
        <div className="flex items-center justify-between text-xs mt-1.5">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Cơ Động Hành Quân</span>
          </div>
          <span className="font-bold font-mono text-amber-400">+{faction.movement_bonus ?? 0}%</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-amber-500 to-yellow-300 h-full rounded-full"
            style={{ width: `${Math.min(100, (faction.movement_bonus ?? 0) * 2.8)}%` }}
          />
        </div>
      </div>

    </div>
  );
};
