import React, { useEffect, useRef } from 'react';
import { ArrowRight, ShieldCheck, Wallet, X } from 'lucide-react';
import { ChainType } from '../../types';
import './WalletModal.css';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (chain: ChainType) => Promise<void>;
  isConnecting: boolean;
  authStep: string;
  error: string | null;
  onPlayDrum: () => void;
  onPlayGong: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen, onClose, onConnect, isConnecting, authStep, error, onPlayDrum, onPlayGong,
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConnecting) onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isOpen, isConnecting, onClose]);

  if (!isOpen) return null;

  const connect = async () => {
    onPlayGong();
    try {
      await onConnect('solana');
      onClose();
    } catch {
      // useWallet exposes the error in the dialog so the player can retry.
    }
  };

  return (
    <div className="wallet-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isConnecting) onClose();
    }}>
      <section className="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-title" aria-describedby="wallet-description">
        <button ref={closeRef} type="button" className="wallet-close" onClick={() => { onPlayDrum(); onClose(); }} disabled={isConnecting} aria-label="Đóng hộp kết nối ví"><X aria-hidden="true" /></button>
        <div className="wallet-art" aria-hidden="true" />
        <div className="wallet-content">
          <p className="wallet-kicker">Hào Khí Đại Việt · On-chain</p>
          <h2 id="wallet-title">Kết nối ví <span>Solana</span></h2>
          <p id="wallet-description">Dùng ví để giao dịch DEX và quản lý tài sản trong game. Bạn vẫn có thể chơi chiến dịch mà không cần ví.</p>
          <div className="wallet-network"><span className="wallet-network-dot" /> Mạng thử nghiệm: <strong>Solana Devnet</strong></div>
          <div className="wallet-assurance"><ShieldCheck aria-hidden="true" /><span>Ví sẽ yêu cầu bạn ký thông điệp xác thực. Trang này không yêu cầu khóa riêng hay cụm từ khôi phục.</span></div>
          {error && <p className="wallet-error" role="alert">{error}</p>}
          {isConnecting && <p className="wallet-progress" role="status">{authStep || 'Đang kết nối ví…'}</p>}
          <button type="button" className="wallet-connect" disabled={isConnecting} onClick={() => void connect()}><Wallet aria-hidden="true" /> {isConnecting ? 'Đang kết nối…' : 'Kết nối ví Solana'} <ArrowRight aria-hidden="true" /></button>
          <button type="button" className="wallet-play" disabled={isConnecting} onClick={() => { onPlayDrum(); onClose(); }}>Để sau</button>
        </div>
      </section>
    </div>
  );
};
