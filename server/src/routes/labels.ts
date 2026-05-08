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

// GET /api/labels - List labels
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

    const rows = db.prepare(query).all(...params as []) as LabelRow[];
    const labels = rows.map(row => {
      const label = rowToLabel(row);
      // Count emails with this label
      const count = db
        .prepare('SELECT COUNT(*) as count FROM email_labels WHERE label_id = ?')
        .get(row.id) as { count: number };
      return { ...label, emailCount: count.count };
    });

    res.json({ success: true, data: labels } as ApiResponse<typeof labels>);
  })
);

// GET /api/labels/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM labels WHERE id = ?')
      .get(req.params.id) as LabelRow | undefined;

    if (!row) throw new AppError('라벨을 찾을 수 없습니다', 404);

    res.json({ success: true, data: rowToLabel(row) } as ApiResponse<Label>);
  })
);

// POST /api/labels - Create label
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

    // Check for duplicate name
    const existing = db
      .prepare('SELECT id FROM labels WHERE name = ? AND (account_id = ? OR account_id IS NULL)')
      .get(name, accountId || null);

    if (existing) {
      throw new AppError('같은 이름의 라벨이 이미 존재합니다', 409);
    }

    db.prepare(
      `INSERT INTO labels (id, account_id, name, color, is_system, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    ).run(id, accountId || null, name, color, now, now);

    const row = db.prepare('SELECT * FROM labels WHERE id = ?').get(id) as LabelRow;
    res.status(201).json({ success: true, data: rowToLabel(row) } as ApiResponse<Label>);
  })
);

// PUT /api/labels/:id - Update label
router.put(
  '/:id',
  [body('name').optional().notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM labels WHERE id = ?')
      .get(req.params.id) as LabelRow | undefined;

    if (!existing) throw new AppError('라벨을 찾을 수 없습니다', 404);
    if (existing.is_system === 1) throw new AppError('시스템 라벨은 수정할 수 없습니다', 403);

    const { name, color } = req.body;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE labels SET name = COALESCE(?, name), color = COALESCE(?, color), updated_at = ? WHERE id = ?`
    ).run(name || null, color || null, now, req.params.id);

    const row = db.prepare('SELECT * FROM labels WHERE id = ?').get(req.params.id) as LabelRow;
    res.json({ success: true, data: rowToLabel(row) } as ApiResponse<Label>);
  })
);

// DELETE /api/labels/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM labels WHERE id = ?')
      .get(req.params.id) as LabelRow | undefined;

    if (!existing) throw new AppError('라벨을 찾을 수 없습니다', 404);
    if (existing.is_system === 1) throw new AppError('시스템 라벨은 삭제할 수 없습니다', 403);

    db.prepare('DELETE FROM labels WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '라벨을 삭제했습니다' });
  })
);

export default router;
