import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Label, ApiResponse } from '../types';

const router = Router();

interface LabelDoc extends Omit<Label, 'id'> { _id: string }

function docToLabel(doc: LabelDoc): Label {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// GET /api/labels
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.query as Record<string, string>;
  const col = getDb().collection<LabelDoc>('labels');

  const filter = accountId ? { $or: [{ accountId }, { accountId: null }] } : {};
  const docs = await col.find(filter).sort({ isSystem: -1, name: 1 }).toArray();

  const labels = await Promise.all(docs.map(async doc => {
    const emailCount = await getDb().collection('emails').countDocuments({ labels: doc._id, isDeleted: false });
    return { ...docToLabel(doc), emailCount };
  }));

  res.json({ success: true, data: labels });
}));

// GET /api/labels/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const col = getDb().collection<LabelDoc>('labels');
  const doc = await col.findOne({ _id: req.params.id });
  if (!doc) throw new AppError('라벨을 찾을 수 없습니다', 404);
  res.json({ success: true, data: docToLabel(doc) } as ApiResponse<Label>);
}));

// POST /api/labels
router.post('/', [
  body('name').notEmpty().withMessage('라벨 이름을 입력해주세요'),
  body('color').optional().isString(),
], validate, asyncHandler(async (req: Request, res: Response) => {
  const { name, color = '#6B7280', accountId } = req.body;
  const col = getDb().collection<LabelDoc>('labels');

  const existing = await col.findOne({ name, $or: [{ accountId: accountId || null }, { accountId: null }] });
  if (existing) throw new AppError('같은 이름의 라벨이 이미 존재합니다', 409);

  const now = new Date().toISOString();
  const doc: LabelDoc = { _id: uuidv4(), accountId: accountId || null, name, color, isSystem: false, createdAt: now, updatedAt: now };
  await col.insertOne(doc);

  res.status(201).json({ success: true, data: docToLabel(doc) } as ApiResponse<Label>);
}));

// PUT /api/labels/:id
router.put('/:id', [body('name').optional().notEmpty()], validate, asyncHandler(async (req: Request, res: Response) => {
  const col = getDb().collection<LabelDoc>('labels');
  const existing = await col.findOne({ _id: req.params.id });
  if (!existing) throw new AppError('라벨을 찾을 수 없습니다', 404);
  if (existing.isSystem) throw new AppError('시스템 라벨은 수정할 수 없습니다', 403);

  const { name, color } = req.body;
  const updates: Partial<LabelDoc> = { updatedAt: new Date().toISOString() };
  if (name) updates.name = name;
  if (color) updates.color = color;

  await col.updateOne({ _id: req.params.id }, { $set: updates });
  const updated = await col.findOne({ _id: req.params.id });
  res.json({ success: true, data: docToLabel(updated!) } as ApiResponse<Label>);
}));

// DELETE /api/labels/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const col = getDb().collection<LabelDoc>('labels');
  const existing = await col.findOne({ _id: req.params.id });
  if (!existing) throw new AppError('라벨을 찾을 수 없습니다', 404);
  if (existing.isSystem) throw new AppError('시스템 라벨은 삭제할 수 없습니다', 403);

  await col.deleteOne({ _id: req.params.id });
  res.json({ success: true, message: '라벨을 삭제했습니다' });
}));

export default router;
