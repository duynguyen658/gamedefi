import React, { useMemo, useState } from 'react';
import { Faction, Player, BattleResultResponse, BattleUnit, HexTile, TerrainType, TacticalAction, MapLocation, RewardClaim } from '../../types';
import { apiService } from '../../services/api';
import { BACH_DANG_HEXES, BACH_DANG_UNITS, BATTLEFIELD_DIMS } from '../../data/campaign';
import { hexToPixel, hexPolygonPoints, boardPixelSize, hexDistance, HEX_SIZE } from '../../utils/hexGrid';
import {
  ArrowLeft,
  Waves,
  Sun,
  Move,
  Swords,
  LayoutGrid,
  Flame,
  Radar,
  MousePointer2,
  Sparkles,
  ExternalLink,
  LoaderCircle,
  Trophy,
} from 'lucide-react';

interface BattleScreenProps {
  player: Player;
  faction: Faction;
  location: MapLocation;
  onExitBattle: () => void;
  onPlayDrum: () => void;
  onPlaySword: () => void;
  onPlayGong: () => void;
}

const TERRAIN_STYLES: Record<TerrainType, { fill: string; stroke: string }> = {
  plain: { fill: '#2c3a24', stroke: '#4b5d3a' },
  hill: { fill: '#5a4a26', stroke: '#D4AF37' },
  forest: { fill: '#173420', stroke: '#2f6b3f' },
  mud: { fill: '#3b2f1e', stroke: '#6b5334' },
  river: { fill: '#0e3648', stroke: '#2e8fb0' },
  stakes: { fill: '#123b4d', stroke: '#e0b04a' },
  fort: { fill: '#3a1414', stroke: '#8B1E0F' },
};

const TERRAIN_NAME_VI: Record<TerrainType, string> = {
  plain: 'Đồng bằng',
  hill: 'Gò cao',
  forest: 'Rừng ngập mặn',
  mud: 'Bãi lầy triều',
  river: 'Sông nước',
  stakes: 'Bãi cọc ngầm',
  fort: 'Công sự',
};

const ACTIONS: { key: TacticalAction; label: string; icon: React.ReactNode }[] = [
  { key: 'move', label: 'Di chuyển', icon: <Move className="w-4 h-4" /> },
  { key: 'attack', label: 'Tấn công', icon: <Swords className="w-4 h-4" /> },
  { key: 'formation', label: 'Đội hình', icon: <LayoutGrid className="w-4 h-4" /> },
  { key: 'fire_arrow', label: 'Hỏa tiễn', icon: <Flame className="w-4 h-4" /> },
];

