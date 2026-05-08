import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Email, EmailRow, AccountRow, Thread, ApiResponse, SendEmailOptions } from '../types';

const router = Router();

function rowToEmail(row: EmailRow): Email {
  const accountRow = getDb()
    .prepare('SELECT * FROM accounts WHERE id = ?')
    .get(row.account_id) as AccountRow | undefined;

  const labelIds = (
    getDb()
      .prepare('SELECT label_id FROM email_labels WHERE email_id = ?')
      .all(row.id) as { label_id: string }[]
  ).map(l => l.label_id);

  return {
    id: row.id,
    accountId: row.account_id,
    accountEmail: accountRow?.email,
    threadId: row.thread_id,
    messageId: row.message_id,
    subject: row.subject,
    from: JSON.parse(row.from_address),
    to: JSON.parse(row.to_addresses),
    cc: JSON.parse(row.cc_addresses),
    bcc: JSON.parse(row.bcc_addresses),
    replyTo: row.reply_to ? JSON.parse(row.reply_to) : undefined,
    body: row.body,
    bodyText: row.body_text,
    attachments: JSON.parse(row.attachments),
    labels: labelIds,
    isRead: row.is_read === 1,
    isStarred: row.is_starred === 1,
    isImportant: row.is_important === 1,
    isArchived: row.is_archived === 1,
    isDeleted: row.is_deleted === 1,
    isDraft: row.is_draft === 1,
    priority: row.priority,
    date: row.date,
    inReplyTo: row.in_reply_to || undefined,
    references: row.email_references ? JSON.parse(row.email_references) : undefined,
    snippet: row.snippet || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildThreads(emails: Email[]): Thread[] {
  const threadMap = new Map<string, Email[]>();

  for (const email of emails) {
    const existing = threadMap.get(email.threadId) || [];
    existing.push(email);
    threadMap.set(email.threadId, existing);
  }

  const threads: Thread[] = [];
  for (const [threadId, threadEmails] of threadMap.entries()) {
    threadEmails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastEmail = threadEmails[threadEmails.length - 1];
    const allLabels = [...new Set(threadEmails.flatMap(e => e.labels))];

    threads.push({
      id: threadId,
      accountId: lastEmail.accountId,
      subject: lastEmail.subject,
      emails: threadEmails,
      lastEmail,
      isRead: threadEmails.every(e => e.isRead),
      isStarred: threadEmails.some(e => e.isStarred),
      isImportant: threadEmails.some(e => e.isImportant),
      labels: allLabels,
      participantCount: new Set([
        ...threadEmails.map(e => e.from.email),
        ...threadEmails.flatMap(e => e.to.map(t => t.email)),
      ]).size,
      emailCount: threadEmails.length,
    });
  }

  // Sort threads by latest email date
  threads.sort((a, b) => new Date(b.lastEmail.date).getTime() - new Date(a.lastEmail.date).getTime());
  return threads;
}

// GET /api/emails - List emails
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const {
      accountId,
      labelId,
      folder = 'inbox',
      page = '1',
      limit = '50',
      q,
      threaded = 'true',
    } = req.query as Record<string, string>;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions: string[] = ['e.is_deleted = 0'];
    const params: unknown[] = [];

    if (accountId) {
      whereConditions.push('e.account_id = ?');
      params.push(accountId);
    }

    // Folder filter
    switch (folder) {
      case 'inbox':
        whereConditions.push('e.is_archived = 0', 'e.is_draft = 0', 'e.is_deleted = 0');
        // Exclude emails where account is the sender (for inbox)
        break;
      case 'sent':
        whereConditions.push('e.is_draft = 0');
        // Filter where from matches account email
        whereConditions.push(`(
          SELECT a.email FROM accounts a WHERE a.id = e.account_id
        ) = JSON_EXTRACT(e.from_address, '$.email')`);
        break;
      case 'starred':
        whereConditions.push('e.is_starred = 1');
        break;
      case 'important':
        whereConditions.push('e.is_important = 1');
        break;
      case 'archive':
        whereConditions.push('e.is_archived = 1', 'e.is_draft = 0');
        break;
      case 'trash':
        whereConditions = ['e.is_deleted = 1']; // Reset conditions for trash
        if (accountId) {
          whereConditions.push('e.account_id = ?');
        }
        break;
      case 'drafts':
        whereConditions.push('e.is_draft = 1');
        break;
      case 'unread':
        whereConditions.push('e.is_read = 0', 'e.is_draft = 0', 'e.is_archived = 0');
        break;
    }

    if (labelId) {
      whereConditions.push('el.label_id = ?');
      params.push(labelId);
    }

    if (q) {
      whereConditions.push(`(e.subject LIKE ? OR e.from_address LIKE ? OR e.body_text LIKE ?)`);
      const likeQ = `%${q}%`;
      params.push(likeQ, likeQ, likeQ);
    }

    const joinClause = labelId ? 'JOIN email_labels el ON e.id = el.email_id' : '';
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(DISTINCT e.id) as total FROM emails e ${joinClause} ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params as []) as { total: number };
    const total = countResult.total;

    const emailQuery = `
      SELECT DISTINCT e.* FROM emails e ${joinClause} ${whereClause}
      ORDER BY e.date DESC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(emailQuery).all(...params as [], parseInt(limit), offset) as EmailRow[];
    const emails = rows.map(rowToEmail);

    let responseData: unknown;
    if (threaded === 'true') {
      const threads = buildThreads(emails);
      responseData = {
        threads,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      };
    } else {
      responseData = {
        data: emails,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      };
    }

    res.json({ success: true, data: responseData });
  })
);

// GET /api/emails/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM emails WHERE id = ?')
      .get(req.params.id) as EmailRow | undefined;

    if (!row) throw new AppError('이메일을 찾을 수 없습니다', 404);

    res.json({ success: true, data: rowToEmail(row) } as ApiResponse<Email>);
  })
);

// GET /api/emails/thread/:threadId
router.get(
  '/thread/:threadId',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM emails WHERE thread_id = ? AND is_deleted = 0 ORDER BY date ASC')
      .all(req.params.threadId) as EmailRow[];

    if (rows.length === 0) throw new AppError('스레드를 찾을 수 없습니다', 404);

    const emails = rows.map(rowToEmail);
    const threads = buildThreads(emails);
    const thread = threads[0];

    res.json({ success: true, data: thread } as ApiResponse<Thread>);
  })
);

// POST /api/emails/send - Send email
router.post(
  '/send',
  [
    body('accountId').notEmpty().withMessage('계정을 선택해주세요'),
    body('to').isArray({ min: 1 }).withMessage('수신자를 입력해주세요'),
    body('subject').notEmpty().withMessage('제목을 입력해주세요'),
    body('body').notEmpty().withMessage('본문을 입력해주세요'),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { accountId, to, cc, bcc, subject, body: emailBody, inReplyTo, references, threadId } = req.body;

    const accountRow = db
      .prepare('SELECT * FROM accounts WHERE id = ? AND is_active = 1')
      .get(accountId) as AccountRow | undefined;

    if (!accountRow) throw new AppError('유효한 계정을 찾을 수 없습니다', 404);

    const account = {
      id: accountRow.id,
      name: accountRow.name,
      email: accountRow.email,
      type: accountRow.type,
      accessToken: accountRow.access_token || undefined,
      refreshToken: accountRow.refresh_token || undefined,
      tokenExpiry: accountRow.token_expiry || undefined,
      imapHost: accountRow.imap_host || undefined,
      imapPort: accountRow.imap_port || undefined,
      imapSecure: accountRow.imap_secure === 1,
      smtpHost: accountRow.smtp_host || undefined,
      smtpPort: accountRow.smtp_port || undefined,
      smtpSecure: accountRow.smtp_secure === 1,
      password: accountRow.password || undefined,
      signature: accountRow.signature || undefined,
      isActive: accountRow.is_active === 1,
      createdAt: accountRow.created_at,
      updatedAt: accountRow.updated_at,
    };

    const sendOptions: SendEmailOptions = {
      accountId,
      to,
      cc: cc || [],
      bcc: bcc || [],
      subject,
      body: emailBody,
      bodyText: emailBody.replace(/<[^>]*>/g, ''),
      inReplyTo,
      references,
      threadId,
    };

    let sentMessageId: string;
    let sentThreadId: string;

    if (account.type === 'gmail') {
      const { sendGmailMessage } = await import('../services/gmail');
      const result = await sendGmailMessage(account, sendOptions);
      sentMessageId = result.messageId;
      sentThreadId = result.threadId;
    } else {
      const { sendImapMessage } = await import('../services/imap');
      const result = await sendImapMessage(account, sendOptions);
      sentMessageId = result.messageId;
      sentThreadId = result.threadId;
    }

    // Save to DB
    const now = new Date().toISOString();
    const emailId = uuidv4();
    const finalThreadId = sentThreadId || threadId || emailId;

    db.prepare(
      `INSERT INTO emails (id, account_id, thread_id, message_id, subject, from_address, to_addresses, cc_addresses, bcc_addresses,
       body, body_text, attachments, is_read, is_starred, is_important, is_archived, is_deleted, is_draft, priority, date, in_reply_to, email_references, snippet, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 1, 0, 0, 0, 0, 0, 'normal', ?, ?, ?, ?, ?, ?)`
    ).run(
      emailId, accountId, finalThreadId, sentMessageId || emailId,
      subject,
      JSON.stringify({ name: account.name, email: account.email }),
      JSON.stringify(to),
      JSON.stringify(cc || []),
      JSON.stringify(bcc || []),
      emailBody,
      emailBody.replace(/<[^>]*>/g, '').slice(0, 500),
      now,
      inReplyTo || null,
      references ? JSON.stringify(references) : null,
      emailBody.replace(/<[^>]*>/g, '').slice(0, 200),
      now, now
    );

    res.json({ success: true, data: { id: emailId, threadId: finalThreadId }, message: '이메일을 전송했습니다' });
  })
);

// PATCH /api/emails/:id/read - Mark read/unread
router.patch(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { isRead = true } = req.body;
    const now = new Date().toISOString();

    const result = db
      .prepare('UPDATE emails SET is_read = ?, updated_at = ? WHERE id = ?')
      .run(isRead ? 1 : 0, now, req.params.id);

    if (result.changes === 0) throw new AppError('이메일을 찾을 수 없습니다', 404);
    res.json({ success: true, message: `이메일을 ${isRead ? '읽음' : '읽지 않음'}으로 표시했습니다` });
  })
);

// PATCH /api/emails/:id/star - Star/unstar
router.patch(
  '/:id/star',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { isStarred = true } = req.body;
    const now = new Date().toISOString();

    const result = db
      .prepare('UPDATE emails SET is_starred = ?, updated_at = ? WHERE id = ?')
      .run(isStarred ? 1 : 0, now, req.params.id);

    if (result.changes === 0) throw new AppError('이메일을 찾을 수 없습니다', 404);
    res.json({ success: true, message: `이메일을 ${isStarred ? '중요' : '중요 해제'}로 표시했습니다` });
  })
);

// PATCH /api/emails/:id/important - Mark important/unimportant
router.patch(
  '/:id/important',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { isImportant = true } = req.body;
    const now = new Date().toISOString();

    db.prepare('UPDATE emails SET is_important = ?, updated_at = ? WHERE id = ?')
      .run(isImportant ? 1 : 0, now, req.params.id);

    res.json({ success: true, message: '이메일 중요도가 변경되었습니다' });
  })
);

// PATCH /api/emails/:id/archive - Archive/unarchive
router.patch(
  '/:id/archive',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { isArchived = true } = req.body;
    const now = new Date().toISOString();

    db.prepare('UPDATE emails SET is_archived = ?, updated_at = ? WHERE id = ?')
      .run(isArchived ? 1 : 0, now, req.params.id);

    res.json({ success: true, message: `이메일을 ${isArchived ? '보관' : '보관 해제'}했습니다` });
  })
);

// DELETE /api/emails/:id - Delete (soft delete / move to trash)
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { permanent = false } = req.query;
    const now = new Date().toISOString();

    if (permanent === 'true') {
      db.prepare('DELETE FROM emails WHERE id = ?').run(req.params.id);
    } else {
      db.prepare('UPDATE emails SET is_deleted = 1, updated_at = ? WHERE id = ?').run(now, req.params.id);
    }

    res.json({ success: true, message: '이메일을 삭제했습니다' });
  })
);

// POST /api/emails/:id/labels - Add label to email
router.post(
  '/:id/labels',
  [body('labelId').notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { labelId } = req.body;

    const email = db.prepare('SELECT id FROM emails WHERE id = ?').get(req.params.id);
    if (!email) throw new AppError('이메일을 찾을 수 없습니다', 404);

    const label = db.prepare('SELECT id FROM labels WHERE id = ?').get(labelId);
    if (!label) throw new AppError('라벨을 찾을 수 없습니다', 404);

    db.prepare('INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)').run(req.params.id, labelId);
    res.json({ success: true, message: '라벨을 추가했습니다' });
  })
);

// DELETE /api/emails/:id/labels/:labelId - Remove label from email
router.delete(
  '/:id/labels/:labelId',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    db.prepare('DELETE FROM email_labels WHERE email_id = ? AND label_id = ?').run(req.params.id, req.params.labelId);
    res.json({ success: true, message: '라벨을 제거했습니다' });
  })
);

// PATCH /api/emails/thread/:threadId/read - Mark thread read/unread
router.patch(
  '/thread/:threadId/read',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { isRead = true } = req.body;
    const now = new Date().toISOString();

    db.prepare('UPDATE emails SET is_read = ?, updated_at = ? WHERE thread_id = ?')
      .run(isRead ? 1 : 0, now, req.params.threadId);

    res.json({ success: true, message: '스레드를 읽음으로 표시했습니다' });
  })
);

// GET /api/emails/search - Search emails
router.get(
  '/search/results',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { q, accountId, page = '1', limit = '50' } = req.query as Record<string, string>;

    if (!q) {
      res.json({ success: true, data: { data: [], total: 0, page: 1, limit: 50, totalPages: 0 } });
      return;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const likeQ = `%${q}%`;

    let baseWhere = 'e.is_deleted = 0 AND (e.subject LIKE ? OR e.from_address LIKE ? OR e.body_text LIKE ?)';
    const searchParams: unknown[] = [likeQ, likeQ, likeQ];

    if (accountId) {
      baseWhere += ' AND e.account_id = ?';
      searchParams.push(accountId);
    }

    const countResult = db
      .prepare(`SELECT COUNT(DISTINCT e.id) as total FROM emails e WHERE ${baseWhere}`)
      .get(...searchParams as []) as { total: number };

    const rows = db
      .prepare(`SELECT DISTINCT e.* FROM emails e WHERE ${baseWhere} ORDER BY e.date DESC LIMIT ? OFFSET ?`)
      .all(...searchParams as [], parseInt(limit), offset) as EmailRow[];

    const emails = rows.map(rowToEmail);

    res.json({
      success: true,
      data: {
        data: emails,
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.total / parseInt(limit)),
      },
    });
  })
);

// POST /api/emails/batch - Batch operations
router.post(
  '/batch',
  [
    body('ids').isArray({ min: 1 }).withMessage('이메일 ID 목록을 입력해주세요'),
    body('action').isIn(['read', 'unread', 'star', 'unstar', 'archive', 'unarchive', 'delete', 'restore']).withMessage('올바른 작업을 선택해주세요'),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { ids, action } = req.body;
    const now = new Date().toISOString();

    const placeholders = ids.map(() => '?').join(', ');

    switch (action) {
      case 'read':
        db.prepare(`UPDATE emails SET is_read = 1, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        break;
      case 'unread':
        db.prepare(`UPDATE emails SET is_read = 0, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        break;
      case 'star':
        db.prepare(`UPDATE emails SET is_starred = 1, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        break;
      case 'unstar':
        db.prepare(`UPDATE emails SET is_starred = 0, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        break;
      case 'archive':
        db.prepare(`UPDATE emails SET is_archived = 1, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        break;
      case 'unarchive':
        db.prepare(`UPDATE emails SET is_archived = 0, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        break;
      case 'delete':
        db.prepare(`UPDATE emails SET is_deleted = 1, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        break;
      case 'restore':
        db.prepare(`UPDATE emails SET is_deleted = 0, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        break;
    }

    res.json({ success: true, message: `${ids.length}개 이메일에 작업을 수행했습니다` });
  })
);

export default router;
