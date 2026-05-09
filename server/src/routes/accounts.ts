import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getDb, convertToNumberedParams } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getAuthUrl, exchangeCodeForTokens } from '../services/gmail';
import { testImapConnection } from '../services/imap';
import { Account, AccountRow, ApiResponse } from '../types';

const router = Router();

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    type: row.type,
    accessToken: row.access_token || undefined,
    refreshToken: row.refresh_token || undefined,
    tokenExpiry: row.token_expiry || undefined,
    imapHost: row.imap_host || undefined,
    imapPort: row.imap_port || undefined,
    imapSecure: row.imap_secure === 1,
    smtpHost: row.smtp_host || undefined,
    smtpPort: row.smtp_port || undefined,
    smtpSecure: row.smtp_secure === 1,
    password: row.password || undefined,
    signature: row.signature || undefined,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/accounts - List all accounts
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const db = getDb();
    const rows = await db.all<AccountRow>('SELECT * FROM accounts ORDER BY created_at ASC');

    const accounts = await Promise.all(rows.map(async row => {
      const acc = rowToAccount(row);
      // Count unread emails
      const unreadCount = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM emails WHERE account_id = ? AND is_read = 0 AND is_deleted = 0 AND is_archived = 0 AND is_draft = 0",
        [row.id]
      );
      acc.unreadCount = unreadCount?.count ?? 0;
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
    const db = getDb();
    const row = await db.get<AccountRow>('SELECT * FROM accounts WHERE id = ?', [req.params.id]);

    if (!row) throw new AppError('계정을 찾을 수 없습니다', 404);

    const acc = rowToAccount(row);
    delete acc.accessToken;
    delete acc.refreshToken;
    delete acc.password;

    res.json({ success: true, data: acc } as ApiResponse<Account>);
  })
);

