import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { Account, Email, EmailAddress, Attachment, SendEmailOptions } from '../types';

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string;
}

export function testImapConnection(config: ImapConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.secure,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    imap.once('ready', () => {
      imap.end();
      resolve();
    });

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
}

function parseEmailAddressStr(str: string): EmailAddress {
  if (!str) return { email: '' };
  const match = str.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { email: str.trim() };
}

export async function fetchImapMessages(
  account: Account,
  options: { folder?: string; limit?: number; since?: Date } = {}
): Promise<Email[]> {
  const { folder = 'INBOX', limit = 50, since } = options;

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password || '',
      host: account.imapHost || '',
      port: account.imapPort || 993,
      tls: account.imapSecure !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 30000,
      authTimeout: 10000,
    });

    const emails: Email[] = [];

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        const totalMessages = box.messages.total;
        if (totalMessages === 0) {
          imap.end();
          resolve([]);
          return;
        }

        const start = Math.max(1, totalMessages - limit + 1);
        const searchCriteria = since
          ? ['SINCE', since.toDateString()]
          : [`${start}:${totalMessages}`];

        const fetchMessages = (uids: number[] | string) => {
          const fetch = imap.fetch(uids, { bodies: '', struct: true });
          const parsePromises: Promise<void>[] = [];

          fetch.on('message', (msg, _seqno) => {
            const parsePromise = new Promise<void>((res, rej) => {
              const buffers: Buffer[] = [];

              msg.on('body', (stream) => {
                stream.on('data', (chunk: Buffer) => buffers.push(chunk));
              });

              msg.once('end', async () => {
                try {
                  const raw = Buffer.concat(buffers);
                  const parsed = await simpleParser(raw);

                  const fromAddr = parsed.from?.value?.[0];
                  const toAddrs = parsed.to
                    ? (Array.isArray(parsed.to) ? parsed.to.flatMap((a: { value: { name: string; address?: string }[] }) => a.value) : parsed.to.value)
                    : [];
                  const ccAddrs = parsed.cc
                    ? (Array.isArray(parsed.cc) ? parsed.cc.flatMap((a: { value: { name: string; address?: string }[] }) => a.value) : parsed.cc.value)
                    : [];

                  const attachments: Attachment[] = (parsed.attachments || []).map(att => ({
                    id: uuidv4(),
                    filename: att.filename || 'attachment',
                    contentType: att.contentType,
                    size: att.size || 0,
                    data: att.content?.toString('base64'),
                  }));

                  const htmlBody = parsed.html || '';
                  const textBody = parsed.text || '';
                  const messageId = parsed.messageId || uuidv4();
                  const threadId = parsed.inReplyTo || messageId;
                  const date = parsed.date?.toISOString() || new Date().toISOString();

                  const email: Email = {
                    id: uuidv4(),
                    accountId: account.id,
                    threadId,
                    messageId,
                    subject: parsed.subject || '(제목 없음)',
                    from: fromAddr
                      ? { name: fromAddr.name, email: fromAddr.address || '' }
                      : { email: '' },
                    to: toAddrs.map((a: { name?: string; address?: string }) => ({ name: a.name, email: a.address || '' })),
                    cc: ccAddrs.map((a: { name?: string; address?: string }) => ({ name: a.name, email: a.address || '' })),
                    bcc: [],
                    body: htmlBody || `<pre>${textBody}</pre>`,
                    bodyText: textBody,
                    attachments,
                    labels: [],
                    isRead: false,
                    isStarred: false,
                    isImportant: false,
                    isArchived: false,
                    isDeleted: false,
                    isDraft: false,
                    priority: 'normal',
                    date,
                    inReplyTo: parsed.inReplyTo || undefined,
                    references: parsed.references
                      ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references])
                      : undefined,
                    snippet: textBody.slice(0, 200),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  };

                  emails.push(email);
                  res();
                } catch (parseErr) {
                  rej(parseErr);
                }
              });
            });
            parsePromises.push(parsePromise);
          });

          fetch.once('error', (err: Error) => {
            imap.end();
            reject(err);
          });

          fetch.once('end', async () => {
            try {
              await Promise.allSettled(parsePromises);
              imap.end();
              emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              resolve(emails);
            } catch (err) {
              reject(err);
            }
          });
        };

        if (since) {
          imap.search(searchCriteria, (searchErr, results) => {
            if (searchErr) {
              imap.end();
              reject(searchErr);
              return;
            }
            if (!results || results.length === 0) {
              imap.end();
              resolve([]);
              return;
            }
            const uidsToFetch = results.slice(-limit);
            fetchMessages(uidsToFetch);
          });
        } else {
          fetchMessages(`${start}:${totalMessages}`);
        }
      });
    });

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
}

export async function sendImapMessage(
  account: Account,
  options: SendEmailOptions
): Promise<{ messageId: string; threadId: string }> {
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort || 587,
    secure: account.smtpSecure !== false,
    auth: {
      user: account.email,
      pass: account.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const toStr = options.to.map(a => a.name ? `"${a.name}" <${a.email}>` : a.email);
  const ccStr = options.cc?.map(a => a.name ? `"${a.name}" <${a.email}>` : a.email) || [];
  const bccStr = options.bcc?.map(a => a.name ? `"${a.name}" <${a.email}>` : a.email) || [];

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"${account.name}" <${account.email}>`,
    to: toStr,
    cc: ccStr.length > 0 ? ccStr : undefined,
    bcc: bccStr.length > 0 ? bccStr : undefined,
    subject: options.subject,
    html: options.body,
    text: options.bodyText || options.body.replace(/<[^>]*>/g, ''),
    inReplyTo: options.inReplyTo,
    references: options.references?.join(' '),
  };

  const result = await transporter.sendMail(mailOptions);

  return {
    messageId: result.messageId || uuidv4(),
    threadId: options.threadId || options.inReplyTo || result.messageId || uuidv4(),
  };
}

export async function moveToFolder(
  account: Account,
  messageId: string,
  fromFolder: string,
  toFolder: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password || '',
      host: account.imapHost || '',
      port: account.imapPort || 993,
      tls: account.imapSecure !== false,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox(fromFolder, false, (err) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        imap.search([['HEADER', 'MESSAGE-ID', messageId]], (searchErr, uids) => {
          if (searchErr || !uids || uids.length === 0) {
            imap.end();
            if (searchErr) reject(searchErr);
            else resolve();
            return;
          }

          imap.move(uids, toFolder, (moveErr) => {
            imap.end();
            if (moveErr) reject(moveErr);
            else resolve();
          });
        });
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
}
