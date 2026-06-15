'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Minus, Plus, QrCode, ShoppingBag, Ticket, Wallet } from 'lucide-react';
import QRCode from 'react-qr-code';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RazorpayMockCheckout, type PaymentOrder } from '@/components/finance/RazorpayMockCheckout';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Tab = 'menu' | 'wallet' | 'pass' | 'orders';

type WalletData = { wallet_id: string; current_balance: string };
type CatalogItem = { item_id: string; item_name: string; price: string; meal_type: string };
type QrPayload = { qr_payload: string; expires_at: string; refresh_in_seconds: number };
type LedgerEntry = {
  ledger_id: string;
  entry_type: string;
  amount: string;
  balance_after: string;
  note: string | null;
  created_at: string;
};
type OrderWindow = { dates: { date: string; label: string }[]; max_advance_days: number };
type DailyMenu = {
  date: string;
  meals: { BREAKFAST: string[]; LUNCH: string[]; DINNER: string[] };
  cutoffs: Record<string, { time: string; passed: boolean }>;
  special_notes?: string | null;
};
type CartLine = { item: CatalogItem; mealType: string; quantity: number };
type AddonOrder = {
  order_id: string;
  item_name: string;
  amount_deducted: string;
  order_date: string;
  meal_type: string;
  claim_pin: string;
  static_qr_data: string;
  is_redeemed: boolean;
  redeemed_at: string | null;
  created_at: string;
};

const MEALS = [
  { key: 'BREAKFAST', label: 'Breakfast', icon: '🌅' },
  { key: 'LUNCH', label: 'Lunch', icon: '☀️' },
  { key: 'DINNER', label: 'Dinner', icon: '🌙' },
] as const;

function itemEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('omelet') || n.includes('egg')) return '🍳';
  if (n.includes('milk')) return '🥛';
  if (n.includes('maggi') || n.includes('noodle')) return '🍜';
  if (n.includes('paneer')) return '🧀';
  if (n.includes('coffee') || n.includes('tea')) return '☕';
  return '🍽️';
}

function formatLedgerAmount(entry: LedgerEntry): string {
  const amt = Number(entry.amount);
  const prefix = amt >= 0 ? '+' : '';
  return `${prefix}₹${Math.abs(amt).toFixed(0)}`;
}

