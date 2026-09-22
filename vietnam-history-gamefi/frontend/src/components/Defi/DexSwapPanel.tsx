import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from 'lucide-react';
import { Player } from '../../types';
import { apiService } from '../../services/api';
import { SOLANA_NETWORK, solanaAdapter } from '../../services/solana';
import {
  DexBalances,
  DexTokenSymbol,
  dexTokens,
  loadDexBalances,
  maximumSpendable,
  validateSwapAmount,
} from '../../services/dexBalances';
import { formatBaseUnits, uiAmountToBaseUnits } from '../../services/dexMath';
import type { DexExecution, DexOrder } from '../../types/dex';

interface DexSwapPanelProps {
  player: Player;
  onPlayDrum: () => void;
}

type BalanceStatus = 'loading' | 'ready' | 'error' | 'wallet-required';
type RequestStatus = 'idle' | 'quoting' | 'signing' | 'executing';

const EMPTY_BALANCES: DexBalances = { SOL: '0', USDC: '0' };

function apiError(error: unknown): string {
  return error instanceof Error ? error.message : 'DEX không thể xử lý yêu cầu lúc này.';
}

export const DexSwapPanel: React.FC<DexSwapPanelProps> = ({ player, onPlayDrum }) => {
  const [fromToken, setFromToken] = useState<DexTokenSymbol>('SOL');
  const [toToken, setToToken] = useState<DexTokenSymbol>('USDC');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(50);
  const [balances, setBalances] = useState<DexBalances>(EMPTY_BALANCES);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>('loading');
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [order, setOrder] = useState<DexOrder | null>(null);
  const [execution, setExecution] = useState<DexExecution | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      setBalances(await loadDexBalances(player.wallet));
      setBalanceStatus('ready');
    } catch {
      setBalanceStatus('error');
      setError('Không đọc được số dư từ Solana RPC. Hãy thử tải lại.');
    }
  };

  useEffect(() => {
    void refreshBalances();
  }, [player.wallet, player.is_guest]);

  const clearQuote = () => {
    setOrder(null);
    setExecution(null);
    setError(null);
  };

  const reversePair = () => {
    onPlayDrum();
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount('');
    clearQuote();
  };

  const requestOrder = async () => {
    if (amountError || !amount) return;
    onPlayDrum();
    setRequestStatus('quoting');
    setError(null);
    setExecution(null);
    try {
      const nextOrder = await apiService.createDexOrder({
        wallet: player.wallet,
        input_symbol: fromToken,
        output_symbol: toToken,
        amount: uiAmountToBaseUnits(amount, from.decimals),
        slippage_bps: slippageBps,
      });
      setOrder(nextOrder);
    } catch (requestError) {
      setOrder(null);
      setError(apiError(requestError));
    } finally {
      setRequestStatus('idle');
    }
  };

  const signAndExecute = async () => {
    if (!order?.transaction || !order.executable) return;
    onPlayDrum();
    setError(null);
    setExecution(null);
    try {
      setRequestStatus('signing');
      const signedTransaction = await solanaAdapter.signVersionedTransaction(order.transaction, player.wallet);
      setRequestStatus('executing');
      const result = await apiService.executeDexOrder({
        wallet: player.wallet,
        request_id: order.request_id,
        signed_transaction: signedTransaction,
      });
      setExecution(result);
      if (result.status !== 'Success') setError(result.error || `Giao dịch thất bại với mã ${result.code}.`);
      if (result.status === 'Success') await refreshBalances();
    } catch (executeError) {
      setError(apiError(executeError));
    } finally {
      setRequestStatus('idle');
    }
  };

  const networkLabel = SOLANA_NETWORK === 'mainnet-beta' ? 'Mainnet' : SOLANA_NETWORK;
  const balanceLabel = balanceStatus === 'loading'
    ? 'Đang đọc…'
    : balanceStatus === 'ready'
      ? `${balances[fromToken]} ${fromToken}`
      : 'Chưa có dữ liệu';
  const outputDisplay = order
    ? formatBaseUnits(BigInt(order.out_amount), order.output_decimals, 6)
    : null;
  const minimumReceived = order
    ? formatBaseUnits(
        BigInt(order.out_amount) * BigInt(10_000 - order.slippage_bps) / 10_000n,
        order.output_decimals,
        6,
      )
    : null;
  const explorerUrl = execution?.signature
    ? `https://explorer.solana.com/tx/${execution.signature}${SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`}`
    : null;
  const busy = requestStatus !== 'idle';
  const canRequestQuote = balanceStatus === 'ready' && Boolean(amount) && !amountError && !busy;

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
              if (next === '' || /^\d*(?:\.\d*)?$/.test(next)) {
                setAmount(next);
                clearQuote();
              }
            }}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`Số lượng ${fromToken} muốn đổi`}
            className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-slate-700"
          />
          <button
            type="button"
            onClick={() => {
              setAmount(maximumSpendable(balances[fromToken], fromToken));
              clearQuote();
            }}
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
              clearQuote();
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
          <span className={`text-2xl font-semibold ${outputDisplay ? 'text-imperial-lightgold' : 'text-slate-500'}`}>
            {outputDisplay || 'Chưa có báo giá'}
          </span>
          <span className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300">{toToken}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px]">
        <label className="text-slate-400" htmlFor="dex-slippage">Slippage tối đa</label>
        <select
          id="dex-slippage"
          value={slippageBps}
          onChange={(event) => {
            setSlippageBps(Number(event.target.value));
            clearQuote();
          }}
          className="rounded-lg border border-slate-700 bg-black/30 px-2 py-1.5 text-slate-200 outline-none"
        >
          <option value={10}>0.10%</option>
          <option value={50}>0.50%</option>
          <option value={100}>1.00%</option>
        </select>
      </div>

      {order && (
        <div className={`rounded-xl border p-3 text-[11px] ${order.simulation ? 'border-amber-700/50 bg-amber-950/20' : 'border-emerald-800/50 bg-emerald-950/20'}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={order.simulation ? 'font-bold text-amber-300' : 'font-bold text-emerald-300'}>
              {order.simulation ? 'Báo giá mô phỏng Devnet' : 'Báo giá Jupiter Mainnet'}
            </span>
            <span className="text-slate-400">{order.router} · {order.mode}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-slate-400">
            <span>Nhận tối thiểu</span><span className="text-right text-slate-200">{minimumReceived} {toToken}</span>
            <span>Phí tuyến</span><span className="text-right text-slate-200">{(order.fee_bps / 100).toFixed(2)}%</span>
            <span>Price impact</span><span className="text-right text-slate-200">Theo bộ định tuyến</span>
          </div>
          {order.warning && <p className="mt-2 text-amber-300">{order.warning}</p>}
        </div>
      )}

      {amount && amountError && balanceStatus === 'ready' && (
        <p className="flex items-center gap-2 text-[11px] text-amber-300" role="alert">
          <ShieldAlert className="h-3.5 w-3.5" />
          {amountError}
        </p>
      )}
      {balanceStatus === 'wallet-required' && (
        <p className="flex items-center gap-2 text-[11px] text-amber-300">
          <WalletCards className="h-3.5 w-3.5" />
          Hãy kết nối ví Solana để lấy báo giá.
        </p>
      )}
      {error && <p className="text-[11px] text-red-300" role="alert">{error}</p>}
      {execution?.status === 'Success' && execution.signature && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-[11px] text-emerald-300">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Giao dịch đã xác nhận.</span>
          <a href={explorerUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline">
            Explorer <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {!order || order.simulation ? (
        <button
          type="button"
          onClick={() => void requestOrder()}
          disabled={!canRequestQuote}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-imperial-gold/50 bg-imperial-darkred/70 py-3 text-sm font-bold text-imperial-lightgold transition-colors hover:bg-imperial-crimson/70 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/70 disabled:text-slate-500"
        >
          {requestStatus === 'quoting' && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {order?.simulation ? 'Lấy lại báo giá mô phỏng' : 'Lấy báo giá'}
        </button>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => void signAndExecute()}
            disabled={busy || !order.executable || execution?.status === 'Success'}
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-900/60 py-3 text-sm font-bold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {execution?.status === 'Success' ? 'Đã hoàn tất' : requestStatus === 'signing' ? 'Đang chờ ví ký…' : requestStatus === 'executing' ? 'Đang xác nhận…' : 'Ký và đổi'}
          </button>
          <button
            type="button"
            onClick={() => void requestOrder()}
            disabled={busy}
            className="rounded-xl border border-slate-700 px-3 text-slate-400 hover:text-white disabled:opacity-40"
            aria-label="Lấy lại báo giá"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
