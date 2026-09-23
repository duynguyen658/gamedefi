import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  CheckCircle2,
  Clock3,
  Coins,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ScrollText,
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
import { buildRaydiumSwapTransaction } from '../../services/raydiumSwap';
import type { DexConfig, DexExecution, DexOrder, DexSwapHistory } from '../../types/dex';
import { GameTokenCard } from './GameTokenCard';

interface DexSwapPanelProps {
  player: Player;
  onPlayDrum: () => void;
}

type BalanceStatus = 'loading' | 'ready' | 'error' | 'wallet-required';
type RequestStatus = 'idle' | 'quoting' | 'signing' | 'executing';

const EMPTY_BALANCES: DexBalances = { SOL: '0', HKDV: '0', USDC: '0' };
const QUOTE_TOKEN: DexTokenSymbol = SOLANA_NETWORK === 'devnet' || SOLANA_NETWORK === 'mainnet-beta' ? 'HKDV' : 'USDC';

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `dex-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const STATUS_LABELS: Record<DexSwapHistory['status'], string> = {
  quoted: 'Đã báo giá',
  simulated: 'Mô phỏng',
  pending_confirmation: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  failed: 'Thất bại',
  expired: 'Hết hạn',
};

function apiError(error: unknown): string {
  return error instanceof Error ? error.message : 'DEX không thể xử lý yêu cầu lúc này.';
}

export const DexSwapPanel: React.FC<DexSwapPanelProps> = ({ player, onPlayDrum }) => {
  const [fromToken, setFromToken] = useState<DexTokenSymbol>('SOL');
  const [toToken, setToToken] = useState<DexTokenSymbol>(QUOTE_TOKEN);
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(50);
  const [balances, setBalances] = useState<DexBalances>(EMPTY_BALANCES);
  const [dexConfig, setDexConfig] = useState<DexConfig | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>('loading');
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [order, setOrder] = useState<DexOrder | null>(null);
  const [execution, setExecution] = useState<DexExecution | null>(null);
  const [history, setHistory] = useState<DexSwapHistory[]>([]);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [intentKey, setIntentKey] = useState<string | null>(null);
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
    setDexConfig(null);
    setError(null);
    try {
      const config = await apiService.getDexConfig();
      const quoteToken = dexTokens().find((item) => item.symbol !== 'SOL');
      const backendToken = config.tokens.find((item) => item.symbol === quoteToken?.symbol);
      if (config.network !== SOLANA_NETWORK || !quoteToken?.mint || backendToken?.mint !== quoteToken.mint
          || (SOLANA_NETWORK === 'mainnet-beta' && config.provider !== 'jupiter')
          || (SOLANA_NETWORK === 'devnet' && config.provider !== 'raydium')) {
        throw new Error('Cấu hình DEX của frontend và backend không khớp mạng hoặc mint token.');
      }
      if (!config.supports_execution && SOLANA_NETWORK === 'mainnet-beta') {
        throw new Error('DEX Mainnet đang tạm đóng để kiểm tra vận hành.');
      }
      setDexConfig(config);
      setBalances(await loadDexBalances(player.wallet));
      setBalanceStatus('ready');
    } catch (balanceError) {
      setBalanceStatus('error');
      setError(apiError(balanceError));
    }
  };

  const refreshHistory = async () => {
    if (player.is_guest) {
      setHistory([]);
      setHistoryStatus('ready');
      return;
    }
    setHistoryStatus('loading');
    try {
      setHistory(await apiService.getDexHistory());
      setHistoryStatus('ready');
    } catch {
      setHistoryStatus('error');
    }
  };

  useEffect(() => {
    void refreshBalances();
    void refreshHistory();
  }, [player.wallet, player.is_guest]);

  const clearQuote = () => {
    setOrder(null);
    setExecution(null);
    setIntentKey(null);
    setError(null);
  };

  const reversePair = () => {
    onPlayDrum();
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount('');
    clearQuote();
  };

  const requestOrder = async (forceNew = false) => {
    if (amountError || !amount) return;
    onPlayDrum();
    setRequestStatus('quoting');
    setError(null);
    setExecution(null);
    try {
      const key = forceNew || !intentKey ? newIdempotencyKey() : intentKey;
      setIntentKey(key);
      const nextOrder = await apiService.createDexOrder({
        wallet: player.wallet,
        input_symbol: fromToken,
        output_symbol: toToken,
        amount: uiAmountToBaseUnits(amount, from.decimals),
        slippage_bps: slippageBps,
        idempotency_key: key,
      });
      setOrder(nextOrder);
      await refreshHistory();
    } catch (requestError) {
      setOrder(null);
      setError(apiError(requestError));
    } finally {
      setRequestStatus('idle');
    }
  };

  const signAndExecute = async () => {
    if (!order?.executable) return;
    onPlayDrum();
    setError(null);
    setExecution(null);
    try {
      setRequestStatus('signing');
      const unsignedTransaction = order.provider === 'raydium'
        ? await buildRaydiumSwapTransaction(order, player.wallet)
        : order.transaction;
      if (!unsignedTransaction) throw new Error('DEX không trả giao dịch để ký.');
      const signedTransaction = await solanaAdapter.signVersionedTransaction(unsignedTransaction, player.wallet);
      setRequestStatus('executing');
      const result = await apiService.executeDexOrder({
        wallet: player.wallet,
        request_id: order.request_id,
        signed_transaction: signedTransaction,
      });
      setExecution(result);
      if (result.status !== 'Success') setError(result.error || `Giao dịch thất bại với mã ${result.code}.`);
      if (result.status === 'Success') await refreshBalances();
      await refreshHistory();
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
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)_minmax(0,0.9fr)] xl:gap-8">
      <aside className="order-2 min-w-0 space-y-6 lg:order-1" aria-label="Tài sản và phần thưởng">
        <div className="border-t border-imperial-gold/50 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-imperial-gold">Tài sản trong ví</span>
            <button
              type="button"
              onClick={() => void refreshBalances()}
              disabled={balanceStatus === 'loading' || player.is_guest}
              className="flex h-11 w-11 items-center justify-center text-amber-200 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-imperial-gold disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Tải lại số dư"
            >
              <RefreshCw className={`h-4 w-4 ${balanceStatus === 'loading' ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-slate-400" title={player.wallet}>{player.wallet}</p>
          <dl className="mt-5 divide-y divide-imperial-border/70">
            {tokens.map((token) => (
              <div key={token.symbol} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                <dt className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-imperial-border bg-imperial-slate text-xs text-imperial-lightgold">{token.symbol === 'SOL' ? '◎' : 'H'}</span>
                  {token.symbol}
                </dt>
                <dd className="min-w-0 break-all text-right text-sm font-bold tabular-nums text-imperial-lightgold">
                  {balanceStatus === 'ready' ? balances[token.symbol] : balanceStatus === 'loading' ? 'Đang đọc…' : '—'}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">Số dư được đọc trực tiếp từ Solana. {networkLabel} chỉ dùng token của mạng này.</p>
        </div>
        <div className="border-t border-imperial-border pt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-imperial-gold">Thị trường</p>
          <h3 className="mt-2 font-cinzel text-lg font-bold text-imperial-lightgold">{QUOTE_TOKEN} / SOL</h3>
          <p className="mt-1 text-xs text-slate-400">{SOLANA_NETWORK === 'devnet' ? 'Raydium CPMM · Devnet' : SOLANA_NETWORK === 'mainnet-beta' ? 'Jupiter · Mainnet' : 'Mạng thử nghiệm'}</p>
          {dexConfig?.pool_id && (
            <a
              href={`https://explorer.solana.com/address/${dexConfig.pool_id}?cluster=${SOLANA_NETWORK}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs text-imperial-lightgold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-imperial-gold"
            >
              Kiểm tra pool <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <div className="border-t border-imperial-border pt-5">
          <div className="flex items-center gap-2 text-imperial-lightgold"><Coins className="h-4 w-4" /><h3 className="font-cinzel text-base font-bold">Chiến lợi phẩm HKDV</h3></div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">Phần thưởng từ trận đánh và nhiệm vụ có thể dùng tại Khu Giao Thương sau khi được xác nhận.</p>
          <GameTokenCard player={player} />
        </div>
      </aside>

      <section className="order-1 min-w-0 rounded-2xl border border-imperial-gold/40 bg-imperial-lacquer p-5 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)] sm:p-7 lg:order-2" aria-labelledby="dex-swap-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-imperial-border pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-imperial-gold">Giao dịch · 01</p>
            <h3 id="dex-swap-title" className="mt-1 font-cinzel text-xl font-bold text-imperial-lightgold">Đổi SOL ↔ {QUOTE_TOKEN}</h3>
          </div>
          <span className="rounded-full border border-amber-600/40 bg-amber-950/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">{networkLabel}</span>
        </div>
        <div className="mt-6 space-y-4">

          <div className="rounded-xl border border-imperial-border bg-imperial-obsidian/70 p-4 transition-colors focus-within:border-imperial-gold/70">
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
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tabular-nums text-white outline-none placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => {
                  setAmount(maximumSpendable(balances[fromToken], fromToken));
                  clearQuote();
                }}
                disabled={balanceStatus !== 'ready'}
                className="min-h-11 px-2 text-[10px] font-bold uppercase tracking-wide text-imperial-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-imperial-gold disabled:opacity-30"
              >
                Tối đa
              </button>
              <select
                value={fromToken}
                onChange={(event) => {
                  const symbol = event.target.value as DexTokenSymbol;
                  setFromToken(symbol);
                  setToToken(symbol === 'SOL' ? QUOTE_TOKEN : 'SOL');
                  setAmount('');
                  clearQuote();
                }}
                className="min-h-11 rounded-lg border border-imperial-gold/40 bg-imperial-darkred/50 px-3 py-2 text-sm font-bold text-imperial-lightgold focus-visible:outline focus-visible:outline-2 focus-visible:outline-imperial-gold"
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
              className="flex h-11 w-11 items-center justify-center rounded-full border border-imperial-gold/50 bg-imperial-darkred text-imperial-lightgold transition-transform hover:rotate-180 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-imperial-gold motion-reduce:transition-none"
              aria-label="Đảo chiều cặp giao dịch"
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-xl border border-imperial-border bg-imperial-obsidian/50 p-4">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Bạn nhận</span>
              <span className="text-slate-500">{balances[toToken]} {toToken} trong ví</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className={`min-w-0 break-all text-2xl font-semibold tabular-nums ${outputDisplay ? 'text-imperial-lightgold' : 'text-slate-500'}`}>
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
              className="min-h-11 rounded-lg border border-slate-700 bg-black/30 px-3 py-1.5 text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-imperial-gold"
            >
              <option value={10}>0.10%</option>
              <option value={50}>0.50%</option>
              <option value={100}>1.00%</option>
            </select>
          </div>

          {order && (
            <div className={`rounded-xl border p-3 text-[11px] ${order.simulation ? 'border-amber-700/50 bg-amber-950/20' : 'border-emerald-800/50 bg-emerald-950/20'}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                <span className={order.simulation ? 'font-bold text-amber-300' : 'font-bold text-emerald-300'}>
                  {order.simulation ? 'Báo giá mô phỏng' : order.provider === 'raydium' ? 'Raydium HKDV/SOL Devnet' : 'Jupiter HKDV/SOL Mainnet'}
                </span>
                <span className="font-mono text-slate-400" title={order.router}>{order.router.slice(0, 6)}…{order.router.slice(-6)} · {order.mode}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <span>Nhận tối thiểu</span><span className="text-right text-slate-200">{minimumReceived} {toToken}</span>
                <span>{order.provider === 'jupiter' ? 'Phí Jupiter' : 'Phí pool'}</span>
                <span className="text-right text-slate-200">{(order.fee_bps / 100).toFixed(2)}%</span>
                <span>Tác động giá</span>
                <span className="text-right text-slate-200">
                  {order.provider === 'jupiter' && order.price_impact_bps === 0
                    ? 'Chưa có dữ liệu'
                    : `${(order.price_impact_bps / 100).toFixed(2)}%`}
                </span>
                <span>Pool</span>
                <span className="truncate text-right text-slate-200">
                  {order.provider === 'raydium'
                    ? order.router.slice(0, 6) + '...' + order.router.slice(-6)
                    : 'Theo bộ định tuyến'}
                </span>
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
          {error && <p className="text-xs leading-relaxed text-red-300" role="alert">{error}</p>}
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
              onClick={() => void requestOrder(Boolean(order?.simulation))}
              disabled={!canRequestQuote}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-imperial-gold/60 bg-imperial-crimson py-3 text-sm font-bold text-imperial-lightgold transition-colors hover:bg-imperial-darkred focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-imperial-gold disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/70 disabled:text-slate-500"
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
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-900/60 py-3 text-sm font-bold text-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {execution?.status === 'Success' ? 'Đã hoàn tất' : requestStatus === 'signing' ? 'Đang chờ ví ký…' : requestStatus === 'executing' ? 'Đang xác nhận…' : 'Ký và đổi'}
              </button>
              <button
                type="button"
                onClick={() => void requestOrder(true)}
                disabled={busy}
                className="min-h-12 min-w-12 rounded-xl border border-slate-700 px-3 text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-imperial-gold disabled:opacity-40"
                aria-label="Lấy lại báo giá"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      <aside className="order-3 min-w-0 space-y-8 border-t border-imperial-border pt-5 lg:border-t-0 lg:pt-0" aria-label="Trạng thái và lịch sử giao dịch">
        <section className="border-t border-imperial-gold/50 pt-4">
          <div className="flex items-center gap-2 text-imperial-lightgold"><ScrollText className="h-4 w-4" /><h3 className="font-cinzel text-base font-bold">Sổ giao dịch</h3></div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">Báo giá từ pool, ví của bạn ký giao dịch và Solana xác nhận kết quả.</p>
          <ol className="mt-5 space-y-4 text-xs">
            <li className="flex gap-3"><span className="font-bold text-imperial-gold">01</span><span className={order ? 'text-imperial-lightgold' : 'text-slate-400'}>Xem báo giá và mức nhận tối thiểu</span></li>
            <li className="flex gap-3"><span className="font-bold text-imperial-gold">02</span><span className={requestStatus === 'signing' || requestStatus === 'executing' || execution ? 'text-imperial-lightgold' : 'text-slate-400'}>Kiểm tra và ký trong ví Solana</span></li>
            <li className="flex gap-3"><span className="font-bold text-imperial-gold">03</span><span className={execution?.status === 'Success' ? 'text-emerald-300' : 'text-slate-400'}>Xác nhận và đối chiếu trên Explorer</span></li>
          </ol>
        </section>

        <section className="border-t border-imperial-border pt-5" aria-live="polite">
          <div className="flex items-center gap-2 text-imperial-lightgold"><Clock3 className="h-4 w-4" /><h3 className="font-cinzel text-base font-bold">Lệnh gần đây</h3></div>
          {historyStatus === 'loading' ? (
            <p className="mt-4 text-xs text-slate-400">Đang tải lịch sử giao dịch…</p>
          ) : historyStatus === 'error' ? (
            <div className="mt-4 space-y-2 text-xs text-amber-200">
              <p>Chưa tải được lịch sử. Hãy kiểm tra kết nối hoặc thử lại sau.</p>
              <button type="button" onClick={() => void refreshHistory()} className="min-h-11 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-imperial-gold">Thử tải lại</button>
            </div>
          ) : history.length === 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              {player.is_guest ? 'Kết nối ví Solana để xem lịch sử giao dịch.' : 'Chưa có lệnh nào. Bắt đầu bằng cách nhập số SOL hoặc HKDV ở ô giao dịch.'}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-imperial-border/70">
              {history.map((item) => {
                const href = item.signature
                  ? `https://explorer.solana.com/tx/${item.signature}${SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`}`
                  : null;
                return (
                  <li key={item.request_id} className="py-3 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-200">
                        {formatBaseUnits(BigInt(item.in_amount), item.input_decimals, 4)} {item.input_symbol}
                        {' → '}
                        {formatBaseUnits(BigInt(item.out_amount), item.output_decimals, 4)} {item.output_symbol}
                      </span>
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-imperial-lightgold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-imperial-gold">
                          {STATUS_LABELS[item.status]} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className={item.status === 'failed' ? 'text-red-300' : 'text-slate-400'}>{STATUS_LABELS[item.status]}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
};
