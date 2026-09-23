import React, { useEffect, useState } from 'react';
import { CheckCircle2, Coins, ExternalLink, Gift, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Player, Quest, RewardClaim } from '../../types';
import type { GameTokenSnapshot } from '../../services/gameToken';
import { loadGameTokenSnapshot } from '../../services/gameToken';
import { apiService } from '../../services/api';
import { formatBaseUnits } from '../../services/dexMath';

interface GameTokenCardProps {
  player: Player;
}

const STATUS_LABELS: Record<RewardClaim['status'], string> = {
  reserved: 'Đã giữ chỗ',
  preparing: 'Đang ký',
  submitted: 'Đang xác nhận',
  submission_unknown: 'Đang đối soát',
  confirmed: 'Đã nhận',
  failed: 'Thất bại',
};

export const GameTokenCard: React.FC<GameTokenCardProps> = ({ player }) => {
  const [snapshot, setSnapshot] = useState<GameTokenSnapshot | null>(null);
  const [rewards, setRewards] = useState<RewardClaim[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingQuest, setClaimingQuest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const tokenSnapshot = await loadGameTokenSnapshot(player.wallet, Boolean(player.is_guest));
      setSnapshot(tokenSnapshot);
      if (player.is_guest) {
        setRewards([]);
        setQuests([]);
      } else {
        const [history, playerQuests] = await Promise.all([
          apiService.getRewards(player.wallet, 8),
          apiService.getPlayerQuests(player.wallet),
        ]);
        setRewards(history);
        setQuests(playerQuests);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đọc được trạng thái HKDV.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [player.wallet, player.is_guest]);

  const claimQuest = async (quest: Quest) => {
    setClaimingQuest(quest.id);
    setError(null);
    try {
      await apiService.claimQuestReward(player.wallet, quest.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không claim được phần thưởng quest.');
    } finally {
      setClaimingQuest(null);
    }
  };

  const tokenAmount = (amount: number) =>
    formatBaseUnits(BigInt(amount), snapshot?.token.decimals ?? 6, 6);

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
        <button type="button" onClick={() => void refresh()} disabled={loading} className="text-slate-400 hover:text-white disabled:opacity-40" aria-label="Tải lại số dư và reward HKDV">
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
            Cung cố định 1 tỷ · Receipt PDA chống nhận trùng
          </div>
        </>
      )}

      {!player.is_guest && quests.some((quest) => quest.completed) && (
        <div className="mt-3 border-t border-amber-700/30 pt-3">
          <div className="mb-2 flex items-center gap-1.5 font-semibold text-amber-200">
            <Gift className="h-3.5 w-3.5" /> Nhiệm vụ đủ điều kiện
          </div>
          <div className="space-y-2">
            {quests.filter((quest) => quest.completed).map((quest) => {
              const claimed = quest.reward_claim_status === 'confirmed';
              const processing = Boolean(quest.reward_claim_status && !['failed', 'confirmed'].includes(quest.reward_claim_status));
              return (
                <div key={quest.id} className="rounded-lg border border-slate-800 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-200">{quest.title}</div>
                      <div className="text-[10px] text-slate-500">{tokenAmount(quest.reward_hkdv_base_units)} HKDV</div>
                    </div>
                    <button
                      type="button"
                      disabled={claimed || processing || claimingQuest === quest.id}
                      onClick={() => void claimQuest(quest)}
                      className="rounded-lg border border-amber-500/50 px-2 py-1 text-[10px] font-semibold text-amber-200 disabled:border-emerald-800 disabled:text-emerald-400"
                    >
                      {claimingQuest === quest.id ? 'Đang gửi…' : claimed ? 'Đã nhận' : processing ? 'Đang xác nhận' : 'Nhận thưởng'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!player.is_guest && (
        <div className="mt-3 border-t border-amber-700/30 pt-3">
          <div className="mb-2 font-semibold text-slate-300">Lịch sử phần thưởng on-chain</div>
          {rewards.length === 0 ? (
            <p className="text-[10px] text-slate-500">Chưa có claim HKDV.</p>
          ) : (
            <div className="space-y-1.5">
              {rewards.map((reward) => (
                <div key={reward.claim_id} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2 py-1.5">
                  <div>
                    <div className="text-slate-300">{reward.source_type === 'battle' ? 'Chiến thắng' : 'Nhiệm vụ'} · {tokenAmount(reward.amount)} HKDV</div>
                    <div className="font-mono text-[9px] text-slate-600">{reward.claim_id.slice(0, 10)}…</div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px]">
                    {reward.status === 'confirmed' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                    <span className={reward.status === 'failed' ? 'text-red-300' : reward.status === 'confirmed' ? 'text-emerald-300' : 'text-amber-300'}>
                      {STATUS_LABELS[reward.status]}
                    </span>
                    {reward.explorer_url && (
                      <a href={reward.explorer_url} target="_blank" rel="noreferrer" aria-label="Mở giao dịch trên Solana Explorer">
                        <ExternalLink className="h-3 w-3 text-slate-400" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-[10px] text-red-300">{error}</p>}
    </div>
  );
};
