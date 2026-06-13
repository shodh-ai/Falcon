'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type OverrideLog = {
  log_id: string;
  employee_id: string;
  assigned_approver: string | null;
  bypassed_by: string | null;
  type_of_action: string;
  type_of_request: string;
  date_and_time: string;
};

export default function OverrideLogsPage() {
  const api = useAuthedApi();
  const [logs, setLogs] = useState<OverrideLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<OverrideLog[]>('/api/super-admin/override-logs')
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [api]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">HR Admin Override Logs</h1>
      <p className="text-sm text-muted-foreground">
        Audit log of all workflow requests bypassed or force-rejected by HR administrators.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Override Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/50 font-medium whitespace-nowrap">
                  <th className="p-3">Log ID</th>
                  <th className="p-3">Employee ID</th>
                  <th className="p-3">Assigned Approver</th>
                  <th className="p-3">Action By</th>
                  <th className="p-3">Type of Action</th>
                  <th className="p-3">Type of Request</th>
                  <th className="p-3">Date and Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.log_id} className="hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs text-muted-foreground">{log.log_id.slice(0, 8)}...</td>
                    <td className="p-3 font-medium">{log.employee_id}</td>
                    <td className="p-3">{log.assigned_approver || '—'}</td>
                    <td className="p-3">{log.bypassed_by || '—'}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        log.type_of_action.toLowerCase().includes('approve') 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {log.type_of_action}
                      </span>
                    </td>
                    <td className="p-3">{log.type_of_request}</td>
                    <td className="p-3 whitespace-nowrap">{new Date(log.date_and_time).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No override logs found.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Loading logs...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
