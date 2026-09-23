import {
  Advisor,
  Army,
  BattleResultResponse,
  ChainType,
  Faction,
  FactionRegisterRequest,
  GameTokenInfo,
  LeaderboardEntry,
  MarketplaceListing,
  NonceResponse,
  Player,
  Quest,
  RewardClaim,
  TradeProposal,
  WalletVerifyRequest,
} from '../types';
import type { DexExecution, DexOrder, DexOrderRequest, DexSwapHistory } from '../types/dex';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

async function apiError(response: Response): Promise<Error> {
  try {
    const payload = await response.json();
    return new Error(typeof payload?.detail === 'string' ? payload.detail : `HTTP error ${response.status}`);
  } catch {
    return new Error(`HTTP error ${response.status}`);
  }
}

export const DEFAULT_FACTIONS: Faction[] = [
  {
    faction_id: 1,
    name: "Văn Lang – Âu Lạc",
    rarity: "rare",
    image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80",
    description: "Thời đại Hùng Vương dựng nước và Thục Phán xây thành Cổ Loa, phát minh nỏ thần liên cơ bách phát bách trúng.",
    historical_era: "TK VII TCN – 179 TCN",
    motto: "Hùng Đồ Lạc Việt • Uy Trấn Cổ Loa",
    attack_bonus: 15,
    defense_bonus: 10,
    movement_bonus: 5,
    special_unit: "Xạ Thủ Nỏ Thần Cổ Loa",
    banner_color: "from-amber-700 via-yellow-600 to-amber-900",
    coat_of_arms: "Trống Đồng Đông Sơn",
    starting_advisor_id: "cao_lo",
    strengths: "Tầm xa vượt trội, công sự thành lũy vững chắc"
  },
  {
    faction_id: 2,
    name: "Hai Bà Trưng – Bà Triệu",
    rarity: "rare",
    image: "https://images.unsplash.com/photo-1542224566-6e85f2e6772f?w=800&auto=format&fit=crop&q=80",
    description: "Ngọn cờ khởi nghĩa Mê Linh và Cửu Chân lật đổ ách đô hộ, khẳng định ý chí quật cường của nữ tướng Đại Việt.",
    historical_era: "40 – 248",
    motto: "Rửa Sạch Nợ Nước • Khôi Phục Cơ Nghiệp",
    attack_bonus: 20,
    defense_bonus: 5,
    movement_bonus: 15,
    special_unit: "Chiến Tượng Nữ Binh Mê Linh",
    banner_color: "from-pink-800 via-rose-700 to-red-900",
    coat_of_arms: "Voi Chiến Hai Đầu & Hoa Sen",
    starting_advisor_id: "hai_ba_trung",
    strengths: "Càn quét thiết giáp bằng voi chiến, sĩ khí quật khởi"
  },
  {
    faction_id: 3,
    name: "Nhà Ngô – Nhà Đinh",
    rarity: "rare",
    image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
    description: "Chiến thắng Bạch Đằng 938 chấm dứt ngàn năm Bắc thuộc; Đinh Tiên Hoàng dẹp loạn 12 sứ quân, định đô Hoa Lư.",
    historical_era: "938 – 980",
    motto: "Bạch Đằng Phá Địch • Vạn Thắng Thống Nhất",
    attack_bonus: 15,
    defense_bonus: 15,
    movement_bonus: 10,
    special_unit: "Thủy Binh Cọc Ngầm & Kỵ Binh Hoa Lư",
    banner_color: "from-blue-900 via-cyan-800 to-slate-900",
    coat_of_arms: "Cọc Nhọn Sông Nước & Cờ Lau",
    starting_advisor_id: "ngo_quyen",
    strengths: "Bẫy thủy chiến hiểm hóc, kỵ bộ cơ động"
  },
  {
    faction_id: 4,
    name: "Nhà Lý",
    rarity: "common",
    image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80",
    description: "Kỷ nguyên dựng đô Thăng Long vĩ đại, rồng vàng thăng thiên, phá Tống bình Chiêm với bài thơ thần Nam Quốc Sơn Hà.",
    historical_era: "1009 – 1225",
    motto: "Nam Quốc Sơn Hà Nam Đế Cư",
    attack_bonus: 10,
    defense_bonus: 20,
    movement_bonus: 10,
    special_unit: "Cấm Quân Hoàng Thành Thăng Long",
    banner_color: "from-amber-700 via-amber-600 to-yellow-500",
    coat_of_arms: "Thần Long Thời Lý",
    starting_advisor_id: "ly_thuong_kiet",
    strengths: "Phòng tuyến Như Nguyệt kiên cố, kỷ luật chiến đấu cao"
  },
  {
    faction_id: 5,
    name: "Nhà Trần",
    rarity: "epic",
    image: "https://images.unsplash.com/photo-1542224566-6e85f2e6772f?w=800&auto=format&fit=crop&q=80",
    description: "Hào khí Đông A bất khuất, ba lần đại thắng Nguyên Mông, thủy chiến cắm cọc Bạch Đằng vang dội địa cầu.",
    historical_era: "1225 – 1400",
    motto: "Sát Thát - Phá Cường Địch Báo Hoàng Ân",
    attack_bonus: 25,
    defense_bonus: 20,
    movement_bonus: 15,
    special_unit: "Thiết Đột Thủy Binh Đại Việt",
    banner_color: "from-red-800 via-crimson to-red-600",
    coat_of_arms: "Chữ Sát Thát & Thần Kiếm",
    starting_advisor_id: "tran_hung_dao",
    strengths: "Ba lần đại phá Nguyên Mông, thủy bộ phối hợp toàn diện"
  },
  {
    faction_id: 6,
    name: "Hậu Lê – Lam Sơn",
    rarity: "epic",
    image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
    description: "Khởi nghĩa Lam Sơn mười năm nếm mật nằm gai, gươm Thuận Thiên trừ bạo tàn, mở ra thời thịnh trị bậc nhất.",
    historical_era: "1418 – 1527",
    motto: "Lấy đại nghĩa thắng hung tàn, lấy chí nhân thay cường bạo",
    attack_bonus: 20,
    defense_bonus: 15,
    movement_bonus: 15,
    special_unit: "Nghĩa Quân Lam Sơn Thiết Binh",
    banner_color: "from-orange-800 via-red-700 to-amber-700",
    coat_of_arms: "Thuận Thiên Kiếm & Rùa Vàng",
    starting_advisor_id: "le_loi",
    strengths: "Chiến tranh du kích, hỏa lực pháo thần cơ"
  },
  {
    faction_id: 7,
    name: "Tây Sơn",
    rarity: "epic",
    image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80",
    description: "Áo vải cờ đào, hành quân thần tốc đánh tan quân Xiêm ở Rạch Gầm và đại phá 29 vạn quân Mãn Thanh mùa xuân Kỷ Dậu.",
    historical_era: "1771 – 1802",
    motto: "Đánh Cho Sử Tri Nam Quốc Anh Hùng Chi Hữu Chủ",
    attack_bonus: 30,
    defense_bonus: 10,
    movement_bonus: 25,
    special_unit: "Hỏa Hổ Trận & Voi Chiến Đại Bác",
    banner_color: "from-red-600 via-amber-600 to-orange-700",
    coat_of_arms: "Hỏa Hổ Tây Sơn & Cờ Đỏ",
    starting_advisor_id: "quang_trung",
    strengths: "Hành quân thần tốc, hỏa khí vượt trội, đòn phủ đầu áp đảo"
  },
  {
    faction_id: 8,
    name: "Nhà Nguyễn",
    rarity: "legendary",
    image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80",
    description: "Triều đại thống nhất non sông từ Ải Nam Quan đến Mũi Cà Mau, pháo đài Vauban kiên cố và súng đại bác uy lực.",
    historical_era: "1802 – 1945",
    motto: "Nhất Thống Giang Sơn • Uy Danh Cửu Đỉnh",
    attack_bonus: 15,
    defense_bonus: 25,
    movement_bonus: 10,
    special_unit: "Cửu Vị Thần Công Vệ Binh",
    banner_color: "from-amber-600 via-yellow-600 to-amber-800",
    coat_of_arms: "Kinh Thành Huế & Cửu Đỉnh",
    starting_advisor_id: "nguyen_tri_phuong",
    strengths: "Công sự kiên cố kiểu Vauban, hỏa pháo tầm xa đại bác"
  }
];

