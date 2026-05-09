import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApiResponse } from '../types';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const response: ApiResponse = {
      success: false,
      error: '입력값이 올바르지 않습니다',
      data: errors.array() as unknown,
    };
    res.status(400).json(response);
    return;
  }
  next();
}
