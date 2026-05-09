import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Draft, ApiResponse } from '../types';

const router = Router();

interface DraftDoc extends Omit<Draft, 'id'> { _id: string }

function docToDraft(doc: DraftDoc): Draft {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// GET /api/drafts
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.query as Record<string, string>;
  const col = getDb().collection<DraftDoc>('drafts');
  const filter = accountId ? { accountId } : {};
  const docs = await col.find(filter).sort({ updatedAt: -1 }).toArray();
  res.json({ success: true, data: docs.map(docToDraft) } as ApiResponse<Draft[]>);
}));

// GET /api/drafts/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const doc = await getDb().collection<DraftDoc>('drafts').findOne({ _id: req.params.id });
  if (!doc) throw new AppError('임시저장을 찾을 수 없습니다', 404);
  res.json({ success: true, data: docToDraft(doc) } as ApiResponse<Draft>);
}));

// POST /api/drafts
router.post('/', [body('accountId').notEmpty().withMessage('계정을 선택해주세요')], validate,
  asyncHandler(async (req: Request, res: Response) => {
    const { accountId, subject = '', to = [], cc = [], bcc = [], body: draftBody = '', attachments = [], inReplyTo, threadId } = req.body;
    const now = new Date().toISOString();
    const doc: DraftDoc = {
      _id: uuidv4(), accountId, subject, to, cc, bcc, body: draftBody,
      attachments, inReplyTo, threadId, createdAt: now, updatedAt: now,
    };
    await getDb().collection<DraftDoc>('drafts').insertOne(doc);
    res.status(201).json({ success: true, data: docToDraft(doc) } as ApiResponse<Draft>);
  })
);

// PUT /api/drafts/:id
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const col = getDb().collection<DraftDoc>('drafts');
  const existing = await col.findOne({ _id: req.params.id });
  if (!existing) throw new AppError('임시저장을 찾을 수 없습니다', 404);

  const { subject, to, cc, bcc, body: draftBody, attachments, inReplyTo, threadId } = req.body;
  const updates: Partial<DraftDoc> = { updatedAt: new Date().toISOString() };
  if (subject !== undefined) updates.subject = subject;
  if (to !== undefined) updates.to = to;
  if (cc !== undefined) updates.cc = cc;
  if (bcc !== undefined) updates.bcc = bcc;
  if (draftBody !== undefined) updates.body = draftBody;
  if (attachments !== undefined) updates.attachments = attachments;
  if (inReplyTo !== undefined) updates.inReplyTo = inReplyTo;
  if (threadId !== undefined) updates.threadId = threadId;

  await col.updateOne({ _id: req.params.id }, { $set: updates });
  const updated = await col.findOne({ _id: req.params.id });
  res.json({ success: true, data: docToDraft(updated!) } as ApiResponse<Draft>);
}));

// DELETE /api/drafts/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const col = getDb().collection<DraftDoc>('drafts');
  const existing = await col.findOne({ _id: req.params.id });
  if (!existing) throw new AppError('임시저장을 찾을 수 없습니다', 404);
  await col.deleteOne({ _id: req.params.id });
  res.json({ success: true, message: '임시저장을 삭제했습니다' });
}));

export default router;
