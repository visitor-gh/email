import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getCollection } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Email, Thread, ApiResponse, SendEmailOptions } from '../types';

const router = Router();

interface EmailDoc {
  _id: string;
  accountId: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: { name?: string; email: string };
  to: { name?: string; email: string }[];
  cc: { name?: string; email: string }[];
  bcc: { name?: string; email: string }[];
  replyTo?: { name?: string; email: string } | null;
  body: string;
  bodyText: string;
  attachments: unknown[];
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  isDraft: boolean;
  priority: string;
  date: string;
  inReplyTo?: string | null;
  references?: string[] | null;
  snippet?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AccountDoc {
  _id: string;
  email: string;
  name: string;
  type: string;
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

function docToEmail(doc: EmailDoc, accountEmail?: string): Email {
  return {
    id: doc._id,
    accountId: doc.accountId,
    accountEmail,
    threadId: doc.threadId,
    messageId: doc.messageId,
    subject: doc.subject,
    from: doc.from,
    to: doc.to,
    cc: doc.cc,
    bcc: doc.bcc,
    replyTo: doc.replyTo || undefined,
    body: doc.body,
    bodyText: doc.bodyText,
    attachments: doc.attachments as Email['attachments'],
    labels: doc.labels,
    isRead: doc.isRead,
    isStarred: doc.isStarred,
    isImportant: doc.isImportant,
    isArchived: doc.isArchived,
    isDeleted: doc.isDeleted,
    isDraft: doc.isDraft,
    priority: doc.priority as Email['priority'],
    date: doc.date,
    inReplyTo: doc.inReplyTo || undefined,
    references: doc.references || undefined,
    snippet: doc.snippet || undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
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

  threads.sort((a, b) => new Date(b.lastEmail.date).getTime() - new Date(a.lastEmail.date).getTime());
  return threads;
}

// GET /api/emails - List emails
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const accountsCol = getCollection<AccountDoc>('accounts');
    const {
      accountId,
      labelId,
      folder = 'inbox',
      page = '1',
      limit = '50',
      q,
      threaded = 'true',
    } = req.query as Record<string, string>;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build filter
    const filter: Record<string, unknown> = {};

    if (accountId) {
      filter.accountId = accountId;
    }

    // Folder filtering
    switch (folder) {
      case 'inbox':
        filter.isDeleted = false;
        filter.isArchived = false;
        filter.isDraft = false;
        break;
      case 'sent':
        filter.isDraft = false;
        filter.isDeleted = false;
        // Filter by account email as sender - handled after getting account
        if (accountId) {
          const accountDoc = await accountsCol.findOne({ _id: accountId });
          if (accountDoc) {
            filter['from.email'] = accountDoc.email;
          }
        }
        break;
      case 'starred':
        filter.isStarred = true;
        filter.isDeleted = false;
        break;
      case 'important':
        filter.isImportant = true;
        filter.isDeleted = false;
        break;
      case 'archive':
        filter.isArchived = true;
        filter.isDraft = false;
        filter.isDeleted = false;
        break;
      case 'trash':
        filter.isDeleted = true;
        break;
      case 'drafts':
        filter.isDraft = true;
        filter.isDeleted = false;
        break;
      case 'unread':
        filter.isRead = false;
        filter.isDraft = false;
        filter.isArchived = false;
        filter.isDeleted = false;
        break;
      default:
        filter.isDeleted = false;
        break;
    }

    if (labelId) {
      filter.labels = labelId;
    }

    if (q) {
      const qRegex = new RegExp(q, 'i');
      filter.$or = [
        { subject: qRegex },
        { bodyText: qRegex },
        { 'from.email': qRegex },
      ];
    }

    const total = await col.countDocuments(filter as Parameters<typeof col.countDocuments>[0]);
    const docs = await col
      .find(filter as Parameters<typeof col.find>[0])
      .sort({ date: -1 })
      .skip(offset)
      .limit(limitNum)
      .toArray();

    // Enrich with account email
    const accountCache = new Map<string, string>();
    const emails = await Promise.all(docs.map(async doc => {
      let accountEmail = accountCache.get(doc.accountId);
      if (!accountEmail) {
        const acc = await accountsCol.findOne({ _id: doc.accountId });
        accountEmail = acc?.email;
        if (accountEmail) accountCache.set(doc.accountId, accountEmail);
      }
      return docToEmail(doc, accountEmail);
    }));

    let responseData: unknown;
    if (threaded === 'true') {
      const threads = buildThreads(emails);
      responseData = {
        threads,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      };
    } else {
      responseData = {
        data: emails,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      };
    }

    res.json({ success: true, data: responseData });
  })
);

