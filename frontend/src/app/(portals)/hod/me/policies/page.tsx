import { ZimyoPoliciesPanel } from '@/components/zimyo/ZimyoPoliciesPanel';

export default function HodPoliciesPage() {
  return (
    <div className="min-h-screen bg-slate-50/50 p-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-6">
        <h1 className="text-xl font-bold text-sgvu-navy">My Policies</h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          View, acknowledge, and download company policy documents
        </p>
      </div>
      <ZimyoPoliciesPanel />
    </div>
  );
}
