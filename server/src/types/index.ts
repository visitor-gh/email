export type AccountType = 'gmail' | 'imap';
export type EmailStatus = 'read' | 'unread';
export type Priority = 'high' | 'normal' | 'low';

export interface Account {
  id: string;
  name: string;
  email: string;
  type: AccountType;
  // Gmail OAuth
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
  // IMAP
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  password?: string;
  // Common
  signature?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
}

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  type: AccountType;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: number | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: number | null;
  password: string | null;
  signature: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
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

export interface EmailRow {
  id: string;
  account_id: string;
  thread_id: string;
  message_id: string;
  subject: string;
  from_address: string;
  to_addresses: string;
  cc_addresses: string;
  bcc_addresses: string;
  reply_to: string | null;
  body: string;
  body_text: string;
  attachments: string;
  is_read: number;
  is_starred: number;
  is_important: number;
  is_archived: number;
  is_deleted: number;
  is_draft: number;
  priority: Priority;
  date: string;
  in_reply_to: string | null;
  references: string | null;
  snippet: string | null;
  created_at: string;
  updated_at: string;
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

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  data?: string; // base64
}

export interface Label {
  id: string;
  accountId: string | null;
  name: string;
  color: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LabelRow {
  id: string;
  account_id: string | null;
  name: string;
  color: string;
  is_system: number;
  created_at: string;
  updated_at: string;
}

export interface EmailLabel {
  emailId: string;
  labelId: string;
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

export interface DraftRow {
  id: string;
  account_id: string;
  subject: string;
  to_addresses: string;
  cc_addresses: string;
  bcc_addresses: string;
  body: string;
  attachments: string;
  in_reply_to: string | null;
  thread_id: string | null;
  created_at: string;
  updated_at: string;
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

export interface TemplateRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface SendEmailOptions {
  accountId: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string;
  bodyText?: string;
  attachments?: Attachment[];
  inReplyTo?: string;
  references?: string[];
  threadId?: string;
}

export interface SearchOptions {
  query: string;
  accountId?: string;
  labelId?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isRead?: boolean;
  isStarred?: boolean;
  isImportant?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface OAuthState {
  accountId?: string;
  redirectUrl?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: GmailPayload;
  internalDate: string;
  sizeEstimate: number;
}

export interface GmailPayload {
  headers: GmailHeader[];
  parts?: GmailPart[];
  body?: GmailBody;
  mimeType: string;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  mimeType: string;
  headers: GmailHeader[];
  body: GmailBody;
  parts?: GmailPart[];
  filename?: string;
  partId?: string;
}

export interface GmailBody {
  size: number;
  data?: string;
  attachmentId?: string;
}