// GET /api/emails/search/results - Search emails
router.get(
  '/search/results',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const accountsCol = getCollection<AccountDoc>('accounts');
    const { q, accountId, page = '1', limit = '50' } = req.query as Record<string, string>;

    if (!q) {
      res.json({ success: true, data: { data: [], total: 0, page: 1, limit: 50, totalPages: 0 } });
      return;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    const qRegex = new RegExp(q, 'i');

    const filter: Record<string, unknown> = {
      isDeleted: false,
      $or: [
        { subject: qRegex },
        { bodyText: qRegex },
        { 'from.email': qRegex },
      ],
    };

    if (accountId) {
      filter.accountId = accountId;
    }

    const total = await col.countDocuments(filter as Parameters<typeof col.countDocuments>[0]);
    const docs = await col
      .find(filter as Parameters<typeof col.find>[0])
      .sort({ date: -1 })
      .skip(offset)
      .limit(limitNum)
      .toArray();

    const accountCache = new Map<string, string>();
    const emails = await Promise.all(docs.map(async doc => {
      let accountEmail = accountCache.get(doc.accountId);
      if (!accountEmail) {
        const acc = await accountsCol.findOne({ _id: doc.accountId });
        accountEmail = acc?.email;
        if (accountEmail) accountCache.set(doc.accountId, accountEmail);
      }
      return docToEmail(doc, accountEmail);
    }));

    res.json({
      success: true,
      data: {
        data: emails,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
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
    const col = getCollection<EmailDoc>('emails');
    const { ids, action } = req.body;
    const now = new Date().toISOString();

    const updateMap: Record<string, Record<string, unknown>> = {
      read: { isRead: true },
      unread: { isRead: false },
      star: { isStarred: true },
      unstar: { isStarred: false },
      archive: { isArchived: true },
      unarchive: { isArchived: false },
      delete: { isDeleted: true },
      restore: { isDeleted: false },
    };

    const updates = updateMap[action];
    if (updates) {
      await col.updateMany(
        { _id: { $in: ids } } as Parameters<typeof col.updateMany>[0],
        { $set: { ...updates, updatedAt: now } }
      );
    }

    res.json({ success: true, message: `${ids.length}개 이메일에 작업을 수행했습니다` });
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
    const accountsCol = getCollection<AccountDoc>('accounts');
    const emailsCol = getCollection<EmailDoc>('emails');
    const { accountId, to, cc, bcc, subject, body: emailBody, inReplyTo, references, threadId } = req.body;

    const accountDoc = await accountsCol.findOne({ _id: accountId, isActive: true });
    if (!accountDoc) throw new AppError('유효한 계정을 찾을 수 없습니다', 404);

    const account = {
      id: accountDoc._id,
      name: accountDoc.name,
      email: accountDoc.email,
      type: accountDoc.type as 'gmail' | 'imap',
      accessToken: accountDoc.accessToken || undefined,
      refreshToken: accountDoc.refreshToken || undefined,
      tokenExpiry: accountDoc.tokenExpiry || undefined,
      imapHost: accountDoc.imapHost || undefined,
      imapPort: accountDoc.imapPort || undefined,
      imapSecure: accountDoc.imapSecure ?? true,
      smtpHost: accountDoc.smtpHost || undefined,
      smtpPort: accountDoc.smtpPort || undefined,
      smtpSecure: accountDoc.smtpSecure ?? true,
      password: accountDoc.password || undefined,
      signature: accountDoc.signature || undefined,
      isActive: accountDoc.isActive,
      createdAt: accountDoc.createdAt,
      updatedAt: accountDoc.updatedAt,
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

    const now = new Date().toISOString();
    const emailId = uuidv4();
    const finalThreadId = sentThreadId || threadId || emailId;

    const emailDoc: EmailDoc = {
      _id: emailId,
      accountId,
      threadId: finalThreadId,
      messageId: sentMessageId || emailId,
      subject,
      from: { name: account.name, email: account.email },
      to,
      cc: cc || [],
      bcc: bcc || [],
      replyTo: null,
      body: emailBody,
      bodyText: emailBody.replace(/<[^>]*>/g, '').slice(0, 500),
      attachments: [],
      labels: [],
      isRead: true,
      isStarred: false,
      isImportant: false,
      isArchived: false,
      isDeleted: false,
      isDraft: false,
      priority: 'normal',
      date: now,
      inReplyTo: inReplyTo || null,
      references: references || null,
      snippet: emailBody.replace(/<[^>]*>/g, '').slice(0, 200),
      createdAt: now,
      updatedAt: now,
    };

    await emailsCol.insertOne(emailDoc);

    res.json({ success: true, data: { id: emailId, threadId: finalThreadId }, message: '이메일을 전송했습니다' });
  })
);

// GET /api/emails/thread/:threadId
router.get(
  '/thread/:threadId',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const accountsCol = getCollection<AccountDoc>('accounts');
    const docs = await col
      .find({ threadId: req.params.threadId, isDeleted: false } as Parameters<typeof col.find>[0])
      .sort({ date: 1 })
      .toArray();

    if (docs.length === 0) throw new AppError('스레드를 찾을 수 없습니다', 404);

    const accountCache = new Map<string, string>();
    const emails = await Promise.all(docs.map(async doc => {
      let accountEmail = accountCache.get(doc.accountId);
      if (!accountEmail) {
        const acc = await accountsCol.findOne({ _id: doc.accountId });
        accountEmail = acc?.email;
        if (accountEmail) accountCache.set(doc.accountId, accountEmail);
      }
      return docToEmail(doc, accountEmail);
    }));

    const threads = buildThreads(emails);
    const thread = threads[0];

    res.json({ success: true, data: thread } as ApiResponse<Thread>);
  })
);

// GET /api/emails/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const accountsCol = getCollection<AccountDoc>('accounts');
    const doc = await col.findOne({ _id: req.params.id } as Parameters<typeof col.findOne>[0]);

    if (!doc) throw new AppError('이메일을 찾을 수 없습니다', 404);

    const acc = await accountsCol.findOne({ _id: doc.accountId });
    res.json({ success: true, data: docToEmail(doc, acc?.email) } as ApiResponse<Email>);
  })
);

