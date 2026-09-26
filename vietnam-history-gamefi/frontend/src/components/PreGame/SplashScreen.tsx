import React from 'react';
import { ArrowRight, ArrowLeftRight, Compass, Crown, Play, Shield, ShoppingBag, Swords, Wallet } from 'lucide-react';
import { DrumOrnament } from '../Common/DrumOrnament';
import './SplashScreen.css';

interface SplashScreenProps {
  onEnterF2P: () => void;
  onEnterWithWallet: () => void;
  onPlayDrum: () => void;
  onPlayGong: () => void;
}

const experiences = [
  { number: '01', name: 'Chiến dịch', eyebrow: 'Chơi miễn phí', description: 'Chọn triều đại, dựng binh lực và tiến vào những trận đánh trong sử Việt.', Icon: Swords, action: 'Vào chiến dịch', requiresWallet: false, className: 'splash-experience-campaign' },
  { number: '02', name: 'Quân Sư', eyebrow: 'Tướng cố vấn', description: 'Khám phá các danh tướng và chọn người đồng hành trong hành trình của bạn.', Icon: Crown, action: 'Vào game gặp quân sư', requiresWallet: false, className: 'splash-experience-advisor' },
  { number: '03', name: 'Chợ Tướng', eyebrow: 'Solana Devnet', description: 'Khám phá khu giao dịch Tướng Cố Vấn với ví Solana của bạn.', Icon: ShoppingBag, action: 'Mở chợ tướng', requiresWallet: true, className: 'splash-experience-market' },
  { number: '04', name: 'DEX', eyebrow: 'Solana Devnet', description: 'Giao dịch HKDV và SOL trong khu giao thương của game.', Icon: ArrowLeftRight, action: 'Mở khu DEX', requiresWallet: true, className: 'splash-experience-dex' },
];

const journey = [
  { number: 'I', title: 'Chọn triều đại', text: 'Bắt đầu từ một trong tám triều đại.' },
  { number: 'II', title: 'Dụng binh', text: 'Chiêu mộ quân và bước vào chiến dịch.' },
  { number: 'III', title: 'Mở rộng hành trình', text: 'Kết nối ví khi muốn giao dịch Tướng và HKDV.' },
];

const legends = [
  { name: 'Hai Bà Trưng', chapter: 'Khởi nghĩa Mê Linh' },
  { name: 'Trần Hưng Đạo', chapter: 'Hào khí Đông A' },
  { name: 'Lê Lợi', chapter: 'Khởi nghĩa Lam Sơn' },
  { name: 'Quang Trung', chapter: 'Đại phá quân Thanh' },
];

export const SplashScreen: React.FC<SplashScreenProps> = ({ onEnterF2P, onEnterWithWallet, onPlayDrum, onPlayGong }) => {
  const enterGame = () => { onPlayGong(); onEnterF2P(); };
  const connectWallet = () => { onPlayDrum(); onEnterWithWallet(); };

  return (
    <div className="splash-page">
      <section className="splash-hero" aria-labelledby="splash-title">
        <div className="splash-hero-image" aria-hidden="true" />
        <div className="splash-hero-inner">
          <div className="splash-copy">
            <p className="splash-eyebrow"><span /> Game chiến thuật lịch sử Việt Nam</p>
            <h1 id="splash-title" className="splash-title">Hào Khí <span>Đại Việt</span></h1>
            <p className="splash-verse"><span>“Nam quốc sơn hà Nam đế cư</span><span>Tiệt nhiên định phận tại thiên thư”</span></p>
            <p className="splash-intro">Chọn một triều đại, chiêu mộ binh mã và dẫn quân qua những trận đánh vang dội.</p>
            <div className="splash-actions">
              <button type="button" onClick={enterGame} className="splash-play-button"><Play className="h-4 w-4 fill-current" aria-hidden="true" /><span>Chơi ngay, không cần ví</span><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" onClick={connectWallet} className="splash-wallet-button"><Wallet className="h-4 w-4" aria-hidden="true" /><span>Kết nối ví</span></button>
            </div>
            <div className="splash-hero-tags" aria-label="Đặc điểm trò chơi">
              <span><Shield aria-hidden="true" /> Chơi miễn phí</span>
              <span><Compass aria-hidden="true" /> Tám triều đại</span>
              <span><ArrowLeftRight aria-hidden="true" /> Solana Devnet</span>
            </div>
          </div>
          <div className="splash-hero-seal" aria-hidden="true"><DrumOrnament size={160} fluid animate /></div>
        </div>
      </section>

      <div className="splash-shell">
        <section className="splash-experiences" aria-labelledby="splash-experiences-title">
          <div className="splash-section-heading">
            <div><p className="splash-section-kicker">Khám phá Hào Khí Đại Việt</p><h2 id="splash-experiences-title">Một thế giới, nhiều cách trải nghiệm</h2></div>
            <p>Vào trận trước. Mở rộng hành trình khi bạn sẵn sàng.</p>
          </div>
          <div className="splash-experience-grid">
            {experiences.map(({ number, name, eyebrow, description, Icon, action, requiresWallet, className }) => (
              <article className={`splash-experience ${className}`} key={number}>
                <div className="splash-experience-art" aria-hidden="true"><Icon /></div>
                <div className="splash-experience-body">
                  <span className="splash-experience-eyebrow">{number} / {eyebrow}</span>
                  <h3>{name}</h3><p>{description}</p>
                  <button type="button" onClick={requiresWallet ? connectWallet : enterGame} aria-label={requiresWallet ? `${action} — kết nối ví` : action}><span>{action}</span><ArrowRight aria-hidden="true" /></button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="splash-legends" aria-labelledby="splash-legends-title">
          <div className="splash-section-heading">
            <div><p className="splash-section-kicker">Dấu ấn sử Việt</p><h2 id="splash-legends-title">Những tên tuổi làm nên hào khí</h2></div>
            <p>Tranh minh họa nhân vật lịch sử trong thế giới của game.</p>
          </div>
          <div className="splash-legends-grid">
            {legends.map((legend, index) => (
              <figure className="splash-legend" key={legend.name}>
                <div className={`splash-legend-art splash-legend-art-${index + 1}`} role="img" aria-label={`Tranh minh họa ${legend.name}`} />
                <figcaption><span>{legend.chapter}</span><strong>{legend.name}</strong></figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="splash-journey" aria-labelledby="splash-journey-title">
          <div className="splash-journey-intro">
            <p className="splash-section-kicker">Lộ trình của bạn</p>
            <h2 id="splash-journey-title">Viết nên thiên sử của riêng mình.</h2>
            <p>Mỗi bước đều bắt đầu từ cuộc chơi. Ví chỉ cần khi bạn chọn giao dịch trên Solana.</p>
            <button type="button" onClick={enterGame}>Bắt đầu hành trình <ArrowRight aria-hidden="true" /></button>
          </div>
          <ol className="splash-journey-list">
            {journey.map((step) => <li key={step.number}><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}
          </ol>
        </section>
      </div>
    </div>
  );
};
