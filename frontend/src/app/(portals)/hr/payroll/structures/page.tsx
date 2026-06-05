'use client';

import { useEffect, useState } from 'react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type PayPackage = {
  package_id: string;
  employee_name: string;
  employee_id: string;
  basic_pay: string;
  hra: string;
  da: string;
  pf_deduction: string;
  tds_deduction: string;
  net_salary: string;
};

export default function HrSalaryStructuresPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [packages, setPackages] = useState<PayPackage[]>([]);

  useEffect(() => {
    void api.get<PayPackage[]>('/api/hr/payroll/packages').then(setPackages);
  }, [api, entityId]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="Salary Structures"
        description="Per-employee pay breakdown: Basic, DA, HRA, PF, and TDS components."
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3">Employee</th>
                <th className="p-3">Basic</th>
                <th className="p-3">HRA</th>
                <th className="p-3">DA</th>
                <th className="p-3">PF</th>
                <th className="p-3">TDS</th>
                <th className="p-3">Net</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.package_id} className="border-b">
                  <td className="p-3">
                    {p.employee_name}
                    <span className="block text-xs text-muted-foreground">{p.employee_id}</span>
                  </td>
                  <td className="p-3">₹{Number(p.basic_pay).toLocaleString()}</td>
                  <td className="p-3">₹{Number(p.hra).toLocaleString()}</td>
                  <td className="p-3">₹{Number(p.da).toLocaleString()}</td>
                  <td className="p-3">₹{Number(p.pf_deduction).toLocaleString()}</td>
                  <td className="p-3">₹{Number(p.tds_deduction).toLocaleString()}</td>
                  <td className="p-3 font-semibold">₹{Number(p.net_salary).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {packages.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No salary packages configured yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
