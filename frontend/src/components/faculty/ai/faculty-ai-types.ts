export type FacultyAiRole = 'user' | 'assistant' | 'system';

export type FacultyAiMessage = {
  message_id: string;
  role: FacultyAiRole;
  content: string;
  prompt_type?: string | null;
  token_usage?: number;
  attachments?: Array<{ name: string; mime: string; size: number }> | null;
  created_at?: string;
};

export type FacultyAiConversationSummary = {
  conversation_id: string;
  title: string;
  prompt_type?: string | null;
  token_usage?: number;
  created_at?: string;
  updated_at?: string;
};

export type FacultyAiConversationDetail = FacultyAiConversationSummary & {
  messages: FacultyAiMessage[];
  starter_prompt?: string | null;
};

export type FacultyAiPromptTemplate = {
  id: string;
  label: string;
  category: 'academic' | 'student' | 'research' | 'admin' | 'communication';
  prompt: string;
};

export type FacultyAiContext = {
  faculty_name?: string;
  department?: string | null;
  today_classes?: unknown[];
  pending_attendance?: unknown[];
  upcoming_exams?: unknown[];
  pending_grade_submission?: unknown[];
  research_deadlines?: unknown[];
  meetings_today?: unknown[];
  courses?: Array<{ code?: string; name?: string }>;
  snapshot_text?: string;
};

export type FacultyAiChatResponse = {
  conversation_id: string;
  title: string;
  source?: 'gemini' | 'offline';
  user_message: FacultyAiMessage;
  assistant_message: FacultyAiMessage;
};

export const facultyAiButtonClass = [
  'w-full rounded-xl border-0 bg-sgvu-navy px-3.5 py-2.5 text-left text-sm font-semibold text-sgvu-gold shadow-sm transition',
  'hover:bg-[#123A6D] hover:text-sgvu-gold',
  'active:bg-sgvu-gold active:text-sgvu-navy',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50',
  'disabled:opacity-50',
].join(' ');
