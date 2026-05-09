import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import {
  Email,
  EmailAddress,
  Attachment,
  GmailMessage,
  GmailHeader,
  GmailPart,
  SendEmailOptions,
  Account,
} from '../types';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/accounts/oauth/callback'
  );
}

export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state: state ? Buffer.from(JSON.stringify(state)).toString('base64') : undefined,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  email: string;
  name: string;
}> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);

  // Get user info
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();

  return {
    accessToken: tokens.access_token || '',
    refreshToken: tokens.refresh_token || '',
    tokenExpiry: tokens.expiry_date || Date.now() + 3600000,
    email: userInfo.data.email || '',
    name: userInfo.data.name || '',
  };
}

export function createGmailClient(account: Account): gmail_v1.Gmail {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiry,
  });

  // Auto-refresh token
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.access_token) {
      account.accessToken = tokens.access_token;
    }
    if (tokens.expiry_date) {
      account.tokenExpiry = tokens.expiry_date;
    }
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function refreshAccessToken(account: Account): Promise<{
  accessToken: string;
  tokenExpiry: number;
}> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: account.refreshToken,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  return {
    accessToken: credentials.access_token || '',
    tokenExpiry: credentials.expiry_date || Date.now() + 3600000,
  };
}

function parseEmailAddress(addressStr: string): EmailAddress {
  if (!addressStr) return { email: '' };

  const match = addressStr.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { email: addressStr.trim() };
}

function parseEmailAddresses(addressStr: string): EmailAddress[] {
  if (!addressStr) return [];
  return addressStr.split(',').map(a => parseEmailAddress(a.trim())).filter(a => a.email);
}

function getHeader(headers: GmailHeader[], name: string): string {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBodyFromParts(
  parts: GmailPart[],
  mimeType: string = 'text/html'
): string {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) {
      return decodeBase64(part.body.data);
    }
    if (part.parts) {
      const nested = extractBodyFromParts(part.parts, mimeType);
      if (nested) return nested;
    }
  }
  return '';
}

function extractAttachments(parts: GmailPart[]): Attachment[] {
  const attachments: Attachment[] = [];

  function traverse(parts: GmailPart[]) {
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          contentType: part.mimeType,
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        traverse(part.parts);
      }
    }
  }

  traverse(parts);
  return attachments;
}

