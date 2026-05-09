import axios, { AxiosError } from 'axios';
import {
  Account,
  Email,
  Thread,
  Label,
  Draft,
  Template,
  ApiResponse,
  PaginatedEmailResult,
  EmailAddress,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.response.use(
  res => res,
  (err: AxiosError<ApiResponse>) => {
    const message = err.response?.data?.error || err.message || '서버 오류가 발생했습니다';
    return Promise.reject(new Error(message));
  }
);

// ─── Accounts ───────────────────────────────────────────────────────────────

export const accountsApi = {
  list: async (): Promise<Account[]> => {
    const res = await api.get<ApiResponse<Account[]>>('/accounts');
    return res.data.data || [];
  },

  get: async (id: string): Promise<Account> => {
    const res = await api.get<ApiResponse<Account>>(`/accounts/${id}`);
    return res.data.data!;
  },

  getOAuthUrl: async (): Promise<string> => {
    const res = await api.get<ApiResponse<{ url: string }>>('/accounts/oauth/url');
    return res.data.data!.url;
  },

  createImap: async (data: {
    name: string;
    email: string;
    imapHost: string;
    imapPort: number;
    imapSecure?: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure?: boolean;
    password: string;
    signature?: string;
  }): Promise<Account> => {
    const res = await api.post<ApiResponse<Account>>('/accounts', { ...data, type: 'imap' });
    return res.data.data!;
  },

  update: async (id: string, data: Partial<Account> & { password?: string }): Promise<Account> => {
    const res = await api.put<ApiResponse<Account>>(`/accounts/${id}`, data);
    return res.data.data!;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/accounts/${id}`);
  },

  sync: async (id: string): Promise<{ synced: number }> => {
    const res = await api.post<ApiResponse<{ synced: number }>>(`/accounts/${id}/sync`);
    return res.data.data!;
  },
};

// ─── Emails ─────────────────────────────────────────────────────────────────

export interface EmailListParams {
  accountId?: string;
  labelId?: string;
  folder?: string;
  page?: number;
  limit?: number;
  q?: string;
  threaded?: boolean;
}

export const emailsApi = {
  list: async (params: EmailListParams = {}): Promise<PaginatedEmailResult> => {
    const res = await api.get<ApiResponse<PaginatedEmailResult>>('/emails', {
      params: {
        ...params,
        threaded: params.threaded !== false ? 'true' : 'false',
      },
    });
    return res.data.data!;
  },

  get: async (id: string): Promise<Email> => {
    const res = await api.get<ApiResponse<Email>>(`/emails/${id}`);
    return res.data.data!;
  },

  getThread: async (threadId: string): Promise<Thread> => {
    const res = await api.get<ApiResponse<Thread>>(`/emails/thread/${threadId}`);
    return res.data.data!;
  },

  send: async (data: {
    accountId: string;
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string[];
    threadId?: string;
  }): Promise<{ id: string; threadId: string }> => {
    const res = await api.post<ApiResponse<{ id: string; threadId: string }>>('/emails/send', data);
    return res.data.data!;
  },

  markRead: async (id: string, isRead: boolean): Promise<void> => {
    await api.patch(`/emails/${id}/read`, { isRead });
  },

  markThreadRead: async (threadId: string, isRead: boolean): Promise<void> => {
    await api.patch(`/emails/thread/${threadId}/read`, { isRead });
  },

  star: async (id: string, isStarred: boolean): Promise<void> => {
    await api.patch(`/emails/${id}/star`, { isStarred });
  },

  markImportant: async (id: string, isImportant: boolean): Promise<void> => {
    await api.patch(`/emails/${id}/important`, { isImportant });
  },

  archive: async (id: string, isArchived: boolean): Promise<void> => {
    await api.patch(`/emails/${id}/archive`, { isArchived });
  },

  delete: async (id: string, permanent?: boolean): Promise<void> => {
    await api.delete(`/emails/${id}`, { params: { permanent: permanent ? 'true' : undefined } });
  },

  addLabel: async (emailId: string, labelId: string): Promise<void> => {
    await api.post(`/emails/${emailId}/labels`, { labelId });
  },

  removeLabel: async (emailId: string, labelId: string): Promise<void> => {
    await api.delete(`/emails/${emailId}/labels/${labelId}`);
  },

  search: async (query: string, accountId?: string, page = 1, limit = 50): Promise<PaginatedEmailResult> => {
    const res = await api.get<ApiResponse<PaginatedEmailResult>>('/emails/search/results', {
      params: { q: query, accountId, page, limit },
    });
    return res.data.data!;
  },

  batch: async (
    ids: string[],
    action: 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'unarchive' | 'delete' | 'restore'
  ): Promise<void> => {
    await api.post('/emails/batch', { ids, action });
  },
};

// ─── Labels ─────────────────────────────────────────────────────────────────

export const labelsApi = {
  list: async (accountId?: string): Promise<(Label & { emailCount: number })[]> => {
    const res = await api.get<ApiResponse<(Label & { emailCount: number })[]>>('/labels', {
      params: { accountId },
    });
    return res.data.data || [];
  },

  create: async (data: { name: string; color?: string; accountId?: string }): Promise<Label> => {
    const res = await api.post<ApiResponse<Label>>('/labels', data);
    return res.data.data!;
  },

  update: async (id: string, data: { name?: string; color?: string }): Promise<Label> => {
    const res = await api.put<ApiResponse<Label>>(`/labels/${id}`, data);
    return res.data.data!;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/labels/${id}`);
  },
};

// ─── Drafts ─────────────────────────────────────────────────────────────────

export const draftsApi = {
  list: async (accountId?: string): Promise<Draft[]> => {
    const res = await api.get<ApiResponse<Draft[]>>('/drafts', {
      params: { accountId },
    });
    return res.data.data || [];
  },

  get: async (id: string): Promise<Draft> => {
    const res = await api.get<ApiResponse<Draft>>(`/drafts/${id}`);
    return res.data.data!;
  },

  save: async (data: Partial<Draft> & { accountId: string }): Promise<Draft> => {
    const res = await api.post<ApiResponse<Draft>>('/drafts', data);
    return res.data.data!;
  },

  update: async (id: string, data: Partial<Draft>): Promise<Draft> => {
    const res = await api.put<ApiResponse<Draft>>(`/drafts/${id}`, data);
    return res.data.data!;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/drafts/${id}`);
  },
};

// ─── Templates ──────────────────────────────────────────────────────────────

export const templatesApi = {
  list: async (category?: string): Promise<{ templates: Template[]; grouped: Record<string, Template[]> }> => {
    const res = await api.get<ApiResponse<{ templates: Template[]; grouped: Record<string, Template[]> }>>(
      '/templates',
      { params: { category } }
    );
    return res.data.data!;
  },

  get: async (id: string): Promise<Template> => {
    const res = await api.get<ApiResponse<Template>>(`/templates/${id}`);
    return res.data.data!;
  },

  create: async (data: { name: string; subject: string; body: string; category?: string }): Promise<Template> => {
    const res = await api.post<ApiResponse<Template>>('/templates', data);
    return res.data.data!;
  },

  update: async (id: string, data: Partial<Template>): Promise<Template> => {
    const res = await api.put<ApiResponse<Template>>(`/templates/${id}`, data);
    return res.data.data!;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/templates/${id}`);
  },
};

export default api;