// POST /api/accounts/oauth/url - Get Gmail OAuth URL
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
    const db = getDb();
    const now = new Date().toISOString();

    // Check if account already exists
    const existing = await db.get<AccountRow>('SELECT * FROM accounts WHERE email = ?', [tokens.email]);

    let accountId: string;

    if (existing) {
      // Update tokens
      await db.run(
        `UPDATE accounts SET access_token = ?, refresh_token = ?, token_expiry = ?, updated_at = ? WHERE id = ?`,
        [tokens.accessToken, tokens.refreshToken, tokens.tokenExpiry, now, existing.id]
      );
      accountId = existing.id;
    } else {
      accountId = uuidv4();
      await db.run(
        `INSERT INTO accounts (id, name, email, type, access_token, refresh_token, token_expiry, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'gmail', ?, ?, ?, 1, ?, ?)`,
        [accountId, tokens.name, tokens.email, tokens.accessToken, tokens.refreshToken, tokens.tokenExpiry, now, now]
      );
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

    const db = getDb();
    const now = new Date().toISOString();
    const id = uuidv4();

    await db.run(
      `INSERT INTO accounts (id, name, email, type, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, password, signature, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'imap', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, name, email, imapHost, imapPort, imapSecure !== false ? 1 : 0,
       smtpHost, smtpPort, smtpSecure !== false ? 1 : 0, password, signature || null, now, now]
    );

    const row = await db.get<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id]);
    const acc = rowToAccount(row!);
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
    const db = getDb();
    const existing = await db.get<AccountRow>('SELECT * FROM accounts WHERE id = ?', [req.params.id]);

    if (!existing) throw new AppError('계정을 찾을 수 없습니다', 404);

    const { name, signature, imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure, password, isActive } = req.body;
    const now = new Date().toISOString();

    await db.run(
      `UPDATE accounts SET
        name = COALESCE(?, name),
        signature = COALESCE(?, signature),
        imap_host = COALESCE(?, imap_host),
        imap_port = COALESCE(?, imap_port),
        imap_secure = COALESCE(?, imap_secure),
        smtp_host = COALESCE(?, smtp_host),
        smtp_port = COALESCE(?, smtp_port),
        smtp_secure = COALESCE(?, smtp_secure),
        password = COALESCE(?, password),
        is_active = COALESCE(?, is_active),
        updated_at = ?
       WHERE id = ?`,
      [
        name || null, signature !== undefined ? signature : null,
        imapHost || null, imapPort || null,
        imapSecure !== undefined ? (imapSecure ? 1 : 0) : null,
        smtpHost || null, smtpPort || null,
        smtpSecure !== undefined ? (smtpSecure ? 1 : 0) : null,
        password || null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        now, req.params.id
      ]
    );

    const row = await db.get<AccountRow>('SELECT * FROM accounts WHERE id = ?', [req.params.id]);
    const acc = rowToAccount(row!);
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
    const db = getDb();
    const existing = await db.get<AccountRow>('SELECT * FROM accounts WHERE id = ?', [req.params.id]);

    if (!existing) throw new AppError('계정을 찾을 수 없습니다', 404);

    await db.run('DELETE FROM accounts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '계정이 삭제되었습니다' });
  })
);

// POST /api/accounts/:id/sync - Sync emails for account
router.post(
  '/:id/sync',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const row = await db.get<AccountRow>('SELECT * FROM accounts WHERE id = ?', [req.params.id]);

    if (!row) throw new AppError('계정을 찾을 수 없습니다', 404);

    const account = rowToAccount(row);

    let synced = 0;
    if (account.type === 'gmail') {
      const { fetchGmailMessages } = await import('../services/gmail');
      const { emails } = await fetchGmailMessages(account, { maxResults: 100 });

      const insertSql = `INSERT INTO emails
          (id, account_id, thread_id, message_id, subject, from_address, to_addresses, cc_addresses, bcc_addresses,
           reply_to, body, body_text, attachments, is_read, is_starred, is_important, is_archived, is_deleted, is_draft,
           priority, date, in_reply_to, email_references, snippet, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           account_id = EXCLUDED.account_id,
           thread_id = EXCLUDED.thread_id,
           message_id = EXCLUDED.message_id,
           subject = EXCLUDED.subject,
           from_address = EXCLUDED.from_address,
           to_addresses = EXCLUDED.to_addresses,
           cc_addresses = EXCLUDED.cc_addresses,
           bcc_addresses = EXCLUDED.bcc_addresses,
           reply_to = EXCLUDED.reply_to,
           body = EXCLUDED.body,
           body_text = EXCLUDED.body_text,
           attachments = EXCLUDED.attachments,
           is_read = EXCLUDED.is_read,
           is_starred = EXCLUDED.is_starred,
           is_important = EXCLUDED.is_important,
           is_archived = EXCLUDED.is_archived,
           is_deleted = EXCLUDED.is_deleted,
           is_draft = EXCLUDED.is_draft,
           priority = EXCLUDED.priority,
           date = EXCLUDED.date,
           in_reply_to = EXCLUDED.in_reply_to,
           email_references = EXCLUDED.email_references,
           snippet = EXCLUDED.snippet,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`;

      const { sql: convertedSql } = convertToNumberedParams(insertSql);

      await db.transaction(async (client) => {
        for (const email of emails) {
          await client.query(convertedSql, [
            email.id, email.accountId, email.threadId, email.messageId,
            email.subject,
            JSON.stringify(email.from),
            JSON.stringify(email.to),
            JSON.stringify(email.cc),
            JSON.stringify(email.bcc),
            email.replyTo ? JSON.stringify(email.replyTo) : null,
            email.body, email.bodyText,
            JSON.stringify(email.attachments),
            email.isRead ? 1 : 0,
            email.isStarred ? 1 : 0,
            email.isImportant ? 1 : 0,
            email.isArchived ? 1 : 0,
            email.isDeleted ? 1 : 0,
            email.isDraft ? 1 : 0,
            email.priority,
            email.date,
            email.inReplyTo || null,
            email.references ? JSON.stringify(email.references) : null,
            email.snippet || null,
            email.createdAt,
            email.updatedAt,
          ]);
        }
      });

      synced = emails.length;
    } else if (account.type === 'imap') {
      const { fetchImapMessages } = await import('../services/imap');
      const emails = await fetchImapMessages(account, { limit: 100 });

      const insertSql = `INSERT INTO emails
          (id, account_id, thread_id, message_id, subject, from_address, to_addresses, cc_addresses, bcc_addresses,
           reply_to, body, body_text, attachments, is_read, is_starred, is_important, is_archived, is_deleted, is_draft,
           priority, date, in_reply_to, email_references, snippet, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           account_id = EXCLUDED.account_id,
           thread_id = EXCLUDED.thread_id,
           message_id = EXCLUDED.message_id,
           subject = EXCLUDED.subject,
           from_address = EXCLUDED.from_address,
           to_addresses = EXCLUDED.to_addresses,
           cc_addresses = EXCLUDED.cc_addresses,
           bcc_addresses = EXCLUDED.bcc_addresses,
           reply_to = EXCLUDED.reply_to,
           body = EXCLUDED.body,
           body_text = EXCLUDED.body_text,
           attachments = EXCLUDED.attachments,
           is_read = EXCLUDED.is_read,
           is_starred = EXCLUDED.is_starred,
           is_important = EXCLUDED.is_important,
           is_archived = EXCLUDED.is_archived,
           is_deleted = EXCLUDED.is_deleted,
           is_draft = EXCLUDED.is_draft,
           priority = EXCLUDED.priority,
           date = EXCLUDED.date,
           in_reply_to = EXCLUDED.in_reply_to,
           email_references = EXCLUDED.email_references,
           snippet = EXCLUDED.snippet,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`;

      const { sql: convertedSql } = convertToNumberedParams(insertSql);

      await db.transaction(async (client) => {
        for (const email of emails) {
          await client.query(convertedSql, [
            email.id, email.accountId, email.threadId, email.messageId,
            email.subject,
            JSON.stringify(email.from),
            JSON.stringify(email.to),
            JSON.stringify(email.cc),
            JSON.stringify(email.bcc),
            email.replyTo ? JSON.stringify(email.replyTo) : null,
            email.body, email.bodyText,
            JSON.stringify(email.attachments),
            email.isRead ? 1 : 0,
            email.isStarred ? 1 : 0,
            email.isImportant ? 1 : 0,
            email.isArchived ? 1 : 0,
            email.isDeleted ? 1 : 0,
            email.isDraft ? 1 : 0,
            email.priority,
            email.date,
            email.inReplyTo || null,
            email.references ? JSON.stringify(email.references) : null,
            email.snippet || null,
            email.createdAt,
            email.updatedAt,
          ]);
        }
      });

      synced = emails.length;
    }

    res.json({ success: true, data: { synced }, message: `${synced}개 이메일을 동기화했습니다` });
  })
);

export default router;
