'use client';

import { CampusAdminHierarchyPage } from '@/components/campus-admin/CampusAdminHierarchyPage';
import {DepartmentLeadershipEditor} from '@/components/campus-admin/DepartmentLeadershipEditor';

export default function CampusHierarchyRoute() {
  return <><CampusAdminHierarchyPage /><DepartmentLeadershipEditor/></>;
}
