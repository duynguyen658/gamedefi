import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowRight, Crown, Flag, RefreshCw, Shield, ShoppingBag, Swords, Trophy, Users } from 'lucide-react';
import { Army, Faction, Player } from '../../types';
import { apiService } from '../../services/api';
import './PreGameLobby.css';

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
  player, faction, onChangeFaction, onEnterBattle, onOpenAdvisorCouncil,
  onOpenMarketplace, onOpenDefiHub, onPlayDrum, onPlayGong, onPlaySword,
}) => {
  const [army, setArmy] = useState<Army | null>(null);
  const [armyLoading, setArmyLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setArmyLoading(true);
    apiService.getPlayerArmy(player.wallet)
      .then((result) => { if (active) setArmy(result); })
      .catch(() => { if (active) setArmy(null); })
      .finally(() => { if (active) setArmyLoading(false); });
    return () => { active = false; };
  }, [player.wallet]);

  const launch = () => { onPlaySword(); onPlayGong(); onEnterBattle(); };
  const openWithDrum = (action: () => void) => { onPlayDrum(); action(); };

  return (
    <div className="app-screen lobby-screen">
      <section className="lobby-hero" aria-labelledby="lobby-title">
        <div>
          <p className="lobby-kicker">Tổng hành dinh · {faction.historical_era}</p>
          <h1 id="lobby-title">Tổng Hành Dinh</h1>
          <p>Tướng quân {player.username} của triều đại {faction.name} đang chờ lệnh. Kiểm tra binh lực, hội ý quân sư và dẫn quân vào chiến trường.</p>
          <div className="lobby-hero-actions">
            <button type="button" className="lobby-primary" onClick={launch}><Swords aria-hidden="true" /> Vào chiến dịch <ArrowRight aria-hidden="true" /></button>
            <button type="button" className="lobby-secondary" onClick={() => openWithDrum(onChangeFaction)}><RefreshCw aria-hidden="true" /> Đổi triều đại</button>
          </div>
        </div>
      </section>

      <div className="lobby-container">
        <div className="lobby-stats" aria-label="Thành tích người chơi">
          <div><Flag aria-hidden="true" /><span><small>Triều đại</small><strong>{faction.name}</strong></span></div>
          <div><Shield aria-hidden="true" /><span><small>Cấp hiện tại</small><strong>{player.level}</strong></span></div>
          <div><Swords aria-hidden="true" /><span><small>Binh lực</small><strong>{army?.total_power ?? player.base_power}</strong></span></div>
          <div><Trophy aria-hidden="true" /><span><small>Trận thắng</small><strong>{player.battles_won ?? '—'}</strong></span></div>
        </div>

        <div className="lobby-grid">
          <section className="lobby-panel" aria-labelledby="lobby-army-title">
            <div className="lobby-panel-heading"><div><p className="lobby-kicker">Binh lực</p><h2 id="lobby-army-title">Quân đội của bạn</h2></div><Users aria-hidden="true" /></div>
            <p className="lobby-panel-intro">Binh chủng và Tướng Cố Vấn của triều đại {faction.name}.</p>
            <div className="lobby-unit-grid">
              <div><span>Trường thương</span><strong>{armyLoading ? '…' : army?.spearmen_count ?? '—'}</strong></div>
              <div><span>Cung thủ</span><strong>{armyLoading ? '…' : army?.archers_count ?? '—'}</strong></div>
              <div><span>Kỵ binh</span><strong>{armyLoading ? '…' : army?.cavalry_count ?? '—'}</strong></div>
              <div><span>Chiến tượng</span><strong>{armyLoading ? '…' : army?.elephants_count ?? '—'}</strong></div>
            </div>
            <div className="lobby-advisor-summary"><Crown aria-hidden="true" /><div><small>Tướng cố vấn đang trang bị</small><strong>{armyLoading ? 'Đang tải…' : army?.equipped_advisor_name || 'Chưa trang bị'}</strong></div></div>
            <button type="button" className="lobby-text-link" onClick={() => openWithDrum(onOpenAdvisorCouncil)}>Vào hội đồng quân sư <ArrowRight aria-hidden="true" /></button>
          </section>
          <section className="lobby-panel lobby-next" aria-labelledby="lobby-next-title">
            <div className="lobby-panel-heading"><div><p className="lobby-kicker">Bước tiếp theo</p><h2 id="lobby-next-title">Tiến vào sử Việt</h2></div><Swords aria-hidden="true" /></div>
            <p className="lobby-panel-intro">Dàn trận trên chiến trường hoặc khám phá các khu vực của hệ sinh thái.</p>
            <button type="button" className="lobby-next-primary" onClick={launch}><Swords aria-hidden="true" /><span><strong>Xuất quân</strong><small>Bước vào bản đồ chiến dịch</small></span><ArrowRight aria-hidden="true" /></button>
            <button type="button" className="lobby-next-link" onClick={() => openWithDrum(onOpenMarketplace)}><ShoppingBag aria-hidden="true" /><span><strong>Marketplace</strong><small>Xem trước Chợ Tướng · giao dịch tạm khóa</small></span><ArrowRight aria-hidden="true" /></button>
            <button type="button" className="lobby-next-link" onClick={() => openWithDrum(onOpenDefiHub)}><ArrowLeftRight aria-hidden="true" /><span><strong>DEX HKDV / SOL</strong><small>{player.is_guest ? 'Kết nối ví để giao dịch' : 'Giao thương trên Solana Devnet'}</small></span><ArrowRight aria-hidden="true" /></button>
          </section>
        </div>
      </div>
    </div>
  );
};
