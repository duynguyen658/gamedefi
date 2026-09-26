import React from 'react';
import { ArrowRight, Play, Wallet } from 'lucide-react';
import { DrumOrnament } from '../Common/DrumOrnament';

interface SplashScreenProps {
  onEnterF2P: () => void;
  onEnterWithWallet: () => void;
  onPlayDrum: () => void;
  onPlayGong: () => void;
}

const chapters = [
  {
    number: '01',
    title: 'Chọn triều đại',
    description: 'Bước vào một trong tám triều đại và gây dựng lực lượng của riêng bạn.',
  },
  {
    number: '02',
    title: 'Dụng binh trên chiến trường',
    description: 'Dàn trận, dùng mưu và tái hiện những trận đánh đã làm nên lịch sử.',
  },
  {
    number: '03',
    title: 'Giao thương khi sẵn sàng',
    description: 'Kết nối ví để sở hữu, trao đổi Tướng Cố Vấn và dùng chợ on-chain.',
  },
];

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onEnterF2P,
  onEnterWithWallet,
  onPlayDrum,
  onPlayGong,
}) => (
  <section className="splash-page">
    <div className="splash-shell">
      <div className="splash-hero">
        <div className="splash-copy">
          <p className="splash-eyebrow"><span className="splash-eyebrow-mark" /> Bước vào sử Việt</p>
          <h1 className="splash-title">Hào Khí <span>Đại Việt</span></h1>
          <p className="splash-verse">
            <span>“Nam quốc sơn hà Nam đế cư</span>
            <span>Tiệt nhiên định phận tại thiên thư”</span>
          </p>
          <p className="splash-intro">
            Chọn một triều đại, chiêu mộ binh mã và dẫn quân qua những trận đánh vang dội.
          </p>

          <div className="splash-actions">
            <button
              type="button"
              onClick={() => {
                onPlayGong();
                onEnterF2P();
              }}
              className="splash-play-button"
            >
              <Play className="h-5 w-5 fill-current" aria-hidden="true" />
              <span>Chơi ngay, không cần ví</span>
              <ArrowRight className="h-5 w-5 splash-play-arrow" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                onPlayDrum();
                onEnterWithWallet();
              }}
              className="splash-wallet-button"
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              <span>Kết nối ví</span>
            </button>
          </div>
          <p className="splash-action-note">Chợ Tướng và giao thương luôn là lựa chọn của bạn.</p>
        </div>

        <div className="splash-visual" aria-hidden="true">
          <div className="splash-visual-disc" />
          <div className="splash-visual-ring" />
          <DrumOrnament className="splash-drum" size={500} fluid animate />
          <div className="splash-visual-caption">
            <span>Ấn tượng Đông Sơn</span>
            <strong>Khởi đầu một thiên sử mới</strong>
          </div>
        </div>
      </div>

      <div className="splash-journey">
        <div className="splash-journey-heading">
          <span>Hành trình của bạn</span>
          <span>Chơi trước. Khám phá thêm khi bạn muốn.</span>
        </div>
        <div className="splash-chapters">
          {chapters.map((chapter) => (
            <div className="splash-chapter" key={chapter.number}>
              <span className="splash-chapter-number">{chapter.number}</span>
              <div>
                <h2>{chapter.title}</h2>
                <p>{chapter.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);