export function parseGmailMessage(msg: GmailMessage, accountId: string): Email {
  const headers = msg.payload?.headers || [];
  const subject = getHeader(headers, 'Subject');
  const fromStr = getHeader(headers, 'From');
  const toString = getHeader(headers, 'To');
  const ccStr = getHeader(headers, 'Cc');
  const bccStr = getHeader(headers, 'Bcc');
  const replyToStr = getHeader(headers, 'Reply-To');
  const messageId = getHeader(headers, 'Message-ID') || msg.id;
  const inReplyTo = getHeader(headers, 'In-Reply-To');
  const referencesStr = getHeader(headers, 'References');
  const dateStr = getHeader(headers, 'Date');

  let htmlBody = '';
  let textBody = '';
  let attachments: Attachment[] = [];

  if (msg.payload?.parts) {
    htmlBody = extractBodyFromParts(msg.payload.parts, 'text/html');
    textBody = extractBodyFromParts(msg.payload.parts, 'text/plain');
    attachments = extractAttachments(msg.payload.parts);
  } else if (msg.payload?.body?.data) {
    const decoded = decodeBase64(msg.payload.body.data);
    if (msg.payload.mimeType === 'text/html') {
      htmlBody = decoded;
    } else {
      textBody = decoded;
    }
  }

  const labelIds = msg.labelIds || [];
  const isRead = !labelIds.includes('UNREAD');
  const isStarred = labelIds.includes('STARRED');
  const isImportant = labelIds.includes('IMPORTANT');
  const isArchived = !labelIds.includes('INBOX') && !isRead;
  const isDraft = labelIds.includes('DRAFT');
  const isDeleted = labelIds.includes('TRASH');

  const labels = labelIds.filter(l =>
    !['UNREAD', 'STARRED', 'IMPORTANT', 'INBOX', 'DRAFT', 'TRASH', 'SPAM', 'SENT', 'CATEGORY_PERSONAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CATEGORY_SOCIAL'].includes(l)
  );

  const date = dateStr ? new Date(dateStr).toISOString() : new Date(parseInt(msg.internalDate)).toISOString();

  return {
    id: uuidv4(),
    accountId,
    threadId: msg.threadId,
    messageId,
    subject,
    from: parseEmailAddress(fromStr),
    to: parseEmailAddresses(toString),
    cc: parseEmailAddresses(ccStr),
    bcc: parseEmailAddresses(bccStr),
    replyTo: replyToStr ? parseEmailAddress(replyToStr) : undefined,
    body: htmlBody || `<pre>${textBody}</pre>`,
    bodyText: textBody || htmlBody.replace(/<[^>]*>/g, ''),
    attachments,
    labels,
    isRead,
    isStarred,
    isImportant,
    isArchived,
    isDeleted,
    isDraft,
    priority: isImportant ? 'high' : 'normal',
    date,
    inReplyTo: inReplyTo || undefined,
    references: referencesStr ? referencesStr.split(/\s+/) : undefined,
    snippet: msg.snippet || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchGmailMessages(
  account: Account,
  options: {
    labelIds?: string[];
    query?: string;
    maxResults?: number;
    pageToken?: string;
  } = {}
): Promise<{ emails: Email[]; nextPageToken?: string; total: number }> {
  const gmail = createGmailClient(account);

  const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
    userId: 'me',
    maxResults: options.maxResults || 50,
    labelIds: options.labelIds,
    q: options.query,
    pageToken: options.pageToken,
  };

  const listResponse = await gmail.users.messages.list(listParams);
  const messages = listResponse.data.messages || [];
  const nextPageToken = listResponse.data.nextPageToken || undefined;
  const total = listResponse.data.resultSizeEstimate || 0;

  const emails: Email[] = [];

  // Fetch messages in batches
  const batchSize = 10;
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(msg =>
        gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        })
      )
    );

    for (const result of batchResults) {
      if (result.data) {
        emails.push(parseGmailMessage(result.data as GmailMessage, account.id));
      }
    }
  }

  return { emails, nextPageToken, total };
}

export async function sendGmailMessage(
  account: Account,
  options: SendEmailOptions
): Promise<{ messageId: string; threadId: string }> {
  const gmail = createGmailClient(account);

  const toStr = options.to.map(a => a.name ? `"${a.name}" <${a.email}>` : a.email).join(', ');
  const ccStr = options.cc?.map(a => a.name ? `"${a.name}" <${a.email}>` : a.email).join(', ') || '';
  const bccStr = options.bcc?.map(a => a.name ? `"${a.name}" <${a.email}>` : a.email).join(', ') || '';

  let rawMessage = [
    `From: "${account.name}" <${account.email}>`,
    `To: ${toStr}`,
    ccStr ? `Cc: ${ccStr}` : '',
    bccStr ? `Bcc: ${bccStr}` : '',
    `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(options.body).toString('base64'),
  ]
    .filter(line => line !== '')
    .join('\r\n');

  if (options.inReplyTo) {
    rawMessage = rawMessage.replace(
      'MIME-Version',
      `In-Reply-To: ${options.inReplyTo}\r\nReferences: ${options.references?.join(' ') || options.inReplyTo}\r\nMIME-Version`
    );
  }

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendParams: gmail_v1.Params$Resource$Users$Messages$Send = {
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
      threadId: options.threadId,
    },
  };

  const result = await gmail.users.messages.send(sendParams);

  return {
    messageId: result.data.id || '',
    threadId: result.data.threadId || '',
  };
}

export async function modifyGmailMessage(
  account: Account,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  const gmail = createGmailClient(account);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
}

export async function deleteGmailMessage(account: Account, messageId: string): Promise<void> {
  const gmail = createGmailClient(account);
  await gmail.users.messages.trash({ userId: 'me', id: messageId });
}

export async function getGmailAttachment(
  account: Account,
  messageId: string,
  attachmentId: string
): Promise<string> {
  const gmail = createGmailClient(account);
  const result = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  return result.data.data || '';
}