class GameApiService {
  private isServerHealthy: boolean | null = null;
  private accessToken: string | null = null;

  setAccessToken(token?: string | null): void {
    this.accessToken = token || null;
  }

  clearAccessToken(): void {
    this.accessToken = null;
  }

  private authHeaders(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(1500) });
      const data = await res.json();
      this.isServerHealthy = data?.status === 'ok';
      return this.isServerHealthy;
    } catch {
      this.isServerHealthy = false;
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Auth & Players
  // -------------------------------------------------------------------------

  async guestLogin(username?: string): Promise<Player> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      this.setAccessToken(data.access_token);
      return {
        ...data,
        base_power: 1200,
      };
    } catch (e) {
      this.clearAccessToken();
      console.warn('Backend unavailable, using local guest player fallback:', e);
      const guestId = Math.random().toString(36).substring(2, 8);
      return {
        wallet: `guest_${guestId}`,
        chain: 'solana',
        username: username || `TuongQuan_${guestId}`,
        faction_id: null,
        nft_object_id: null,
        level: 1,
        base_power: 1200,
        rice: 5000,
        gold: 10000,
        morale: 85,
        is_guest: true,
      };
    }
  }

  async getNonce(chain: ChainType, wallet: string): Promise<NonceResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain, wallet }),
    });
    if (!res.ok) throw new Error(`Không thể tạo wallet challenge (${res.status})`);
    return await res.json();
  }

  async verifyWallet(payload: WalletVerifyRequest): Promise<Player> {
    const res = await fetch(`${API_BASE_URL}/auth/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      this.clearAccessToken();
      throw new Error(`Xác thực chữ ký ví thất bại (${res.status})`);
    }
    const data = await res.json();
    this.setAccessToken(data.access_token);
    return { ...data, base_power: 1200 };
  }

  // -------------------------------------------------------------------------
  // Factions
  // -------------------------------------------------------------------------

  async getFactions(): Promise<Faction[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/factions`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data: Faction[] = await res.json();
      return data.map((item) => {
        const fallback = DEFAULT_FACTIONS.find(f => f.faction_id === item.faction_id) || DEFAULT_FACTIONS[0];
        return {
          ...fallback,
          ...item,
        };
      });
    } catch (e) {
      console.warn('Backend unavailable, using default rich faction metadata:', e);
      return DEFAULT_FACTIONS;
    }
  }

  async selectFactionF2P(wallet: string, factionId: number): Promise<Player> {
    const res = await fetch(`${API_BASE_URL}/players/${wallet}/faction/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ faction_id: factionId }),
    });
    if (!res.ok) throw new Error(`Không thể chọn faction (${res.status})`);
    return {
      ...(await res.json()),
      access_token: this.accessToken || undefined,
      base_power: 1500,
    };
  }

  async registerPlayerFaction(wallet: string, payload: FactionRegisterRequest): Promise<Player> {
    const res = await fetch(`${API_BASE_URL}/players/${wallet}/faction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Backend không xác minh được Faction NFT (${res.status})`);
    return { ...(await res.json()), base_power: 1500 };
  }

  // -------------------------------------------------------------------------
  // Advisors & Army
  // -------------------------------------------------------------------------

  async getAdvisors(factionId?: number): Promise<Advisor[]> {
    try {
      const url = factionId ? `${API_BASE_URL}/advisors?faction_id=${factionId}` : `${API_BASE_URL}/advisors`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Error fetching advisors:', e);
      return [];
    }
  }

  async getAdvisor(id: string): Promise<Advisor | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/advisors/${id}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Error fetching advisor detail:', e);
      return null;
    }
  }

  async getPlayerArmy(wallet: string): Promise<Army> {
    try {
      const res = await fetch(`${API_BASE_URL}/players/${wallet}/army`, { headers: this.authHeaders() });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Error fetching army:', e);
      return {
        player_wallet: wallet,
        faction_id: null,
        equipped_advisor_id: null,
        equipped_advisor_name: null,
        spearmen_count: 100,
        archers_count: 60,
        cavalry_count: 30,
        elephants_count: 5,
        total_power: 500,
        morale: 85,
        formation: 'standard',
      };
    }
  }

  async equipAdvisor(wallet: string, advisorId: string): Promise<Army> {
    const res = await fetch(`${API_BASE_URL}/players/${wallet}/army/equip-advisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ advisor_id: advisorId }),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  // -------------------------------------------------------------------------
  // Battles (100% Off-Chain)
  // -------------------------------------------------------------------------

  async executeBattle(
    playerWallet: string,
    scenarioId: string = 'bach_dang_1288',
    tacticalFormation: string = 'standard',
    advisorId?: string,
  ): Promise<BattleResultResponse> {
    const res = await fetch(`${API_BASE_URL}/battles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({
        player_wallet: playerWallet,
        scenario_id: scenarioId,
        tactical_formation: tacticalFormation,
        advisor_id: advisorId,
      }),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/leaderboard`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Error fetching leaderboard:', e);
      return [];
    }
  }

  async getQuests(factionId?: number): Promise<Quest[]> {
    try {
      const url = factionId ? `${API_BASE_URL}/quests?faction_id=${factionId}` : `${API_BASE_URL}/quests`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Error fetching quests:', e);
      return [];
    }
  }


  async getPlayerQuests(wallet: string): Promise<Quest[]> {
    const res = await fetch(`${API_BASE_URL}/quests/players/${wallet}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw await apiError(res);
    return await res.json();
  }

  async claimBattleReward(wallet: string, battleId: string): Promise<RewardClaim> {
    const res = await fetch(`${API_BASE_URL}/rewards/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ wallet, battle_id: battleId }),
    });
    if (!res.ok) throw await apiError(res);
    return await res.json();
  }

  async claimQuestReward(wallet: string, questId: string): Promise<RewardClaim> {
    const res = await fetch(`${API_BASE_URL}/rewards/quests/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ wallet, quest_id: questId }),
    });
    if (!res.ok) throw await apiError(res);
    return await res.json();
  }

  async getRewards(wallet: string, limit = 20): Promise<RewardClaim[]> {
    const res = await fetch(`${API_BASE_URL}/players/${wallet}/rewards?limit=${limit}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw await apiError(res);
    return await res.json();
  }


  async getGameToken(): Promise<GameTokenInfo> {
    const res = await fetch(`${API_BASE_URL}/blockchain/solana/game-token`);
    if (!res.ok) throw await apiError(res);
    return await res.json();
  }

  // -------------------------------------------------------------------------
  // DEX provider gateway
  // -------------------------------------------------------------------------

  async createDexOrder(payload: DexOrderRequest): Promise<DexOrder> {
    const res = await fetch(`${API_BASE_URL}/dex/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await apiError(res);
    return await res.json();
  }

  async executeDexOrder(payload: {
    wallet: string;
    request_id: string;
    signed_transaction: string;
  }): Promise<DexExecution> {
    const res = await fetch(`${API_BASE_URL}/dex/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await apiError(res);
    return await res.json();
  }

  async getDexHistory(limit = 5): Promise<DexSwapHistory[]> {
    const res = await fetch(`${API_BASE_URL}/dex/history?limit=${limit}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw await apiError(res);
    return await res.json();
  }

  // -------------------------------------------------------------------------
  // Marketplace & P2P Trades (Optional Blockchain Layer)
  // -------------------------------------------------------------------------

  async getMarketplace(chain?: ChainType, factionId?: number): Promise<MarketplaceListing[]> {
    try {
      const params = new URLSearchParams();
      if (chain) params.append('chain', chain);
      if (factionId) params.append('faction_id', factionId.toString());
      const res = await fetch(`${API_BASE_URL}/marketplace?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Error fetching marketplace:', e);
      return [];
    }
  }

  async createListing(payload: {
    advisor_id: string;
    seller_wallet: string;
    chain: ChainType;
    price: number;
    currency?: string;
    token_id: string;
  }): Promise<MarketplaceListing> {
    const res = await fetch(`${API_BASE_URL}/marketplace/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  async buyListing(payload: {
    listing_id: string;
    buyer_wallet: string;
    tx_digest: string;
  }): Promise<MarketplaceListing> {
    const res = await fetch(`${API_BASE_URL}/marketplace/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  async cancelListing(payload: {
    listing_id: string;
    seller_wallet: string;
  }): Promise<MarketplaceListing> {
    const res = await fetch(`${API_BASE_URL}/marketplace/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  async createTrade(payload: {
    initiator_wallet: string;
    target_wallet: string;
    offered_advisor_id: string;
    requested_advisor_id: string;
    chain: ChainType;
  }): Promise<TradeProposal> {
    const res = await fetch(`${API_BASE_URL}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  async acceptTrade(tradeId: string, wallet: string, txDigest?: string): Promise<TradeProposal> {
    const res = await fetch(`${API_BASE_URL}/trades/${tradeId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade_id: tradeId, wallet, tx_digest: txDigest }),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  async rejectTrade(tradeId: string, wallet: string): Promise<TradeProposal> {
    const res = await fetch(`${API_BASE_URL}/trades/${tradeId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade_id: tradeId, wallet }),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }
}

export const apiService = new GameApiService();
