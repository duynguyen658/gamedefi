import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowRight, BookOpen, ChevronRight, CircleHelp, Coins, Crown, Flag, Play, Shield, ShoppingBag, Swords, Trophy, Wallet } from 'lucide-react';
import { Player, LeaderboardEntry } from '../../types';
import { apiService, DEFAULT_FACTIONS } from '../../services/api';
import './SplashScreen.css';

interface SplashScreenProps {
  player: Player | null;
  onEnterF2P: () => void;
  onEnterWithWallet: () => void;
  onOpenCampaign: () => void;
  onOpenAdvisors: () => void;
  onOpenMarketplace: () => void;
  onOpenDex: () => void;
  onPlayDrum: () => void;
  onPlayGong: () => void;
}

const worlds = [
  { label: 'Chiến dịch', detail: 'Dàn trận, chọn triều đại và chinh chiến qua sử Việt.', eyebrow: 'Chiến thuật theo lượt', art: 'campaign', Icon: Swords, action: 'Vào game' },
  { label: 'Quân Sư', detail: 'Tìm hiểu những danh tướng đồng hành cùng quân đội.', eyebrow: 'Tướng cố vấn', art: 'advisor', Icon: Crown, action: 'Gặp quân sư' },
  { label: 'Marketplace', detail: 'Xem khu Chợ Tướng. Giao dịch đang chờ escrow on-chain.', eyebrow: 'Đang xem trước', art: 'market', Icon: ShoppingBag, action: 'Xem chợ tướng' },
  { label: 'DEX', detail: 'Khám phá luồng đổi HKDV và SOL trên Solana Devnet.', eyebrow: 'HKDV / SOL', art: 'dex', Icon: ArrowLeftRight, action: 'Mở DEX' },
];

const legends = [
  { name: 'Hai Bà Trưng', note: 'Khởi nghĩa Mê Linh' },
  { name: 'Trần Hưng Đạo', note: 'Hào khí Đông A' },
  { name: 'Lê Lợi', note: 'Khởi nghĩa Lam Sơn' },
  { name: 'Quang Trung', note: 'Đại phá quân Thanh' },
];

const chapters = [
  { name: 'Văn Lang – Âu Lạc', era: 'Mở đầu dựng nước' },
  { name: 'Nhà Ngô – Nhà Đinh', era: 'Bạch Đằng • Hoa Lư' },
  { name: 'Nhà Lý', era: 'Thăng Long' },
  { name: 'Nhà Trần', era: 'Hào khí Đông A' },
  { name: 'Tây Sơn', era: 'Thần tốc Bắc Hà' },
];

