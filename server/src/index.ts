import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initializeSchema } from './db/schema';

import accountsRouter from './routes/accounts';
import emailsRouter from './routes/emails';
import labelsRouter from './routes/labels';
import draftsRouter from './routes/drafts';
import templatesRouter from './routes/templates';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Security & logging
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, error: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.' },
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize DB
initializeSchema();

// Health check
app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/accounts', accountsRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/drafts', draftsRouter);
app.use('/api/templates', templatesRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ 서버가 포트 ${PORT}에서 실행 중입니다`);
  console.log(`   환경: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
