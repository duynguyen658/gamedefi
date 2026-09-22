import React, { useState } from 'react';
import { Faction, Player, MapLocation, CampaignChapter, PlayerResources } from '../../types';
import { CAMPAIGN_CHAPTERS, MAP_LOCATIONS } from '../../data/campaign';
import { DrumOrnament } from '../Common/DrumOrnament';
import {
  Wheat,
  Coins,
  ShieldHalf,
  Trophy,
  Settings,
  Lock,
  Flag,
  Swords,
  Sparkles,
  Compass,
  ChevronRight,
} from 'lucide-react';

interface CampaignMapProps {
  player: Player;
  faction: Faction;
  resources: PlayerResources;
  onDeploy: (location: MapLocation) => void;
  onBackToLobby: () => void;
  onPlayDrum: () => void;
  onPlayGong: () => void;
}

const statusLabel: Record<CampaignChapter['status'], string> = {
  active: 'Active',
  available: 'Mở',
  locked: 'Khoá',
};

export const CampaignMap: React.FC<CampaignMapProps> = ({
  player,
  faction,
  resources,
  onDeploy,
  onBackToLobby,
  onPlayDrum,
  onPlayGong,
}) => {
  const activeChapter = CAMPAIGN_CHAPTERS.find(c => c.status === 'active') || CAMPAIGN_CHAPTERS[0];
  const [selectedChapterId, setSelectedChapterId] = useState<number>(activeChapter.chapter_id);
  const targetLocation = MAP_LOCATIONS.find(l => l.is_target) || MAP_LOCATIONS[0];
  const [selectedLocationId, setSelectedLocationId] = useState<string>(targetLocation.location_id);

  const selectedChapter = CAMPAIGN_CHAPTERS.find(c => c.chapter_id === selectedChapterId)!;
  const selectedLocation = MAP_LOCATIONS.find(l => l.location_id === selectedLocationId);

  const handleSelectChapter = (chapter: CampaignChapter) => {
    if (chapter.status === 'locked') return;
    onPlayDrum();
    setSelectedChapterId(chapter.chapter_id);
    const loc = MAP_LOCATIONS.find(l => l.chapter_id === chapter.chapter_id);
    if (loc) setSelectedLocationId(loc.location_id);
  };

  const handleSelectLocation = (loc: MapLocation) => {
    onPlayDrum();
    setSelectedLocationId(loc.location_id);
    const chapter = CAMPAIGN_CHAPTERS.find(c => c.chapter_id === loc.chapter_id);
    if (chapter && chapter.status !== 'locked') setSelectedChapterId(chapter.chapter_id);
  };

  const handleDeploy = () => {
    if (!selectedLocation) return;
    onPlayGong();
    onDeploy(selectedLocation);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4">

      {/* ------------------------------------------------------------------ */}
      {/* Top Status Bar: Commander + Resources                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 bg-imperial-lacquer/90 border border-imperial-gold/50 rounded-2xl px-4 py-3 gold-glow">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-imperial-darkred to-imperial-crimson p-0.5 border-2 border-imperial-gold flex items-center justify-center">
            <span className="font-cinzel text-imperial-gold font-black text-xl">
              {(faction.coat_of_arms ?? faction.name).charAt(0)}
            </span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-cinzel font-bold text-white text-base leading-none">{player.username}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/50 border border-cyan-500/40 text-cyan-300 uppercase font-semibold">
                Solana &bull; Active
              </span>
            </div>
            <div className="w-32 h-1.5 rounded-full bg-black/50 mt-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-imperial-gold" style={{ width: '62%' }} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <ResourceBadge icon={<Wheat className="w-4 h-4 text-emerald-400" />} value={resources.rice} label="Rice" />
          <ResourceBadge icon={<Coins className="w-4 h-4 text-imperial-gold" />} value={resources.gold} label="Gold" />
          <ResourceBadge icon={<ShieldHalf className="w-4 h-4 text-cyan-300" />} value={resources.morale} label="Morale" />

          <button
            onClick={onPlayDrum}
            className="p-2 rounded-lg bg-black/40 hover:bg-black/70 border border-imperial-border text-imperial-lightgold transition-colors"
            title="Bảng Vinh Danh"
          >
            <Trophy className="w-4 h-4" />
          </button>
          <button
            onClick={onBackToLobby}
            className="p-2 rounded-lg bg-black/40 hover:bg-black/70 border border-imperial-border text-slate-300 hover:text-white transition-colors"
            title="Cài đặt / Quay lại sảnh"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">

        {/* ------------------------------------------------------------------ */}
        {/* Left Sidebar: Chapter list                                         */}
        {/* ------------------------------------------------------------------ */}
        <aside className="bg-imperial-lacquer/90 border border-imperial-border rounded-2xl p-4 h-fit">
          <div className="mb-3">
            <h4 className="font-cinzel font-bold text-imperial-lightgold text-sm uppercase tracking-wide">
              Chiến Dịch Lịch Sử
            </h4>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Historic Campaign Chapters</p>
          </div>

          <div className="space-y-2">
            {CAMPAIGN_CHAPTERS.map((chapter) => {
              const isSelected = chapter.chapter_id === selectedChapterId;
              const isLocked = chapter.status === 'locked';
              return (
                <button
                  key={chapter.chapter_id}
                  onClick={() => handleSelectChapter(chapter)}
                  disabled={isLocked}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all flex items-center justify-between
                    ${isSelected
                      ? 'bg-imperial-darkred/50 border-imperial-gold text-white gold-glow'
                      : isLocked
                      ? 'bg-black/20 border-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-black/30 border-slate-700 text-slate-300 hover:border-imperial-gold/60 hover:text-white cursor-pointer'
                    }`}
                >
                  <span>
                    <span className="font-bold font-cinzel block">Ch. {chapter.chapter_id}: {chapter.title_vi}</span>
                    <span className="text-[10px] text-slate-400">({chapter.era})</span>
                  </span>
                  {isLocked ? (
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                  ) : isSelected ? (
                    <span className="text-[9px] font-bold text-emerald-400 shrink-0">[Active]</span>
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ------------------------------------------------------------------ */}
        {/* Center: Stylized map with location markers                         */}
        {/* ------------------------------------------------------------------ */}
        <div className="relative bg-gradient-to-br from-[#0d2a20] via-[#12261c] to-[#0a2b3a] border border-imperial-gold/50 rounded-2xl overflow-hidden min-h-[420px] lg:min-h-[560px]">

          {/* Decorative territory shape + sea gradient */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-90">
            <defs>
              <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2d3a1f" />
                <stop offset="100%" stopColor="#1a2e22" />
              </linearGradient>
              <linearGradient id="sea" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0e2f3d" />
                <stop offset="100%" stopColor="#06141c" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="100" height="100" fill="url(#sea)" />
            <path
              d="M 30 4 C 44 6 50 14 46 22 C 60 24 66 20 70 26 C 74 32 62 34 58 40 C 66 44 70 52 62 56 C 70 62 74 70 66 76 C 72 80 70 90 60 92 C 50 94 40 88 42 78 C 34 76 30 68 34 60 C 26 56 24 46 30 40 C 22 36 22 26 28 20 C 22 16 24 8 30 4 Z"
              fill="url(#land)"
              stroke="#D4AF37"
              strokeWidth="0.6"
              opacity="0.92"
            />
            {/* Sông Red River / Bạch Đằng */}
            <path d="M 34 18 Q 44 24 42 30 Q 40 36 52 34" fill="none" stroke="#3fa9c9" strokeWidth="0.6" opacity="0.7" />
            <path d="M 42 30 Q 52 30 58 24" fill="none" stroke="#3fa9c9" strokeWidth="0.5" opacity="0.6" />
          </svg>

          {/* Faint mountain glyphs scattered */}
          <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle, rgba(212,175,55,0.15) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }} />

          {/* Compass rose ornament */}
          <div className="absolute bottom-3 right-3 opacity-70 pointer-events-none">
            <DrumOrnament size={110} animate={false} />
          </div>

          {/* Location markers */}
          {MAP_LOCATIONS.map((loc) => {
            const chapter = CAMPAIGN_CHAPTERS.find(c => c.chapter_id === loc.chapter_id);
            const isSelected = loc.location_id === selectedLocationId;
            const isLocked = chapter?.status === 'locked';
            return (
              <button
                key={loc.location_id}
                onClick={() => handleSelectLocation(loc)}
                disabled={isLocked}
                style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-full flex flex-col items-center group ${isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {loc.is_capital ? (
                  <div className={`w-9 h-9 rounded-md bg-gradient-to-b from-amber-300 to-imperial-gold border-2 ${isSelected ? 'border-white' : 'border-imperial-darkred'} flex items-center justify-center shadow-lg`}>
                    <span className="text-imperial-darkred font-cinzel font-black text-sm">{loc.flag_glyph}</span>
                  </div>
                ) : (
                  <Flag
                    className={`w-9 h-9 drop-shadow-lg ${isSelected ? 'text-imperial-lightgold' : 'text-imperial-crimson'} fill-current`}
                    strokeWidth={1}
                  />
                )}
                <span className="mt-1 text-[10px] font-cinzel font-bold text-white bg-black/60 px-1.5 py-0.5 rounded whitespace-nowrap">
                  {loc.name}
                </span>

                {isSelected && (
                  <div className="absolute top-full mt-1 w-44 bg-imperial-lacquer/95 border border-imperial-gold rounded-lg p-2 text-left shadow-xl z-20">
                    <div className="text-[11px] font-bold text-imperial-lightgold">{loc.name} ({loc.sub_label})</div>
                    {loc.tooltip && <div className="text-[10px] text-slate-300 mt-0.5">{loc.tooltip}</div>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom Action Bar                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-imperial-lacquer/90 border border-imperial-border rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onPlayDrum}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 hover:bg-black/70 border border-slate-700 text-xs text-slate-200 transition-colors"
          >
            <Swords className="w-4 h-4 text-imperial-gold" />
            <span className="text-left leading-tight">
              <span className="block font-semibold">Quản Lý Quân Đội</span>
              <span className="block text-[9px] text-slate-400 uppercase">Army Fleet</span>
            </span>
          </button>
          <button
            onClick={onPlayDrum}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 hover:bg-black/70 border border-slate-700 text-xs text-slate-200 transition-colors"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-left leading-tight">
              <span className="block font-semibold">Ấn tín Solana Generals</span>
              <span className="block text-[9px] text-slate-400 uppercase">Factore</span>
            </span>
          </button>
        </div>

        <button
          onClick={handleDeploy}
          disabled={!selectedLocation}
          className="px-8 py-3 rounded-2xl bg-gradient-to-r from-imperial-crimson via-red-600 to-imperial-darkred hover:from-red-600 hover:to-imperial-crimson text-imperial-lightgold font-cinzel font-black text-sm uppercase tracking-widest border-2 border-imperial-gold shadow-2xl shadow-red-950/70 hover:scale-[1.03] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Xuất Quân / Deploy{selectedLocation ? ` — ${selectedLocation.name}` : ''}
        </button>

        <div className="hidden sm:flex items-center gap-2 text-slate-400">
          <Compass className="w-5 h-5" />
          <span className="text-[10px]">Mặt trận: <span className="text-imperial-lightgold font-semibold">{selectedChapter.title_vi}</span></span>
        </div>
      </div>
    </div>
  );
};

interface ResourceBadgeProps {
  icon: React.ReactNode;
  value: number;
  label: string;
}

const ResourceBadge: React.FC<ResourceBadgeProps> = ({ icon, value, label }) => (
  <div className="flex items-center gap-1.5 bg-black/40 border border-imperial-border rounded-lg px-2.5 py-1.5" title={label}>
    {icon}
    <span className="font-mono font-bold text-sm text-white">{value.toLocaleString()}</span>
  </div>
);
