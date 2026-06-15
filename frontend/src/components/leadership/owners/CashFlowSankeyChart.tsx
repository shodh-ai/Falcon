'use client';

import ReactECharts from 'echarts-for-react';
import type { CashFlowSankey } from '@/lib/api/api.leadership';

export function CashFlowSankeyChart({ data }: { data: CashFlowSankey }) {
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (p: { data: { source?: string; target?: string; value?: number } }) => {
        if (p.data.source) {
          const value = Number(p.data.value ?? 0);
          return `${p.data.source} → ${p.data.target}<br/>₹${value.toLocaleString('en-IN')}`;
        }
        return '';
      },
    },
    series: [
      {
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'left',
        nodeGap: 14,
        nodeWidth: 18,
        draggable: false,
        data: data.nodes.map((n) => ({
          name: n.name,
          itemStyle: {
            color:
              n.name === 'Total Revenue'
                ? '#d6b65d'
                : n.name === 'PAYROLL' || n.name === 'MARKETING'
                  ? '#ef4444'
                  : '#3b82f6',
            borderColor: '#1e293b',
            borderWidth: 1,
          },
          label: { color: '#e2e8f0', fontSize: 11, fontWeight: 600 },
        })),
        links: data.links.map((l) => ({
          ...l,
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.45 },
        })),
        lineStyle: { color: 'gradient', curveness: 0.5 },
        itemStyle: { borderWidth: 0 },
        label: { color: '#94a3b8', fontSize: 10 },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 420, width: '100%' }} opts={{ renderer: 'canvas' }} />;
}
