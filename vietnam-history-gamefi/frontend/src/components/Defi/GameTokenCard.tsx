import React, { useEffect, useState } from 'react';
import { Coins, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Player } from '../../types';
import type { GameTokenSnapshot } from '../../services/gameToken';
import { loadGameTokenSnapshot } from '../../services/gameToken';

interface GameTokenCardProps {
  player: Player;
}

export const GameTokenCard: React.FC<GameTokenCardProps> = ({ player }) => {
  const [snapshot, setSnapshot] = useState<GameTokenSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await loadGameTokenSnapshot(player.wallet, Boolean(player.is_guest)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đọc được HKDV từ Solana RPC.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [player.wallet, player.is_guest]);

  return (
    <div className="mt-5 rounded-xl border border-amber-600/40 bg-amber-950/20 p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-amber-500/50 bg-red-950 p-2 text-amber-300">
            <Coins className="h-4 w-4" />
          </div>
          <div>
            <div className="font-bold text-imperial-lightgold">HKDV · Hào Khí Đại Việt</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">SPL Token · Devnet</div>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="text-slate-400 hover:text-white disabled:opacity-40" aria-label="Tải lại số dư HKDV">
          {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {snapshot && (
        <>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <div className="text-[10px] text-slate-500">Số dư trong ví</div>
              <div className="font-mono text-lg font-bold text-white">{snapshot.balance ?? 'Cần kết nối ví'} HKDV</div>
            </div>
            <a href={snapshot.token.explorer_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-amber-300 underline">
              Mint <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-300">
            <ShieldCheck className="h-3 w-3" />
            Cung cố định 1 tỷ · Không mint thêm · Không đóng băng ví
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Phần thưởng HKDV sẽ được mở ở giai đoạn reward distributor.</p>
        </>
      )}
      {error && <p className="mt-2 text-[10px] text-red-300">{error}</p>}
    </div>
  );
};
