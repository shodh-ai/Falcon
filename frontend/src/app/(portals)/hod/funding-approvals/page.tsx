'use client';

import { useEffect, useState } from 'react';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { toast } from 'sonner';
import { DollarSign, CheckCircle, XCircle, Clock, BookOpen, User } from 'lucide-react';

type FundingRequest = {
  request_id: string;
  project_title: string;
  faculty_name: string;
  amount: number;
  purpose: string;
  status: 'PENDING_HOD' | 'APPROVED_HOD' | 'REJECTED_HOD' | 'TRANSFERRED';
  created_at: string;
};

export default function HodFundingApprovalsPage() {
  const api = useAuthedApi();
  const [requests, setRequests] = useState<FundingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [commitMessage, setCommitMessage] = useState<Record<string, string>>({});

  const fetchRequests = () => {
    setLoading(true);
    api.get<FundingRequest[]>('/api/academics/hod/funding-requests')
      .then(res => setRequests(res || []))
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  }, [api]);

  const handleAction = async (requestId: string, status: 'APPROVED_HOD' | 'REJECTED_HOD') => {
    const msg = commitMessage[requestId] || '';
    if (status === 'REJECTED_HOD' && !msg) {
      return toast.error('A commit message is required for rejection');
    }
    try {
      await api.patch(`/api/academics/hod/funding-requests/${requestId}`, {
        status,
        commitMessage: msg
      });
      toast.success(`Request ${status === 'APPROVED_HOD' ? 'approved' : 'rejected'} successfully`);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'PENDING_HOD');
  const pastRequests = requests.filter(r => r.status !== 'PENDING_HOD');

  if (loading) {
    return <HodPageFrame><div className="p-8 text-center animate-pulse text-slate-500">Loading funding requests...</div></HodPageFrame>;
  }

  return (
    <HodPageFrame>
      <HodPageHeader 
        title="Project Funding Approvals" 
        description="Review and approve funding requests from faculty for their student projects." 
      />

      <div className="space-y-8 mt-6">
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-amber-500" />
            Pending Approvals ({pendingRequests.length})
          </h2>
          
          {pendingRequests.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-500 bg-slate-50">
              No pending funding requests.
            </div>
          ) : (
            <div className="grid gap-6">
              {pendingRequests.map(req => (
                <Card key={req.request_id} className="border-amber-200 shadow-sm overflow-hidden">
                  <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex justify-between items-center">
                    <div className="flex items-center text-amber-800 font-medium">
                      <DollarSign className="w-5 h-5 mr-1 text-amber-600" />
                      Amount Requested: ₹{req.amount.toLocaleString()}
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 shadow-none border-amber-200">Pending HOD Review</Badge>
                  </div>
                  <CardContent className="p-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center"><BookOpen className="w-4 h-4 mr-1"/> Project Title</p>
                          <p className="font-medium text-slate-800 text-lg">{req.project_title}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center"><User className="w-4 h-4 mr-1"/> Requested By (Faculty)</p>
                          <p className="font-medium text-slate-800">{req.faculty_name}</p>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-2">Purpose of Funding</p>
                        <p className="text-slate-700 italic">"{req.purpose}"</p>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-slate-100">
                      <label className="text-sm font-semibold text-slate-700 mb-2 block">HOD Commit Message (Required for rejection)</label>
                      <textarea 
                        placeholder="Leave a note for the faculty or accountant..."
                        value={commitMessage[req.request_id] || ''}
                        onChange={(e) => setCommitMessage({...commitMessage, [req.request_id]: e.target.value})}
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end gap-3">
                    <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleAction(req.request_id, 'REJECTED_HOD')}>
                      <XCircle className="w-4 h-4 mr-2" /> Reject Request
                    </Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20" onClick={() => handleAction(req.request_id, 'APPROVED_HOD')}>
                      <CheckCircle className="w-4 h-4 mr-2" /> Approve Request
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </section>

        {pastRequests.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-slate-600 mb-4 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-slate-400" />
              Past Requests
            </h2>
            <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 border-b font-medium">
                  <tr>
                    <th className="px-6 py-4">Project</th>
                    <th className="px-6 py-4">Faculty</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pastRequests.map(req => (
                    <tr key={req.request_id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-800">{req.project_title}</td>
                      <td className="px-6 py-4 text-slate-600">{req.faculty_name}</td>
                      <td className="px-6 py-4 text-right font-mono text-slate-700">₹{req.amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <Badge 
                          variant="outline" 
                          className={
                            req.status === 'APPROVED_HOD' ? 'text-blue-600 border-blue-200 bg-blue-50' :
                            req.status === 'TRANSFERRED' ? 'text-emerald-600 border-emerald-200 bg-emerald-50' :
                            'text-red-600 border-red-200 bg-red-50'
                          }
                        >
                          {req.status.replace('_HOD', '')}
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
    </HodPageFrame>
  );
}
