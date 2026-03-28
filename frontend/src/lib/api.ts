const API_BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:8000';

export const apiEvents = new EventTarget();

export interface User {
  id: string;
  balance: number;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  market_id: string;
  outcome: 'YES' | 'NO';
  action: 'BUY' | 'SELL';
  price_cents: number;
  quantity: number;
  filled: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  created_at: string;
}

export interface Position {
  user_id: string;
  market_id: string;
  yes_shares: number;
  no_shares: number;
}

export interface Portfolio {
  user: User;
  available_balance: number;
  positions: Position[];
  open_orders: Order[];
}

export interface OrderBookLevel {
  price_cents: number;
  quantity: number;
}

export interface OrderBook {
  YES_BUY: OrderBookLevel[];
  YES_SELL: OrderBookLevel[];
  NO_BUY: OrderBookLevel[];
  NO_SELL: OrderBookLevel[];
}

export interface WorldSimulationStartRequest {
  event: Record<string, unknown>;
  branch: Record<string, unknown>;
  rerun?: boolean;
}

export interface WorldSimulationStartResponse {
  operation_id: string;
  prompt: string;
  display_name: string;
  cached: boolean;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  progress_status?: string;
  progress_description?: string;
  world_id?: string;
  thumbnail_url?: string;
  pano_url?: string;
  splat_urls?: string[];
  world_marble_url?: string;
  caption?: string;
}

export interface WorldSimulationStatusResponse {
  done: boolean;
  operation_id: string;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  progress_status?: string;
  progress_description?: string;
  world_id?: string;
  thumbnail_url?: string;
  pano_url?: string;
  splat_urls?: string[];
  world_marble_url?: string;
  caption?: string;
  raw_operation: Record<string, unknown>;
}

export interface CachedWorldSimulationResponse {
  event_id: string;
  branch_id: string;
  display_name: string;
  prompt: string;
  operation_id: string;
  done: boolean;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  progress_status?: string;
  progress_description?: string;
  world_id?: string;
  thumbnail_url?: string;
  pano_url?: string;
  splat_urls?: string[];
  world_marble_url?: string;
  caption?: string;
}

export const api = {
  async initUser(userId: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/init`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to init user');
    return response.json();
  },

  async getUser(userId: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}`);
    if (!response.ok) throw new Error('Failed to get user');
    return response.json();
  },

  async placeOrder(
    userId: string,
    marketId: string,
    outcome: 'YES' | 'NO',
    action: 'BUY' | 'SELL',
    priceCents: number,
    quantity: number
  ): Promise<Order> {
    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        market_id: marketId,
        outcome,
        action,
        price_cents: priceCents,
        quantity,
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to place order');
    }
    const newOrder = await response.json();

    // Dispatch optimistic update event so the OrderBook or Portfolio can inject it locally
    apiEvents.dispatchEvent(new CustomEvent('orderPlaced', { detail: newOrder }));

    return newOrder;
  },

  async getUserOrders(userId: string): Promise<Order[]> {
    const response = await fetch(`${API_BASE_URL}/orders/${userId}`);
    if (!response.ok) throw new Error('Failed to get orders');
    return response.json();
  },

  async getUserPortfolio(userId: string): Promise<Portfolio> {
    const response = await fetch(`${API_BASE_URL}/portfolio/${userId}`);
    if (!response.ok) throw new Error('Failed to get portfolio');
    return response.json();
  },

  async getOrderbook(marketId: string): Promise<OrderBook> {
    const response = await fetch(`${API_BASE_URL}/markets/${marketId}/orderbook`);
    if (!response.ok) throw new Error('Failed to get orderbook');
    return response.json();
  },

  async startWorldSimulation(
    payload: WorldSimulationStartRequest,
  ): Promise<WorldSimulationStartResponse> {
    const response = await fetch(`${API_BASE_URL}/simulation/worlds/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to start world simulation');
    }
    return response.json();
  },

  async getWorldSimulationStatus(
    operationId: string,
  ): Promise<WorldSimulationStatusResponse> {
    const response = await fetch(`${API_BASE_URL}/simulation/worlds/operations/${operationId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to fetch world simulation status');
    }
    return response.json();
  },

  async getCachedWorldSimulation(
    eventId: string,
    branchId: string,
  ): Promise<CachedWorldSimulationResponse> {
    const params = new URLSearchParams({ event_id: eventId, branch_id: branchId });
    const response = await fetch(`${API_BASE_URL}/simulation/worlds/cache?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to fetch cached world simulation');
    }
    return response.json();
  },
};