export default function StudentDiningPage() {
  const api = useAuthedApi();
  const [tab, setTab] = useState<Tab>('menu');
  const [loading, setLoading] = useState(true);

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orderWindow, setOrderWindow] = useState<OrderWindow | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [dailyMenu, setDailyMenu] = useState<DailyMenu | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);

  const [qr, setQr] = useState<QrPayload | null>(null);
  const [qrCountdown, setQrCountdown] = useState(30);

  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('500');
  const [checkout, setCheckout] = useState<PaymentOrder | null>(null);
  const [myOrders, setMyOrders] = useState<AddonOrder[]>([]);

  const loadMyOrders = useCallback(async () => {
    try {
      const orders = await api.get<AddonOrder[]>('/api/campus-wallet/mess/my-orders');
      setMyOrders(orders);
    } catch (e) {
      setMyOrders([]);
      toast.error(e instanceof Error ? e.message : 'Could not load order tickets');
    }
  }, [api]);

  const loadWallet = useCallback(async () => {
    const [w, l] = await Promise.all([
      api.get<WalletData>('/api/campus-wallet/me'),
      api.get<LedgerEntry[]>('/api/campus-wallet/ledger'),
    ]);
    setWallet(w);
    setLedger(l);
  }, [api]);

  const loadMenu = useCallback(async () => {
    const [cat, win] = await Promise.all([
      api.get<CatalogItem[]>('/api/campus-wallet/mess/catalog'),
      api.get<OrderWindow>('/api/campus-wallet/mess/order-window'),
    ]);
    setCatalog(cat);
    setOrderWindow(win);
    if (!selectedDate && win.dates[0]) {
      setSelectedDate(win.dates[0].date);
    }
  }, [api, selectedDate]);

  const loadDailyMenu = useCallback(
    async (date: string) => {
      if (!date) return;
      const menu = await api.get<DailyMenu>(`/api/campus-wallet/mess/daily-menu?date=${date}`);
      setDailyMenu(menu);
    },
    [api],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await Promise.all([loadWallet(), loadMenu()]);
        await loadMyOrders();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWallet, loadMenu, loadMyOrders]);

  useEffect(() => {
    if (selectedDate) void loadDailyMenu(selectedDate);
  }, [selectedDate, loadDailyMenu]);

  useEffect(() => {
    if (tab === 'orders') void loadMyOrders();
  }, [tab, loadMyOrders]);

  useEffect(() => {
    if (tab !== 'pass') return;
    const refresh = () => {
      void api
        .get<QrPayload>('/api/campus-wallet/mess/qr')
        .then((payload) => {
          setQr(payload);
          setQrCountdown(payload.refresh_in_seconds ?? 30);
        })
        .catch(() => undefined);
    };
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [api, tab]);

  useEffect(() => {
    if (tab !== 'pass' || !qr) return;
    const tick = window.setInterval(() => {
      setQrCountdown((c) => (c <= 1 ? 30 : c - 1));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [tab, qr]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.item.price) * line.quantity, 0),
    [cart],
  );
  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);
  const unredeemedCount = useMemo(() => myOrders.filter((o) => !o.is_redeemed).length, [myOrders]);

  function isCutoffPassed(mealType: string): boolean {
    return dailyMenu?.cutoffs?.[mealType]?.passed ?? false;
  }

  function addToCart(item: CatalogItem, mealType: string) {
    if (isCutoffPassed(mealType)) {
      toast.error(`${mealType} add-ons closed for today`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.item.item_id === item.item_id && l.mealType === mealType);
      if (existing) {
        return prev.map((l) =>
          l.item.item_id === item.item_id && l.mealType === mealType
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [...prev, { item, mealType, quantity: 1 }];
    });
  }

  function adjustCart(itemId: string, mealType: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.item.item_id === itemId && l.mealType === mealType
            ? { ...l, quantity: l.quantity + delta }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }

  async function payFromWallet() {
    if (!selectedDate || cart.length === 0) return;
    setCheckingOut(true);
    try {
      const res = await api.post<{ new_balance: number; total_deducted: number }>('/api/mess/order', {
        order_date: selectedDate,
        items: cart.map((l) => ({
          item_id: l.item.item_id,
          meal_type: l.mealType,
          quantity: l.quantity,
        })),
      });
      toast.success(`Order placed · ₹${res.total_deducted} deducted — check My Orders for your ticket`);
      setCart([]);
      await Promise.all([loadWallet(), loadMyOrders()]);
      setTab('orders');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  }

  async function startTopUp() {
    const amount = Number(topUpAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      const order = await api.post<PaymentOrder>('/api/wallet/topup/order', { amount });
      setCheckout(order);
      setTopUpOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start top-up');
    }
  }

  async function confirmTopUp(paymentId: string) {
    if (!checkout) return;
    await api.post('/api/wallet/topup', { amount: checkout.amount_inr, payment_id: paymentId });
    toast.success('Wallet topped up successfully');
    setCheckout(null);
    await loadWallet();
  }

  if (loading) {
    return (
      <StudentPageShell width="5xl">
        <StudentLoadingState label="Loading dining workspace…" />
      </StudentPageShell>
    );
  }

  return (
    <StudentPageShell width="5xl" className={cartCount > 0 && tab === 'menu' ? 'pb-28' : undefined}>
      <StudentPageHeader
        title="Smart Mess & Campus Wallet"
        description="Order add-ons, top up Falcon Pay, and flash your meal pass at the counter."
      />

      <StudentTabBar
        tabs={[
          { id: 'menu' as Tab, label: '🍔 Live Menu', count: cartCount || undefined },
          { id: 'wallet' as Tab, label: '💳 Falcon Pay' },
          { id: 'pass' as Tab, label: '📱 Meal Pass' },
          { id: 'orders' as Tab, label: '🎟️ My Orders', count: unredeemedCount || undefined },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === 'menu' && (
        <div className="space-y-6">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {orderWindow?.dates.map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelectedDate(d.date)}
                className={cn(
                  'shrink-0 rounded-2xl border px-5 py-3 text-sm font-semibold transition',
                  selectedDate === d.date
                    ? 'border-sgvu-gold bg-sgvu-gold/10 text-sgvu-navy shadow-sm'
                    : 'border-border/70 bg-white text-muted-foreground hover:border-sgvu-gold/40',
                )}
              >
                {d.label}
                <span className="mt-0.5 block text-xs font-normal opacity-70">
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </button>
            ))}
          </div>

          {dailyMenu?.special_notes ? (
            <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">{dailyMenu.special_notes}</p>
          ) : null}

          {MEALS.map(({ key, label, icon }) => {
            const baseItems = dailyMenu?.meals[key as keyof DailyMenu['meals']] ?? [];
            const addons = catalog.filter((c) => c.meal_type.toUpperCase() === key);
            const cutoff = dailyMenu?.cutoffs?.[key];
            const locked = cutoff?.passed ?? false;

            return (
              <section
                key={key}
                className="overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-border/50 bg-gradient-to-r from-sgvu-navy/5 to-transparent px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <h2 className="text-lg font-bold text-sgvu-navy">{label}</h2>
                      <p className="text-xs text-muted-foreground">Included in your hostel mess fee</p>
                    </div>
                  </div>
                  {cutoff ? (
                    <Badge variant={locked ? 'secondary' : 'outline'} className="gap-1">
                      <Clock className="h-3 w-3" />
                      {locked ? 'Add-ons closed' : `Order by ${cutoff.time}`}
                    </Badge>
                  ) : null}
                </div>

                <div className="p-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Base menu
                  </p>
                  <div className="mb-5 flex flex-wrap gap-2">
                    {baseItems.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-sgvu-navy"
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Add-ons
                  </p>
                  {addons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No paid add-ons for {label.toLowerCase()}.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {addons.map((item) => (
                        <div
                          key={item.item_id}
                          className={cn(
                            'flex items-center justify-between rounded-2xl border p-4 transition',
                            locked ? 'border-border/40 bg-muted/30 opacity-60' : 'border-border/70 hover:border-sgvu-gold/40',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{itemEmoji(item.item_name)}</span>
                            <div>
                              <p className="font-semibold text-sgvu-navy">{item.item_name}</p>
                              <p className="text-sm font-bold text-sgvu-gold">₹{Number(item.price).toFixed(0)}</p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={locked ? 'secondary' : 'default'}
                            disabled={locked}
                            onClick={() => addToCart(item, key)}
                            className="gap-1"
                          >
                            <Plus className="h-4 w-4" />
                            Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === 'wallet' && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-gradient-to-br from-sgvu-navy to-sgvu-navy/90 p-8 text-white shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-white/70">Falcon Pay · Campus Wallet</p>
                <p className="mt-2 text-5xl font-black tracking-tight">
                  ₹ {Number(wallet?.current_balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-2 text-sm text-white/60">Available for mess add-ons</p>
              </div>
              <Wallet className="h-10 w-10 text-sgvu-gold/80" />
            </div>
            <Button
              className="mt-6 bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90"
              size="lg"
              onClick={() => setTopUpOpen(true)}
            >
              Top-Up Wallet
            </Button>
          </div>

          <section>
            <h2 className="mb-4 text-lg font-bold text-sgvu-navy">Transaction ledger</h2>
            {ledger.length === 0 ? (
              <StudentEmptyState
                title="No transactions yet"
                description="Top up your wallet or order add-ons to see your statement here."
              />
            ) : (
              <div className="space-y-2">
                {ledger.map((entry) => (
                  <div
                    key={entry.ledger_id}
                    className="flex items-center justify-between rounded-2xl border border-border/70 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-sgvu-navy">
                        {entry.note ?? (entry.entry_type === 'TOP_UP' ? 'Wallet top-up via UPI' : 'Mess add-on')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-bold',
                        Number(entry.amount) >= 0 ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {formatLedgerAmount(entry)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'pass' && (
        <div className="mx-auto max-w-md space-y-6 text-center">
          <div className="rounded-3xl border border-border/70 bg-white p-8 shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sgvu-gold/10">
              <QrCode className="h-6 w-6 text-sgvu-gold" />
            </div>
            <h2 className="text-xl font-bold text-sgvu-navy">Master Meal Pass</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For standard breakfast, lunch &amp; dinner buffet entry only. Refreshes every 30 seconds.
            </p>
            <Badge variant="outline" className="mt-3">Identity check · stops proxy eating</Badge>

            <div className="relative mx-auto mt-6 inline-block rounded-2xl border-4 border-sgvu-gold/30 bg-white p-4">
              {qr?.qr_payload ? (
                <QRCode value={qr.qr_payload} size={220} level="M" />
              ) : (
                <div className="flex h-[220px] w-[220px] items-center justify-center text-muted-foreground">
                  Generating…
                </div>
              )}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-sgvu-navy px-3 py-1 text-xs font-bold text-white">
                {qrCountdown}s
              </div>
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              Secured with a rotating code — screenshots won&apos;t work for friends.
            </p>
          </div>

          <div className="rounded-2xl bg-blue-50 p-4 text-left text-sm text-blue-900">
            <p className="font-semibold">What the mess worker sees:</p>
            <p className="mt-1 italic">
              &ldquo;Ajay Saini — Room 101. LUNCH ENTRY — Standard buffet&rdquo;
            </p>
            <p className="mt-2 text-xs text-blue-800/80">
              Pre-ordered add-ons (Midnight Maggi, extra omelet) use separate burnable tickets in My Orders — not this QR.
            </p>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Burnable order tickets</p>
            <p className="mt-0.5 text-amber-900/80">
              Each pre-order gets a static QR and 4-digit PIN. Show either at the counter — once claimed, the ticket is burnt forever.
            </p>
          </div>

          {myOrders.filter((o) => !o.is_redeemed).length === 0 ? (
            <StudentEmptyState
              title="No active order tickets"
              description="Pre-order add-ons from Live Menu — your ticket and claim PIN will appear here."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {myOrders
                .filter((o) => !o.is_redeemed)
                .map((order) => (
                  <div
                    key={order.order_id}
                    className="overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm"
                  >
                    <div className="flex items-center justify-between border-b border-border/50 bg-sgvu-navy/5 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-sgvu-gold" />
                        <span className="font-bold text-sgvu-navy">{order.item_name}</span>
                      </div>
                      <Badge>{order.meal_type}</Badge>
                    </div>
                    <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          For {new Date(`${order.order_date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                          · ₹{Number(order.amount_deducted).toFixed(0)} paid
                        </p>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Claim PIN
                        </p>
                        <p className="font-mono text-3xl font-black tracking-widest text-sgvu-navy">
                          #{order.claim_pin}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Say this if your phone is dead</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Order QR
                        </p>
                        <div className="rounded-xl border-2 border-dashed border-sgvu-gold/40 p-2">
                          <QRCode value={order.static_qr_data} size={120} level="M" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {myOrders.some((o) => o.is_redeemed) ? (
            <section className="pt-4">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Claimed (burnt)</h3>
              <div className="space-y-2">
                {myOrders
                  .filter((o) => o.is_redeemed)
                  .slice(0, 10)
                  .map((order) => (
                    <div
                      key={order.order_id}
                      className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-2 text-sm opacity-60"
                    >
                      <span className="line-through">{order.item_name}</span>
                      <span className="text-xs text-muted-foreground">
                        Claimed{' '}
                        {order.redeemed_at
                          ? new Date(order.redeemed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short' })
                          : ''}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {cartCount > 0 && tab === 'menu' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-sgvu-gold/30 bg-white/95 p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sgvu-gold/15">
                <ShoppingBag className="h-5 w-5 text-sgvu-gold" />
              </div>
              <div>
                <p className="font-bold text-sgvu-navy">
                  {cartCount} Item{cartCount !== 1 ? 's' : ''} · Total: ₹{cartTotal.toFixed(0)}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {cart.map((l) => (
                    <span key={`${l.item.item_id}-${l.mealType}`} className="inline-flex items-center gap-1">
                      {l.item.item_name} ×{l.quantity}
                      <button type="button" onClick={() => adjustCart(l.item.item_id, l.mealType, -1)}>
                        <Minus className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Button
              size="lg"
              className="shrink-0 bg-sgvu-navy"
              disabled={checkingOut}
              onClick={() => void payFromWallet()}
            >
              {checkingOut ? 'Processing…' : 'Pay from Wallet'}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Top-Up Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Add funds via UPI / Card through Razorpay checkout.</p>
            <div className="flex flex-wrap gap-2">
              {['200', '500', '1000', '2000'].map((amt) => (
                <Button
                  key={amt}
                  variant={topUpAmount === amt ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTopUpAmount(amt)}
                >
                  ₹{amt}
                </Button>
              ))}
            </div>
            <Input
              type="number"
              placeholder="Custom amount"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
            />
            <Button className="w-full" onClick={() => void startTopUp()}>
              Proceed to Pay
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {checkout && (
        <RazorpayMockCheckout
          order={checkout}
          open
          onClose={() => setCheckout(null)}
          onSuccess={confirmTopUp}
        />
      )}
    </StudentPageShell>
  );
}
