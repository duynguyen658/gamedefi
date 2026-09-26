import React, { useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Landmark,
  PiggyBank,
  Scale,
  Send,
  ShieldCheck,
  Vote,
  Wallet,
  ChevronLeft,
  Eye,
  Lock,
} from 'lucide-react';
import { DefiModule, Player } from '../../types';
import {
  DAO_PROPOSALS,
  DEFI_MODULES,
  LENDING_MARKETS,
  PAYMENT_HISTORY,
  SAVINGS_VAULTS,
  TREASURY_FLOWS,
} from '../../data/defi';
import { DexSwapPanel } from './DexSwapPanel';
import { GameTokenCard } from './GameTokenCard';

interface DefiHubProps {
  player: Player;
  onBack: () => void;
  onPlayDrum: () => void;
}

const MODULE_ICONS: Record<DefiModule, React.ReactNode> = {
  payments: <Send className="w-5 h-5" />,
  savings: <PiggyBank className="w-5 h-5" />,
  lending: <Scale className="w-5 h-5" />,
  dex: <ArrowLeftRight className="w-5 h-5" />,
  treasury: <Landmark className="w-5 h-5" />,
  dao: <Vote className="w-5 h-5" />,
};
const NAV_MODULES = [
  ...DEFI_MODULES.filter((item) => item.id === 'dex'),
  ...DEFI_MODULES.filter((item) => item.id !== 'dex'),
];

