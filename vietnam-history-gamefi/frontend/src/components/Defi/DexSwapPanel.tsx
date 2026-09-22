import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, LoaderCircle, RefreshCw, ShieldAlert, WalletCards } from 'lucide-react';
import { Player } from '../../types';
import { SOLANA_NETWORK } from '../../services/solana';
import {
  DexBalances,
  DexTokenSymbol,
  dexTokens,
  loadDexBalances,
  maximumSpendable,
  validateSwapAmount,
} from '../../services/dexBalances';

interface DexSwapPanelProps {
  player: Player;
  onPlayDrum: () => void;
}

type BalanceStatus = 'loading' | 'ready' | 'error' | 'wallet-required';

const EMPTY_BALANCES: DexBalances = { SOL: '0', USDC: '0' };

export const DexSwapPanel: React.FC<DexSwapPanelProps> = ({ player, onPlayDrum }) => {
  const [fromToken, setFromToken] = useState<DexTokenSymbol>('SOL');
  const [toToken, setToToken] = useState<DexTokenSymbol>('USDC');
  const [amount, setAmount] = useState('');
  const [balances, setBalances] = useState<DexBalances>(EMPTY_BALANCES);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>('loading');
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const tokens = useMemo(() => dexTokens(), []);
  const from = tokens.find((token) => token.symbol === fromToken)!;
  const amountError = balanceStatus === 'ready'
    ? validateSwapAmount(amount, balances[fromToken], from.decimals)
    : null;

  const refreshBalances = async () => {
    if (player.is_guest) {
      setBalanceStatus('wallet-required');
      return;
    }
    setBalanceStatus('loading');
    setBalanceError(null);
    try {
      setBalances(await loadDexBalances(player.wallet));
      setBalanceStatus('ready');
    } catch {
      setBalanceStatus('error');
      setBalanceError('Không đọc được số dư từ Solana RPC. Hãy thử tải lại.');
    }
  };

  useEffect(() => {
    void refreshBalances();
  }, [player.wallet, player.is_guest]);

  const reversePair = () => {
    onPlayDrum();
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount('');
  };

  const networkLabel = SOLANA_NETWORK === 'mainnet-beta' ? 'Mainnet' : SOLANA_NETWORK;
  const balanceLabel = balanceStatus === 'loading'
    ? 'Đang đọc…'
    : balanceStatus === 'ready'
      ? `${balances[fromToken]} ${fromToken}`
      : 'Chưa có dữ liệu';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h4 className="text-sm font-bold text-imperial-lightgold">Đổi tài sản</h4>
          <p className="mt-1 text-[11px] text-slate-400">Số dư lấy trực tiếp từ Solana RPC.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-600/40 bg-amber-950/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
            {networkLabel}
          </span>
          <button
            type="button"
            onClick={() => void refreshBalances()}
            disabled={balanceStatus === 'loading' || player.is_guest}
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 transition-colors hover:border-imperial-gold/60 hover:text-imperial-lightgold disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Tải lại số dư"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${balanceStatus === 'loading' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-black/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Bạn bán</span>
          <span className="text-slate-500">Số dư: {balanceLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={amount}
            onChange={(event) => {
              const next = event.target.value;
              if (next === '' || /^\d*(?:\.\d*)?$/.test(next)) setAmount(next);
            }}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`Số lượng ${fromToken} muốn đổi`}
            className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-slate-700"
          />
          <button
            type="button"
            onClick={() => setAmount(maximumSpendable(balances[fromToken], fromToken))}
            disabled={balanceStatus !== 'ready'}
            className="text-[10px] font-bold uppercase tracking-wide text-imperial-gold disabled:opacity-30"
          >
            Tối đa
          </button>
          <select
            value={fromToken}
            onChange={(event) => {
              const symbol = event.target.value as DexTokenSymbol;
              setFromToken(symbol);
              setToToken(symbol === 'SOL' ? 'USDC' : 'SOL');
              setAmount('');
            }}
            className="rounded-lg border border-imperial-gold/40 bg-imperial-darkred/50 px-3 py-2 text-sm font-bold text-imperial-lightgold outline-none"
            aria-label="Token bán"
          >
            {tokens.map((token) => <option key={token.symbol} value={token.symbol}>{token.symbol}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={reversePair}
          className="rounded-full border border-imperial-border bg-imperial-lacquer p-2 text-slate-300 transition-colors hover:border-imperial-gold hover:text-imperial-lightgold"
          aria-label="Đảo chiều cặp giao dịch"
        >
          <ArrowDownUp className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Bạn nhận</span>
          <span className="text-slate-500">{balances[toToken]} {toToken} trong ví</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-lg font-semibold text-slate-500">Chưa có báo giá</span>
          <span className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300">{toToken}</span>
        </div>
      </div>

      {amount && amountError && balanceStatus === 'ready' && (
        <p className="flex items-center gap-2 text-[11px] text-amber-300" role="alert">
          <ShieldAlert className="h-3.5 w-3.5" />
          {amountError}
        </p>
      )}

      {balanceStatus === 'error' && (
        <p className="text-[11px] text-red-300" role="alert">{balanceError}</p>
      )}

      {balanceStatus === 'wallet-required' && (
        <p className="flex items-center gap-2 text-[11px] text-amber-300">
          <WalletCards className="h-3.5 w-3.5" />
          Hãy kết nối ví Solana để đọc số dư và chuẩn bị giao dịch.
        </p>
      )}

      <button
        type="button"
        disabled
        className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 py-3 text-sm font-bold text-slate-500"
      >
        {balanceStatus === 'loading' && <LoaderCircle className="h-4 w-4 animate-spin" />}
        Bộ định tuyến sẽ được nối ở giai đoạn 2
      </button>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-[10px] text-slate-500">
        <span>Giá: chờ báo giá</span>
        <span className="text-center">Phí: chờ tuyến</span>
        <span className="text-right">Impact: chờ tuyến</span>
      </div>
    </div>
  );
};
