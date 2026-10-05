import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  CheckCircle2,
  Clock3,
  Coins,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  WalletCards,
} from 'lucide-react';
import { Player } from '../../types';
import { ApiRequestError, apiService } from '../../services/api';
import { SOLANA_NETWORK, solanaAdapter } from '../../services/solana';
import { signedDexTransactionSignature } from '../../services/dexSignature';
import {
  DexBalances,
  DexTokenSymbol,
  dexTokens,
  estimateDexReserveLamports,
  loadDexBalances,
  maximumSpendable,
  validateSwapAmount,
} from '../../services/dexBalances';
import { formatBaseUnits, uiAmountToBaseUnits } from '../../services/dexMath';
import { buildRaydiumSwapTransaction, isSwapBlockhashValid } from '../../services/raydiumSwap';
import type { DexConfig, DexExecution, DexOrder, DexSwapHistory, QuickSwapIntent } from '../../types/dex';
import { SolRewardCard } from './SolRewardCard';
import './DexSwapPanel.css';

interface DexSwapPanelProps {
  player: Player;
  onPlayDrum: () => void;
  initialSwap?: QuickSwapIntent | null;
}

type BalanceStatus = 'loading' | 'ready' | 'error' | 'wallet-required';
type RequestStatus = 'idle' | 'quoting' | 'preparing' | 'signing' | 'executing';

interface PreparedSwap {
  transaction: string;
  networkFeeLamports: number | null;
  lastValidBlockHeight: number | null;
}

const EMPTY_BALANCES: DexBalances = { SOL: '0', USDC: '0', USDT: '0' };
const QUOTE_TOKEN: DexTokenSymbol = 'USDC';
const STANDARD_SLIPPAGE_BPS = 50;
const HISTORY_PAGE_SIZE = 10;
const HIGH_PRICE_IMPACT_BPS = 300;

function tokenLogo(symbol: DexTokenSymbol): string | null {
  return symbol === 'SOL' ? '/solana-token.svg' : symbol === 'USDC' ? '/usdc-token.svg' : '/usdt-token.svg';
}

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

