'use client';

import ReactECharts from 'echarts-for-react';
import { buildMockSankey } from './budget-fpa-mock-data';

type SankeyData = {
  nodes: { name: string }[];
  links: { source: string; target: string; value: number }[];
};

export function BudgetSankeyChart({ data }: { data?: SankeyData }) {
  const { nodes, links } = data ?? buildMockSankey();

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (p: { data: { source?: string; target?: string; value?: number } }) => {
        if (p.data.source) {
          return `${p.data.source} → ${p.data.target}<br/>₹${p.data.value} Cr flow`;
        }
        return p.data.source ?? '';
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
        data: nodes.map((n) => ({
          name: n.name,
          itemStyle: {
            color:
              n.name === 'University Budget'
                ? '#d6b65d'
                : n.name.includes('Catering') || n.name === 'Vendors'
                  ? '#ef4444'
                  : '#3b82f6',
            borderColor: '#1e293b',
            borderWidth: 1,
          },
          label: { color: '#e2e8f0', fontSize: 11, fontWeight: 600 },
        })),
        links: links.map((l) => ({
          ...l,
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.45 },
        })),
        lineStyle: { color: 'gradient', curveness: 0.5 },
        itemStyle: { borderWidth: 0 },
        label: { color: '#94a3b8', fontSize: 10 },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 360, width: '100%' }} opts={{ renderer: 'canvas' }} />;
}
