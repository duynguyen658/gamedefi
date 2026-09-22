import React, { useState, useEffect } from 'react';
import { Advisor, Army, Faction, Player, RarityType } from '../../types';
import { apiService } from '../../services/api';
import { DrumOrnament } from '../Common/DrumOrnament';
import {
  ArrowLeft,
  Award,
  BookOpen,
  ChevronRight,
  Crown,
  Flame,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  Users,
} from 'lucide-react';

interface AdvisorCouncilProps {
  player: Player;
  faction?: Faction;
  onBack: () => void;
  onOpenMarketplace: () => void;
  onPlayDrum: () => void;
  onPlaySword: () => void;
}

const RARITY_STYLES: Record<RarityType, { badge: string; border: string; bg: string }> = {
  legendary: {
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
    border: 'border-amber-500/60 shadow-amber-950/40',
    bg: 'from-amber-950/30 to-amber-900/10',
  },
  epic: {
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
    border: 'border-purple-500/60 shadow-purple-950/40',
    bg: 'from-purple-950/30 to-purple-900/10',
  },
  rare: {
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
    border: 'border-blue-500/60 shadow-blue-950/40',
    bg: 'from-blue-950/30 to-blue-900/10',
  },
  common: {
    badge: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
    border: 'border-slate-600/50 shadow-black/40',
    bg: 'from-slate-900/40 to-slate-800/10',
  },
};

