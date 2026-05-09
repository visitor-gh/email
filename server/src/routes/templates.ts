import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Template, ApiResponse } from '../types';

const router = Router();

interface TemplateDoc extends Omit<Template, 'id'> { _id: string }

function docToTemplate(doc: TemplateDoc): Template {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// GET /api/templates
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.query as Record<string, string>;
  const col = getDb().collection<TemplateDoc>('templates');
  const filter = category ? { category } : {};
  const docs = await col.find(filter).sort({ category: 1, name: 1 }).toArray();
  const templates = docs.map(docToTemplate);

  const grouped: Record<string, Template[]> = {};
  for (const tmpl of templates) {
    if (!grouped[tmpl.category]) grouped[tmpl.category] = [];
    grouped[tmpl.category].push(tmpl);
  }

  res.json({ success: true, data: { templates, grouped } });
}));

// GET /api/templates/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const doc = await getDb().collection<TemplateDoc>('templates').findOne({ _id: req.params.id });
  if (!doc) throw new AppError('템플릿을 찾을 수 없습니다', 404);
  res.json({ success: true, data: docToTemplate(doc) } as ApiResponse<Template>);
}));

// POST /api/templates
router.post('/', [
  body('name').notEmpty().withMessage('템플릿 이름을 입력해주세요'),
  body('subject').notEmpty().withMessage('제목을 입력해주세요'),
  body('body').notEmpty().withMessage('본문을 입력해주세요'),
], validate, asyncHandler(async (req: Request, res: Response) => {
  const { name, subject, body: tmplBody, category = '일반' } = req.body;
  const now = new Date().toISOString();
  const doc: TemplateDoc = { _id: uuidv4(), name, subject, body: tmplBody, category, createdAt: now, updatedAt: now };
  await getDb().collection<TemplateDoc>('templates').insertOne(doc);
  res.status(201).json({ success: true, data: docToTemplate(doc) } as ApiResponse<Template>);
}));

// PUT /api/templates/:id
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const col = getDb().collection<TemplateDoc>('templates');
  const existing = await col.findOne({ _id: req.params.id });
  if (!existing) throw new AppError('템플릿을 찾을 수 없습니다', 404);

  const { name, subject, body: tmplBody, category } = req.body;
  const updates: Partial<TemplateDoc> = { updatedAt: new Date().toISOString() };
  if (name) updates.name = name;
  if (subject) updates.subject = subject;
  if (tmplBody) updates.body = tmplBody;
  if (category) updates.category = category;

  await col.updateOne({ _id: req.params.id }, { $set: updates });
  const updated = await col.findOne({ _id: req.params.id });
  res.json({ success: true, data: docToTemplate(updated!) } as ApiResponse<Template>);
}));

// DELETE /api/templates/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const col = getDb().collection<TemplateDoc>('templates');
  const existing = await col.findOne({ _id: req.params.id });
  if (!existing) throw new AppError('템플릿을 찾을 수 없습니다', 404);
  await col.deleteOne({ _id: req.params.id });
  res.json({ success: true, message: '템플릿을 삭제했습니다' });
}));

export default router;
