import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AttendanceSummary,
  DashboardMetrics,
  MarksHistory,
  TimetableSlot,
} from '@/types/academics';
import type { FalconNotification } from '@/types/notifications';
import type {
  CampusEvent,
  EcellConfig,
  EcellProject,
  CampusWallet,
  HelpdeskTicket,
  HostelAllocation,
  PlacementHub,
  ProctorAssignment,
  ProctorChatMessage,
  StudentProfile,
  TransportLive,
} from '@/types/campus';

export function useTodayTimetable() {
  return useQuery({
    queryKey: ['timetable', 'today'],
    queryFn: async () => {
      const { data } = await api.get<TimetableSlot[]>('/api/academics/dashboard/timetable/today');
      return data;
    },
  });
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: async () => {
      const { data } = await api.get<DashboardMetrics>('/api/academics/dashboard/metrics');
      return data;
    },
  });
}

export function useAttendanceSummary() {
  return useQuery({
    queryKey: ['attendance', 'summary'],
    queryFn: async () => {
      const { data } = await api.get<AttendanceSummary>('/api/student/attendance');
      return data;
    },
  });
}

export function useMarksHistory() {
  return useQuery({
    queryKey: ['marks', 'history'],
    queryFn: async () => {
      const { data } = await api.get<MarksHistory>('/api/academics/marks/history');
      return data;
    },
  });
}

export function useRecentNotifications() {
  return useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: async () => {
      const { data } = await api.get<FalconNotification[]>('/api/notifications/recent');
      return data;
    },
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>('/api/notifications/unread-count');
      return data.count;
    },
  });
}

export function useStudentProfile() {
  return useQuery({
    queryKey: ['student', 'profile'],
    queryFn: async () => {
      const { data } = await api.get<StudentProfile>('/api/student/profile');
      return data;
    },
  });
}

export function useCampusWallet() {
  return useQuery({
    queryKey: ['campus-wallet'],
    queryFn: async () => {
      const { data } = await api.get<CampusWallet>('/api/campus-wallet/me');
      return data;
    },
  });
}

export function useTransportLive() {
  return useQuery({
    queryKey: ['transport', 'live'],
    queryFn: async () => {
      const { data } = await api.get<TransportLive>('/api/transport/live');
      return data;
    },
    refetchInterval: 15_000,
  });
}

export function useHostelAllocation() {
  return useQuery({
    queryKey: ['hostel', 'allocation'],
    queryFn: async () => {
      const { data } = await api.get<HostelAllocation>('/api/operations/hostel/my-allocation');
      return data;
    },
  });
}

export function useCampusEvents() {
  return useQuery({
    queryKey: ['campus-events'],
    queryFn: async () => {
      const { data } = await api.get<CampusEvent[]>('/api/campus-events/events');
      return data;
    },
  });
}

export function useEcellProjects() {
  return useQuery({
    queryKey: ['ecell', 'projects'],
    queryFn: async () => {
      const { data } = await api.get<EcellProject[]>('/api/ecell/projects/mine');
      return data;
    },
  });
}

export function useEcellConfig() {
  return useQuery({
    queryKey: ['ecell', 'config'],
    queryFn: async () => {
      const { data } = await api.get<EcellConfig | null>('/api/ecell/config/active');
      return data;
    },
  });
}

export function usePlacementHub() {
  return useQuery({
    queryKey: ['placement', 'hub'],
    queryFn: async () => {
      const { data } = await api.get<PlacementHub>('/api/placement/student/hub');
      return data;
    },
  });
}

export function useHelpdeskTickets() {
  return useQuery({
    queryKey: ['helpdesk', 'tickets'],
    queryFn: async () => {
      const { data } = await api.get<HelpdeskTicket[]>('/api/helpdesk/tickets/my-tickets');
      return data;
    },
  });
}

export function useProctorAssignment() {
  return useQuery({
    queryKey: ['proctor', 'assignment'],
    queryFn: async () => {
      const { data } = await api.get<ProctorAssignment>('/api/academics/proctor/me');
      return data;
    },
  });
}

export function useProctorChat() {
  return useQuery({
    queryKey: ['proctor', 'chat'],
    queryFn: async () => {
      const { data } = await api.get<ProctorChatMessage[]>('/api/academics/proctor/chat/my');
      return data;
    },
    refetchInterval: 10_000,
  });
}
