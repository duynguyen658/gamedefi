import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { DefiModule, Player } from '../../types';
import { formatBaseUnits } from '../../services/dexMath';
import {
  FINANCE_PROGRAM_ID, loadFinanceSnapshot, prepareFinanceAction, sendFinanceAction,
  type FinanceAction, type FinanceLoan, type FinanceProposal, type FinanceSnapshot,
  type PreparedFinanceAction,
} from '../../services/financeHub';
import { SOLANA_NETWORK, solanaAdapter } from '../../services/solana';

type Module = Exclude<DefiModule, 'dex' | 'payments'>;
interface Props { module: Module; player: Player; onPlayDrum: () => void }
const sol = (value: bigint) => `${formatBaseUnits(value, 9, 9)} SOL`;
const time = (value: number) => new Date(value * 1000).toLocaleString('vi-VN');
const explorer = (kind: 'address' | 'tx', value: string) =>
  `https://explorer.solana.com/${kind}/${value}?cluster=${SOLANA_NETWORK}`;
const TERMS = [
  { value: 60, label: '1 phút · thử Devnet' },
  { value: 7 * 86400, label: '7 ngày' },
  { value: 30 * 86400, label: '30 ngày' },
];
const VOTING_TERMS = [
  { value: 60, label: '1 phút · thử Devnet' },
  { value: 86400, label: '1 ngày' },
  { value: 7 * 86400, label: '7 ngày' },
];

function actionDetail(action: FinanceAction): string {
  switch (action.kind) {
    case 'open_saving': return `${action.amount} SOL · mở khóa sau ${action.termSeconds} giây · APY 0%`;
    case 'withdraw_saving': return 'Rút toàn bộ SOL khỏi két đã hết kỳ hạn.';
    case 'create_loan': return `Cho ${action.borrower} vay ${action.amount} SOL, lãi cố định ${action.interest} SOL, hạn ${action.termSeconds} giây. Không có thế chấp.`;
    case 'cancel_loan': return `Hoàn lại ${sol(action.loan.principal)} trước khi bên vay nhận tiền.`;
    case 'draw_loan': return `Nhận ${sol(action.loan.principal)}; nghĩa vụ trả ${sol(action.loan.principal + action.loan.interest)}.`;
    case 'repay_loan': return `Trả ${sol(action.loan.principal + action.loan.interest)} cho khoản vay.`;
    case 'claim_repayment': return `Nhận lại ${sol(action.loan.principal + action.loan.interest)} đã được hoàn trả.`;
    case 'initialize_treasury': return 'Khởi tạo ngân khố công khai trên Devnet; quyền chi thuộc DAO.';
    case 'deposit_treasury': return `Nạp ${action.amount} SOL vào ngân khố DAO.`;
    case 'stake_sol': return `Khóa ${action.amount} SOL làm quyền bỏ phiếu.`;
    case 'unstake_sol': return `Rút ${action.amount} SOL khi mọi phiếu đã hết thời hạn khóa.`;
    case 'create_proposal': return `Đề xuất chi ${action.amount} SOL đến ${action.recipient}; bỏ phiếu trong ${action.votingSeconds} giây.`;
    case 'cast_vote': return `${action.approve ? 'Đồng ý' : 'Không đồng ý'} đề xuất ${action.proposal.address} bằng toàn bộ SOL đang khóa.`;
    case 'execute_proposal': return `Chuyển ${sol(action.proposal.amount)} đến ${action.proposal.recipient} sau khi đề xuất thông qua.`;
  }
}

