'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HrStatCard } from '@/components/hr/HrStatCard';
import {
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import {
  DeanFilterBar,
  buildDeanFilterQuery,
  type DeanFilterValues,
} from '@/components/dean/DeanFilterBar';

type ResearchPayload = {
  projects: number;
  patents: number;
  publications: number;
  research_grants: number;
  industry_collaborations: number;
  faculty_research_scores: Array<{ user_id: string; name: string; department: string; score: number }>;
  department_ranking: Array<{ department: string; publications: number; projects: number }>;
};

export default function DeanResearchPage() {
  const api = useAuthedApi();
  const [filters, setFilters] = useState<DeanFilterValues>({});
  const [departments, setDepartments] = useState<Array<{ dept_id: number; dept_name: string }>>([]);
  const [data, setData] = useState<ResearchPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Array<{ dept_id: number; dept_name: string }>>('/api/academics/dean/departments')
      .then((rows) => setDepartments(rows))
      .catch(() => setDepartments([]));
  }, [api]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const payload = await api.get<ResearchPayload>(
          `/api/academics/dean/intelligence/research${buildDeanFilterQuery(filters)}`,
        );
        setData(payload);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, filters]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Research Dashboard"
        description="Projects, publications, grants, and faculty research performance across your school."
        workspaceLabel="Dean Workspace"
      />

      <DeanFilterBar departments={departments} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Research data unavailable.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <HrStatCard label="Projects" value={data.projects} />
            <HrStatCard label="Patents" value={data.patents} />
            <HrStatCard label="Publications" value={data.publications} />
            <HrStatCard label="Research Grants" value={`₹${data.research_grants.toLocaleString('en-IN')}`} />
            <HrStatCard label="Industry Collaborations" value={data.industry_collaborations} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <HodPanel title="Faculty Research Score">
              <HodDataTable
                columns={[
                  { key: 'name', label: 'Faculty', render: (r) => r.name },
                  { key: 'dept', label: 'Department', render: (r) => r.department ?? '—' },
                  { key: 'score', label: 'Score', render: (r) => String(r.score) },
                ]}
                rows={data.faculty_research_scores}
                rowKey={(r) => r.user_id}
              />
            </HodPanel>

            <HodPanel title="Department Research Ranking">
              <HodDataTable
                columns={[
                  { key: 'dept', label: 'Department', render: (r) => r.department },
                  { key: 'pub', label: 'Publications', render: (r) => String(r.publications) },
                  { key: 'proj', label: 'Projects', render: (r) => String(r.projects) },
                ]}
                rows={data.department_ranking}
                rowKey={(r) => r.department}
              />
            </HodPanel>
          </div>
        </>
      )}
    </HodPageFrame>
  );
}