// PATCH /api/emails/:id/read - Mark read/unread
router.patch(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const { isRead = true } = req.body;
    const now = new Date().toISOString();

    const result = await col.updateOne(
      { _id: req.params.id } as Parameters<typeof col.updateOne>[0],
      { $set: { isRead: Boolean(isRead), updatedAt: now } }
    );

    if (result.matchedCount === 0) throw new AppError('이메일을 찾을 수 없습니다', 404);
    res.json({ success: true, message: `이메일을 ${isRead ? '읽음' : '읽지 않음'}으로 표시했습니다` });
  })
);

// PATCH /api/emails/:id/star - Star/unstar
router.patch(
  '/:id/star',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const { isStarred = true } = req.body;
    const now = new Date().toISOString();

    const result = await col.updateOne(
      { _id: req.params.id } as Parameters<typeof col.updateOne>[0],
      { $set: { isStarred: Boolean(isStarred), updatedAt: now } }
    );

    if (result.matchedCount === 0) throw new AppError('이메일을 찾을 수 없습니다', 404);
    res.json({ success: true, message: `이메일을 ${isStarred ? '중요' : '중요 해제'}로 표시했습니다` });
  })
);

// PATCH /api/emails/:id/important - Mark important/unimportant
router.patch(
  '/:id/important',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const { isImportant = true } = req.body;
    const now = new Date().toISOString();

    await col.updateOne(
      { _id: req.params.id } as Parameters<typeof col.updateOne>[0],
      { $set: { isImportant: Boolean(isImportant), updatedAt: now } }
    );

    res.json({ success: true, message: '이메일 중요도가 변경되었습니다' });
  })
);

