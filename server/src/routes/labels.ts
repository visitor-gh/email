import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Label, LabelRow, ApiResponse } from '../types';

const router = Router();

function rowToLabel(row: LabelRow): Label {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    color: row.color,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/labels
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { accountId } = req.query as Record<string, string>;

    let query = 'SELECT * FROM labels';
    const params: unknown[] = [];

    if (accountId) {
      query += ' WHERE account_id = ? OR account_id IS NULL';
      params.push(accountId);
    }

    query += ' ORDER BY is_system DESC, name ASC';

    const rows = await db.all<LabelRow>(query, params);
    const labels = await Promise.all(rows.map(async row => {
      const label = rowToLabel(row);
      const result = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM email_labels WHERE label_id = ?',
        [row.id]
      );
      return { ...label, emailCount: result?.count ?? 0 };
    }));

    res.json({ success: true, data: labels } as ApiResponse<typeof labels>);
  })
);

// GET /api/labels/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const row = await db.get<LabelRow>('SELECT * FROM labels WHERE id = ?', [req.params.id]);
    if (!row) throw new AppError('라벨을 찾을 수 없습니다', 404);
    res.json({ success: true, data: rowToLabel(row) } as ApiResponse<Label>);
  })
);

// POST /api/labels
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('라벨 이름을 입력해주세요'),
    body('color').optional().isString(),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { name, color = '#6B7280', accountId } = req.body;
    const now = new Date().toISOString();
    const id = uuidv4();

    const existing = await db.get(
      'SELECT id FROM labels WHERE name = ? AND (account_id = ? OR account_id IS NULL)',
      [name, accountId || null]
    );
    if (existing) throw new AppError('같은 이름의 라벨이 이미 존재합니다', 409);

    await db.run(
      `INSERT INTO labels (id, account_id, name, color, is_system, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [id, accountId || null, name, color, now, now]
    );

    const row = await db.get<LabelRow>('SELECT * FROM labels WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: rowToLabel(row!) } as ApiResponse<Label>);
  })
);

// PUT /api/labels/:id
router.put(
  '/:id',
  [body('name').optional().notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const existing = await db.get<LabelRow>('SELECT * FROM labels WHERE id = ?', [req.params.id]);
    if (!existing) throw new AppError('라벨을 찾을 수 없습니다', 404);
    if (existing.is_system === 1) throw new AppError('시스템 라벨은 수정할 수 없습니다', 403);

    const { name, color } = req.body;
    const now = new Date().toISOString();

    await db.run(
      `UPDATE labels SET name = COALESCE(?, name), color = COALESCE(?, color), updated_at = ? WHERE id = ?`,
      [name || null, color || null, now, req.params.id]
    );

    const row = await db.get<LabelRow>('SELECT * FROM labels WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: rowToLabel(row!) } as ApiResponse<Label>);
  })
);

// DELETE /api/labels/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const existing = await db.get<LabelRow>('SELECT * FROM labels WHERE id = ?', [req.params.id]);
    if (!existing) throw new AppError('라벨을 찾을 수 없습니다', 404);
    if (existing.is_system === 1) throw new AppError('시스템 라벨은 삭제할 수 없습니다', 403);

    await db.run('DELETE FROM labels WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '라벨을 삭제했습니다' });
  })
);

export default router;
