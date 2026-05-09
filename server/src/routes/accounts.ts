import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getCollection, getDb, getClient } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getAuthUrl, exchangeCodeForTokens } from '../services/gmail';
import { testImapConnection } from '../services/imap';
import { Account, ApiResponse } from '../types';

const router = Router();

interface AccountDoc {
  _id: string;
  name: string;
  email: string;
  type: 'gmail' | 'imap';
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiry?: number | null;
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecure?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  password?: string | null;
  signature?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function docToAccount(doc: AccountDoc): Account {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    type: doc.type,
    accessToken: doc.accessToken || undefined,
    refreshToken: doc.refreshToken || undefined,
    tokenExpiry: doc.tokenExpiry || undefined,
    imapHost: doc.imapHost || undefined,
    imapPort: doc.imapPort || undefined,
    imapSecure: doc.imapSecure ?? true,
    smtpHost: doc.smtpHost || undefined,
    smtpPort: doc.smtpPort || undefined,
    smtpSecure: doc.smtpSecure ?? true,
    password: doc.password || undefined,
    signature: doc.signature || undefined,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// GET /api/accounts - List all accounts
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const col = getCollection<AccountDoc>('accounts');
    const emailsCol = getCollection<{ accountId: string; isRead: boolean; isDeleted: boolean; isArchived: boolean; isDraft: boolean }>('emails');
    const docs = await col.find({}).sort({ createdAt: 1 }).toArray();

    const accounts = await Promise.all(docs.map(async doc => {
      const acc = docToAccount(doc);
      const unreadCount = await emailsCol.countDocuments({
        accountId: doc._id,
        isRead: false,
        isDeleted: false,
        isArchived: false,
        isDraft: false,
      });
      acc.unreadCount = unreadCount;
      // Don't expose tokens
      delete acc.accessToken;
      delete acc.refreshToken;
      delete acc.password;
      return acc;
    }));

    const response: ApiResponse<Account[]> = { success: true, data: accounts };
    res.json(response);
  })
);

// GET /api/accounts/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<AccountDoc>('accounts');
    const doc = await col.findOne({ _id: req.params.id });

    if (!doc) throw new AppError('계정을 찾을 수 없습니다', 404);

    const acc = docToAccount(doc);
    delete acc.accessToken;
    delete acc.refreshToken;
    delete acc.password;

    res.json({ success: true, data: acc } as ApiResponse<Account>);
  })
);

// GET /api/accounts/oauth/url - Get Gmail OAuth URL
router.get(
  '/oauth/url',
  asyncHandler(async (_req: Request, res: Response) => {
    const url = getAuthUrl();
    res.json({ success: true, data: { url } });
  })
);