// PATCH /api/emails/:id/archive - Archive/unarchive
router.patch(
  '/:id/archive',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const { isArchived = true } = req.body;
    const now = new Date().toISOString();

    await col.updateOne(
      { _id: req.params.id } as Parameters<typeof col.updateOne>[0],
      { $set: { isArchived: Boolean(isArchived), updatedAt: now } }
    );

    res.json({ success: true, message: `이메일을 ${isArchived ? '보관' : '보관 해제'}했습니다` });
  })
);

// DELETE /api/emails/:id - Delete (soft delete / move to trash)
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const { permanent = 'false' } = req.query as Record<string, string>;
    const now = new Date().toISOString();

    if (permanent === 'true') {
      await col.deleteOne({ _id: req.params.id } as Parameters<typeof col.deleteOne>[0]);
    } else {
      await col.updateOne(
        { _id: req.params.id } as Parameters<typeof col.updateOne>[0],
        { $set: { isDeleted: true, updatedAt: now } }
      );
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
    const col = getCollection<EmailDoc>('emails');
    const labelsCol = getCollection<{ _id: string }>('labels');
    const { labelId } = req.body;

    const email = await col.findOne({ _id: req.params.id } as Parameters<typeof col.findOne>[0]);
    if (!email) throw new AppError('이메일을 찾을 수 없습니다', 404);

    const label = await labelsCol.findOne({ _id: labelId } as Parameters<typeof labelsCol.findOne>[0]);
    if (!label) throw new AppError('라벨을 찾을 수 없습니다', 404);

    const now = new Date().toISOString();
    await col.updateOne(
      { _id: req.params.id } as Parameters<typeof col.updateOne>[0],
      { $addToSet: { labels: labelId }, $set: { updatedAt: now } } as Parameters<typeof col.updateOne>[1]
    );

    res.json({ success: true, message: '라벨을 추가했습니다' });
  })
);

// DELETE /api/emails/:id/labels/:labelId - Remove label from email
router.delete(
  '/:id/labels/:labelId',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const now = new Date().toISOString();

    await col.updateOne(
      { _id: req.params.id } as Parameters<typeof col.updateOne>[0],
      { $pull: { labels: req.params.labelId }, $set: { updatedAt: now } } as Parameters<typeof col.updateOne>[1]
    );

    res.json({ success: true, message: '라벨을 제거했습니다' });
  })
);

// PATCH /api/emails/thread/:threadId/read - Mark thread read/unread
router.patch(
  '/thread/:threadId/read',
  asyncHandler(async (req: Request, res: Response) => {
    const col = getCollection<EmailDoc>('emails');
    const { isRead = true } = req.body;
    const now = new Date().toISOString();

    await col.updateMany(
      { threadId: req.params.threadId } as Parameters<typeof col.updateMany>[0],
      { $set: { isRead: Boolean(isRead), updatedAt: now } }
    );

    res.json({ success: true, message: '스레드를 읽음으로 표시했습니다' });
  })
);

export default router;