export const DefiHub: React.FC<DefiHubProps> = ({ player, onBack, onPlayDrum }) => {
  const [module, setModule] = useState<DefiModule>('dex');
  const [payAmount, setPayAmount] = useState('5.00');
  const [payTo, setPayTo] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const active = DEFI_MODULES.find((m) => m.id === module)!;
  const shortWallet = `${player.wallet.substring(0, 6)}…${player.wallet.substring(player.wallet.length - 4)}`;

  const showPreviewNotice = (label: string) => {
    onPlayDrum();
    setNotice(`${label}: tính năng này chưa triển khai. Không có giao dịch hoặc chữ ký ví nào được tạo.`);
  };

  return (
    <div className="app-screen mx-auto w-full max-w-[1480px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="dex-screen-hero flex flex-col gap-5 border border-imperial-border p-5 pb-7 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <button
            onClick={() => { onPlayDrum(); onBack(); }}
            className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-imperial-lightgold mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Về tổng hành dinh</span>
          </button>
          <div className="mb-3 inline-flex items-center space-x-2 border border-imperial-gold/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-imperial-gold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Hào Khí Đại Việt · Khu Giao Thương</span>
          </div>
          <h2 className="font-display text-3xl font-black text-imperial-lightgold sm:text-4xl">
            {module === 'dex' ? 'DEX HKDV / SOL' : 'Kinh Tế On-Chain'}
          </h2>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-slate-300">
            {module === 'dex'
              ? 'Đổi SOL và HKDV bằng ví Solana của bạn. Xem rõ tỷ giá, phí và số nhận tối thiểu trước khi ký.'
              : 'Các tiện ích kinh tế trong game. Các module ngoài DEX hiện là bản minh họa và chưa gửi giao dịch.'}
          </p>
        </div>
        <div className="min-w-0 border-t border-imperial-gold/50 pt-3 text-xs sm:min-w-[220px] sm:border-t-0 sm:border-l sm:pl-5 sm:pt-0">
          <div className="text-slate-400 uppercase tracking-wider text-[10px] mb-1">Ví đang dùng</div>
          <div className="font-mono text-imperial-lightgold">{player.is_guest ? 'Chưa kết nối ví' : shortWallet}</div>
          <div className="text-slate-400 mt-1 uppercase">{player.chain} • khóa người chơi ở trong ví</div>
        </div>
      </div>

      <nav className="dex-module-nav mb-8 mt-5 flex gap-2 overflow-x-auto" aria-label="Các khu vực kinh tế">
        {NAV_MODULES.map((m) => {
          const selected = module === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => { onPlayDrum(); setModule(m.id); setNotice(null); }}
              aria-current={selected ? 'page' : undefined}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-imperial-gold ${
                selected
                  ? 'border-imperial-gold bg-imperial-darkred text-imperial-lightgold'
                  : 'border-imperial-border bg-imperial-lacquer/70 text-slate-300 hover:border-imperial-gold/50'
              }`}
            >
              {MODULE_ICONS[m.id]}
              <span>{m.title}</span>
            </button>
          );
        })}
      </nav>

      <div className={module === 'dex' ? 'min-w-0' : 'grid grid-cols-1 gap-6 lg:grid-cols-5'}>
        {module !== 'dex' && (
          <div className="lg:col-span-2 bg-imperial-lacquer/90 border border-imperial-gold/50 rounded-2xl p-6">
            <h3 className="font-display text-lg font-bold text-white mb-1">{active.title}</h3>
            <p className="text-sm text-slate-300 mb-4">{active.tagline}</p>
            <div className="flex items-start space-x-2 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-700/40 rounded-xl p-3">
              <Eye className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{active.principle}</span>
            </div>
            <ul className="mt-5 space-y-2 text-xs text-slate-400">
              <li className="flex items-center space-x-2"><Lock className="w-3.5 h-3.5 text-imperial-gold" /><span>Ví ký DEX; service signer riêng chỉ được phát reward từ vault.</span></li>
              <li className="flex items-center space-x-2"><ShieldCheck className="w-3.5 h-3.5 text-imperial-gold" /><span>Trạng thái đọc được trước khi xác nhận.</span></li>
              <li className="flex items-center space-x-2"><Wallet className="w-3.5 h-3.5 text-imperial-gold" /><span>Ngôn ngữ tiếng Việt, số liệu đơn giản, phí hiển thị trước.</span></li>
            </ul>
            <GameTokenCard player={player} />
          </div>
        )}

        <div className={module === 'dex' ? 'min-w-0' : 'lg:col-span-3 rounded-2xl border border-imperial-border bg-imperial-lacquer/90 p-6'}>
          {module !== 'dex' && (
            <p className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              Bản minh họa: số liệu bên dưới là dữ liệu mẫu, chưa phản ánh tài sản hay giao dịch on-chain.
            </p>
          )}
          {module === 'payments' && (
            <div>
              <h4 className="text-sm font-bold text-imperial-lightgold mb-4">Gửi thanh toán</h4>
              <label className="block text-[11px] text-slate-400 mb-1">Địa chỉ nhận</label>
              <input
                value={payTo}
                onChange={(e) => setPayTo(e.target.value)}
                placeholder="Địa chỉ ví Solana"
                className="w-full mb-3 bg-black/40 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-imperial-gold"
              />
              <label className="block text-[11px] text-slate-400 mb-1">Số tiền</label>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full mb-2 bg-black/40 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-imperial-gold"
              />
              <p className="text-[11px] text-slate-400 mb-4">Chưa tính phí mạng; màn hình này chưa gửi giao dịch.</p>
              <button
                onClick={() => showPreviewNotice('Thanh toán')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-imperial-crimson to-imperial-darkred border border-imperial-gold text-imperial-lightgold font-bold text-sm flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4" /><span>Xem trạng thái tính năng</span>
              </button>
              <div className="mt-5 space-y-2">
                {PAYMENT_HISTORY.map((tx) => (
                  <div key={tx.id} className="flex justify-between text-xs bg-black/30 border border-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-300">{tx.type} {tx.amount}</span>
                    <span className="text-emerald-400">{tx.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {module === 'savings' && (
            <div className="space-y-3">
              {SAVINGS_VAULTS.map((v) => (
                <div key={v.id} className="border border-slate-800 rounded-xl p-4 bg-black/30">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-white text-sm">{v.name}</div>
                      <div className="text-[11px] text-slate-400">TVL {v.tvl} • {v.lock} • Rủi ro {v.risk}</div>
                    </div>
                    <div className="text-imperial-lightgold font-mono font-bold">{v.apy} APY</div>
                  </div>
                  <button
                    onClick={() => showPreviewNotice('Tiết kiệm')}
                    className="text-xs px-3 py-1.5 rounded-lg border border-imperial-gold/50 text-imperial-lightgold hover:bg-imperial-darkred/40"
                  >
                    Xem trạng thái
                  </button>
                </div>
              ))}
            </div>
          )}

          {module === 'lending' && (
            <div>
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="bg-black/30 rounded-xl p-3 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Đã cung cấp</div>
                  <div className="text-lg font-mono text-white">24.0</div>
                </div>
                <div className="bg-black/30 rounded-xl p-3 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Đã vay</div>
                  <div className="text-lg font-mono text-white">6.5</div>
                </div>
                <div className="bg-black/30 rounded-xl p-3 border border-emerald-800">
                  <div className="text-[10px] text-emerald-400 uppercase">Health factor</div>
                  <div className="text-lg font-mono text-emerald-300">2.14</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="text-left py-2">Tài sản</th>
                      <th className="text-right">Cung</th>
                      <th className="text-right">Vay</th>
                      <th className="text-right">LTV max</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {LENDING_MARKETS.map((m) => (
                      <tr key={m.asset} className="border-t border-slate-800">
                        <td className="py-2 font-semibold">{m.asset}</td>
                        <td className="text-right text-emerald-300">{m.supplyApy}</td>
                        <td className="text-right text-amber-300">{m.borrowApy}</td>
                        <td className="text-right">{m.ltv}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 mb-3">Thanh lý kích hoạt khi health factor &lt; 1.0. Không có lãi phạt ẩn ngoài tỷ lệ công bố.</p>
              <button
                onClick={() => showPreviewNotice('Lending')}
                className="w-full py-2.5 rounded-xl border border-imperial-gold/60 text-imperial-lightgold text-sm font-semibold"
              >
                Mô phỏng cung cấp / vay
              </button>
            </div>
          )}

          {module === 'dex' && (
            <DexSwapPanel player={player} onPlayDrum={onPlayDrum} />
          )}

          {module === 'treasury' && (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-black/30 border border-imperial-gold/30 rounded-xl p-4">
                  <div className="text-[10px] uppercase text-slate-400">Ngân khố công khai</div>
                  <div className="text-2xl font-mono text-imperial-lightgold">48,760 SOL</div>
                </div>
                <div className="bg-black/30 border border-slate-800 rounded-xl p-4">
                  <div className="text-[10px] uppercase text-slate-400">Chi 30 ngày</div>
                  <div className="text-2xl font-mono text-amber-200">−1,080 SOL</div>
                </div>
              </div>
              <div className="space-y-2">
                {TREASURY_FLOWS.map((f) => (
                  <div key={f.proof} className="flex justify-between items-center text-xs bg-black/30 border border-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-300">{f.label}</span>
                    <div className="text-right">
                      <div className={f.amount.startsWith('+') ? 'text-emerald-400' : 'text-amber-300'}>{f.amount}</div>
                      <div className="font-mono text-[10px] text-slate-500">{f.proof}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {module === 'dao' && (
            <div className="space-y-3">
              {DAO_PROPOSALS.map((p) => (
                <div key={p.id} className="border border-slate-800 rounded-xl p-4 bg-black/30">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-imperial-gold font-mono">#{p.id}</span>
                    <span className="text-slate-400">{p.status}</span>
                  </div>
                  <div className="text-sm text-white font-semibold mb-2">{p.title}</div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-500" style={{ width: `${p.forPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Ủng hộ {p.forPct}%</span>
                    <span>Quorum {p.quorum}%</span>
                  </div>
                  {p.status === 'Đang bỏ phiếu' && (
                    <button
                      onClick={() => showPreviewNotice('DAO')}
                      className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-emerald-500/50 text-emerald-300"
                    >
                      Xem trạng thái bỏ phiếu
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {notice && (
            <div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200" role="status">
              {notice}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
