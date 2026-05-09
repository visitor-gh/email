import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Template, TemplateRow, ApiResponse } from '../types';

const router = Router();

function rowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/templates
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { category } = req.query as Record<string, string>;

    let query = 'SELECT * FROM templates';
    const params: unknown[] = [];

    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }
    query += ' ORDER BY category ASC, name ASC';

    const rows = await db.all<TemplateRow>(query, params);
    const templates = rows.map(rowToTemplate);

    const grouped: Record<string, Template[]> = {};
    for (const tmpl of templates) {
      if (!grouped[tmpl.category]) grouped[tmpl.category] = [];
      grouped[tmpl.category].push(tmpl);
    }

    res.json({ success: true, data: { templates, grouped } });
  })
);

// GET /api/templates/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const row = await db.get<TemplateRow>('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!row) throw new AppError('템플릿을 찾을 수 없습니다', 404);
    res.json({ success: true, data: rowToTemplate(row) } as ApiResponse<Template>);
  })
);

// POST /api/templates
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('템플릿 이름을 입력해주세요'),
    body('subject').notEmpty().withMessage('제목을 입력해주세요'),
    body('body').notEmpty().withMessage('본문을 입력해주세요'),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { name, subject, body: tmplBody, category = '일반' } = req.body;
    const now = new Date().toISOString();
    const id = uuidv4();

    await db.run(
      `INSERT INTO templates (id, name, subject, body, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, subject, tmplBody, category, now, now]
    );

    const row = await db.get<TemplateRow>('SELECT * FROM templates WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: rowToTemplate(row!) } as ApiResponse<Template>);
  })
);

// PUT /api/templates/:id
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const existing = await db.get<TemplateRow>('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!existing) throw new AppError('템플릿을 찾을 수 없습니다', 404);

    const { name, subject, body: tmplBody, category } = req.body;
    const now = new Date().toISOString();

    await db.run(
      `UPDATE templates SET
        name = COALESCE(?, name),
        subject = COALESCE(?, subject),
        body = COALESCE(?, body),
        category = COALESCE(?, category),
        updated_at = ?
       WHERE id = ?`,
      [name || null, subject || null, tmplBody || null, category || null, now, req.params.id]
    );

    const row = await db.get<TemplateRow>('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: rowToTemplate(row!) } as ApiResponse<Template>);
  })
);

// DELETE /api/templates/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const existing = await db.get<TemplateRow>('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!existing) throw new AppError('템플릿을 찾을 수 없습니다', 404);

    await db.run('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '템플릿을 삭제했습니다' });
  })
);

export default router;
