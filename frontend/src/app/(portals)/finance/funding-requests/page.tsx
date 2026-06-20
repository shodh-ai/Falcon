'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { toast } from 'sonner';
import { DollarSign, CheckCircle, ArrowRightCircle, Building, User, Clock } from 'lucide-react';

type FundingRequest = {
  request_id: string;
  project_title: string;
  faculty_name: string;
  dept_name: string;
  amount: number;
  purpose: string;
  status: 'APPROVED_DEAN' | 'TRANSFERRED';
  created_at: string;
};

export default function FinanceFundingRequestsPage() {
  const api = useAuthedApi();
  const [requests, setRequests] = useState<FundingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = () => {
    setLoading(true);
    api.get<FundingRequest[]>('/api/finance/funding-requests')
      .then(res => setRequests(res || []))
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  }, [api]);

  const handleTransfer = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to initiate this transfer? This action is irreversible.')) return;
    
    try {
      await api.patch(`/api/finance/funding-requests/${requestId}/transfer`);
      toast.success('Funds transferred successfully. Faculty and HOD have been notified.');
      fetchRequests();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const pendingTransfers = requests.filter(r => r.status === 'APPROVED_DEAN');
  const completedTransfers = requests.filter(r => r.status === 'TRANSFERRED');

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-sgvu-navy">Project Funding Disbursals</h1>
        <p className="text-slate-600 mt-2">Manage and transfer approved funds to faculty bank accounts.</p>
      </div>

      {loading ? (
        <div className="p-8 text-center animate-pulse text-slate-500">Loading disbursals...</div>
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-indigo-500" />
              Pending Disbursals ({pendingTransfers.length})
            </h2>
            
            {pendingTransfers.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-500 bg-slate-50">
                No approved funding requests awaiting transfer.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {pendingTransfers.map(req => (
                  <Card key={req.request_id} className="border-indigo-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex justify-between items-center">
                      <div className="flex items-center text-indigo-800 font-medium">
                        <DollarSign className="w-5 h-5 mr-1 text-indigo-600" />
                        Approved Amount: ₹{req.amount.toLocaleString()}
                      </div>
                      <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 shadow-none border-indigo-200">Awaiting Transfer</Badge>
                    </div>
                    <CardContent className="p-6 space-y-4">
                      <div>
                        <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-1">Project Title</p>
                        <p className="font-medium text-slate-800 text-lg">{req.project_title}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center"><User className="w-3 h-3 mr-1"/> Faculty Beneficiary</p>
                          <p className="font-medium text-slate-700">{req.faculty_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center"><Building className="w-3 h-3 mr-1"/> Department</p>
                          <p className="font-medium text-slate-700">{req.dept_name}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1">Approved Purpose</p>
                        <p className="text-sm text-slate-600">{req.purpose}</p>
                      </div>
                    </CardContent>
                    <CardFooter className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end">
                      <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20" onClick={() => handleTransfer(req.request_id)}>
                        <ArrowRightCircle className="w-4 h-4 mr-2" /> Initiate Bank Transfer
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {completedTransfers.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-600 mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2 text-emerald-500" />
                Completed Disbursals
              </h2>
              <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b font-medium">
                    <tr>
                      <th className="px-6 py-4">Project</th>
                      <th className="px-6 py-4">Beneficiary</th>
                      <th className="px-6 py-4">Department</th>
                      <th className="px-6 py-4 text-right">Amount Disbursed</th>
                      <th className="px-6 py-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedTransfers.map(req => (
                      <tr key={req.request_id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-800">{req.project_title}</td>
                        <td className="px-6 py-4 text-slate-600">{req.faculty_name}</td>
                        <td className="px-6 py-4 text-slate-600">{req.dept_name}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-700 font-medium">₹{req.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 font-normal">
                            Transferred
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
