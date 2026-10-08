'use client';

import { useMemo } from 'react';
import { useAuthedApi } from '@/lib/api';

export function usePresidentApi() {
  const api = useAuthedApi();

  return useMemo(
    () => ({
      reviewHrApproval: (requestId: string, approve: boolean, note?: string) =>
        api.post(`/api/president/hr-approvals/${requestId}/review`, { approve, note }),
      createExecutiveOrder: (body: {
        subject: string;
        body: string;
        destination_module: string;
        order_type?: string;
        assigned_to_user_id?: string;
      }) => api.post('/api/president/executive-orders', body),
      updateExecutiveOrderStatus: (orderId: string, status: string) =>
        api.patch(`/api/president/executive-orders/${orderId}/status`, { status }),
      grievanceDecision: (
        ticketId: string,
        body: { decision: string; assigned_officer_user_id?: string },
      ) => api.post(`/api/president/grievances/${ticketId}/decide`, body),
      pendingRatifications: () =>
        api.get<Array<Record<string, unknown>>>('/api/president/convocation/pending-ratification'),
      ratifyConvocation: (applicationId: string, approve: boolean, note?: string) =>
        api.post(`/api/president/convocation/${applicationId}/ratify`, { approve, note }),
      complianceAction: (
        assignmentId: string,
        action: 'ASSIGN_INVESTIGATION' | 'ESCALATE_DEPARTMENT' | 'REQUEST_REPORT' | 'MARK_REVIEWED',
        note?: string,
      ) => api.post(`/api/president/compliance/${assignmentId}/action`, { action, note }),
      meetingActionItems: (
        meetingId: string,
        items: Array<{ title: string; assigned_to_user_id: string; due_at?: string }>,
      ) => api.post(`/api/president/meetings/${meetingId}/action-items`, { items }),
    }),
    [api],
  );
}
