'use client';

import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { MyPoliciesPanel } from '@/components/self-service/MyPoliciesPanel';

export default function EssPoliciesPage() {
  return (
    <>
      <HrPageHeader 
        title="Company Policies" 
        description="Review active company policies, acknowledge them, and participate in anonymous policy polls." 
      />
      <div className="mt-6">
        <MyPoliciesPanel />
      </div>
    </>
  );
}
