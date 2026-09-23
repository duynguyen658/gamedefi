import React, { useState, useEffect } from 'react';
import { Advisor, ChainType, Faction, MarketplaceListing, Player, RarityType, TradeProposal } from '../../types';
import { apiService } from '../../services/api';
import {
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  Coins,
  Crown,
  Filter,
  Flame,
  PlusCircle,
  RefreshCw,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Tag,
  Wallet,
} from 'lucide-react';

interface AdvisorMarketplaceProps {
  player: Player | null;
  onBack: () => void;
  onOpenWalletModal: () => void;
  onPlayDrum: () => void;
  onPlaySword: () => void;
}

const RARITY_BADGES: Record<RarityType, string> = {
  legendary: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  epic: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
  rare: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  common: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
};

export const AdvisorMarketplace: React.FC<AdvisorMarketplaceProps> = ({
  player,
  onBack,
  onOpenWalletModal,
  onPlayDrum,
  onPlaySword,
}) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'list' | 'trades'>('browse');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [selectedChain, setSelectedChain] = useState<ChainType | 'all'>('all');
  const [selectedFaction, setSelectedFaction] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Form states for creating listing
  const [listAdvisorId, setListAdvisorId] = useState<string>('tran_hung_dao');
  const [listPrice, setListPrice] = useState<string>('20.0');
  const [listTokenId, setListTokenId] = useState<string>('');

  // Form states for P2P trade
  const [tradeTargetWallet, setTradeTargetWallet] = useState<string>('');
  const [tradeOfferedId, setTradeOfferedId] = useState<string>('ly_thuong_kiet');
  const [tradeRequestedId, setTradeRequestedId] = useState<string>('tran_hung_dao');
  const [trades, setTrades] = useState<TradeProposal[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const chainFilter = selectedChain === 'all' ? undefined : selectedChain;
      const factionFilter = selectedFaction === 'all' ? undefined : selectedFaction;
      const list = await apiService.getMarketplace(chainFilter, factionFilter);
      setListings(list);
      const advs = await apiService.getAdvisors();
      setAdvisors(advs);
    } catch (e) {
      console.error('Error loading marketplace:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [selectedChain, selectedFaction]);

  const handleBuy = async (listing: MarketplaceListing) => {
    if (!player || player.is_guest) {
      setStatusMessage('Vui lòng kết nối ví blockchain (Solana) để thực hiện giao dịch mua.');
      onOpenWalletModal();
      return;
    }

    setStatusMessage('Marketplace đang tạm khóa cho đến khi escrow contract on-chain được triển khai và kiểm toán. Không có giao dịch nào được thực hiện.');
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player || player.is_guest) {
      onOpenWalletModal();
      return;
    }

    setStatusMessage('Niêm yết đang tạm khóa cho đến khi escrow contract on-chain được triển khai và kiểm toán.');
  };

  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player || player.is_guest) {
      onOpenWalletModal();
      return;
    }

    setStatusMessage('Trao đổi P2P đang tạm khóa cho đến khi escrow contract on-chain được triển khai và kiểm toán.');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Navigation Top */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-imperial-lightgold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về Hội Đồng Quân Sư</span>
        </button>

        {/* Wallet Status Badge */}
        <div className="flex items-center space-x-3">
          {(!player || player.is_guest) ? (
            <button
              onClick={onOpenWalletModal}
              className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-imperial-gold hover:bg-yellow-500 text-black text-xs font-bold transition-all cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Kết Nối Ví Để Giao Dịch</span>
            </button>
          ) : (
            <div className="px-3 py-1 rounded-lg bg-emerald-950/60 border border-emerald-600/50 text-[11px] text-emerald-300 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Ví {player.chain.toUpperCase()}: {player.wallet.substring(0, 6)}...{player.wallet.slice(-4)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Header Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-amber-950/50 via-imperial-slate to-imperial-obsidian border border-amber-600/40 p-6 mb-6 overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Coins className="w-4 h-4" />
              <span>Lớp Giao Dịch Sở Hữu On-Chain (Solana)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-black text-white">
              Chợ Tướng Cố Vấn Đại Việt
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Nơi người chơi tự do mua, bán hoặc trao đổi (P2P Trade) Tướng Cố Vấn độc bản bằng công nghệ blockchain. Hoàn toàn tùy chọn và độc lập với tiến trình chiến dịch cốt lõi.
            </p>
          </div>

          <div className="text-right hidden sm:block">
            <div className="text-[11px] text-slate-400">Triết lý thiết kế</div>
            <div className="text-xs font-bold text-imperial-lightgold font-display">
              History is the Game. Blockchain is the Marketplace.
            </div>
          </div>
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div className="mb-6 p-3 rounded-xl bg-amber-950/70 border border-amber-500/60 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-xs text-slate-400 hover:text-white ml-2">Đóng</button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center space-x-2 border-b border-imperial-border mb-6">
        <button
          onClick={() => setActiveTab('browse')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center space-x-2 ${
            activeTab === 'browse'
              ? 'border-imperial-gold text-imperial-lightgold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Mua Tướng ({listings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('list')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center space-x-2 ${
            activeTab === 'list'
              ? 'border-imperial-gold text-imperial-lightgold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Niêm Yết Bán Tướng</span>
        </button>

        <button
          onClick={() => setActiveTab('trades')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center space-x-2 ${
            activeTab === 'trades'
              ? 'border-imperial-gold text-imperial-lightgold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>Trao Đổi Tướng P2P</span>
        </button>
      </div>

      {/* TAB 1: BROWSE & BUY */}
      {activeTab === 'browse' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-imperial-lacquer/70 border border-imperial-border/70 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">Chuỗi:</span>
              {(['all', 'solana'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedChain(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                    selectedChain === c
                      ? 'bg-amber-600 text-white shadow'
                      : 'bg-imperial-obsidian text-slate-400 hover:text-white'
                  }`}
                >
                  {c === 'all' ? 'Tất cả chain' : c}
                </button>
              ))}
            </div>

            <button
              onClick={loadData}
              className="p-1.5 rounded-lg bg-imperial-obsidian text-slate-400 hover:text-white border border-slate-700"
              title="Làm mới"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Listings Grid */}
          {loading ? (
            <div className="text-center py-16 text-slate-400">Đang đồng bộ dữ liệu niêm yết từ Solana...</div>
          ) : listings.length === 0 ? (
            <div className="text-center py-16 text-slate-500 bg-imperial-lacquer/40 rounded-2xl border border-imperial-border">
              Chưa có tướng nào đang được niêm yết với bộ lọc này. Hãy là người đầu tiên niêm yết!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map((item) => {
                const adv = advisors.find(a => a.id === item.advisor_id);
                const badge = RARITY_BADGES[item.rarity] || RARITY_BADGES.common;

                return (
                  <div
                    key={item.listing_id}
                    className="rounded-2xl border border-imperial-border bg-gradient-to-b from-imperial-lacquer to-imperial-obsidian p-5 hover:border-imperial-gold/60 transition-all shadow-lg flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Meta */}
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge}`}>
                          {item.rarity}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-black/40 px-2 py-0.5 rounded border border-slate-700">
                          {item.chain}
                        </span>
                      </div>

                      <h3 className="text-lg font-black text-white font-display">{item.advisor_name}</h3>
                      <div className="text-xs text-amber-400 font-medium mb-3">
                        {adv?.title || 'Quân Sư'} &bull; Faction #{item.faction_id}
                      </div>

                      {/* Skill snapshot */}
                      {adv && (
                        <div className="bg-black/30 rounded-xl p-3 border border-slate-800 text-xs mb-4 space-y-1.5">
                          <div className="text-cyan-300 font-semibold flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            <span>{adv.passive_name}</span>
                          </div>
                          <div className="text-slate-400 text-[11px] line-clamp-2">{adv.passive_effect}</div>
                        </div>
                      )}
                    </div>

                    {/* Price and Buy Action */}
                    <div className="pt-4 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-slate-400">Giá niêm yết:</span>
                        <div className="text-base font-black text-imperial-lightgold font-display">
                          {item.price} {item.currency}
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 mb-3 truncate">
                        Người bán: {item.seller_wallet}
                      </div>

                      <button
                        onClick={() => handleBuy(item)}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-amber-950/60 flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span>Mua Ngay Bằng Ví {item.chain.toUpperCase()}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LIST FOR SALE */}
      {activeTab === 'list' && (
        <div className="max-w-2xl mx-auto bg-imperial-lacquer/80 border border-imperial-border rounded-2xl p-6 sm:p-8">
          <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Tag className="w-4 h-4" />
            <span>Niêm yết tài sản</span>
          </div>
          <h2 className="text-xl font-black text-white font-display mb-2">Bán Tướng Cố Vấn Lên Chợ</h2>
          <p className="text-xs text-slate-300 mb-6">
            Chọn Tướng Cố Vấn bạn sở hữu trên ví để niêm yết bán cho người chơi khác. Người mua sẽ trả token và quyền sở hữu on-chain sẽ được cập nhật.
          </p>

          <form onSubmit={handleCreateListing} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Chọn Tướng Cố Vấn:</label>
              <select
                value={listAdvisorId}
                onChange={(e) => setListAdvisorId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-imperial-obsidian border border-slate-700 text-white text-xs"
              >
                {advisors.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.rarity.toUpperCase()} - {a.faction_name})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Giá Bán (SOL):</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-imperial-obsidian border border-slate-700 text-white text-xs"
                placeholder="25.0"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Mã Định Danh NFT / Object ID Trên Chain:</label>
              <input
                type="text"
                value={listTokenId}
                onChange={(e) => setListTokenId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-imperial-obsidian border border-slate-700 text-white text-xs"
                placeholder="PDA hoặc token account Solana"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-imperial-crimson to-red-700 hover:from-red-600 hover:to-imperial-crimson text-white text-xs font-bold uppercase tracking-wider font-display shadow-xl cursor-pointer mt-4"
            >
              Ký Chữ Ký Ví & Đăng Bán
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: P2P TRADES */}
      {activeTab === 'trades' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-imperial-lacquer/80 border border-imperial-border rounded-2xl p-6 sm:p-8">
            <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2">
              <ArrowLeftRight className="w-4 h-4" />
              <span>Trao đổi ngang hàng P2P</span>
            </div>
            <h2 className="text-xl font-black text-white font-display mb-2">Đề Nghị Đổi Tướng Trực Tiếp</h2>
            <p className="text-xs text-slate-300 mb-6">
              Trao đổi Tướng Cố Vấn trực tiếp giữa 2 người chơi mà không mất phí trung gian. Cả hai bên đều phải ký xác nhận chữ ký ví để hoàn tất.
            </p>

            <form onSubmit={handleCreateTrade} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Địa Chỉ Ví Đối Phương:</label>
                <input
                  type="text"
                  value={tradeTargetWallet}
                  onChange={(e) => setTradeTargetWallet(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-imperial-obsidian border border-slate-700 text-white text-xs font-mono"
                  placeholder="Địa chỉ ví Solana"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Tướng Bạn Đề Nghị Đổi:</label>
                  <select
                    value={tradeOfferedId}
                    onChange={(e) => setTradeOfferedId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-imperial-obsidian border border-slate-700 text-white text-xs"
                  >
                    {advisors.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Tướng Bạn Muốn Nhận Về:</label>
                  <select
                    value={tradeRequestedId}
                    onChange={(e) => setTradeRequestedId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-imperial-obsidian border border-slate-700 text-white text-xs"
                  >
                    {advisors.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-600 hover:to-blue-600 text-white text-xs font-bold uppercase tracking-wider font-display shadow-xl cursor-pointer mt-4"
              >
                Gửi Đề Nghị Trao Đổi
              </button>
            </form>
          </div>

          {/* Trade Proposals List */}
          {trades.length > 0 && (
            <div className="bg-imperial-lacquer/80 border border-imperial-border rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white font-display mb-4">Các Đề Nghị Đang Chờ</h3>
              <div className="space-y-3">
                {trades.map(t => (
                  <div key={t.trade_id} className="bg-black/30 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                    <div className="text-xs">
                      <div className="text-slate-200 font-bold">{t.offered_advisor_name} ➔ {t.requested_advisor_name}</div>
                      <div className="text-[10px] text-slate-400">Đến: {t.target_wallet.substring(0, 8)}...</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {t.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

