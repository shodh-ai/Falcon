'use client';
import type {ReactNode} from 'react';
import {RoleGate} from '@/components/layout/RoleGate';
import {AppShell} from '@/components/layout/AppShell';
import {StaffProfileFreezeGate} from '@/components/onboarding/StaffProfileFreezeGate';
import {LayoutDashboard,Inbox,UserRound} from 'lucide-react';
import {PortalOnboardingGuard} from '@/components/onboarding/PortalOnboardingGuard';
import {PRINCIPAL_ONBOARDING_CONFIG} from '@/lib/onboarding/portal-onboarding';
import {usePathname} from 'next/navigation';
const config={personaLabel:'Principal Workspace',personaTitle:'Department Leadership',homeHref:'/principal/dashboard',commandItems:[],navGroups:[{title:'Department',items:[{label:'Overview & Academic Data',href:'/principal/dashboard',icon:LayoutDashboard},{label:'Reporting Approvals',href:'/principal/inbox',icon:Inbox},{label:'Personal Faculty Workspace',href:'/faculty/dashboard',icon:UserRound}]}]};
export default function PrincipalLayout({children}:{children:ReactNode}){
 const onboarding=usePathname().startsWith('/principal/onboarding');
 return <RoleGate><PortalOnboardingGuard config={PRINCIPAL_ONBOARDING_CONFIG}>{onboarding?children:<StaffProfileFreezeGate><AppShell config={config}>{children}</AppShell></StaffProfileFreezeGate>}</PortalOnboardingGuard></RoleGate>;
}
