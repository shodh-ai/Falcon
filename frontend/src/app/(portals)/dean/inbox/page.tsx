'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { toast } from 'sonner';
import { CheckCircle, XCircle, DollarSign, Building, User, FileText } from 'lucide-react';

type FundingRequest = {
  request_id: string;
  project_title: string;
  faculty_name: string;
  dept_name: string;
  amount: number;
  purpose: string;
  status: 'APPROVED_HOD';
  created_at: string;
};

export default function DeanInboxPage() {
  const api = useAuthedApi();
  const [requests, setRequests] = useState<FundingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Record<string, string>>({});

  const fetchRequests = () => {
    setLoading(true);
    api.get<FundingRequest[]>('/api/academics/dean/funding-requests')
      .then(res => setRequests((res || []).filter(r => r.status === 'APPROVED_HOD')))
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  }, [api]);

  const handleAction = async (requestId: string, action: 'APPROVED_DEAN' | 'REJECTED_DEAN') => {
    const comment = comments[requestId] || '';
    if (action === 'REJECTED_DEAN' && !comment.trim()) {
      return toast.error('A comment is required when rejecting a request.');
    }

    try {
      await api.patch(`/api/academics/dean/funding-requests/${requestId}`, {
        status: action,
        commitMessage: comment,
      });
      toast.success(`Request ${action === 'APPROVED_DEAN' ? 'approved' : 'rejected'} successfully.`);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Dean Approval Inbox</h1>
        <p className="text-slate-600 mt-2">Review funding requests that have been approved by the HOD.</p>
      </div>

      {loading ? (
        <div className="p-8 text-center animate-pulse text-slate-500">Loading pending requests...</div>
      ) : requests.length === 0 ? (
        <div className="p-12 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-500 bg-slate-50">
          <CheckCircle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700">You're all caught up!</h3>
          <p className="mt-1">There are no pending funding requests requiring your approval.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {requests.map(req => (
            <Card key={req.request_id} className="border-indigo-100 shadow-sm">
              <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex justify-between items-center">
                <div className="flex items-center text-indigo-800 font-medium">
                  <DollarSign className="w-5 h-5 mr-1 text-indigo-600" />
                  Amount: ₹{req.amount.toLocaleString()}
                </div>
                <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Pending Dean</Badge>
              </div>
              <CardContent className="p-6 space-y-4">
                <div>
                  <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-1">Project Title</p>
                  <p className="font-medium text-slate-800 text-lg">{req.project_title}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center"><User className="w-3 h-3 mr-1"/> Faculty</p>
                    <p className="font-medium text-slate-700">{req.faculty_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center"><Building className="w-3 h-3 mr-1"/> Department</p>
                    <p className="font-medium text-slate-700">{req.dept_name}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center"><FileText className="w-3 h-3 mr-1"/> Purpose</p>
                  <p className="text-sm text-slate-600">{req.purpose}</p>
                </div>
                
                <div className="pt-2">
                  <p className="text-sm font-medium text-slate-700 mb-2">Dean's Comment</p>
                  <textarea 
                    placeholder="Add an optional comment..." 
                    className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    value={comments[req.request_id] || ''}
                    onChange={(e) => setComments(prev => ({ ...prev, [req.request_id]: e.target.value }))}
                  />
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end space-x-3">
                <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => handleAction(req.request_id, 'REJECTED_DEAN')}>
                  <XCircle className="w-4 h-4 mr-2" /> Reject
                </Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => handleAction(req.request_id, 'APPROVED_DEAN')}>
                  <CheckCircle className="w-4 h-4 mr-2" /> Approve Request
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
