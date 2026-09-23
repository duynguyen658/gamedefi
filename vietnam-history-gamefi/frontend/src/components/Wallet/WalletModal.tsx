import React, { useState } from 'react';
import { X, ShieldCheck, Sparkles, Loader2, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { ChainType } from '../../types';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (chain: ChainType) => Promise<any>;
  isConnecting: boolean;
  authStep: string;
  error: string | null;
  onPlayDrum: () => void;
  onPlayGong: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  isConnecting,
  authStep,
  error,
  onPlayDrum,
  onPlayGong,
}) => {
  const [selectedChain, setSelectedChain] = useState<ChainType>('solana');

  if (!isOpen) return null;

  const handleSelectChain = (c: ChainType) => {
    setSelectedChain(c);
    onPlayDrum();
  };

  const handleConnectClick = async () => {
    onPlayGong();
    try {
      await onConnect(selectedChain);
      onClose();
    } catch (e) {
      // Error is handled in hook
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-imperial-lacquer border border-imperial-gold/60 rounded-2xl p-6 sm:p-7 shadow-2xl gold-glow text-left overflow-hidden corner-ornament"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background accent */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-imperial-crimson/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isConnecting}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-black/40 hover:bg-imperial-darkred text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 text-imperial-gold text-xs font-semibold uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Xác thực danh tính Tướng quân</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-display text-white">
            Kết Nối Ví Khởi Trận
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Theo kiến trúc MVP: Ví của bạn nắm giữ quyền sở hữu Ấn tín Solana và bảo chứng thành tích on-chain.
          </p>
        </div>

        {/* Step 1: Chọn Blockchain */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Mạng Solana
          </label>
          <div className="grid grid-cols-1 gap-3">


            <button
              type="button"
              onClick={() => handleSelectChain('solana')}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                selectedChain === 'solana'
                  ? 'bg-purple-950/50 border-purple-400 shadow-md shadow-purple-950/50 scale-[1.02]'
                  : 'bg-black/40 border-imperial-border hover:border-slate-600 text-slate-400'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-300 font-bold mb-1">
                ⚡
              </div>
              <span className="font-semibold text-sm text-slate-100">Solana Network</span>
              <span className="text-[10px] text-purple-400/80">Rust Anchor &bull; Devnet</span>
            </button>
          </div>
        </div>

        {/* Quy trình bảo mật & mã hóa */}
        <div className="bg-black/40 border border-slate-800 rounded-xl p-3 mb-5 text-xs space-y-1.5 text-slate-300">
          <div className="font-semibold text-imperial-gold flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Quy trình xác thực an toàn (Section 5.1 PDF):</span>
          </div>
          <ul className="text-[11px] text-slate-400 space-y-1 pl-4 list-disc">
            <li>Máy chủ cấp một Nonce challenge độc nhất có thời hạn.</li>
            <li>Ví của bạn ký xác thực off-chain (không bao giờ lộ Private Key).</li>
            <li>Kết nối ví Solana đã cài trong trình duyệt; không tạo ví giả.</li>
          </ul>
        </div>

        {/* Error notification if any */}
        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-700/60 rounded-xl flex items-start space-x-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Progress status during connect */}
        {isConnecting && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-600/50 rounded-xl flex items-center space-x-3 text-xs text-amber-200">
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
            <span className="font-medium">{authStep || 'Đang xác thực thông điệp...'}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleConnectClick}
          disabled={isConnecting}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-imperial-crimson via-red-600 to-imperial-darkred hover:from-red-600 hover:to-imperial-crimson text-imperial-lightgold border border-imperial-gold font-bold text-sm shadow-lg shadow-red-950/60 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang Xử Lý Xác Thực...</span>
            </>
          ) : (
            <>
              <span>Xác Nhận Kết Nối Solana</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="text-center text-[11px] text-slate-500 mt-3">
          Hỗ trợ Phantom và Solflare. Ví của bạn ký xác thực và giao dịch.
        </p>
      </div>
    </div>
  );
};
