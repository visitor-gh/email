import { getDb, initializeDb } from './database';

interface LabelDoc { _id: string; [key: string]: unknown }
interface TemplateDoc { _id: string; [key: string]: unknown }

export async function initializeSchema(): Promise<void> {
  const db = getDb();

  // Create indexes
  await db.collection('accounts').createIndex({ email: 1 }, { unique: true });
  await db.collection('emails').createIndex({ accountId: 1 });
  await db.collection('emails').createIndex({ threadId: 1 });
  await db.collection('emails').createIndex({ date: -1 });
  await db.collection('labels').createIndex({ name: 1 });

  // Seed system labels
  const labelsCol = db.collection<LabelDoc>('labels');
  const now = new Date().toISOString();
  const systemLabels = [
    { _id: 'label_inbox', name: '받은편지함', color: '#3B82F6', isSystem: true, accountId: null, createdAt: now, updatedAt: now },
    { _id: 'label_sent', name: '보낸편지함', color: '#10B981', isSystem: true, accountId: null, createdAt: now, updatedAt: now },
    { _id: 'label_drafts', name: '임시보관함', color: '#F59E0B', isSystem: true, accountId: null, createdAt: now, updatedAt: now },
    { _id: 'label_starred', name: '중요편지함', color: '#EF4444', isSystem: true, accountId: null, createdAt: now, updatedAt: now },
    { _id: 'label_archive', name: '보관함', color: '#8B5CF6', isSystem: true, accountId: null, createdAt: now, updatedAt: now },
    { _id: 'label_trash', name: '휴지통', color: '#6B7280', isSystem: true, accountId: null, createdAt: now, updatedAt: now },
    { _id: 'label_spam', name: '스팸함', color: '#EC4899', isSystem: true, accountId: null, createdAt: now, updatedAt: now },
  ];

  for (const label of systemLabels) {
    await labelsCol.updateOne(
      { _id: label._id },
      { $setOnInsert: label },
      { upsert: true }
    );
  }

  // Seed default templates
  const templatesCol = db.collection<TemplateDoc>('templates');
  const defaultTemplates = [
    {
      _id: 'tmpl_001',
      name: '미팅 요청',
      subject: '[미팅 요청] {주제}',
      body: '<p>안녕하세요, {수신자}님.</p><p>{발신자}입니다.</p><p>다음과 같이 미팅을 요청드립니다.</p><ul><li><strong>일시:</strong> {날짜/시간}</li><li><strong>장소:</strong> {장소}</li><li><strong>안건:</strong> {안건}</li></ul><p>확인 후 회신 부탁드립니다.</p><p>감사합니다.</p>',
      category: '업무',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: 'tmpl_002',
      name: '업무 보고',
      subject: '[보고] {월}월 업무 현황 보고',
      body: '<p>안녕하세요.</p><p>이번 달 업무 현황을 보고드립니다.</p><h3>완료 사항</h3><ul><li></li></ul><h3>진행 중</h3><ul><li></li></ul><h3>예정 사항</h3><ul><li></li></ul><p>감사합니다.</p>',
      category: '보고',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: 'tmpl_003',
      name: '휴가 자동 회신',
      subject: '자동 회신: 부재 중입니다',
      body: '<p>안녕하세요.</p><p>현재 {시작일}부터 {종료일}까지 휴가 중으로 이메일 확인이 어렵습니다.</p><p>긴급한 사항은 {연락처}로 연락주시기 바랍니다.</p><p>복귀 후 신속히 답변드리겠습니다.</p><p>감사합니다.</p>',
      category: '자동회신',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: 'tmpl_004',
      name: '감사 인사',
      subject: '감사합니다',
      body: '<p>안녕하세요, {수신자}님.</p><p>{내용}에 대해 진심으로 감사드립니다.</p><p>앞으로도 좋은 관계 유지하길 바랍니다.</p><p>감사합니다.<br>{발신자}</p>',
      category: '일반',
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const tmpl of defaultTemplates) {
    await templatesCol.updateOne(
      { _id: tmpl._id },
      { $setOnInsert: tmpl },
      { upsert: true }
    );
  }

  console.log('Database schema initialized successfully');
}

// Run directly if called as main
if (require.main === module) {
  (async () => {
    await initializeDb();
    await initializeSchema();
    process.exit(0);
  })();
}
