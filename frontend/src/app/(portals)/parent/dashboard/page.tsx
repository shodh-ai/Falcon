'use client';

import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { useParentChild } from '@/context/ParentChildContext';
import { ParentFeedCard, type FeedItem } from '@/components/parent/ParentFeedCard';
import { ParentPageHeader } from '@/components/parent/ParentPageHeader';

type FeedResponse = {
  child_name: string;
  feed: FeedItem[];
};

export default function ParentDashboardPage() {
  const api = useAuthedApi();
  const { selectedChildId, loading: childLoading } = useParentChild();

  const { data, isLoading } = useSWR<FeedResponse>(
    selectedChildId ? ['parent-feed', selectedChildId] : null,
    () => api.get<FeedResponse>(`/api/parent/students/${selectedChildId}/feed`),
    { revalidateOnFocus: true },
  );

  if (childLoading || (isLoading && !data)) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  const feed = data?.feed ?? [];

  return (
    <div className="space-y-6">
      <ParentPageHeader
        title="Live Feed"
        description="Real-time updates on attendance, hostel movement, and fee reminders for your linked student."
      />

      {feed.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed bg-white p-8 text-center shadow-sm">
          <p className="font-medium text-sgvu-navy">All quiet for now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New attendance marks, gate scans, and fee alerts will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {feed.map((item) => (
            <ParentFeedCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
