import { useState, useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';
import { useSendEmail } from '../hooks/useEmails';
import { useAccounts } from '../hooks/useAccounts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesApi, draftsApi } from '../api/client';
import { ComposeData, EmailAddress, Template } from '../types';
import toast from 'react-hot-toast';

interface ComposeModalProps {
  initialData?: Partial<ComposeData>;
  onClose: () => void;
}

function parseEmailInput(input: string): EmailAddress[] {
  return input
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const match = s.match(/^(.+?)\s*<(.+?)>$/);
      if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
      return { email: s };
    });
}

function addressesToString(addrs: EmailAddress[]): string {
  return addrs.map(a => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ');
}

export function ComposeModal({ initialData = {}, onClose }: ComposeModalProps) {
  const { data: accounts = [] } = useAccounts();
  const sendEmail = useSendEmail();
  const qc = useQueryClient();

  const [accountId, setAccountId] = useState(
    initialData.accountId || accounts[0]?.id || ''
  );
  const [toStr, setToStr] = useState(addressesToString(initialData.to || []));
  const [ccStr, setCcStr] = useState(addressesToString(initialData.cc || []));
  const [bccStr, setBccStr] = useState(addressesToString(initialData.bcc || []));
  const [subject, setSubject] = useState(initialData.subject || '');
  const [body, setBody] = useState(initialData.body || '');
  const [showCc, setShowCc] = useState((initialData.cc?.length || 0) > 0);
  const [showBcc, setShowBcc] = useState((initialData.bcc?.length || 0) > 0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [draftId, setDraftId] = useState(initialData.draftId);
  const [autoSaving, setAutoSaving] = useState(false);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  const { data: templateData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
  });

  const saveDraft = useCallback(async () => {
    if (!accountId) return;
    setAutoSaving(true);
    try {
      const draftPayload = {
        accountId,
        subject,
        to: parseEmailInput(toStr),
        cc: parseEmailInput(ccStr),
        bcc: parseEmailInput(bccStr),
        body,
        inReplyTo: initialData.inReplyTo,
        threadId: initialData.threadId,
      };

      if (draftId) {
        await draftsApi.update(draftId, draftPayload);
      } else {
        const draft = await draftsApi.save(draftPayload);
        if (isMounted.current) setDraftId(draft.id);
      }
      qc.invalidateQueries({ queryKey: ['emails'] });
    } catch {
      // Silent fail for auto-save
    } finally {
      if (isMounted.current) setAutoSaving(false);
    }
  }, [accountId, subject, toStr, ccStr, bccStr, body, draftId, initialData]);

  // Auto-save every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      if (subject || toStr || body) saveDraft();
    }, 30000);
    return () => clearInterval(timer);
  }, [saveDraft, subject, toStr, body]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Set account when accounts load
  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(initialData.accountId || accounts[0].id);
    }
  }, [accounts, accountId, initialData.accountId]);

  // Append signature when account changes
  useEffect(() => {
    const account = accounts.find(a => a.id === accountId);
    if (account?.signature && !body.includes(account.signature)) {
      const sigHtml = `<br/><br/>-- <br/>${account.signature}`;
      setBody(prev => prev ? prev + sigHtml : sigHtml);
    }
  }, [accountId, accounts]);

  const handleSend = async () => {
    if (!toStr.trim()) {
      toast.error('수신자를 입력해주세요');
      return;
    }
    if (!subject.trim()) {
      toast.error('제목을 입력해주세요');
      return;
    }
    if (!accountId) {
      toast.error('발신 계정을 선택해주세요');
      return;
    }

    await sendEmail.mutateAsync({
      accountId,
      to: parseEmailInput(toStr),
      cc: parseEmailInput(ccStr),
      bcc: parseEmailInput(bccStr),
      subject,
      body,
      inReplyTo: initialData.inReplyTo,
      references: initialData.references,
      threadId: initialData.threadId,
    });

    // Delete draft if it was saved
    if (draftId) {
      try { await draftsApi.delete(draftId); } catch {}
      qc.invalidateQueries({ queryKey: ['emails'] });
    }

    onClose();
  };

  const handleDiscard = async () => {
    if (draftId) {
      try { await draftsApi.delete(draftId); } catch {}
    }
    onClose();
  };

  const applyTemplate = (template: Template) => {
    setSubject(template.subject);
    setBody(template.body);
    setShowTemplates(false);
  };

  if (minimized) {
    return (
      <div
        className="fixed bottom-0 right-6 z-50 bg-gray-800 text-white px-4 py-2 rounded-t-lg cursor-pointer flex items-center gap-2 shadow-lg"
        onClick={() => setMinimized(false)}
      >
        <span className="text-sm font-medium truncate max-w-48">
          {subject || '(제목 없음)'}
        </span>
        <button className="ml-auto text-gray-300 hover:text-white">▲</button>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-gray-300 hover:text-white">✕</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
      <div className="w-[600px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col pointer-events-auto" style={{ maxHeight: '90vh' }}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 text-white rounded-t-xl">
          <h3 className="font-medium text-sm">새 이메일</h3>
          <div className="flex items-center gap-1">
            {autoSaving && <span className="text-xs text-gray-400 mr-2">저장 중...</span>}
            <button
              onClick={() => saveDraft()}
              className="p-1 hover:bg-gray-700 rounded text-gray-300 hover:text-white text-xs px-2"
              title="임시저장"
            >
              임시저장
            </button>
            <button
              onClick={() => setMinimized(true)}
              className="p-1 hover:bg-gray-700 rounded text-gray-300"
              title="최소화"
            >
              −
            </button>
            <button
              onClick={handleDiscard}
              className="p-1 hover:bg-gray-700 rounded text-gray-300"
              title="닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* From account */}
          <div className="flex items-center border-b border-gray-100 px-4 py-2">
            <span className="text-xs text-gray-400 w-12">보낸이</span>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="flex-1 text-sm text-gray-700 border-none focus:outline-none bg-transparent"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} &lt;{a.email}&gt;</option>
              ))}
            </select>
          </div>

          {/* To */}
          <div className="flex items-center border-b border-gray-100 px-4 py-2">
            <span className="text-xs text-gray-400 w-12">받는이</span>
            <input
              type="text"
              value={toStr}
              onChange={e => setToStr(e.target.value)}
              placeholder="이메일 주소 (쉼표로 구분)"
              className="flex-1 text-sm border-none focus:outline-none"
            />
            <div className="flex gap-2 text-xs text-gray-400">
              <button onClick={() => setShowCc(p => !p)} className="hover:text-gray-600">참조</button>
              <button onClick={() => setShowBcc(p => !p)} className="hover:text-gray-600">숨은참조</button>
            </div>
          </div>

          {/* CC */}
          {showCc && (
            <div className="flex items-center border-b border-gray-100 px-4 py-2">
              <span className="text-xs text-gray-400 w-12">참조</span>
              <input
                type="text"
                value={ccStr}
                onChange={e => setCcStr(e.target.value)}
                placeholder="참조 이메일 주소"
                className="flex-1 text-sm border-none focus:outline-none"
              />
            </div>
          )}

          {/* BCC */}
          {showBcc && (
            <div className="flex items-center border-b border-gray-100 px-4 py-2">
              <span className="text-xs text-gray-400 w-12">숨은참조</span>
              <input
                type="text"
                value={bccStr}
                onChange={e => setBccStr(e.target.value)}
                placeholder="숨은참조 이메일 주소"
                className="flex-1 text-sm border-none focus:outline-none"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center border-b border-gray-100 px-4 py-2">
            <span className="text-xs text-gray-400 w-12">제목</span>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="이메일 제목"
              className="flex-1 text-sm border-none focus:outline-none font-medium"
            />
            <button
              onClick={() => setShowTemplates(p => !p)}
              className="text-xs text-gray-400 hover:text-gray-600 ml-2"
              title="템플릿 사용"
            >
              📋 템플릿
            </button>
          </div>

          {/* Templates dropdown */}
          {showTemplates && templateData && (
            <div className="border-b border-gray-100 bg-gray-50 max-h-48 overflow-y-auto">
              {Object.entries(templateData.grouped).map(([category, tmpls]) => (
                <div key={category}>
                  <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 bg-gray-100">
                    {category}
                  </div>
                  {(tmpls as Template[]).map(tmpl => (
                    <button
                      key={tmpl.id}
                      onClick={() => applyTemplate(tmpl)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
                    >
                      <span className="font-medium">{tmpl.name}</span>
                      <span className="text-gray-400 text-xs truncate">{tmpl.subject}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Body - rich text editor */}
          <div className="flex-1 px-4 py-3 min-h-48">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="이메일 내용을 입력하세요..."
              className="w-full h-full min-h-48 text-sm text-gray-800 border-none focus:outline-none resize-none leading-relaxed"
              style={{ fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSend}
              disabled={sendEmail.isPending}
              className={clsx(
                'btn-primary',
                sendEmail.isPending && 'opacity-50 cursor-not-allowed'
              )}
            >
              {sendEmail.isPending ? '전송 중...' : '✉️ 전송'}
            </button>
            <button
              onClick={() => saveDraft()}
              disabled={autoSaving}
              className="btn-secondary text-xs"
            >
              {autoSaving ? '저장 중...' : '임시저장'}
            </button>
          </div>
          <button
            onClick={handleDiscard}
            className="btn-ghost text-xs text-red-500 hover:text-red-700"
          >
            🗑️ 삭제
          </button>
        </div>
      </div>
    </div>
  );
}
