import { getDb } from './database';

export function initializeSchema(): void {
  const db = getDb();

  // Accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('gmail', 'imap')),
      access_token TEXT,
      refresh_token TEXT,
      token_expiry INTEGER,
      imap_host TEXT,
      imap_port INTEGER,
      imap_secure INTEGER DEFAULT 1,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_secure INTEGER DEFAULT 1,
      password TEXT,
      signature TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Emails table
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      from_address TEXT NOT NULL,
      to_addresses TEXT NOT NULL DEFAULT '[]',
      cc_addresses TEXT NOT NULL DEFAULT '[]',
      bcc_addresses TEXT NOT NULL DEFAULT '[]',
      reply_to TEXT,
      body TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      attachments TEXT NOT NULL DEFAULT '[]',
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_important INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      is_draft INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal',
      date TEXT NOT NULL,
      in_reply_to TEXT,
      email_references TEXT,
      snippet TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Indexes for emails
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_emails_account_id ON emails(account_id);
    CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails(thread_id);
    CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC);
    CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);
    CREATE INDEX IF NOT EXISTS idx_emails_is_starred ON emails(is_starred);
    CREATE INDEX IF NOT EXISTS idx_emails_is_deleted ON emails(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_emails_is_archived ON emails(is_archived);
    CREATE INDEX IF NOT EXISTS idx_emails_is_draft ON emails(is_draft);
  `);

  // Labels table
  db.exec(`
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Email labels junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_labels (
      email_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (email_id, label_id),
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
    )
  `);

  // Drafts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      to_addresses TEXT NOT NULL DEFAULT '[]',
      cc_addresses TEXT NOT NULL DEFAULT '[]',
      bcc_addresses TEXT NOT NULL DEFAULT '[]',
      body TEXT NOT NULL DEFAULT '',
      attachments TEXT NOT NULL DEFAULT '[]',
      in_reply_to TEXT,
      thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '일반',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Full-text search virtual table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
      id UNINDEXED,
      subject,
      from_address,
      to_addresses,
      body_text,
      snippet,
      content=emails,
      content_rowid=rowid
    )
  `);

  // Triggers to keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON emails BEGIN
      INSERT INTO emails_fts(rowid, id, subject, from_address, to_addresses, body_text, snippet)
      VALUES (new.rowid, new.id, new.subject, new.from_address, new.to_addresses, new.body_text, new.snippet);
    END;

    CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON emails BEGIN
      INSERT INTO emails_fts(emails_fts, rowid, id, subject, from_address, to_addresses, body_text, snippet)
      VALUES ('delete', old.rowid, old.id, old.subject, old.from_address, old.to_addresses, old.body_text, old.snippet);
    END;

    CREATE TRIGGER IF NOT EXISTS emails_au AFTER UPDATE ON emails BEGIN
      INSERT INTO emails_fts(emails_fts, rowid, id, subject, from_address, to_addresses, body_text, snippet)
      VALUES ('delete', old.rowid, old.id, old.subject, old.from_address, old.to_addresses, old.body_text, old.snippet);
      INSERT INTO emails_fts(rowid, id, subject, from_address, to_addresses, body_text, snippet)
      VALUES (new.rowid, new.id, new.subject, new.from_address, new.to_addresses, new.body_text, new.snippet);
    END;
  `);

  // Seed system labels
  const now = new Date().toISOString();
  const systemLabels = [
    { id: 'label_inbox', name: '받은편지함', color: '#3B82F6', isSystem: 1 },
    { id: 'label_sent', name: '보낸편지함', color: '#10B981', isSystem: 1 },
    { id: 'label_drafts', name: '임시보관함', color: '#F59E0B', isSystem: 1 },
    { id: 'label_starred', name: '중요편지함', color: '#EF4444', isSystem: 1 },
    { id: 'label_archive', name: '보관함', color: '#8B5CF6', isSystem: 1 },
    { id: 'label_trash', name: '휴지통', color: '#6B7280', isSystem: 1 },
    { id: 'label_spam', name: '스팸함', color: '#EC4899', isSystem: 1 },
  ];

  const insertLabel = db.prepare(`
    INSERT OR IGNORE INTO labels (id, account_id, name, color, is_system, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?, ?, ?)
  `);

  for (const label of systemLabels) {
    insertLabel.run(label.id, label.name, label.color, label.isSystem, now, now);
  }

  // Seed default templates
  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO templates (id, name, subject, body, category, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const defaultTemplates = [
    {
      id: 'tmpl_001',
      name: '미팅 요청',
      subject: '[미팅 요청] {주제}',
      body: '<p>안녕하세요, {수신자}님.</p><p>{발신자}입니다.</p><p>다음과 같이 미팅을 요청드립니다.</p><ul><li><strong>일시:</strong> {날짜/시간}</li><li><strong>장소:</strong> {장소}</li><li><strong>안건:</strong> {안건}</li></ul><p>확인 후 회신 부탁드립니다.</p><p>감사합니다.</p>',
      category: '업무',
    },
    {
      id: 'tmpl_002',
      name: '업무 보고',
      subject: '[보고] {월}월 업무 현황 보고',
      body: '<p>안녕하세요.</p><p>이번 달 업무 현황을 보고드립니다.</p><h3>완료 사항</h3><ul><li></li></ul><h3>진행 중</h3><ul><li></li></ul><h3>예정 사항</h3><ul><li></li></ul><p>감사합니다.</p>',
      category: '보고',
    },
    {
      id: 'tmpl_003',
      name: '휴가 자동 회신',
      subject: '자동 회신: 부재 중입니다',
      body: '<p>안녕하세요.</p><p>현재 {시작일}부터 {종료일}까지 휴가 중으로 이메일 확인이 어렵습니다.</p><p>긴급한 사항은 {연락처}로 연락주시기 바랍니다.</p><p>복귀 후 신속히 답변드리겠습니다.</p><p>감사합니다.</p>',
      category: '자동회신',
    },
    {
      id: 'tmpl_004',
      name: '감사 인사',
      subject: '감사합니다',
      body: '<p>안녕하세요, {수신자}님.</p><p>{내용}에 대해 진심으로 감사드립니다.</p><p>앞으로도 좋은 관계 유지하길 바랍니다.</p><p>감사합니다.<br>{발신자}</p>',
      category: '일반',
    },
  ];

  for (const tmpl of defaultTemplates) {
    insertTemplate.run(tmpl.id, tmpl.name, tmpl.subject, tmpl.body, tmpl.category, now, now);
  }

  console.log('Database schema initialized successfully');
}

// Run directly if called as main
if (require.main === module) {
  initializeSchema();
  process.exit(0);
}
