'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipAdmissionsFunnelPage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<Array<{ stage: string; count: number }>>([]);

  useEffect(() => {
    void api.admissionsFunnel().then((r) => setData(r.funnel)).catch(() => setData([]));
  }, [api]);

  const option = useMemo(() => {
    const seriesData = data.map((d) => ({ name: d.stage, value: d.count }));
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: '#334155',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        formatter: (p: { name: string; value: number }) => `${p.name}<br/>${Number(p.value ?? 0).toLocaleString('en-IN')}`,
      },
      series: [
        {
          type: 'funnel',
          top: 10,
          bottom: 10,
          left: '10%',
          width: '80%',
          minSize: '30%',
          maxSize: '100%',
          sort: 'descending',
          label: { color: '#e2e8f0', fontSize: 12, fontWeight: 600 },
          labelLine: { lineStyle: { color: '#64748b' } },
          itemStyle: { borderColor: '#0f172a', borderWidth: 1, opacity: 0.95 },
          data: seriesData.length ? seriesData : [
            { name: 'Inquiries', value: 50000 },
            { name: 'Applications', value: 10000 },
            { name: 'Fees Paid', value: 2500 },
          ],
        },
      ],
    };
  }, [data]);

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader
        eyebrow="Pillar 2"
        title="Admissions & Growth Funnel"
        description="Conversion funnel from inquiries to enrolled students"
      />

      <LeadershipSectionCard title="Conversion Funnel">
        <ReactECharts option={option} style={{ height: 420, width: '100%' }} opts={{ renderer: 'canvas' }} />
      </LeadershipSectionCard>
    </div>
  );
}
