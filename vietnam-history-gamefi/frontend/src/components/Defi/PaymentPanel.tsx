import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import type { Player } from '../../types';
import { formatBaseUnits } from '../../services/dexMath';
import { SOLANA_NETWORK, solanaAdapter } from '../../services/solana';
import {
  paymentBalance,
  prepareSolPayment,
  sendSolPayment,
  type PreparedSolPayment,
  type SolPaymentResult,
} from '../../services/solPayment';

interface Props {
  player: Player;
  onPlayDrum: () => void;
}

export const PaymentPanel: React.FC<Props> = ({ player, onPlayDrum }) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<PreparedSolPayment | null>(null);
  const [result, setResult] = useState<SolPaymentResult | null>(null);
  const [busy, setBusy] = useState<'loading' | 'preparing' | 'signing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionInFlight = useRef(false);

  const refreshBalance = async () => {
    if (player.is_guest) { setBalance(null); return; }
    setBusy('loading');
    try {
      setBalance(await paymentBalance(player.wallet));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đọc được số dư SOL.');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => { void refreshBalance(); }, [player.wallet, player.is_guest]);
  useEffect(() => {
    if (player.is_guest) return;
    return solanaAdapter.onWalletChange((wallet) => {
      setPrepared(null);
      if (wallet === player.wallet) void refreshBalance();
      else setError('Ví đã đổi tài khoản hoặc ngắt kết nối. Hãy đăng nhập lại trước khi thanh toán.');
    });
  }, [player.wallet, player.is_guest]);

  const changeForm = (field: 'recipient' | 'amount', value: string) => {
    if (field === 'recipient') setRecipient(value);
    else if (value === '' || /^\d*(?:\.\d*)?$/.test(value)) setAmount(value);
    else return;
    setPrepared(null);
    setResult(null);
    setError(null);
  };

  const review = async () => {
    if (player.is_guest || busy || actionInFlight.current) return;
    actionInFlight.current = true;
    onPlayDrum();
    setBusy('preparing');
    setError(null);
    setResult(null);
    try {
      setPrepared(await prepareSolPayment(player.wallet, recipient, amount));
    } catch (reason) {
      setPrepared(null);
      setError(reason instanceof Error ? reason.message : 'Không kiểm tra được thanh toán.');
    } finally {
      setBusy(null);
      actionInFlight.current = false;
    }
  };

  const send = async () => {
    if (!prepared || busy || actionInFlight.current) return;
    actionInFlight.current = true;
    onPlayDrum();
    setBusy('signing');
    setError(null);
    try {
      const next = await sendSolPayment(prepared);
      setResult(next);
      setPrepared(null);
      if (next.status === 'confirmed') {
        setBalance(await paymentBalance(player.wallet).catch(() => null));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không gửi được thanh toán.');
      setPrepared(null);
    } finally {
      setBusy(null);
      actionInFlight.current = false;
    }
  };

  const explorerUrl = result?.signature
    ? `https://explorer.solana.com/tx/${result.signature}?cluster=${SOLANA_NETWORK}` : null;
  const balanceLabel = balance === null ? 'Chưa đọc được' : `${formatBaseUnits(BigInt(balance), 9, 6)} SOL`;

  return (
    <div className="finance-layout">
      <section className="finance-panel finance-panel-primary" aria-labelledby="payment-title">
        <header className="dex-card-heading">
          <div><span className="dex-eyebrow">Chuyển SOL · Devnet</span><h3 id="payment-title">Thanh toán</h3></div>
        </header>
        <div className="finance-panel-body">
          <div className="finance-field">
            <label htmlFor="payment-recipient">Ví nhận</label>
            <input id="payment-recipient" value={recipient} onChange={(event) => changeForm('recipient', event.target.value)}
              placeholder="Địa chỉ Solana của người nhận" autoComplete="off" spellCheck={false} disabled={Boolean(busy)} />
          </div>
          <div className="finance-field">
            <div className="finance-field-top">
              <label htmlFor="payment-amount">Số SOL gửi</label>
              <span>Số dư: {balanceLabel}</span>
            </div>
            <div className="finance-amount-row">
              <input id="payment-amount" value={amount} onChange={(event) => changeForm('amount', event.target.value)}
                placeholder="0.00" inputMode="decimal" disabled={Boolean(busy)} />
              <button type="button" onClick={() => {
                if (balance === null) return;
                changeForm('amount', formatBaseUnits(BigInt(Math.max(0, balance - 10_000)), 9, 9));
              }} disabled={balance === null || Boolean(busy)}>MAX</button>
              <span className="finance-token"><img src="/solana-token.svg" alt="" /> SOL</span>
            </div>
          </div>
          {prepared && (
            <div className="finance-review" role="group" aria-label="Kiểm tra trước khi ký thanh toán">
              <strong>Kiểm tra trước khi ký</strong>
              <dl>
                <div><dt>Gửi</dt><dd>{formatBaseUnits(prepared.amountLamports, 9, 9)} SOL</dd></div>
                <div><dt>Đến ví</dt><dd className="finance-address">{prepared.recipient}</dd></div>
                <div><dt>Phí mạng ước tính</dt><dd>{formatBaseUnits(BigInt(prepared.feeLamports), 9, 9)} SOL</dd></div>
              </dl>
            </div>
          )}
          {error && <p className="finance-message is-error" role="alert">{error}</p>}
          {result && (
            <div className={`finance-message is-${result.status}`} role="status">
              {result.status === 'confirmed' && <CheckCircle2 size={17} aria-hidden="true" />}
              <span>{result.status === 'confirmed' ? 'Thanh toán đã xác nhận trên Devnet.' : result.message}</span>
              {explorerUrl && <a href={explorerUrl} target="_blank" rel="noreferrer">Xem Explorer <ExternalLink size={14} aria-hidden="true" /></a>}
            </div>
          )}
          {busy && <p className="finance-progress" role="status"><LoaderCircle size={15} className="dex-spin" aria-hidden="true" />
            {busy === 'loading' ? 'Đang đọc số dư…' : busy === 'preparing' ? 'Đang kiểm tra địa chỉ, số dư và phí…' : 'Đang chờ ví ký và xác nhận…'}
          </p>}
          <button type="button" className="dex-primary-action finance-submit" onClick={() => void (prepared ? send() : review())}
            disabled={player.is_guest || Boolean(busy) || !recipient.trim() || !amount.trim() || result?.status === 'pending'}>
            {busy === 'signing' ? <LoaderCircle size={17} className="dex-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
            {prepared ? 'Ký và gửi SOL' : 'Kiểm tra thanh toán'}
          </button>
          {player.is_guest && <p className="finance-note">Kết nối ví Solana trong thanh điều hướng để gửi SOL.</p>}
        </div>
      </section>
      <aside className="finance-panel finance-panel-aside" aria-labelledby="payment-guide-title">
        <header className="dex-card-heading"><div><span className="dex-eyebrow">Trước khi gửi</span><h3 id="payment-guide-title">Xác nhận người nhận</h3></div></header>
        <div className="finance-panel-body">
          <p className="finance-aside-lead">Đối chiếu toàn bộ địa chỉ ví nhận trước khi ký. Giao dịch SOL trên blockchain không thể thu hồi sau khi xác nhận.</p>
          <dl className="finance-facts">
            <div><dt>Mạng</dt><dd>Solana Devnet</dd></div>
            <div><dt>Tài sản</dt><dd>SOL thử</dd></div>
            <div><dt>Ví gửi</dt><dd className="finance-address">{player.is_guest ? 'Chưa kết nối' : player.wallet}</dd></div>
            <div><dt>Phí mạng</dt><dd>{prepared ? `${formatBaseUnits(BigInt(prepared.feeLamports), 9, 9)} SOL` : 'Hiện khi kiểm tra'}</dd></div>
          </dl>
          <button type="button" className="finance-text-button" onClick={() => void refreshBalance()} disabled={player.is_guest || Boolean(busy)}>
            <RefreshCw size={15} aria-hidden="true" /> Cập nhật số dư
          </button>
        </div>
      </aside>
    </div>
  );
};
