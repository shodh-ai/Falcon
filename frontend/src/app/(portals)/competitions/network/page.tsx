'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createCompetitionsApi } from '@/lib/api/api.competitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const c = useMemo(() => createCompetitionsApi(api), [api]);
  const [channels, setChannels] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [active, setActive] = useState<string>('');
  useEffect(() => {
    void c.channels().then((ch) => { setChannels(ch); if (ch[0]) setActive(ch[0].channel_id); }).catch(() => toast.error('Load failed'));
  }, [c]);
  useEffect(() => { if (active) void c.posts(active).then(setPosts); }, [c, active]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Tokamak Network</h1>
      <div className="flex gap-2 flex-wrap">{channels.map((ch) => <Button key={ch.channel_id} variant={active===ch.channel_id?'default':'outline'} size="sm" onClick={() => setActive(ch.channel_id)}>{ch.name}</Button>)}</div>
      {posts.map((p) => (
        <Card key={p.post_id}><CardContent className="pt-4 text-sm"><strong>{p.author_name ?? 'Anon'}:</strong> {p.body}</CardContent></Card>
      ))}
      {active && <Button onClick={() => c.createPost({ channel_id: active, body: 'Keeping talent warm — monthly bounty drop incoming.' }).then(() => c.posts(active).then(setPosts))}>Post update</Button>}
    </div>
  );
}
