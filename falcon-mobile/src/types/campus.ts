export type CampusWallet = {
  wallet_id: string;
  current_balance: string | number;
  last_updated?: string;
};

export type TransportLive = {
  route_id: string;
  route_name: string;
  stop_name: string;
  stop_lat: number;
  stop_lng: number;
  location: { lat: number; lng: number } | null;
  eta_minutes: number | null;
};

export type HostelAllocation = {
  allocation_id: string;
  hostel_block: string | null;
  room_number: string | null;
  bed_number: string;
  mess_plan: string;
  start_date: string;
  end_date: string;
  status: string;
  warden: { user_id: string; name: string; email: string } | null;
} | null;

export type CampusEvent = {
  event_id: string;
  title: string;
  description?: string;
  venue_name?: string;
  start_at: string;
  end_at: string;
  status: string;
};

export type EcellProject = {
  project_id: string;
  startup_name: string;
  innovation_description: string;
  pitch_deck_url?: string | null;
  requested_funding: string | number;
  approved_funding_amount?: string | number | null;
  current_status: string;
  submitted_at: string;
  cohort_name?: string | null;
};

export type EcellConfig = {
  config_id: string;
  cohort_name: string;
  is_active: boolean;
  max_funding_limit?: string | number | null;
};

export type PlacementHub = {
  open_drives: {
    drive_id: string;
    company_name: string;
    job_title?: string;
    job_role?: string;
    package_lpa?: string | number;
    min_cgpa: string | number;
  }[];
  my_applications: { application_id: string; drive_id: string; status: string }[];
  student_cgpa: number;
  student_backlogs: number;
};

export type HelpdeskTicket = {
  ticket_id: string;
  ticket_ref: string;
  category: string;
  subject: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
  created_at: string;
};

export type ProctorAssignment = {
  mentorship_id: string;
  assigned_at: string;
  proctor: { user_id: string; name: string; email: string; department: string | null };
} | null;

export type ProctorChatMessage = {
  message_id: string;
  sender_type: 'STUDENT' | 'FACULTY';
  message_text: string;
  is_read: boolean;
  sent_at: string;
};

export type StudentProfile = {
  profile_photo_url?: string | null;
  name?: string;
};