export const DexSwapPanel: React.FC<DexSwapPanelProps> = ({ player, onPlayDrum, initialSwap }) => {
  const [fromToken, setFromToken] = useState<DexTokenSymbol>(initialSwap?.fromToken ?? 'SOL');
  const [toToken, setToToken] = useState<DexTokenSymbol>(initialSwap?.fromToken && initialSwap.fromToken !== 'SOL' ? 'SOL' : QUOTE_TOKEN);
  const [amount, setAmount] = useState(initialSwap?.amount ?? '');
  const [slippageBps, setSlippageBps] = useState(STANDARD_SLIPPAGE_BPS);
  const [balances, setBalances] = useState<DexBalances>(EMPTY_BALANCES);
  const [dexConfig, setDexConfig] = useState<DexConfig | null>(null);
  const [reserveLamports, setReserveLamports] = useState(10_000_000);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>('loading');
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [order, setOrder] = useState<DexOrder | null>(null);
  const [preparedSwap, setPreparedSwap] = useState<PreparedSwap | null>(null);
  const [acceptHighImpact, setAcceptHighImpact] = useState(false);
  const [signedSignature, setSignedSignature] = useState<string | null>(null);
  const [quoteSecondsLeft, setQuoteSecondsLeft] = useState<number | null>(null);
  const [execution, setExecution] = useState<DexExecution | null>(null);
  const [history, setHistory] = useState<DexSwapHistory[]>([]);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const quoteVersion = useRef(0);
  const quoteAbort = useRef<AbortController | null>(null);
  const historyVersion = useRef(0);

  useEffect(() => () => {
    quoteVersion.current += 1;
    quoteAbort.current?.abort();
  }, []);

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
      const matched = tokens.every((token) => config.tokens.some((backendToken) =>
        backendToken.symbol === token.symbol
        && backendToken.mint === (token.mint || 'So11111111111111111111111111111111111111112')
        && backendToken.decimals === token.decimals));
      if (config.network !== SOLANA_NETWORK || !matched
          || (SOLANA_NETWORK === 'mainnet-beta' && config.provider !== 'jupiter')
          || (SOLANA_NETWORK === 'devnet' && (config.provider !== 'raydium'
            || !config.program_id || !config.pools.USDC || !config.pools.USDT))) {
        throw new Error('Cấu hình DEX của frontend và backend không khớp mạng hoặc mint token.');
      }
      if (!config.supports_execution && SOLANA_NETWORK === 'mainnet-beta') {
        throw new Error('DEX Mainnet đang tạm đóng để kiểm tra vận hành.');
      }
      setDexConfig(config);
      const [nextBalances, nextReserve] = await Promise.all([
        loadDexBalances(player.wallet),
        estimateDexReserveLamports().catch(() => 10_000_000),
      ]);
      setBalances(nextBalances);
      setReserveLamports(nextReserve);
      setBalanceStatus('ready');
    } catch (balanceError) {
      setBalanceStatus('error');
      setError(apiError(balanceError));
    }
  };

  const refreshHistory = async () => {
    const version = ++historyVersion.current;
    setHistoryLoadingMore(false);
    setHistoryError(null);
    if (player.is_guest) {
      setHistory([]);
      setHistoryHasMore(false);
      setHistoryStatus('ready');
      return;
    }
    setHistoryStatus('loading');
    try {
      const firstPage = await apiService.getDexHistory(HISTORY_PAGE_SIZE, 0);
      if (version !== historyVersion.current) return;
      setHistory(firstPage);
      setHistoryHasMore(firstPage.length === HISTORY_PAGE_SIZE);
      setHistoryStatus('ready');
    } catch {
      if (version === historyVersion.current) setHistoryStatus('error');
    }
  };

  const loadMoreHistory = async () => {
    if (!historyHasMore || historyLoadingMore || historyStatus !== 'ready') return;
    const version = historyVersion.current;
    setHistoryLoadingMore(true);
    setHistoryError(null);
    try {
      const nextPage = await apiService.getDexHistory(HISTORY_PAGE_SIZE, history.length);
      if (version !== historyVersion.current) return;
      setHistory((current) => [...current, ...nextPage]);
      setHistoryHasMore(nextPage.length === HISTORY_PAGE_SIZE);
    } catch (historyError) {
      if (version === historyVersion.current) setHistoryError(apiError(historyError));
    } finally {
      if (version === historyVersion.current) setHistoryLoadingMore(false);
    }
  };

  useEffect(() => {
    void refreshBalances();
    void refreshHistory();
  }, [player.wallet, player.is_guest]);

  useEffect(() => {
    if (player.is_guest || historyStatus !== 'ready' || !history.some((item) =>
      item.status === 'pending_confirmation' || (item.status === 'confirmed' && !item.total_output_amount))) return;
    const timer = window.setInterval(() => void refreshHistory(), 10_000);
    return () => window.clearInterval(timer);
  }, [history, historyStatus, player.is_guest]);

  const clearQuote = () => {
    quoteVersion.current += 1;
    quoteAbort.current?.abort();
    quoteAbort.current = null;
    setOrder(null);
    setPreparedSwap(null);
    setAcceptHighImpact(false);
    setSignedSignature(null);
    setExecution(null);
    setError(null);
    setRequestStatus((status) => status === 'quoting' ? 'idle' : status);
  };

  useEffect(() => {
    if (player.is_guest) return;
    return solanaAdapter.onWalletChange((wallet) => {
      if (wallet === player.wallet) {
        void refreshBalances();
        return;
      }
      clearQuote();
      setBalanceStatus('error');
      setError('Ví đã đổi tài khoản hoặc ngắt kết nối. Hãy kết nối lại để tiếp tục swap.');
    });
  }, [player.wallet, player.is_guest]);

  const reversePair = () => {
    onPlayDrum();
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount('');
    clearQuote();
  };

  const requestOrder = async (automatic = false) => {
    if (player.is_guest || balanceStatus !== 'ready' || amountError || !amount) return;
    if (!automatic) onPlayDrum();
    const version = ++quoteVersion.current;
    quoteAbort.current?.abort();
    const controller = new AbortController();
    quoteAbort.current = controller;
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
        idempotency_key: newIdempotencyKey(),
      }, controller.signal);
      if (version !== quoteVersion.current) return;
      setOrder(nextOrder);
      setPreparedSwap(null);
      setAcceptHighImpact(false);
      setSignedSignature(null);
    } catch (requestError) {
      if (controller.signal.aborted || version !== quoteVersion.current) return;
      setOrder(null);
      setError(apiError(requestError));
    } finally {
      if (version === quoteVersion.current) {
        quoteAbort.current = null;
        setRequestStatus('idle');
      }
    }
  };

  useEffect(() => {
    if (player.is_guest || balanceStatus !== 'ready' || !amount || amountError
        || execution?.status === 'Success' || requestStatus === 'preparing'
        || requestStatus === 'signing' || requestStatus === 'executing') return;
    const timer = window.setTimeout(() => void requestOrder(true), 500);
    return () => window.clearTimeout(timer);
  }, [amount, fromToken, toToken, slippageBps, balanceStatus, player.wallet, player.is_guest, quoteRetry, execution?.status]);

  useEffect(() => {
    if (!order?.expires_at) {
      setQuoteSecondsLeft(null);
      return;
    }
    const update = () => {
      const seconds = Math.max(0, Math.ceil(order.expires_at! - Date.now() / 1000));
      setQuoteSecondsLeft(seconds);
      if (seconds === 0 && requestStatus === 'idle') {
        setOrder(null);
        setPreparedSwap(null);
        setQuoteRetry((value) => value + 1);
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [order?.request_id, requestStatus]);

  const prepareSwap = async () => {
    if (!order?.executable || !dexConfig) return;
    if (order.expires_at && Date.now() >= (order.expires_at - 20) * 1000) {
      setOrder(null);
      setError('Báo giá sắp hết hạn. Đang cập nhật báo giá mới.');
      setQuoteRetry((value) => value + 1);
      return;
    }
    if (fromToken === 'SOL' && Number(amount) > Number(maximumSpendable(balances.SOL, 'SOL', reserveLamports))) {
      setError('Hãy giữ lại SOL để trả phí mạng và tạo tài khoản token. Bấm MAX để chọn số lượng phù hợp.');
      return;
    }
    setRequestStatus('preparing');
    setError(null);
    try {
      const next = order.provider === 'raydium'
        ? await buildRaydiumSwapTransaction(order, player.wallet, dexConfig)
        : { transaction: order.transaction || '', networkFeeLamports: null, lastValidBlockHeight: null };
      if (!next.transaction) throw new Error('DEX không trả giao dịch để ký.');
      setPreparedSwap(next);
    } catch (reason) {
      setError(apiError(reason));
    } finally {
      setRequestStatus('idle');
    }
  };

  const signAndExecute = async () => {
    if (!order?.executable || !preparedSwap || (order.price_impact_bps >= HIGH_PRICE_IMPACT_BPS && !acceptHighImpact)) return;
    if (order.expires_at && Date.now() >= order.expires_at * 1000) {
      setOrder(null);
      setError('Báo giá đã hết hạn. Đang cập nhật báo giá mới.');
      setQuoteRetry((value) => value + 1);
      return;
    }
    onPlayDrum();
    setError(null);
    setExecution(null);
    let signed = false;
    let submitted = false;
    try {
      if (!await isSwapBlockhashValid(preparedSwap.lastValidBlockHeight)) {
        setPreparedSwap(null);
        throw new Error('Blockhash đã cũ. Hãy kiểm tra lại giao dịch trước khi ký.');
      }
      setRequestStatus('signing');
      const signedTransaction = await solanaAdapter.signDexTransaction(preparedSwap.transaction, player.wallet);
      signed = true;
      setSignedSignature(signedDexTransactionSignature(signedTransaction));
      if (order.expires_at && Date.now() >= order.expires_at * 1000) {
        throw new Error('Báo giá hết hạn trong lúc ví ký. Giao dịch chưa được gửi; hãy lấy báo giá mới.');
      }
      if (!await isSwapBlockhashValid(preparedSwap.lastValidBlockHeight)) {
        throw new Error('Blockhash hết hạn trong lúc ví ký. Giao dịch chưa được gửi; hãy lấy báo giá mới.');
      }
      setRequestStatus('executing');
      submitted = true;
      const result = await apiService.executeDexOrder({
        wallet: player.wallet,
        request_id: order.request_id,
        signed_transaction: signedTransaction,
      });
      setExecution(result);
      if (result.status !== 'Success') setError(result.error || `Giao dịch thất bại với mã ${result.code}.`);
      if (result.status === 'Success') {
        try {
          setBalances(await loadDexBalances(player.wallet));
        } catch {
          setError('Giao dịch đã xác nhận nhưng chưa tải lại được số dư. Hãy làm mới trang để kiểm tra.');
        }
      } else {
        setOrder(null);
      }
      await refreshHistory();
    } catch (executeError) {
      const rejected = executeError instanceof ApiRequestError && executeError.status === 422;
      if (!submitted || rejected) setSignedSignature(null);
      setError(submitted && !rejected
        ? `${apiError(executeError)} Hãy kiểm tra lịch sử hoặc Explorer trước khi tạo lệnh khác.`
        : apiError(executeError));
      if (signed) {
        setOrder(null);
        setPreparedSwap(null);
        await refreshHistory();
      }
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
  const explorerUrl = execution?.signature || signedSignature
    ? `https://explorer.solana.com/tx/${execution?.signature || signedSignature}${SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`}`
    : null;
  const busy = requestStatus !== 'idle';
  const canRequestQuote = balanceStatus === 'ready' && Boolean(amount) && !amountError && !busy;
  const effectiveRate = order && Number(order.in_amount) > 0
    ? (Number(order.out_amount) / 10 ** order.output_decimals) /
      (Number(order.in_amount) / 10 ** order.input_decimals)
    : null;

  const poolSymbol = fromToken === 'SOL' ? toToken : fromToken;
  const poolAddress = dexConfig?.pools[poolSymbol];
  const rateDisplay = effectiveRate !== null && Number.isFinite(effectiveRate)
    ? `1 ${fromToken} ≈ ${effectiveRate.toLocaleString('vi-VN', { maximumFractionDigits: 6 })} ${toToken}`
    : null;
  const receiveBalance = balanceStatus === 'ready' ? `${balances[toToken]} ${toToken}` : balanceStatus === 'loading' ? 'Đang đọc…' : 'Chưa có dữ liệu';

  return (
    <div className="dex-trading">
      <div className="dex-trading-grid">
        <section className="dex-swap-card" aria-labelledby="dex-swap-title">
          <header className="dex-card-heading">
            <div>
              <span className="dex-eyebrow">Giao dịch token</span>
              <h3 id="dex-swap-title">Swap</h3>
            </div>
          </header>

          <div className="dex-swap-body">
            <div className="dex-token-box">
              <div className="dex-token-meta">
                <label htmlFor="dex-amount">Bạn bán</label>
                <span className="dex-balance-actions">
                  <span>Số dư: {balanceLabel}</span>
                  {!player.is_guest && (
                    <button type="button" onClick={() => void refreshBalances()}
                      disabled={balanceStatus === 'loading' || requestStatus === 'signing' || requestStatus === 'executing'}
                      aria-label="Cập nhật số dư ví" title="Cập nhật số dư ví">
                      <RefreshCw size={14} aria-hidden="true" />
                    </button>
                  )}
                </span>
              </div>
              <input
                id="dex-amount"
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
                className="dex-amount-input"
                disabled={requestStatus === 'signing' || requestStatus === 'executing'}
                aria-invalid={Boolean(amount && amountError)}
                aria-describedby={amount && amountError ? 'dex-amount-error' : undefined}
              />
              {amount && amountError && (
                <span id="dex-amount-error" className="dex-amount-hint" role="status">
                  {amountError.includes('Số dư') ? 'Vượt số dư khả dụng. Chọn MAX để tiếp tục.' : amountError}
                </span>
              )}
              <div className="dex-token-actions">
                <button
                  type="button"
                  onClick={() => {
                    setAmount(maximumSpendable(balances[fromToken], fromToken, reserveLamports));
                    clearQuote();
                  }}
                  disabled={balanceStatus !== 'ready' || requestStatus === 'signing' || requestStatus === 'executing'}
                  className="dex-max-button"
                >
                  MAX
                </button>
                <div className="dex-token-picker">
                  <img src={tokenLogo(fromToken)!} alt="" />
                  <select
                    value={fromToken}
                    disabled={requestStatus === 'signing' || requestStatus === 'executing'}
                    onChange={(event) => {
                      const symbol = event.target.value as DexTokenSymbol;
                      setFromToken(symbol);
                      setToToken(symbol === 'SOL' ? (toToken === 'SOL' ? QUOTE_TOKEN : toToken) : 'SOL');
                      setAmount('');
                      clearQuote();
                    }}
                    aria-label="Token bán"
                  >
                    {tokens.map((token) => <option key={token.symbol} value={token.symbol}>{token.symbol}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="dex-pair-switch-row">
              <button type="button" onClick={reversePair} disabled={requestStatus === 'signing' || requestStatus === 'executing'} className="dex-pair-switch" aria-label="Đảo chiều cặp giao dịch">
                <ArrowDownUp aria-hidden="true" size={19} />
              </button>
            </div>

            <div className="dex-token-box dex-token-box-output">
              <div className="dex-token-meta">
                <span>Bạn nhận</span>
                <span>Số dư: {receiveBalance}</span>
              </div>
              <output className={outputDisplay ? 'dex-output-amount' : 'dex-output-amount is-placeholder'} aria-live="polite">
                {outputDisplay || 'Chưa có báo giá'}
              </output>
              <div className="dex-token-actions dex-token-actions-output">
                {fromToken === 'SOL' ? (
                  <div className="dex-token-picker">
                    <img src={tokenLogo(toToken)!} alt="" />
                    <select
                      value={toToken}
                      disabled={requestStatus === 'signing' || requestStatus === 'executing'}
                      onChange={(event) => { setToToken(event.target.value as DexTokenSymbol); clearQuote(); }}
                      aria-label="Token nhận"
                    >
                      {tokens.filter((token) => token.symbol !== 'SOL').map((token) => <option key={token.symbol} value={token.symbol}>{token.symbol}</option>)}
                    </select>
                  </div>
                ) : (
                  <span className="dex-token-fixed"><img src="/solana-token.svg" alt="" /> SOL</span>
                )}
              </div>
            </div>

            <div className="dex-slippage-row">
              <label htmlFor="dex-slippage">Trượt giá tối đa</label>
              <select
                id="dex-slippage"
                value={slippageBps}
                disabled={requestStatus === 'signing' || requestStatus === 'executing'}
                onChange={(event) => { setSlippageBps(Number(event.target.value)); clearQuote(); }}
              >
                <option value={10}>0,10%</option>
                <option value={STANDARD_SLIPPAGE_BPS}>Tiêu chuẩn · 0,50%</option>
                <option value={100}>1,00%</option>
              </select>
            </div>

            <p className="dex-slippage-help">Mức tiêu chuẩn 0,5% áp dụng cho biến động giá từ lúc lấy báo giá đến khi giao dịch được thực hiện.</p>

            <dl className="dex-quote-details" aria-live="polite">
              <div><dt>Tỷ giá trung bình của lệnh</dt><dd>{rateDisplay ?? 'Lấy báo giá để xem'}</dd></div>
              <div><dt>Nhận tối thiểu</dt><dd>{order ? `${minimumReceived} ${toToken}` : '—'}</dd></div>
              <div><dt>Tác động giá</dt><dd>{order ? order.provider === 'jupiter' && order.price_impact_bps === 0 ? 'Chưa có dữ liệu' : `${(order.price_impact_bps / 100).toFixed(2)}%` : '—'}</dd></div>
              <div><dt>{order?.provider === 'jupiter' ? 'Phí Jupiter' : 'Phí pool'}</dt><dd>{order ? `${(order.fee_bps / 100).toFixed(2)}%` : '—'}</dd></div>
              <div><dt>Phí mạng ước tính</dt><dd>{preparedSwap?.networkFeeLamports !== null && preparedSwap?.networkFeeLamports !== undefined
                ? `${(preparedSwap.networkFeeLamports / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 9 })} SOL`
                : 'Kiểm tra giao dịch để xem'}</dd></div>
            </dl>
            {order && quoteSecondsLeft !== null && <p className="dex-quote-expiry">Báo giá còn {quoteSecondsLeft} giây.</p>}

            {preparedSwap && order && (
              <div className="dex-review" role="group" aria-label="Kiểm tra giao dịch trước khi ký">
                <strong>Kiểm tra trước khi ký</strong>
                <span>Bạn đổi {amount} {fromToken} và nhận tối thiểu {minimumReceived} {toToken}.</span>
                <span>Ví cần SOL để trả phí mạng và tạo tài khoản token nếu chưa có.</span>
                {order.price_impact_bps >= HIGH_PRICE_IMPACT_BPS && (
                  <label className="dex-impact-confirm">
                    <input type="checkbox" checked={acceptHighImpact} onChange={(event) => setAcceptHighImpact(event.target.checked)} />
                    Tôi chấp nhận tác động giá {(order.price_impact_bps / 100).toFixed(2)}%.
                  </label>
                )}
              </div>
            )}

            {order?.simulation && (
              <p className="dex-message is-warning" role="status">Báo giá mô phỏng; chưa thể ký giao dịch.</p>
            )}
            {balanceStatus === 'wallet-required' && (
              <p className="dex-message is-warning" role="status"><WalletCards size={16} aria-hidden="true" />Hãy kết nối ví Solana để lấy báo giá.</p>
            )}
            {error && <p className="dex-message is-error" role="alert">{error}</p>}
            {error && signedSignature && explorerUrl && (
              <a href={explorerUrl} target="_blank" rel="noreferrer" className="dex-signed-link">
                Kiểm tra chữ ký {signedSignature.slice(0, 6)}…{signedSignature.slice(-6)} trên Explorer <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
            {execution?.status === 'Success' && execution.signature && (
              <div className="dex-message is-success" role="status">
                <CheckCircle2 size={17} aria-hidden="true" />
                <span>Giao dịch đã xác nhận.</span>
                <a href={explorerUrl || '#'} target="_blank" rel="noreferrer">Explorer <ExternalLink size={14} aria-hidden="true" /></a>
              </div>
            )}
            {requestStatus !== 'idle' && (
              <p className="dex-operation-status" role="status" aria-live="polite">
                <LoaderCircle size={15} className="dex-spin" aria-hidden="true" />
                {requestStatus === 'quoting' ? 'Đang lấy báo giá…' : requestStatus === 'preparing' ? 'Đang kiểm tra phí và mô phỏng giao dịch…' : requestStatus === 'signing' ? 'Đang chờ xác nhận trong ví…' : 'Đang gửi và xác nhận giao dịch…'}
              </p>
            )}

            {!order || order.simulation ? error && canRequestQuote && (
              <button
                type="button"
                onClick={() => void requestOrder()}
                disabled={!canRequestQuote}
                className="dex-primary-action"
              >
                Thử lại báo giá
              </button>
            ) : (
              <div className="dex-action-row">
                <button
                  type="button"
                  onClick={() => void (preparedSwap ? signAndExecute() : prepareSwap())}
                  disabled={busy || !order.executable || execution?.status === 'Success'
                    || Boolean(preparedSwap && order.price_impact_bps >= HIGH_PRICE_IMPACT_BPS && !acceptHighImpact)}
                  className="dex-primary-action"
                >
                  {busy && <LoaderCircle size={18} className="dex-spin" aria-hidden="true" />}
                  {execution?.status === 'Success' ? 'Đã hoàn tất' : requestStatus === 'signing' ? 'Đang chờ ví ký…' : requestStatus === 'executing' ? 'Đang xác nhận…' : preparedSwap ? 'Ký và đổi' : 'Kiểm tra giao dịch'}
                </button>
                <button type="button" onClick={() => void requestOrder()} disabled={busy} className="dex-refresh-quote" aria-label="Lấy lại báo giá" title="Lấy lại báo giá">
                  <RefreshCw size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="dex-market-card" aria-labelledby="dex-market-title">
          <header className="dex-card-heading">
            <div>
              <h3 id="dex-market-title">Thị trường</h3>
            </div>
          </header>
          <div className="dex-market-pair">
            <div className="dex-pair-logos">
              <img src={tokenLogo(fromToken)!} alt="" />
              <img src={tokenLogo(toToken)!} alt="" />
            </div>
            <div>
              <strong>{fromToken} / {toToken}</strong>
              <span>{SOLANA_NETWORK === 'devnet' ? 'Solana Devnet' : 'Solana Mainnet'}</span>
            </div>
          </div>
          <div className="dex-market-rate">
            <span>Tỷ giá swap</span>
            <strong>{rateDisplay ?? 'Chưa có báo giá'}</strong>
          </div>
          <dl className="dex-market-facts">
            <div><dt>Định tuyến</dt><dd>{SOLANA_NETWORK === 'devnet' ? 'Raydium CPMM' : 'Jupiter'}</dd></div>
            <div><dt>Mạng</dt><dd>{networkLabel}</dd></div>
            <div><dt>Phí pool</dt><dd>{order ? `${(order.fee_bps / 100).toFixed(2)}%` : 'Theo báo giá'}</dd></div>
          </dl>
          {poolAddress && (
            <a className="dex-market-link" href={`https://explorer.solana.com/address/${poolAddress}?cluster=${SOLANA_NETWORK}`} target="_blank" rel="noreferrer">
              Kiểm tra pool trên Explorer <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
        </aside>
      </div>

      <section className="dex-history-card" aria-labelledby="dex-history-title">
        <header className="dex-history-heading">
          <div>
            <span className="dex-eyebrow">Hoạt động của ví</span>
            <h3 id="dex-history-title"><Clock3 size={19} aria-hidden="true" />Giao dịch gần đây</h3>
          </div>
          <div className="dex-history-tools">
            <span>Giao dịch qua DEX này</span>
            {!player.is_guest && (
              <button type="button" onClick={() => void refreshHistory()} disabled={historyStatus === 'loading'}
                aria-label="Cập nhật lịch sử giao dịch" title="Cập nhật lịch sử giao dịch">
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </header>
        {historyStatus === 'loading' ? (
          <p className="dex-history-empty">Đang tải lịch sử giao dịch…</p>
        ) : historyStatus === 'error' ? (
          <div className="dex-history-empty is-error">
            <span>Chưa tải được lịch sử. Hãy kiểm tra kết nối rồi thử lại.</span>
            <button type="button" onClick={() => void refreshHistory()}>Thử tải lại</button>
          </div>
        ) : history.length === 0 ? (
          <p className="dex-history-empty">{player.is_guest ? 'Kết nối ví Solana để xem lịch sử giao dịch.' : 'Chưa có giao dịch nào được gửi từ ví này.'}</p>
        ) : (
          <ul className="dex-history-list">
            {history.map((item) => {
              const href = item.signature && !item.error?.startsWith('RPC từ chối giao dịch:')
                ? `https://explorer.solana.com/tx/${item.signature}${SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`}`
                : null;
              return (
                <li key={item.request_id}>
                  <span className="dex-history-pair">
                    {formatBaseUnits(BigInt(item.total_input_amount || item.in_amount), item.input_decimals, 4)} {item.input_symbol}
                    {item.status === 'failed'
                      ? ' → giao dịch không hoàn tất'
                      : ` → ${item.total_output_amount ? '' : '≈ '}${formatBaseUnits(BigInt(item.total_output_amount || item.out_amount), item.output_decimals, 4)} ${item.output_symbol}`}
                    {typeof item.network_fee_lamports === 'number' && (
                      <small className="dex-history-fee">Phí mạng: {(item.network_fee_lamports / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 9 })} SOL</small>
                    )}
                  </span>
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('vi-VN')}</time>
                  <span className={`dex-history-status is-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                  {href && <a href={href} target="_blank" rel="noreferrer" className="dex-history-link">Explorer <ExternalLink size={14} aria-hidden="true" /></a>}
                  {item.status === 'failed' && item.error && <small className="dex-history-error">{item.error}</small>}
                </li>
              );
            })}
          </ul>
        )}
        {historyStatus === 'ready' && historyHasMore && (
          <button type="button" className="dex-history-more" onClick={() => void loadMoreHistory()} disabled={historyLoadingMore}>
            {historyLoadingMore ? 'Đang tải…' : 'Xem thêm giao dịch'}
          </button>
        )}
        {historyError && <p className="dex-history-page-error" role="alert">{historyError}</p>}
      </section>

      <section className="dex-reward-section" aria-labelledby="dex-reward-title">
        <div className="dex-reward-heading">
          <Coins size={19} aria-hidden="true" />
          <div>
            <h3 id="dex-reward-title">Phần thưởng SOL</h3>
            <p>Thưởng từ trận đánh và nhiệm vụ sau khi được xác nhận.</p>
          </div>
        </div>
        <SolRewardCard player={player} />
      </section>
    </div>
  );
};