export const FinanceLivePanel: React.FC<Props> = ({ module, player, onPlayDrum }) => {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<{ value: string; pending: boolean } | null>(null);
  const [prepared, setPrepared] = useState<{ action: FinanceAction; transaction: PreparedFinanceAction } | null>(null);
  const [amount, setAmount] = useState('');
  const [interest, setInterest] = useState('');
  const [recipient, setRecipient] = useState('');
  const [termSeconds, setTermSeconds] = useState(TERMS[0].value);
  const [votingSeconds, setVotingSeconds] = useState(VOTING_TERMS[0].value);
  const inFlight = useRef(false);

  const refresh = async () => {
    if (player.is_guest) return;
    setBusy(true);
    try {
      const next = await loadFinanceSnapshot(player.wallet);
      setSnapshot(next);
      setError(null);
    } catch (reason) {
      setSnapshot(null);
      setPrepared(null);
      setError(reason instanceof Error ? reason.message : 'Không đọc được dữ liệu Devnet.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void refresh(); }, [player.wallet, player.is_guest, module]);
  useEffect(() => { setPrepared(null); setSignature(null); }, [module]);
  useEffect(() => {
    if (player.is_guest) return;
    return solanaAdapter.onWalletChange((wallet) => {
      setPrepared(null);
      if (wallet === player.wallet) void refresh();
      else setError('Ví đã đổi hoặc ngắt kết nối. Hãy đăng nhập lại.');
    });
  }, [player.wallet, player.is_guest]);

  const edit = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPrepared(null);
    setSignature(null);
    setError(null);
  };
  const begin = async (action: FinanceAction) => {
    if (busy || inFlight.current || player.is_guest || !snapshot?.deployed) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSignature(null);
    onPlayDrum();
    try {
      const transaction = await prepareFinanceAction(action, player.wallet);
      setPrepared({ action, transaction });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không chuẩn bị được giao dịch.');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };
  const sign = async () => {
    if (!prepared || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    onPlayDrum();
    try {
      const tx = await sendFinanceAction(prepared.transaction);
      setSignature({ value: tx.signature, pending: tx.status === 'pending' });
      setPrepared(null);
      if (tx.status === 'confirmed') setSnapshot(await loadFinanceSnapshot(player.wallet));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Giao dịch không thành công.');
      setPrepared(null);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };
  const button = (label: string, action: FinanceAction, disabled = false) =>
    <button type="button" className="finance-action-button" onClick={() => void begin(action)}
      disabled={busy || Boolean(prepared) || disabled || !snapshot?.deployed || player.is_guest}>{label}</button>;
  const field = (label: string, value: string, setter: (value: string) => void, placeholder: string, numeric = false) =>
    <div className="finance-field"><label>{label}
      <input value={value} onChange={(event) => edit(setter, event.target.value)}
        placeholder={placeholder} inputMode={numeric ? 'decimal' : 'text'} autoComplete="off"
        spellCheck={false} disabled={busy || Boolean(prepared)} />
    </label></div>;
  const termField = (label: string, value: number, setter: (value: number) => void, options = TERMS) =>
    <div className="finance-field"><label>{label}
      <select value={value} onChange={(event) => { setter(Number(event.target.value)); setPrepared(null); }}
        disabled={busy || Boolean(prepared)}>{options.map((option) =>
          <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    </label></div>;

  const saving = snapshot?.saving;
  const treasury = snapshot?.treasury;
  const stake = snapshot?.stake;
  const loans = snapshot?.loans ?? [];
  const proposals = snapshot?.proposals ?? [];
  const now = snapshot?.chainNow ?? 0;
  const headings: Record<Module, [string, string]> = {
    savings: ['Két SOL · Devnet', 'Tiết kiệm'],
    lending: ['Khoản vay ngang hàng · Devnet', 'Lending'],
    treasury: ['Ngân khố DAO · Devnet', 'Treasury'],
    dao: ['SOL khóa · Devnet', 'DAO tooling'],
  };
  const [eyebrow, heading] = headings[module];
  const loanRow = (loan: FinanceLoan) => {
    const isLender = loan.lender === player.wallet;
    const due = loan.dueAt ? time(loan.dueAt) : 'Tính khi người vay rút';
    return <article className="finance-item" key={loan.address}>
      <div className="finance-item-heading"><strong>{isLender ? 'Bạn cho vay' : 'Bạn đi vay'} · {sol(loan.principal)}</strong>
        <a href={explorer('address', loan.address)} target="_blank" rel="noreferrer">Explorer <ExternalLink size={13} /></a></div>
      <p>{loan.status === 0 ? 'Đã ký quỹ · chờ bên vay nhận' : loan.status === 1 ? (now > loan.dueAt ? 'Đã quá hạn · chưa trả' : 'Đang vay') : 'Đã hoàn trả · chờ người cho vay nhận'}</p>
      <dl className="finance-facts">
        <div><dt>Người cho vay</dt><dd className="finance-address">{loan.lender}</dd></div>
        <div><dt>Người vay</dt><dd className="finance-address">{loan.borrower}</dd></div>
        <div><dt>Lãi cố định</dt><dd>{sol(loan.interest)}</dd></div>
        <div><dt>Hạn trả</dt><dd>{due}</dd></div>
      </dl>
      <div className="finance-actions">
        {isLender && loan.status === 0 && button('Hủy và nhận lại SOL', { kind: 'cancel_loan', loan })}
        {!isLender && loan.status === 0 && button('Nhận SOL vay', { kind: 'draw_loan', loan })}
        {!isLender && loan.status === 1 && button('Trả gốc + lãi', { kind: 'repay_loan', loan })}
        {isLender && loan.status === 2 && button('Nhận tiền hoàn trả', { kind: 'claim_repayment', loan })}
      </div>
    </article>;
  };
  const proposalRow = (proposal: FinanceProposal) =>
    <article className="finance-item" key={proposal.address}>
      <div className="finance-item-heading"><strong>Chi {sol(proposal.amount)}</strong>
        <a href={explorer('address', proposal.address)} target="_blank" rel="noreferrer">Explorer <ExternalLink size={13} /></a></div>
      <p className="finance-address">Đến {proposal.recipient}</p>
      <dl className="finance-facts">
        <div><dt>Kết thúc</dt><dd>{time(proposal.endsAt)}</dd></div>
        <div><dt>Đồng ý / Phản đối</dt><dd>{sol(proposal.yesVotes)} / {sol(proposal.noVotes)}</dd></div>
        <div><dt>Quorum</dt><dd>{sol(proposal.quorum)}</dd></div>
        <div><dt>Trạng thái</dt><dd>{proposal.executed ? 'Đã chi' : now < proposal.endsAt ? 'Đang bỏ phiếu' : 'Đã đóng phiếu'}</dd></div>
        {proposal.voted && <div><dt>Phiếu của bạn</dt><dd>Đã ghi nhận</dd></div>}
      </dl>
      {module === 'dao' && !proposal.executed && <div className="finance-actions">
        {now < proposal.endsAt && !proposal.voted && <>
          {button('Đồng ý', { kind: 'cast_vote', proposal, approve: true }, !stake?.amount)}
          {button('Phản đối', { kind: 'cast_vote', proposal, approve: false }, !stake?.amount)}
        </>}
        {now >= proposal.endsAt && proposal.yesVotes >= proposal.quorum && proposal.yesVotes > proposal.noVotes &&
          button('Thực hiện chi', { kind: 'execute_proposal', proposal })}
      </div>}
    </article>;

  return <div className="finance-layout">
    <section className="finance-panel finance-panel-primary" aria-labelledby="finance-live-title">
      <header className="dex-card-heading"><div><span className="dex-eyebrow">{eyebrow}</span>
        <h3 id="finance-live-title">{heading}</h3></div></header>
      <div className="finance-panel-body">
        {player.is_guest && <p className="finance-message">Kết nối ví Solana để xem dữ liệu và giao dịch.</p>}
        {snapshot && !snapshot.deployed && <div className="finance-empty">
          <strong>Chương trình chưa có trên Devnet</strong>
          <span>Mã chương trình đã sẵn sàng; cần build và triển khai trước khi có thể ký giao dịch.</span>
        </div>}
        {snapshot?.deployed && module === 'savings' && <>
          {saving ? <article className="finance-item">
            <strong>Khoản đang khóa: {sol(saving.principal)}</strong>
            <p>Mở khóa: {time(saving.unlockAt)} · APY 0%</p>
            {button('Rút SOL', { kind: 'withdraw_saving' }, now < saving.unlockAt)}
            {now < saving.unlockAt && <p>Sau khi đến hạn, bấm “Cập nhật dữ liệu” để mở nút rút.</p>}
          </article> : <>
            {field('Số SOL muốn khóa', amount, setAmount, '0.1', true)}
            {termField('Kỳ hạn', termSeconds, setTermSeconds)}
            <p className="finance-note">Lãi suất 0%. Không thể rút trước thời điểm mở khóa ghi trên chuỗi.</p>
            {button('Kiểm tra khoản gửi', { kind: 'open_saving', amount, termSeconds }, !amount)}
          </>}
        </>}
        {snapshot?.deployed && module === 'lending' && <>
          {field('Ví người vay', recipient, setRecipient, 'Địa chỉ Solana')}
          {field('Số SOL cho vay', amount, setAmount, '0.1', true)}
          {field('Lãi cố định (SOL)', interest, setInterest, '0.01', true)}
          {termField('Thời hạn sau khi nhận tiền', termSeconds, setTermSeconds)}
          <p className="finance-note">Khoản vay không thế chấp. Nếu người vay không trả, chương trình không thể hoàn lại SOL cho người cho vay.</p>
          {button('Kiểm tra khoản cho vay', { kind: 'create_loan', borrower: recipient, amount, interest, termSeconds },
            !recipient || !amount || !interest)}
          <h4 className="finance-subheading">Khoản vay của ví</h4>
          {loans.length ? loans.map(loanRow) : <p className="finance-note">Chưa có khoản vay.</p>}
        </>}
        {snapshot?.deployed && module === 'treasury' && <>
          {!treasury ? <>
            <p className="finance-note">Ngân khố chưa được tạo trên Devnet.</p>
            {button('Khởi tạo ngân khố', { kind: 'initialize_treasury' })}
          </> : <>
            <div className="finance-highlight"><span>Số dư có thể đề xuất chi</span>
              <strong>{sol(treasury.available)}</strong></div>
            {field('Nạp SOL vào ngân khố', amount, setAmount, '0.1', true)}
            {button('Kiểm tra khoản nạp', { kind: 'deposit_treasury', amount }, !amount)}
            <h4 className="finance-subheading">Đề xuất chi</h4>
            {proposals.length ? proposals.map(proposalRow) : <p className="finance-note">Chưa có đề xuất.</p>}
          </>}
        </>}
        {snapshot?.deployed && module === 'dao' && <>
          {!treasury ? <p className="finance-note">Hãy khởi tạo ngân khố trong mục Treasury trước.</p> : <>
            <div className="finance-highlight"><span>SOL đã khóa để bỏ phiếu</span>
              <strong>{sol(stake?.amount ?? 0n)}</strong></div>
            <p className="finance-note">Sau khi bỏ phiếu, SOL bị khóa đến lúc đề xuất kết thúc. Quorum của mỗi đề xuất là 20% tổng SOL khóa khi tạo.</p>
            {stake && now < stake.lockedUntil && <p className="finance-note">Mở khóa theo đồng hồ Solana: {time(stake.lockedUntil)}. Bấm “Cập nhật dữ liệu” sau thời điểm này.</p>}
            {field('Số SOL khóa / rút', amount, setAmount, '0.1', true)}
            <div className="finance-actions">
              {button('Khóa SOL', { kind: 'stake_sol', amount }, !amount)}
              {button('Rút SOL', { kind: 'unstake_sol', amount }, !amount || !stake?.amount || now < stake.lockedUntil)}
            </div>
            <h4 className="finance-subheading">Đề xuất chi từ ngân khố</h4>
            {field('Ví nhận SOL', recipient, setRecipient, 'Địa chỉ Solana')}
            {field('Số SOL đề xuất chi', amount, setAmount, '0.1', true)}
            {termField('Thời gian bỏ phiếu', votingSeconds, setVotingSeconds, VOTING_TERMS)}
            {button('Kiểm tra đề xuất', { kind: 'create_proposal', recipient, amount, votingSeconds },
              !recipient || !amount || !stake?.amount)}
            <h4 className="finance-subheading">Đề xuất đang và đã bỏ phiếu</h4>
            {proposals.length ? proposals.map(proposalRow) : <p className="finance-note">Chưa có đề xuất.</p>}
          </>}
        </>}
        {prepared && <div className="finance-review" role="group" aria-label="Kiểm tra giao dịch">
          <strong>{prepared.transaction.label}</strong>
          <p>{actionDetail(prepared.action)}</p>
          <dl>
            <div><dt>Mạng</dt><dd>Solana Devnet</dd></div>
            <div><dt>Phí mạng ước tính</dt><dd>{sol(BigInt(prepared.transaction.feeLamports))}</dd></div>
          </dl>
          <div className="finance-actions">
            <button type="button" className="dex-primary-action finance-submit" onClick={() => void sign()} disabled={busy}>Ký giao dịch</button>
            <button type="button" className="finance-action-button" onClick={() => setPrepared(null)} disabled={busy}>Hủy</button>
          </div>
        </div>}
        {busy && <p className="finance-progress" role="status"><LoaderCircle size={15} className="dex-spin" /> Đang kiểm tra Devnet…</p>}
        {error && <p className="finance-message is-error" role="alert">{error}</p>}
        {signature && <p className={`finance-message is-${signature.pending ? 'pending' : 'confirmed'}`} role="status">
          {signature.pending ? 'Đã gửi hoặc trạng thái chưa rõ; kiểm tra Explorer trước khi thử lại.' : 'Giao dịch đã xác nhận.'}
          <a href={explorer('tx', signature.value)} target="_blank" rel="noreferrer">Xem Explorer <ExternalLink size={14} /></a></p>}
      </div>
    </section>
    <aside className="finance-panel finance-panel-aside" aria-labelledby="finance-live-info">
      <header className="dex-card-heading"><div><span className="dex-eyebrow">Dữ liệu trên chuỗi</span>
        <h3 id="finance-live-info">Thông tin Devnet</h3></div></header>
      <div className="finance-panel-body">
        <dl className="finance-facts">
          <div><dt>Chương trình</dt><dd>{!snapshot ? 'Chưa kiểm tra' : snapshot.deployed ? 'Đã triển khai' : 'Chưa triển khai'}</dd></div>
          <div><dt>Đồng hồ Solana</dt><dd>{snapshot ? time(snapshot.chainNow) : 'Chưa đọc'}</dd></div>
          <div><dt>Ví</dt><dd className="finance-address">{player.is_guest ? 'Chưa kết nối' : player.wallet}</dd></div>
          <div><dt>Số dư ví</dt><dd>{snapshot ? sol(BigInt(snapshot.balance)) : 'Đang đọc…'}</dd></div>
          <div><dt>Ngân khố</dt><dd>{treasury ? sol(treasury.available) : 'Chưa tạo'}</dd></div>
          <div><dt>Tổng SOL bỏ phiếu</dt><dd>{treasury ? sol(treasury.totalStaked) : '—'}</dd></div>
        </dl>
        <a className="finance-text-button" href={explorer('address', FINANCE_PROGRAM_ID.toBase58())}
          target="_blank" rel="noreferrer">Xem chương trình <ExternalLink size={14} /></a>
        <button type="button" className="finance-text-button" onClick={() => void refresh()} disabled={busy || player.is_guest}>
          <RefreshCw size={15} /> Cập nhật dữ liệu</button>
      </div>
    </aside>
  </div>;
};
