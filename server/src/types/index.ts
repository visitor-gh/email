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

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  createdAt: string;
  updatedAt: string;
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
