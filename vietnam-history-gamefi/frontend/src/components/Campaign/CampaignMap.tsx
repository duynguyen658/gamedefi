import React from 'react';
import { ArrowLeft, ArrowRight, Flag, Swords, Waves } from 'lucide-react';
import { Faction, MapLocation, Player } from '../../types';
import { MAP_LOCATIONS } from '../../data/campaign';
import './CampaignMap.css';

interface CampaignMapProps {
  player: Player;
  faction: Faction;
  onDeploy: (location: MapLocation) => void;
  onBackToLobby: () => void;
  onPlayGong: () => void;
}

const playableLocation = MAP_LOCATIONS.find((location) => location.location_id === 'bach_dang');
const otherLocations = MAP_LOCATIONS.filter((location) => location.location_id !== 'bach_dang');

export const CampaignMap: React.FC<CampaignMapProps> = ({
  player, faction, onDeploy, onBackToLobby, onPlayGong,
}) => {
  const deploy = () => {
    if (!playableLocation) return;
    onPlayGong();
    onDeploy(playableLocation);
  };

  return (
    <div className="app-screen campaign-screen">
      <section className="campaign-hero" aria-labelledby="campaign-title">
        <div className="campaign-hero-inner">
          <button type="button" className="campaign-back" onClick={onBackToLobby}><ArrowLeft aria-hidden="true" /> Về tổng hành dinh</button>
          <p className="campaign-kicker">Chiến dịch lịch sử · Chiến thuật theo lượt</p>
          <h1 id="campaign-title">Dẫn quân vào <span>Bạch Đằng</span></h1>
          <p>Chọn vị trí, tận dụng địa hình sông nước và đón đúng thời cơ thủy triều để phá quân địch.</p>
          <button type="button" className="campaign-deploy" onClick={deploy} disabled={!playableLocation}><Swords aria-hidden="true" /> Vào trận Bạch Đằng <ArrowRight aria-hidden="true" /></button>
        </div>
      </section>

      <div className="campaign-container">
        <div className="campaign-summary">
          <div><Flag aria-hidden="true" /><span><small>Triều đại đã chọn</small><strong>{faction.name}</strong></span></div>
          <div><Swords aria-hidden="true" /><span><small>Tướng quân</small><strong>{player.username}</strong></span></div>
          <div><Waves aria-hidden="true" /><span><small>Chiến trường khả dụng</small><strong>Bạch Đằng</strong></span></div>
        </div>

        <div className="campaign-content">
          <section className="campaign-main-card" aria-labelledby="campaign-current-title">
            <div className="campaign-main-art" aria-hidden="true" />
            <div className="campaign-main-copy">
              <span className="campaign-available">Có thể vào trận</span>
              <h2 id="campaign-current-title">Đại chiến Bạch Đằng</h2>
              <p>Một chiến trường lục giác với sông, bãi lầy, gò cao và cọc ngầm. Bố trí binh lực và chọn hành động theo từng lượt. Kịch bản hiện dùng đội quân nhà Trần để tái hiện trận đánh.</p>
              <div className="campaign-terrain"><span>Sông nước</span><span>Bãi cọc</span><span>Thủy triều</span></div>
              <button type="button" onClick={deploy} disabled={!playableLocation}>Dàn trận ngay <ArrowRight aria-hidden="true" /></button>
            </div>
          </section>
          <aside className="campaign-other" aria-labelledby="campaign-other-title">
            <p className="campaign-kicker">Dấu mốc trong sử Việt</p>
            <h2 id="campaign-other-title">Khám phá thêm</h2>
            <p>Những địa danh đã xuất hiện trên bản đồ thế giới; kịch bản chiến đấu riêng chưa mở.</p>
            <ul>{otherLocations.map((location) => <li key={location.location_id}><Flag aria-hidden="true" /><span><strong>{location.name}</strong><small>{location.sub_label}</small></span><em>Chưa có trận</em></li>)}</ul>
          </aside>
        </div>
      </div>
    </div>
  );
};
