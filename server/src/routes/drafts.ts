import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Draft, DraftRow, ApiResponse } from '../types';

const router = Router();

function rowToDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    accountId: row.account_id,
    subject: row.subject,
    to: JSON.parse(row.to_addresses),
    cc: JSON.parse(row.cc_addresses),
    bcc: JSON.parse(row.bcc_addresses),
    body: row.body,
    attachments: JSON.parse(row.attachments),
    inReplyTo: row.in_reply_to || undefined,
    threadId: row.thread_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/drafts
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { accountId } = req.query as Record<string, string>;

    let query = 'SELECT * FROM drafts';
    const params: unknown[] = [];

    if (accountId) {
      query += ' WHERE account_id = ?';
      params.push(accountId);
    }
    query += ' ORDER BY updated_at DESC';

    const rows = await db.all<DraftRow>(query, params);
    res.json({ success: true, data: rows.map(rowToDraft) } as ApiResponse<Draft[]>);
  })
);

// GET /api/drafts/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const row = await db.get<DraftRow>('SELECT * FROM drafts WHERE id = ?', [req.params.id]);
    if (!row) throw new AppError('임시저장을 찾을 수 없습니다', 404);
    res.json({ success: true, data: rowToDraft(row) } as ApiResponse<Draft>);
  })
);

// POST /api/drafts
router.post(
  '/',
  [body('accountId').notEmpty().withMessage('계정을 선택해주세요')],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { accountId, subject = '', to = [], cc = [], bcc = [], body: draftBody = '', attachments = [], inReplyTo, threadId } = req.body;
    const now = new Date().toISOString();
    const id = uuidv4();

    await db.run(
      `INSERT INTO drafts (id, account_id, subject, to_addresses, cc_addresses, bcc_addresses, body, attachments, in_reply_to, thread_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, accountId, subject, JSON.stringify(to), JSON.stringify(cc), JSON.stringify(bcc),
       draftBody, JSON.stringify(attachments), inReplyTo || null, threadId || null, now, now]
    );

    const row = await db.get<DraftRow>('SELECT * FROM drafts WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: rowToDraft(row!) } as ApiResponse<Draft>);
  })
);

// PUT /api/drafts/:id
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const existing = await db.get<DraftRow>('SELECT * FROM drafts WHERE id = ?', [req.params.id]);
    if (!existing) throw new AppError('임시저장을 찾을 수 없습니다', 404);

    const { subject, to, cc, bcc, body: draftBody, attachments, inReplyTo, threadId } = req.body;
    const now = new Date().toISOString();

    await db.run(
      `UPDATE drafts SET
        subject = COALESCE(?, subject),
        to_addresses = COALESCE(?, to_addresses),
        cc_addresses = COALESCE(?, cc_addresses),
        bcc_addresses = COALESCE(?, bcc_addresses),
        body = COALESCE(?, body),
        attachments = COALESCE(?, attachments),
        in_reply_to = COALESCE(?, in_reply_to),
        thread_id = COALESCE(?, thread_id),
        updated_at = ?
       WHERE id = ?`,
      [
        subject !== undefined ? subject : null,
        to !== undefined ? JSON.stringify(to) : null,
        cc !== undefined ? JSON.stringify(cc) : null,
        bcc !== undefined ? JSON.stringify(bcc) : null,
        draftBody !== undefined ? draftBody : null,
        attachments !== undefined ? JSON.stringify(attachments) : null,
        inReplyTo !== undefined ? inReplyTo : null,
        threadId !== undefined ? threadId : null,
        now, req.params.id,
      ]
    );

    const row = await db.get<DraftRow>('SELECT * FROM drafts WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: rowToDraft(row!) } as ApiResponse<Draft>);
  })
);

// DELETE /api/drafts/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const existing = await db.get<DraftRow>('SELECT * FROM drafts WHERE id = ?', [req.params.id]);
    if (!existing) throw new AppError('임시저장을 찾을 수 없습니다', 404);

    await db.run('DELETE FROM drafts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '임시저장을 삭제했습니다' });
  })
);

export default router;
