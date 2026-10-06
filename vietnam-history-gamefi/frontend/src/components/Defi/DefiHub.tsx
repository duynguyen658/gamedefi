import React, { useState } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  Landmark,
  PiggyBank,
  Scale,
  Send,
  Vote,
} from 'lucide-react';
import type { DefiModule, Player } from '../../types';
import { DEFI_MODULES } from '../../data/defi';
import type { QuickSwapIntent } from '../../types/dex';
import { DexSwapPanel } from './DexSwapPanel';
import { PaymentPanel } from './PaymentPanel';
import { FinanceLivePanel } from './FinanceLivePanel';
import './DefiHub.css';

interface DefiHubProps {
  player: Player;
  onBack: () => void;
  onPlayDrum: () => void;
  initialSwap?: QuickSwapIntent | null;
}

const MODULE_ICONS = {
  dex: ArrowLeftRight,
  payments: Send,
  savings: PiggyBank,
  lending: Scale,
  treasury: Landmark,
  dao: Vote,
};

const NAV_MODULES = [
  ...DEFI_MODULES.filter((item) => item.id === 'dex'),
  ...DEFI_MODULES.filter((item) => item.id !== 'dex'),
];

export const DefiHub: React.FC<DefiHubProps> = ({ player, onBack, onPlayDrum, initialSwap }) => {
  const [module, setModule] = useState<DefiModule>('dex');
  const active = DEFI_MODULES.find((item) => item.id === module)!;
  const isFuture = module !== 'dex' && module !== 'payments';

  return (
    <div className="app-screen dex-shell mx-auto w-full px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="dex-screen-hero flex flex-col gap-5 border border-imperial-border p-5 pb-7 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <button type="button" onClick={() => { onPlayDrum(); onBack(); }}
            className="mb-3 inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-imperial-lightgold">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" /><span>Tổng hành dinh</span>
          </button>
          <h2 className="font-display text-3xl font-black text-imperial-lightgold sm:text-4xl">{active.title}</h2>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-slate-300">
            {module === 'dex'
              ? 'Swap token trên Solana Devnet. Xem tỷ giá, phí và số nhận tối thiểu trước khi ký.'
              : active.tagline}
          </p>
        </div>
      </div>

      <nav className="dex-module-nav mb-8 mt-5 flex gap-2 overflow-x-auto" aria-label="Các khu vực kinh tế">
        {NAV_MODULES.map((item) => {
          const Icon = MODULE_ICONS[item.id];
          const selected = module === item.id;
          return (
            <button key={item.id} type="button" onClick={() => { onPlayDrum(); setModule(item.id); }}
              aria-current={selected ? 'page' : undefined}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-imperial-gold">
              <Icon aria-hidden="true" /><span>{item.title}</span>
            </button>
          );
        })}
      </nav>

      {module === 'dex' && <DexSwapPanel player={player} onPlayDrum={onPlayDrum} initialSwap={initialSwap} />}
      {module === 'payments' && <PaymentPanel player={player} onPlayDrum={onPlayDrum} />}
      {isFuture && <FinanceLivePanel module={module} player={player} onPlayDrum={onPlayDrum} />}
    </div>
  );
};