export const BattleScreen: React.FC<BattleScreenProps> = ({
  player,
  faction,
  location,
  onExitBattle,
  onPlayDrum,
  onPlaySword,
  onPlayGong,
}) => {
  const [units, setUnits] = useState<BattleUnit[]>(BACH_DANG_UNITS);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('p1');
  const [selectedHex, setSelectedHex] = useState<{ col: number; row: number } | null>({ col: 1, row: 3 });
  const [activeAction, setActiveAction] = useState<TacticalAction | null>(null);
  const [turnSide, setTurnSide] = useState<'player' | 'enemy'>('player');
  const [tideTurnsLeft, setTideTurnsLeft] = useState<number>(2);
  const [log, setLog] = useState<string[]>(['Trận Bạch Đằng bắt đầu. Đến lượt quân ta hành động.']);
  const [battleResult, setBattleResult] = useState<BattleResultResponse | null>(null);
  const [rewardClaim, setRewardClaim] = useState<RewardClaim | null>(null);
  const [settling, setSettling] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);

  const { cols, rows } = BATTLEFIELD_DIMS;
  const boardSize = useMemo(() => boardPixelSize(cols, rows), [cols, rows]);

  const selectedUnit = units.find(u => u.unit_id === selectedUnitId) || null;
  const hexAt = (col: number, row: number) => BACH_DANG_HEXES.find(h => h.col === col && h.row === row);
  const unitAt = (col: number, row: number) => units.find(u => u.col === col && u.row === row);
  const selectedTile = selectedHex ? hexAt(selectedHex.col, selectedHex.row) : undefined;

  const pushLog = (msg: string) => setLog(prev => [msg, ...prev].slice(0, 5));

  const validTargets = useMemo(() => {
    if (!selectedUnit || !activeAction) return new Set<string>();
    const set = new Set<string>();
    if (activeAction === 'move') {
      for (const tile of BACH_DANG_HEXES) {
        if (tile.zone === 'enemy') continue;
        const dist = hexDistance(selectedUnit, tile);
        if (dist > 0 && dist <= 2 && !unitAt(tile.col, tile.row)) {
          set.add(`${tile.col}-${tile.row}`);
        }
      }
    } else if (activeAction === 'attack') {
      for (const u of units) {
        if (u.side === selectedUnit.side) continue;
        const dist = hexDistance(selectedUnit, u);
        if (dist <= 1) set.add(`${u.col}-${u.row}`);
      }
    } else if (activeAction === 'fire_arrow') {
      const onHill = hexAt(selectedUnit.col, selectedUnit.row)?.terrain === 'hill';
      const range = onHill ? 4 : 3;
      for (const u of units) {
        if (u.side === selectedUnit.side) continue;
        const dist = hexDistance(selectedUnit, u);
        if (dist <= range) set.add(`${u.col}-${u.row}`);
      }
    }
    return set;
  }, [selectedUnit, activeAction, units]);

  const endPlayerTurn = () => {
    setTurnSide('enemy');
    setActiveAction(null);
    pushLog('Quân Mông Cổ đang điều binh...');
    window.setTimeout(() => {
      setTideTurnsLeft(t => (t > 0 ? t - 1 : 3));
      setTurnSide('player');
      pushLog('Đến lượt quân ta. Triều nước tiếp tục rút.');
    }, 900);
  };

  const handleSelectHex = (col: number, row: number) => {
    const unit = unitAt(col, row);
    setSelectedHex({ col, row });

    if (turnSide !== 'player') return;

    if (activeAction === 'move' && selectedUnit && validTargets.has(`${col}-${row}`)) {
      onPlayDrum();
      setUnits(prev => prev.map(u => (u.unit_id === selectedUnit.unit_id ? { ...u, col, row } : u)));
      pushLog(`${selectedUnit.name} di chuyển tới ô (${col}, ${row}).`);
      setActiveAction(null);
      endPlayerTurn();
      return;
    }

    if ((activeAction === 'attack' || activeAction === 'fire_arrow') && selectedUnit && unit && validTargets.has(`${col}-${row}`)) {
      onPlaySword();
      const bonus = activeAction === 'fire_arrow' ? 1.3 : 1.0;
      const hillBonus = hexAt(selectedUnit.col, selectedUnit.row)?.terrain === 'hill' ? 1.2 : 1.0;
      const dmg = Math.max(5, Math.round(selectedUnit.stats.atk * bonus * hillBonus - unit.stats.def * 0.4));
      setUnits(prev =>
        prev
          .map(u => (u.unit_id === unit.unit_id ? { ...u, stats: { ...u.stats, at: Math.max(0, u.stats.at - dmg) } } : u))
          .filter(u => u.stats.at > 0 || u.side === 'player')
      );
      pushLog(`${selectedUnit.name} ${activeAction === 'fire_arrow' ? 'bắn hoả tiễn vào' : 'tấn công'} ${unit.name}, gây ${dmg} sát thương.`);
      setActiveAction(null);
      endPlayerTurn();
      return;
    }

    if (unit) {
      setSelectedUnitId(unit.unit_id);
    }
  };

  const handleSelectUnit = (unit: BattleUnit) => {
    setSelectedUnitId(unit.unit_id);
    setSelectedHex({ col: unit.col, row: unit.row });
    if (unit.side === 'enemy') setActiveAction(null);
  };

  const handleAction = (action: TacticalAction) => {
    if (!selectedUnit || selectedUnit.side !== 'player' || turnSide !== 'player') return;
    onPlayDrum();
    if (action === 'formation') {
      pushLog(`${selectedUnit.name} chuyển sang đội hình phòng ngự, +DEF tạm thời.`);
      setUnits(prev => prev.map(u => (u.unit_id === selectedUnit.unit_id ? { ...u, stats: { ...u.stats, def: u.stats.def + 5 } } : u)));
      setActiveAction(null);
      endPlayerTurn();
      return;
    }
    setActiveAction(prev => (prev === action ? null : action));
  };

  const handleSettleBattle = async () => {
    setSettling(true);
    setSettlementError(null);
    try {
      const scenarioId = 'bach_dang_1288';
      const result = await apiService.executeBattle(player.wallet, scenarioId, 'aggressive');
      setBattleResult(result);
      if (result.victory && !player.is_guest) {
        const claim = await apiService.claimBattleReward(player.wallet, result.battle_id);
        setRewardClaim(claim);
      }
      if (result.victory) onPlayGong();
    } catch (reason) {
      setSettlementError(reason instanceof Error ? reason.message : 'Không thể ghi nhận kết quả trận đánh.');
    } finally {
      setSettling(false);
    }
  };

  const playerInitiative = turnSide === 'player';

  return (
    <div className="app-screen battle-screen max-w-[1500px] mx-auto px-3 sm:px-4 lg:px-6 py-4">

      <button
        onClick={onExitBattle}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-imperial-lightgold transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
          <span>Về chiến dịch</span>
      </button>

      <div className="battle-intro">
        <p>Chiến dịch lịch sử · Bạch Đằng</p>
        <h1>Thủy chiến Bạch Đằng</h1>
        <span>Chọn quân, đọc địa hình và hành động theo lượt.</span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Top HUD: environment / tide meter / initiative timeline             */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="flex items-center gap-2 bg-imperial-lacquer/90 border border-imperial-border rounded-xl px-3 py-2 text-xs">
          <Sun className="w-4 h-4 text-amber-300" />
          <span className="text-slate-300">Bối cảnh:</span>
          <span className="font-bold text-white">Ban ngày</span>
        </div>

        <div className="bg-imperial-lacquer/90 border border-imperial-gold/50 rounded-xl px-3 py-2 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Waves className="w-4 h-4 text-cyan-300" />
              Thủy triều: <span className="font-bold text-cyan-300">Đang rút</span>
            </span>
            <span className="font-bold text-imperial-lightgold">Còn {tideTurnsLeft} lượt</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-black/50 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-700 transition-all" style={{ width: `${(tideTurnsLeft / 3) * 100}%` }} />
          </div>
        </div>

        <div className="bg-imperial-lacquer/90 border border-imperial-border rounded-xl px-3 py-2 text-xs">
          <div className="text-slate-300 mb-1">Thứ tự lượt</div>
          <div className="flex items-center justify-center gap-3">
            <div className={`flex flex-col items-center gap-0.5 ${playerInitiative ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${playerInitiative ? 'border-imperial-gold bg-blue-900' : 'border-slate-700 bg-black/30'}`}>
                <Swords className="w-4 h-4 text-blue-200" />
              </div>
              <span className="text-[9px] text-slate-400">Quân Trần</span>
            </div>
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500 rotate-180" />
            <div className={`flex flex-col items-center gap-0.5 ${!playerInitiative ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${!playerInitiative ? 'border-imperial-gold bg-red-900' : 'border-slate-700 bg-black/30'}`}>
                <Swords className="w-4 h-4 text-red-200" />
              </div>
              <span className="text-[9px] text-slate-400">Quân Nguyên</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-3">

        {/* ------------------------------------------------------------------ */}
        {/* Hex battlefield                                                     */}
        {/* ------------------------------------------------------------------ */}
        <div className="battle-board relative border border-imperial-gold/40 rounded-2xl overflow-auto p-2">
          <svg
            viewBox={`0 0 ${boardSize.width} ${boardSize.height}`}
            width="100%"
            style={{ minWidth: 720 }}
            className="select-none"
          >
            {BACH_DANG_HEXES.map((tile) => {
              const { x, y } = hexToPixel(tile.col, tile.row);
              const style = TERRAIN_STYLES[tile.terrain];
              const isSelected = selectedHex?.col === tile.col && selectedHex?.row === tile.row;
              const isValidTarget = validTargets.has(`${tile.col}-${tile.row}`);
              const zoneStroke = tile.zone === 'ally' ? '#34d399' : tile.zone === 'enemy' ? '#f87171' : style.stroke;

              return (
                <g key={`${tile.col}-${tile.row}`} onClick={() => handleSelectHex(tile.col, tile.row)} className="cursor-pointer">
                  <polygon
                    points={hexPolygonPoints(x, y)}
                    fill={style.fill}
                    stroke={isSelected ? '#F3E5AB' : isValidTarget ? '#facc15' : zoneStroke}
                    strokeWidth={isSelected || isValidTarget ? 2.5 : 1}
                    opacity={tile.zone !== 'neutral' ? 0.92 : 0.85}
                  />
                  {tile.zone !== 'neutral' && (
                    <polygon
                      points={hexPolygonPoints(x, y, HEX_SIZE - 3)}
                      fill="none"
                      stroke={tile.zone === 'ally' ? '#34d399' : '#f87171'}
                      strokeOpacity={0.35}
                      strokeWidth={3}
                    />
                  )}
                  {tile.terrain === 'stakes' &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <line
                        key={i}
                        x1={x - 10 + i * 6}
                        y1={y + 8}
                        x2={x - 10 + i * 6}
                        y2={y - 6}
                        stroke="#e0b04a"
                        strokeWidth={1.4}
                      />
                    ))}
                </g>
              );
            })}

            {/* Terrain feature callouts (persistent tooltip labels) */}
            {BACH_DANG_HEXES.filter(t => t.label).map((tile) => {
              const { x, y } = hexToPixel(tile.col, tile.row);
              return (
                <g key={`label-${tile.col}-${tile.row}`} pointerEvents="none">
                  <foreignObject x={x - 62} y={y - 68} width="140" height="46">
                    <div className="bg-black/75 border border-imperial-border rounded px-1.5 py-1 text-center leading-tight">
                      <div className="text-[8px] text-white font-semibold">{tile.label}</div>
                      {tile.effect && <div className="text-[7px] text-amber-300">{tile.effect}</div>}
                    </div>
                  </foreignObject>
                </g>
              );
            })}

            {/* Units */}
            {units.map((unit) => {
              const { x, y } = hexToPixel(unit.col, unit.row);
              const isSelected = unit.unit_id === selectedUnitId;
              const sideColor = unit.side === 'player' ? '#1d4ed8' : '#b91c1c';
              return (
                <g
                  key={unit.unit_id}
                  transform={`translate(${x}, ${y})`}
                  onClick={(e) => { e.stopPropagation(); handleSelectUnit(unit); }}
                  className="cursor-pointer"
                >
                  <circle r={13} fill={sideColor} stroke={isSelected ? '#F3E5AB' : '#0B0C10'} strokeWidth={isSelected ? 2.5 : 1.5} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#fff" fontWeight="bold">
                    {unit.icon === 'spear' ? '⚔' : unit.icon === 'archer' ? '🏹' : unit.icon === 'elephant' ? '🐘' : '🐎'}
                  </text>
                  <rect x={-16} y={16} width="32" height="4" rx="2" fill="#000" opacity={0.5} />
                  <rect x={-16} y={16} width={32 * Math.max(0, Math.min(1, unit.stats.at / 150))} height="4" rx="2" fill={unit.side === 'player' ? '#34d399' : '#f87171'} />
                </g>
              );
            })}
          </svg>

          {/* Tactical radar mini-map */}
          <div className="absolute top-3 right-3 bg-black/70 border border-imperial-border rounded-lg p-2 w-28">
            <div className="flex items-center gap-1 text-[9px] text-slate-400 mb-1">
              <Radar className="w-3 h-3" /> Sơ đồ trận
            </div>
            <div className="relative w-full aspect-[12/7] bg-imperial-obsidian rounded overflow-hidden">
              {units.map(u => (
                <div
                  key={u.unit_id}
                  className={`absolute w-1.5 h-1.5 rounded-full ${u.side === 'player' ? 'bg-blue-400' : 'bg-red-400'}`}
                  style={{ left: `${(u.col / cols) * 100}%`, top: `${(u.row / rows) * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Right column: unit card + terrain indicator + battle log            */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col gap-3">

          {/* Selected unit stats */}
          <div className="bg-imperial-lacquer/90 border border-imperial-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <MousePointer2 className="w-3.5 h-3.5 text-imperial-gold" />
              <span className="text-[10px] uppercase text-slate-400 tracking-wide">Đơn Vị Đang Chọn</span>
            </div>
            {selectedUnit ? (
              <div className="flex gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl shrink-0 ${selectedUnit.side === 'player' ? 'bg-blue-950 border border-blue-600' : 'bg-red-950 border border-red-600'}`}>
                  {selectedUnit.icon === 'spear' ? '⚔' : selectedUnit.icon === 'archer' ? '🏹' : selectedUnit.icon === 'elephant' ? '🐘' : '🐎'}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold font-display text-white leading-tight">{selectedUnit.name}</div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1 mt-1.5 text-[10px]">
                    <Stat label="AT" value={selectedUnit.stats.at} color="text-emerald-400" />
                    <Stat label="ATK" value={selectedUnit.stats.atk} color="text-red-400" />
                    <Stat label="DEF" value={selectedUnit.stats.def} color="text-blue-400" />
                    <Stat label="AS/TK" value={selectedUnit.stats.asTk} color="text-amber-400" />
                    <Stat label="ATF" value={selectedUnit.stats.atf} color="text-purple-400" />
                    <Stat label="Reg." value={selectedUnit.stats.reg} color="text-cyan-400" />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Chọn một đơn vị trên bàn cờ.</p>
            )}
          </div>

          {/* Terrain advantage indicator */}
          <div className="bg-imperial-lacquer/90 border border-imperial-border rounded-xl p-3">
            <div className="text-[10px] uppercase text-slate-400 tracking-wide mb-1">Địa hình đang chọn</div>
            {selectedTile ? (
              <>
                <div className="text-xs text-slate-300">
                  Ô chiến trường: <span className="font-bold text-white">{TERRAIN_NAME_VI[selectedTile.terrain]}</span>
                </div>
                <div className="text-xs font-bold text-imperial-lightgold mt-0.5">
                  {selectedTile.effect || (selectedTile.terrain === 'hill' ? '+20% tầm bắn' : selectedTile.terrain === 'mud' ? 'Giảm tốc độ di chuyển' : 'Không có hiệu ứng đặc biệt')}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">Chọn một ô trên bàn cờ để xem chi tiết.</p>
            )}
          </div>

          {/* Battle log */}
          <div className="bg-imperial-lacquer/90 border border-imperial-border rounded-xl p-3 flex-1">
            <div className="text-[10px] uppercase text-slate-400 tracking-wide mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-imperial-gold" /> Diễn Biến Trận Đấu
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-300">
              {log.map((entry, i) => (
                <li key={i} className={i === 0 ? 'text-white font-medium' : 'text-slate-500'}>&bull; {entry}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tactical action bar                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-3 bg-imperial-lacquer/90 border border-imperial-gold/40 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {turnSide === 'player' ? (
            <span className="text-emerald-400 font-semibold">Lượt của quân ta — chọn hành động cho {selectedUnit?.name || 'đơn vị'}.</span>
          ) : (
            <span className="text-red-400 font-semibold animate-pulse">Quân Mông Cổ đang hành động...</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ACTIONS.map((action) => (
            <button
              key={action.key}
              onClick={() => handleAction(action.key)}
              disabled={turnSide !== 'player' || !selectedUnit || selectedUnit.side !== 'player'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all
                ${activeAction === action.key
                  ? 'bg-imperial-gold text-imperial-darkred border-imperial-gold'
                  : 'bg-black/40 border-slate-700 text-slate-200 hover:border-imperial-gold/60'
                } disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer`}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => void handleSettleBattle()}
            disabled={settling || Boolean(battleResult)}
            className="flex items-center gap-1.5 rounded-xl border border-amber-400 bg-imperial-darkred px-3 py-2 text-xs font-bold text-imperial-lightgold disabled:opacity-50"
          >
            {settling ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            <span>{settling ? 'Đang ghi nhận…' : battleResult ? 'Đã chốt kết quả' : 'Chốt trận & nhận HKDV'}</span>
          </button>
        </div>
      </div>

      {(battleResult || settlementError) && (
        <div className="mt-3 rounded-2xl border border-imperial-gold/40 bg-imperial-lacquer/90 p-4 text-xs">
          {battleResult && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className={`font-display font-bold ${battleResult.victory ? 'text-emerald-300' : 'text-red-300'}`}>
                  {battleResult.victory ? 'Chiến thắng đã được backend xác nhận' : 'Trận đánh chưa đủ điều kiện nhận HKDV'}
                </div>
                <div className="mt-1 font-mono text-[10px] text-slate-500">Battle ID: {battleResult.battle_id}</div>
                {player.is_guest && battleResult.victory && (
                  <div className="mt-1 text-amber-300">Đăng nhập bằng ví Solana để nhận reward on-chain.</div>
                )}
              </div>
              {rewardClaim && (
                <div className="text-right">
                  <div className={rewardClaim.status === 'confirmed' ? 'text-emerald-300' : 'text-amber-300'}>
                    5 HKDV · {rewardClaim.status === 'confirmed' ? 'đã xác nhận' : 'đang đối soát'}
                  </div>
                  {rewardClaim.explorer_url && (
                    <a href={rewardClaim.explorer_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-300 underline">
                      Solana Explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          {settlementError && <div className="mt-2 text-red-300">{settlementError}</div>}
        </div>
      )}

    </div>
  );
};

interface StatProps {
  label: string;
  value: number;
  color: string;
}

const Stat: React.FC<StatProps> = ({ label, value, color }) => (
  <div className="flex items-center justify-between bg-black/30 rounded px-1.5 py-1">
    <span className="text-slate-500">{label}</span>
    <span className={`font-mono font-bold ${color}`}>{value}</span>
  </div>
);
