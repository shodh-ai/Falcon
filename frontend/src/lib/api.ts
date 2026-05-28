const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = {
  login: () => `${API_URL}/auth/google`,
  profile: (token: string) => ({
    url: `${API_URL}/auth/profile`,
    headers: { Authorization: `Bearer ${token}` },
  }),
  tasks: {
    myTasks: (token: string, status?: string) => ({
      url: `${API_URL}/tasks/assignments/my${status ? `?status=${status}` : ''}`,
      headers: { Authorization: `Bearer ${token}` },
    }),
    submissions: (token: string, assignmentId: string, data: any) => ({
      url: `${API_URL}/tasks/submissions/${assignmentId}`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      data,
    }),
    upload: (token: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return {
        url: `${API_URL}/uploads/single`,
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        data: formData,
      };
    },
  },
  users: {
    stats: (token: string) => ({
      url: `${API_URL}/users/stats`,
      headers: { Authorization: `Bearer ${token}` },
    }),
  },
  scheduler: {
    distribute: (token: string, month: string) => ({
      url: `${API_URL}/scheduler/distribute`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      data: { month },
    }),
  },
};
