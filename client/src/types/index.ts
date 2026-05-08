export type AccountType = 'gmail' | 'imap';
export type Priority = 'high' | 'normal' | 'low';

export interface Account {
  id: string;
  name: string;
  email: string;
  type: AccountType;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  signature?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  data?: string;
}

export interface Email {
  id: string;
  accountId: string;
  accountEmail?: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo?: EmailAddress;
  body: string;
  bodyText: string;
  attachments: Attachment[];
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  isDraft: boolean;
  priority: Priority;
  date: string;
  inReplyTo?: string;
  references?: string[];
  snippet?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  accountId: string;
  subject: string;
  emails: Email[];
  lastEmail: Email;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  labels: string[];
  participantCount: number;
  emailCount: number;
}

export interface Label {
  id: string;
  accountId: string | null;
  name: string;
  color: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  emailCount?: number;
}

export interface Draft {
  id: string;
  accountId: string;
  subject: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  body: string;
  attachments: Attachment[];
  inReplyTo?: string;
  threadId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComposeData {
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  body: string;
  accountId: string;
  inReplyTo?: string;
  references?: string[];
  threadId?: string;
  draftId?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedEmailResult {
  threads?: Thread[];
  data?: Email[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type FolderType =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'starred'
  | 'important'
  | 'archive'
  | 'trash'
  | 'unread';
