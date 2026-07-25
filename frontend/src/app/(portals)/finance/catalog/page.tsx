'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function CatalogPage() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [items, setItems] = useState<any[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});

  const reload = () =>
    ops.catalog().then(setItems).catch(() => toast.error('Failed to load catalog'));

  useEffect(() => {
    void reload();
  }, [ops]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Procurement Catalog</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Internal Amazon: pre-negotiated prices and vendors. Ordering skips RFQ — no room to inflate
        quotes.
      </p>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.catalog_item_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{item.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="text-muted-foreground">
                {item.sku} · {item.category ?? 'General'} · {item.vendor_name ?? 'Vendor locked'}
              </div>
              <div className="text-lg font-semibold">
                ₹{Number(item.locked_unit_price).toLocaleString('en-IN')} / {item.unit}
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  value={qty[item.catalog_item_id] ?? '1'}
                  onChange={(e) =>
                    setQty((q) => ({ ...q, [item.catalog_item_id]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  onClick={() =>
                    ops
                      .orderCatalog({
                        catalog_item_id: item.catalog_item_id,
                        qty: Number(qty[item.catalog_item_id] ?? 1),
                      })
                      .then((res) => {
                        toast.success(
                          res.po
                            ? `Ordered — PO ${String(res.po.po_id).slice(0, 8)}…`
                            : 'Order pending DOFA / board approval',
                        );
                      })
                      .catch((e) => toast.error(String(e?.message ?? e)))
                  }
                >
                  Order
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!items.length && (
        <p className="text-sm text-muted-foreground">No catalog items. Run antifraud migration seed.</p>
      )}
    </div>
  );
}