export const AdvisorCouncil: React.FC<AdvisorCouncilProps> = ({
  player,
  faction,
  onBack,
  onOpenMarketplace,
  onPlayDrum,
  onPlaySword,
}) => {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [army, setArmy] = useState<Army | null>(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState<Advisor | null>(null);
  const [filterFaction, setFilterFaction] = useState<number | null>(faction?.faction_id || null);
  const [filterRarity, setFilterRarity] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const advs = await apiService.getAdvisors();
      setAdvisors(advs);
      const a = await apiService.getPlayerArmy(player.wallet);
      setArmy(a);
      if (advs.length > 0) {
        const equipped = advs.find(ad => ad.id === a.equipped_advisor_id);
        setSelectedAdvisor(equipped || advs[0]);
      }
      setLoading(false);
    }
    load();
  }, [player.wallet]);

  const handleEquip = async (advisor: Advisor) => {
    onPlaySword();
    try {
      const updated = await apiService.equipAdvisor(player.wallet, advisor.id);
      setArmy(updated);
      setSelectedAdvisor(advisor);
    } catch (e) {
      console.error('Failed to equip advisor:', e);
    }
  };

  const filteredAdvisors = advisors.filter(a => {
    if (filterFaction !== null && a.faction_id !== filterFaction) return false;
    if (filterRarity !== null && a.rarity !== filterRarity) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Navigation Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-imperial-lightgold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Trở về Sảnh Quân Đội</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => { onPlayDrum(); onOpenMarketplace(); }}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-bold shadow-lg shadow-amber-950/50 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Chợ Tướng (Marketplace)</span>
          </button>
        </div>
      </div>

      {/* Header Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-imperial-lacquer via-imperial-slate to-imperial-obsidian border border-imperial-border p-6 mb-8 overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2 text-imperial-lightgold text-xs font-bold uppercase tracking-wider mb-1">
              <Crown className="w-4 h-4 text-imperial-gold" />
              <span>Hào Khí Đại Việt &bull; Cố Vấn Tướng Soái</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-cinzel font-black text-white tracking-wide">
              Hội Đồng Quân Sư Lịch Sử
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              Tướng Cố Vấn cung cấp các kỹ năng chiến thuật, nội tại địa hình và sức mạnh sĩ khí đặc trưng cho từng triều đại. Tách biệt hoàn toàn khỏi blockchain trong tính toán trận đánh.
            </p>
          </div>

          {/* Equipped Advisor Status */}
          {army && army.equipped_advisor_id && (
            <div className="bg-black/40 border border-imperial-gold/40 rounded-xl p-3 flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-amber-950/60 border border-amber-500/50 flex items-center justify-center">
                <Crown className="w-5 h-5 text-imperial-lightgold" />
              </div>
              <div className="text-left">
                <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Đang Chỉ Huy Quân Đội</div>
                <div className="text-sm font-bold text-white font-cinzel">{army.equipped_advisor_name || army.equipped_advisor_id}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-imperial-lacquer/60 border border-imperial-border/60 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-2 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>Tộc hệ:</span>
          </span>
          <button
            onClick={() => setFilterFaction(null)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              filterFaction === null ? 'bg-imperial-gold text-black' : 'bg-imperial-obsidian text-slate-300 hover:text-white'
            }`}
          >
            Tất Cả Triều Đại
          </button>
          {faction && (
            <button
              onClick={() => setFilterFaction(faction.faction_id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterFaction === faction.faction_id ? 'bg-amber-600 text-white' : 'bg-imperial-obsidian text-slate-300 hover:text-white'
              }`}
            >
              {faction.name} (Tộc Bạn)
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Phẩm cấp:</span>
          </span>
          {['legendary', 'epic', 'rare'].map((r) => (
            <button
              key={r}
              onClick={() => setFilterRarity(filterRarity === r ? null : r)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                filterRarity === r ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50' : 'bg-imperial-obsidian text-slate-400 hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Advisor Roster & Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Advisor Cards List (2 Columns) */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            <div className="col-span-2 text-center py-12 text-slate-400">Đang triệu tập danh tướng Đại Việt...</div>
          ) : filteredAdvisors.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-slate-500">Không tìm thấy tướng cố vấn phù hợp với bộ lọc.</div>
          ) : (
            filteredAdvisors.map((adv) => {
              const isEquipped = army?.equipped_advisor_id === adv.id;
              const isSelected = selectedAdvisor?.id === adv.id;
              const style = RARITY_STYLES[adv.rarity] || RARITY_STYLES.common;

              return (
                <div
                  key={adv.id}
                  onClick={() => setSelectedAdvisor(adv)}
                  className={`rounded-2xl border transition-all p-5 cursor-pointer bg-gradient-to-b ${style.bg} ${
                    isSelected ? 'ring-2 ring-imperial-gold border-imperial-gold' : 'border-imperial-border/80 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.badge}`}>
                        {adv.rarity}
                      </span>
                      <h3 className="text-base font-bold text-white font-cinzel mt-2">{adv.name}</h3>
                      <div className="text-xs text-amber-400/90 font-medium">{adv.title} &bull; {adv.faction_name}</div>
                    </div>

                    {isEquipped && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                        Đang Ra Trận
                      </span>
                    )}
                  </div>

                  {/* Skills Snapshot */}
                  <div className="space-y-2 mt-3 pt-3 border-t border-slate-700/50 text-xs">
                    <div className="flex items-start gap-1.5 text-slate-300">
                      <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-200">{adv.passive_name}:</span>{' '}
                        <span className="text-slate-400 text-[11px] line-clamp-1">{adv.passive_effect}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 text-slate-300">
                      <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-200">{adv.active_skill}:</span>{' '}
                        <span className="text-slate-400 text-[11px] line-clamp-1">{adv.skill_description}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                    <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                      <span>Mưu lược: <b className="text-white">{adv.base_tactics}</b></span>
                      <span>Thống soái: <b className="text-white">{adv.base_leadership}</b></span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEquip(adv);
                      }}
                      disabled={isEquipped}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isEquipped
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-imperial-crimson hover:bg-red-600 text-white shadow-md'
                      }`}
                    >
                      {isEquipped ? 'Đang Trang Bị' : 'Trang Bị'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Advisor Dossier Detail */}
        {selectedAdvisor && (
          <div className="bg-imperial-lacquer/90 border border-imperial-border rounded-2xl p-6 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${RARITY_STYLES[selectedAdvisor.rarity].badge}`}>
                {selectedAdvisor.rarity}
              </span>
              <span className="text-xs text-slate-400 font-cinzel">{selectedAdvisor.faction_name}</span>
            </div>

            <h2 className="text-xl font-black text-white font-cinzel">{selectedAdvisor.name}</h2>
            <div className="text-xs text-amber-400 font-semibold mb-4">{selectedAdvisor.title}</div>

            {/* Historical Lore */}
            <div className="bg-black/30 rounded-xl p-3 border border-slate-800 mb-5">
              <div className="flex items-center space-x-1.5 text-xs text-imperial-lightgold font-bold mb-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Bối Cảnh Lịch Sử</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed italic">
                "{selectedAdvisor.historical_lore}"
              </p>
            </div>

            {/* Tactical Stats */}
            <div className="space-y-3 mb-5">
              <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                <Swords className="w-3.5 h-3.5 text-imperial-gold" />
                <span>Chỉ Số Chiến Thuật Quân Sư</span>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Mưu Lược & Địa Hình (Tactics)</span>
                    <span className="font-bold text-white">{selectedAdvisor.base_tactics} / 100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${selectedAdvisor.base_tactics}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Thống Lĩnh & Sĩ Khí (Leadership)</span>
                    <span className="font-bold text-white">{selectedAdvisor.base_leadership} / 100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${selectedAdvisor.base_leadership}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Dũng Khí & Uy Thế (Valor)</span>
                    <span className="font-bold text-white">{selectedAdvisor.base_valor} / 100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${selectedAdvisor.base_valor}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Passives & Skills Deep Dive */}
            <div className="space-y-3 pt-4 border-t border-slate-800 mb-6">
              <div className="bg-cyan-950/30 border border-cyan-700/40 rounded-xl p-3">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-cyan-300 mb-1">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Nội Tại: {selectedAdvisor.passive_name}</span>
                </div>
                <p className="text-xs text-slate-300">{selectedAdvisor.passive_effect}</p>
              </div>

              <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-3">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-300 mb-1">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Chiêu Thức: {selectedAdvisor.active_skill}</span>
                </div>
                <p className="text-xs text-slate-300">{selectedAdvisor.skill_description}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={() => handleEquip(selectedAdvisor)}
                disabled={army?.equipped_advisor_id === selectedAdvisor.id}
                className={`w-full py-3 rounded-xl font-cinzel font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  army?.equipped_advisor_id === selectedAdvisor.id
                    ? 'bg-emerald-950 border border-emerald-600/50 text-emerald-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-imperial-crimson to-red-700 hover:from-red-600 hover:to-imperial-crimson text-white shadow-xl shadow-red-950/60'
                }`}
              >
                {army?.equipped_advisor_id === selectedAdvisor.id ? 'Đang Chỉ Huy Toàn Quân' : 'Trang Bị Cho Đạo Quân'}
              </button>

              <button
                onClick={() => { onPlayDrum(); onOpenMarketplace(); }}
                className="w-full py-2.5 rounded-xl bg-imperial-obsidian hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                <span>Tìm Tướng Tương Tự Trên Chợ</span>
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};

