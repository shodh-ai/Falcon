'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { Building, Building2, Briefcase, Globe, MapPin, Users, Trash2, Pencil } from 'lucide-react';

type OrgNode = {
  unit_id: string;
  parent_id: string | null;
  unit_type: string;
  unit_name: string;
  children?: OrgNode[];
};

export default function HrOrgStructurePage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ unit_type: 'DEPARTMENT', unit_name: '', parent_id: '' });

  const load = () => void api.get<OrgNode[]>('/api/hr/admin/org-structure').then(setTree);

  useEffect(() => {
    load();
  }, [api, entityId]);

  async function saveUnit() {
    try {
      const payload = {
        unit_type: form.unit_type,
        unit_name: form.unit_name,
        parent_id: form.parent_id || null, // send null if empty string
      };

      if (editingId) {
        await api.put(`/api/hr/admin/org-structure/${editingId}`, payload);
        toast.success('Org unit updated');
      } else {
        await api.post('/api/hr/admin/org-structure', payload);
        toast.success('Org unit created');
      }
      setForm({ unit_type: 'DEPARTMENT', unit_name: '', parent_id: '' });
      setEditingId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function removeUnit(unitId: string) {
    if (!confirm('Are you sure you want to delete this unit?')) return;
    try {
      await api.del(`/api/hr/admin/org-structure/${unitId}`);
      toast.success('Org unit deleted');
      if (editingId === unitId) {
        setEditingId(null);
        setForm({ unit_type: 'DEPARTMENT', unit_name: '', parent_id: '' });
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  function flattenTree(nodes: OrgNode[]): OrgNode[] {
    let result: OrgNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        result = result.concat(flattenTree(node.children));
      }
    }
    return result;
  }

  const allUnits = flattenTree(tree);

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'ZONE': return { icon: Globe, bg: 'bg-purple-100', text: 'text-purple-700', iconBg: 'bg-purple-50' };
      case 'LOCATION': return { icon: MapPin, bg: 'bg-blue-100', text: 'text-blue-700', iconBg: 'bg-blue-50' };
      case 'BRANCH': return { icon: Building2, bg: 'bg-indigo-100', text: 'text-indigo-700', iconBg: 'bg-indigo-50' };
      case 'DEPARTMENT': return { icon: Users, bg: 'bg-green-100', text: 'text-green-700', iconBg: 'bg-green-50' };
      case 'SUB_DEPARTMENT': return { icon: Users, bg: 'bg-emerald-100', text: 'text-emerald-700', iconBg: 'bg-emerald-50' };
      case 'COST_CENTER': return { icon: Briefcase, bg: 'bg-orange-100', text: 'text-orange-700', iconBg: 'bg-orange-50' };
      default: return { icon: Building, bg: 'bg-gray-100', text: 'text-gray-700', iconBg: 'bg-gray-50' };
    }
  };

  function renderNode(node: OrgNode, depth = 0) {
    const styles = getTypeStyles(node.unit_type);
    const Icon = styles.icon;
    const isEditingThis = editingId === node.unit_id;

    return (
      <div key={node.unit_id} className="relative">
        <div className={`group flex items-center justify-between rounded-md py-2 px-3 transition-colors ${isEditingThis ? 'bg-sgvu-gold/10 ring-1 ring-sgvu-gold/50' : 'hover:bg-slate-50'} ${depth > 0 ? 'mt-1' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-md ${styles.iconBg} ${styles.text}`}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="font-medium text-sm text-slate-800">{node.unit_name}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles.bg} ${styles.text}`}>
              {node.unit_type}
            </span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-sgvu-navy hover:bg-slate-100"
              onClick={() => {
                setEditingId(node.unit_id);
                setForm({ unit_type: node.unit_type, unit_name: node.unit_name, parent_id: node.parent_id || '' });
              }}
              title="Edit unit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => void removeUnit(node.unit_id)}
              title="Delete unit"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {node.children && node.children.length > 0 && (
          <div className="ml-5 pl-4 border-l-2 border-slate-100 mt-1 space-y-1">
            {node.children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <HrPageHeader title="Organization Structure" description="Zone → Location → Branch → Department hierarchy per entity." />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className="rounded-md border border-slate-200 px-3 py-2 text-sm bg-white"
              value={form.unit_type}
              onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
            >
              {['ZONE', 'LOCATION', 'BRANCH', 'DEPARTMENT', 'SUB_DEPARTMENT', 'COST_CENTER'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input placeholder="Unit name" value={form.unit_name} onChange={(e) => setForm({ ...form, unit_name: e.target.value })} />
            <select
              className="rounded-md border border-slate-200 px-3 py-2 text-sm bg-white"
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            >
              <option value="">No parent (Top level)</option>
              {allUnits.map(u => (
                // Prevent selecting itself as a parent
                u.unit_id !== editingId && (
                  <option key={u.unit_id} value={u.unit_id}>{u.unit_name} ({u.unit_type})</option>
                )
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void saveUnit()} disabled={!form.unit_name.trim()}>
              {editingId ? 'Update unit' : 'Create unit'}
            </Button>
            {editingId && (
              <Button size="sm" variant="ghost" onClick={() => {
                setEditingId(null);
                setForm({ unit_type: 'DEPARTMENT', unit_name: '', parent_id: '' });
              }}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-6">
          {tree.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No organization units found. Create one above to get started.</div>
          ) : (
            <div className="space-y-2">{tree.map((n) => renderNode(n))}</div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