export const SplashScreen: React.FC<SplashScreenProps> = ({
  player,
  onEnterF2P,
  onEnterWithWallet,
  onOpenCampaign,
  onOpenAdvisors,
  onOpenMarketplace,
  onOpenDex,
  onPlayDrum,
  onPlayGong,
}) => {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaders, setIsLoadingLeaders] = useState(true);

  useEffect(() => {
    let active = true;
    apiService.getLeaderboard().then((items) => {
      if (active) {
        setLeaders(items.slice(0, 5));
      }
    }).catch(() => {
      if (active) setLeaders([]);
    }).finally(() => {
      if (active) setIsLoadingLeaders(false);
    });
    return () => { active = false; };
  }, []);

  const startGame = () => {
    onPlayGong();
    if (player) onOpenCampaign();
    else onEnterF2P();
  };
  const connectWallet = () => {
    onPlayDrum();
    onEnterWithWallet();
  };
  const actions = [startGame, onOpenAdvisors, onOpenMarketplace, onOpenDex];

  return (
    <div className="portal-home">
      <section className="portal-hero" aria-labelledby="portal-title">
        <div className="portal-hero-art" aria-hidden="true" />
        <div className="portal-hero-content">
          <div className="portal-hero-copy">
            <p className="portal-kicker">GameFi · DeFi · Việt sử hùng ca</p>
            <h1 id="portal-title">Hào Khí <span>Đại Việt</span></h1>
            <p className="portal-hero-lead">Hệ sinh thái chiến thuật tái hiện hào hùng lịch sử Việt Nam.</p>
            <p className="portal-hero-description">Chọn triều đại, chiêu mộ binh mã và dẫn quân qua những trận đánh vang dội. Chơi miễn phí; kết nối ví khi muốn giao dịch.</p>
            <div className="portal-hero-actions">
              <button className="portal-button portal-button-primary" type="button" onClick={startGame}><Play aria-hidden="true" /> Chơi ngay <ArrowRight aria-hidden="true" /></button>
              <a className="portal-button portal-button-secondary" href="#ecosystem"><BookOpen aria-hidden="true" /> Khám phá hệ sinh thái</a>
            </div>
            <div className="portal-hero-pills" aria-label="Các khu vực của game">
              <span>Chiến thuật theo lượt</span><span>Tướng cố vấn</span><span>HKDV / SOL Devnet</span>
            </div>
          </div>
          <aside className="portal-hero-collection" aria-label="Giới thiệu tướng lĩnh">
            <div className="portal-collection-top"><Crown aria-hidden="true" /><span>Danh tướng Đại Việt</span></div>
            <div className="portal-collection-portraits" aria-hidden="true">
              {legends.map((legend, index) => <span className={`portal-mini-portrait portrait-${index + 1}`} key={legend.name} />)}
            </div>
            <div className="portal-collection-bottom"><span>Khám phá những nhân vật lịch sử</span><button type="button" onClick={onOpenAdvisors} aria-label="Khám phá danh tướng"><ArrowRight aria-hidden="true" /></button></div>
          </aside>
        </div>
      </section>

      <div className="portal-container">
        <div className="portal-status-strip" aria-label={player ? 'Thông tin người chơi' : 'Thông tin trò chơi'}>
          {player ? (
            <>
              <div><Crown aria-hidden="true" /><span><small>Tướng quân</small><strong>{player.username}</strong></span></div>
              <div><Shield aria-hidden="true" /><span><small>Cấp hiện tại</small><strong>{player.level}</strong></span></div>
              <div><Flag aria-hidden="true" /><span><small>Trận thắng</small><strong>{player.battles_won ?? '—'}</strong></span></div>
              <div><Trophy aria-hidden="true" /><span><small>Sao chiến dịch</small><strong>{player.campaign_stars ?? '—'}</strong></span></div>
            </>
          ) : (
            <>
              <div><Flag aria-hidden="true" /><span><small>Khởi đầu</small><strong>{DEFAULT_FACTIONS.length} triều đại</strong></span></div>
              <div><Swords aria-hidden="true" /><span><small>Trải nghiệm</small><strong>Chơi miễn phí</strong></span></div>
              <div><Crown aria-hidden="true" /><span><small>Đồng hành</small><strong>Tướng cố vấn</strong></span></div>
              <div><Coins aria-hidden="true" /><span><small>Giao thương</small><strong>Solana Devnet</strong></span></div>
            </>
          )}
        </div>

        <section id="ecosystem" className="portal-section portal-worlds" aria-labelledby="portal-worlds-title">
          <div className="portal-heading"><div><p className="portal-kicker">Hệ sinh thái</p><h2 id="portal-worlds-title">Một thế giới, nhiều cách trải nghiệm</h2><p>Chiến dịch, tướng lĩnh và giao thương cùng tồn tại trong thế giới Hào Khí Đại Việt.</p></div></div>
          <div className="portal-world-grid">
            {worlds.map((world, index) => (
              <article className="portal-world" key={world.label}>
                <div className={`portal-world-art world-${world.art}`} aria-hidden="true"><world.Icon /></div>
                <div className="portal-world-body"><span>{world.eyebrow}</span><h3>{world.label}</h3><p>{world.detail}</p><button type="button" onClick={actions[index]}>{world.action}<ArrowRight aria-hidden="true" /></button></div>
              </article>
            ))}
          </div>
        </section>

        <section className="portal-section portal-legends" aria-labelledby="portal-legends-title">
          <div className="portal-heading"><div><p className="portal-kicker">Sử Việt trong game</p><h2 id="portal-legends-title">Những tên tuổi làm nên hào khí</h2><p>Tranh minh họa các danh tướng trong thế giới Hào Khí Đại Việt.</p></div><button type="button" onClick={onOpenAdvisors}>Khám phá quân sư <ArrowRight aria-hidden="true" /></button></div>
          <div className="portal-legend-grid">
            {legends.map((legend, index) => (
              <figure className="portal-legend" key={legend.name}>
                <div className={`portal-legend-image portrait-${index + 1}`} role="img" aria-label={`Tranh minh họa ${legend.name}`} />
                <figcaption><span>{legend.note}</span><strong>{legend.name}</strong></figcaption>
              </figure>
            ))}
          </div>
        </section>

        <div className="portal-feature-grid">
          <section className="portal-panel portal-path" aria-labelledby="portal-path-title">
            <div className="portal-panel-heading"><div><p className="portal-kicker">Bắt đầu hành trình</p><h2 id="portal-path-title">Dấu mốc Việt sử</h2><p>Những triều đại truyền cảm hứng cho game. Trận Bạch Đằng hiện đã có thể chơi.</p></div><button type="button" onClick={startGame}>Vào chiến dịch <ArrowRight aria-hidden="true" /></button></div>
            <ol className="portal-path-list">{chapters.map((chapter, index) => <li key={chapter.name}><span>{String(index + 1).padStart(2, '0')}</span><strong>{chapter.name}</strong><small>{chapter.era}</small></li>)}</ol>
          </section>
          <section className="portal-panel portal-trade" aria-labelledby="portal-trade-title">
            <div className="portal-panel-heading"><div><p className="portal-kicker">Solana Devnet</p><h2 id="portal-trade-title">Giao thương HKDV</h2><p>Xem tỷ giá và điều kiện đổi trước khi ký trong DEX.</p></div></div>
            <div className="portal-token-pair"><div><Coins aria-hidden="true" /><span>HKDV</span></div><ArrowLeftRight aria-hidden="true" /><div><Wallet aria-hidden="true" /><span>SOL</span></div></div>
            <p className="portal-trade-note"><CircleHelp aria-hidden="true" /> Tỷ giá và số dư thật sẽ hiển thị trong DEX sau khi kết nối ví.</p>
            <button type="button" className="portal-button portal-button-primary" onClick={player && !player.is_guest ? onOpenDex : connectWallet}>{player && !player.is_guest ? 'Mở DEX' : 'Kết nối ví để giao dịch'} <ArrowRight aria-hidden="true" /></button>
          </section>
        </div>

        <div className="portal-feature-grid portal-bottom-grid">
          <section id="leaderboard" className="portal-panel portal-leaderboard" aria-labelledby="portal-leaderboard-title">
            <div className="portal-panel-heading"><div><p className="portal-kicker">Thành tích cộng đồng</p><h2 id="portal-leaderboard-title">Bảng xếp hạng</h2></div></div>
            {isLoadingLeaders ? <p className="portal-empty">Đang tải thứ hạng…</p> : leaders.length ? (
              <div className="portal-leader-table" role="table" aria-label="Bảng xếp hạng người chơi">
                <div role="row" className="portal-leader-head"><span role="columnheader">Hạng</span><span role="columnheader">Tướng quân</span><span role="columnheader">Triều đại</span><span role="columnheader">Điểm danh vọng</span></div>
                {leaders.map((leader) => <div role="row" key={leader.wallet}><span role="cell">{String(leader.rank).padStart(2, '0')}</span><strong role="cell">{leader.username}</strong><span role="cell">{leader.faction_name}</span><span role="cell">{leader.reputation_score.toLocaleString('vi-VN')}</span></div>)}
              </div>
            ) : <p className="portal-empty">Chưa có thứ hạng để hiển thị. Hãy vào chiến dịch và ghi dấu tên mình.</p>}
          </section>
          <section className="portal-panel portal-spotlight" aria-labelledby="portal-spotlight-title">
            <div className="portal-spotlight-art" aria-hidden="true" />
            <div className="portal-spotlight-content"><p className="portal-kicker">Trận đánh tiêu biểu</p><h2 id="portal-spotlight-title">Bạch Đằng</h2><p>Dụng binh giữa thủy triều và cọc ngầm. Thử tài điều quân trong trận chiến đã đi vào sử Việt.</p><button type="button" onClick={startGame}>Bước vào chiến dịch <ChevronRight aria-hidden="true" /></button></div>
          </section>
        </div>
      </div>
    </div>
  );
};