// GET /api/accounts/oauth/callback - OAuth2 callback
router.get(
  '/oauth/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { code, error } = req.query;

    if (error) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      return res.redirect(`${clientUrl}?oauth_error=${error}`);
    }

    if (!code || typeof code !== 'string') {
      throw new AppError('인증 코드가 없습니다', 400);
    }

    const tokens = await exchangeCodeForTokens(code);
    const col = getCollection<AccountDoc>('accounts');
    const now = new Date().toISOString();

    // Check if account already exists
    const existing = await col.findOne({ email: tokens.email });

    let accountId: string;

    if (existing) {
      // Update tokens
      await col.updateOne(
        { _id: existing._id },
        { $set: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenExpiry: tokens.tokenExpiry, updatedAt: now } }
      );
      accountId = existing._id;
    } else {
      accountId = uuidv4();
      const newDoc: AccountDoc = {
        _id: accountId,
        name: tokens.name,
        email: tokens.email,
        type: 'gmail',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokens.tokenExpiry,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      await col.insertOne(newDoc);
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}?oauth_success=true&account_id=${accountId}`);
  })
);

// POST /api/accounts - Add IMAP account
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('이름을 입력해주세요'),
    body('email').isEmail().withMessage('올바른 이메일 주소를 입력해주세요'),
    body('type').isIn(['imap']).withMessage('타입이 올바르지 않습니다'),
    body('imapHost').notEmpty().withMessage('IMAP 호스트를 입력해주세요'),
    body('imapPort').isInt({ min: 1, max: 65535 }).withMessage('IMAP 포트가 올바르지 않습니다'),
    body('smtpHost').notEmpty().withMessage('SMTP 호스트를 입력해주세요'),
    body('smtpPort').isInt({ min: 1, max: 65535 }).withMessage('SMTP 포트가 올바르지 않습니다'),
    body('password').notEmpty().withMessage('비밀번호를 입력해주세요'),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure, password, signature } = req.body;

    // Test IMAP connection
    try {
      await testImapConnection({ host: imapHost, port: imapPort, secure: imapSecure !== false, email, password });
    } catch (err) {
      throw new AppError(`IMAP 연결 실패: ${(err as Error).message}`, 400);
    }

    const col = getCollection<AccountDoc>('accounts');
    const now = new Date().toISOString();
    const id = uuidv4();

    const newDoc: AccountDoc = {
      _id: id,
      name,
      email,
      type: 'imap',
      imapHost,
      imapPort,
      imapSecure: imapSecure !== false,
      smtpHost,
      smtpPort,
      smtpSecure: smtpSecure !== false,
      password,
      signature: signature || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await col.insertOne(newDoc);

    const doc = await col.findOne({ _id: id });
    const acc = docToAccount(doc!);
    delete acc.password;

    res.status(201).json({ success: true, data: acc } as ApiResponse<Account>);
  })
);

// PUT /api/accounts/:id - Update account
router.put(
  '/:id',
  [param('id').notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<AccountDoc>('accounts');
    const existing = await col.findOne({ _id: req.params.id });

    if (!existing) throw new AppError('계정을 찾을 수 없습니다', 404);

    const { name, signature, imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure, password, isActive } = req.body;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = { updatedAt: now };
    if (name !== undefined) updates.name = name;
    if (signature !== undefined) updates.signature = signature;
    if (imapHost !== undefined) updates.imapHost = imapHost;
    if (imapPort !== undefined) updates.imapPort = imapPort;
    if (imapSecure !== undefined) updates.imapSecure = imapSecure;
    if (smtpHost !== undefined) updates.smtpHost = smtpHost;
    if (smtpPort !== undefined) updates.smtpPort = smtpPort;
    if (smtpSecure !== undefined) updates.smtpSecure = smtpSecure;
    if (password !== undefined) updates.password = password;
    if (isActive !== undefined) updates.isActive = isActive;

    await col.updateOne({ _id: req.params.id }, { $set: updates });

    const doc = await col.findOne({ _id: req.params.id });
    const acc = docToAccount(doc!);
    delete acc.accessToken;
    delete acc.refreshToken;
    delete acc.password;

    res.json({ success: true, data: acc } as ApiResponse<Account>);
  })
);

// DELETE /api/accounts/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<AccountDoc>('accounts');
    const existing = await col.findOne({ _id: req.params.id });

    if (!existing) throw new AppError('계정을 찾을 수 없습니다', 404);

    await col.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: '계정이 삭제되었습니다' });
  })
);

// POST /api/accounts/:id/sync - Sync emails for account
router.post(
  '/:id/sync',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<AccountDoc>('accounts');
    const doc = await col.findOne({ _id: req.params.id });

    if (!doc) throw new AppError('계정을 찾을 수 없습니다', 404);

    const account = docToAccount(doc);

    let synced = 0;
    interface EmailDoc { _id: string; [key: string]: unknown }
    const emailsCol = getCollection<EmailDoc>('emails');

    if (account.type === 'gmail') {
      const { fetchGmailMessages } = await import('../services/gmail');
      const { emails } = await fetchGmailMessages(account, { maxResults: 100 });

      for (const email of emails) {
        const emailDoc = {
          _id: email.id,
          accountId: email.accountId,
          threadId: email.threadId,
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          to: email.to,
          cc: email.cc,
          bcc: email.bcc,
          replyTo: email.replyTo || null,
          body: email.body,
          bodyText: email.bodyText,
          attachments: email.attachments,
          labels: email.labels || [],
          isRead: email.isRead,
          isStarred: email.isStarred,
          isImportant: email.isImportant,
          isArchived: email.isArchived,
          isDeleted: email.isDeleted,
          isDraft: email.isDraft,
          priority: email.priority,
          date: email.date,
          inReplyTo: email.inReplyTo || null,
          references: email.references || null,
          snippet: email.snippet || null,
          createdAt: email.createdAt,
          updatedAt: email.updatedAt,
        };
        await emailsCol.replaceOne({ _id: emailDoc._id as unknown as never }, emailDoc, { upsert: true });
      }

      synced = emails.length;
    } else if (account.type === 'imap') {
      const { fetchImapMessages } = await import('../services/imap');
      const emails = await fetchImapMessages(account, { limit: 100 });

      for (const email of emails) {
        const emailDoc = {
          _id: email.id,
          accountId: email.accountId,
          threadId: email.threadId,
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          to: email.to,
          cc: email.cc,
          bcc: email.bcc,
          replyTo: email.replyTo || null,
          body: email.body,
          bodyText: email.bodyText,
          attachments: email.attachments,
          labels: email.labels || [],
          isRead: email.isRead,
          isStarred: email.isStarred,
          isImportant: email.isImportant,
          isArchived: email.isArchived,
          isDeleted: email.isDeleted,
          isDraft: email.isDraft,
          priority: email.priority,
          date: email.date,
          inReplyTo: email.inReplyTo || null,
          references: email.references || null,
          snippet: email.snippet || null,
          createdAt: email.createdAt,
          updatedAt: email.updatedAt,
        };
        await emailsCol.replaceOne({ _id: emailDoc._id as unknown as never }, emailDoc, { upsert: true });
      }

      synced = emails.length;
    }

    res.json({ success: true, data: { synced }, message: `${synced}개 이메일을 동기화했습니다` });
  })
);

export default router;
