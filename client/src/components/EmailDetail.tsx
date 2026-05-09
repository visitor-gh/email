import { useState } from 'react';
import clsx from 'clsx';
import { Thread, Email } from '../types';
import { useMarkRead, useStar, useArchive, useDeleteEmail } from '../hooks/useEmails';
import { useQuery } from '@tanstack/react-query';
import { labelsApi } from '../api/client';

interface EmailDetailProps {
  thread: Thread;
  onClose: () => void;
  onReply: (email: Email) => void;
  onReplyAll: (email: Email) => void;
  onForward: (email: Email) => void;
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAddress(addr: { name?: string; email: string }): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function EmailDetail({ thread, onClose, onReply, onReplyAll, onForward }: EmailDetailProps) {
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(
    new Set([thread.lastEmail.id])
  );

  const markRead = useMarkRead();
  const star = useStar();
  const archive = useArchive();
  const deleteEmail = useDeleteEmail();

  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => labelsApi.list(),
  });

  const getLabelName = (labelId: string) => {
    return labels.find(l => l.id === labelId)?.name || labelId;
  };

  const getLabelColor = (labelId: string) => {
    return labels.find(l => l.id === labelId)?.color || '#6B7280';
  };

  const toggleExpand = (emailId: string) => {
    setExpandedEmails(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Thread header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            title="닫기"
          >
            ✕
          </button>
          <h2 className="font-semibold text-gray-900 text-base truncate">
            {thread.subject || '(제목 없음)'}
          </h2>
          {thread.emailCount > 1 && (
            <span className="flex-shrink-0 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
              {thread.emailCount}개
            </span>
          )}
        </div>

        {/* Thread actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => star.mutate({ id: thread.lastEmail.id, isStarred: !thread.isStarred })}
            className={clsx(
              'p-1.5 rounded hover:bg-gray-100 text-sm',
              thread.isStarred ? 'text-yellow-400' : 'text-gray-400'
            )}
            title="중요 표시"
          >
            ⭐
          </button>
          <button
            onClick={() => archive.mutate({ id: thread.lastEmail.id, isArchived: true })}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-sm"
            title="보관"
          >
            📦
          </button>
          <button
            onClick={() => deleteEmail.mutate({ id: thread.lastEmail.id })}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 text-sm"
            title="삭제"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Labels */}
      {thread.labels.length > 0 && (
        <div className="px-6 py-2 flex flex-wrap gap-1.5 border-b border-gray-100">
          {thread.labels.map(labelId => (
            <span
              key={labelId}
              className="px-2 py-0.5 text-xs rounded-full font-medium"
              style={{
                backgroundColor: getLabelColor(labelId) + '20',
                color: getLabelColor(labelId),
              }}
            >
              {getLabelName(labelId)}
            </span>
          ))}
        </div>
      )}

      {/* Emails in thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {thread.emails.map((email, idx) => {
          const isExpanded = expandedEmails.has(email.id);
          const isLast = idx === thread.emails.length - 1;

          return (
            <div
              key={email.id}
              className={clsx(
                'border rounded-xl overflow-hidden',
                isLast ? 'border-blue-200 shadow-sm' : 'border-gray-200'
              )}
            >
              {/* Email header */}
              <div
                className={clsx(
                  'flex items-start justify-between px-4 py-3 cursor-pointer',
                  isExpanded ? 'border-b border-gray-100' : '',
                  isLast ? 'bg-blue-50/50' : 'bg-gray-50/50 hover:bg-gray-100/50'
                )}
                onClick={() => toggleExpand(email.id)}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {(email.from.name || email.from.email)[0].toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">
                        {email.from.name || email.from.email}
                      </span>
                      <span className="text-xs text-gray-400">&lt;{email.from.email}&gt;</span>
                      {!email.isRead && (
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full inline-block" />
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="text-xs text-gray-500 truncate mt-0.5 max-w-sm">
                        {email.snippet || email.bodyText?.slice(0, 80)}
                      </p>
                    )}
                    {isExpanded && (
                      <div className="mt-0.5 text-xs text-gray-500">
                        <span>받는 사람: {email.to.map(formatAddress).join(', ')}</span>
                        {email.cc.length > 0 && (
                          <span className="ml-3">참조: {email.cc.map(formatAddress).join(', ')}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-xs text-gray-400">
                    {formatFullDate(email.date)}
                  </span>
                  {email.attachments?.length > 0 && (
                    <span className="text-xs text-gray-400">📎</span>
                  )}
                  <span className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Email body */}
              {isExpanded && (
                <>
                  <div className="px-4 py-4">
                    <div
                      className="prose prose-sm max-w-none text-gray-800 text-sm leading-relaxed"
                      style={{ fontFamily: 'inherit' }}
                      dangerouslySetInnerHTML={{ __html: email.body }}
                    />
                  </div>

                  {/* Attachments */}
                  {email.attachments && email.attachments.length > 0 && (
                    <div className="px-4 pb-4">
                      <div className="border-t border-gray-100 pt-3">
                        <p className="text-xs text-gray-500 mb-2">
                          첨부파일 {email.attachments.length}개
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {email.attachments.map(att => (
                            <div
                              key={att.id}
                              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer text-sm transition-colors"
                            >
                              <span>📎</span>
                              <div>
                                <div className="text-xs font-medium text-gray-700">{att.filename}</div>
                                <div className="text-xs text-gray-400">{formatFileSize(att.size)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reply actions */}
                  <div className="px-4 pb-4 flex items-center gap-2 border-t border-gray-100 pt-3">
                    <button
                      onClick={() => onReply(email)}
                      className="btn-secondary text-xs"
                    >
                      ↩ 답장
                    </button>
                    <button
                      onClick={() => onReplyAll(email)}
                      className="btn-secondary text-xs"
                    >
                      ↩↩ 전체 답장
                    </button>
                    <button
                      onClick={() => onForward(email)}
                      className="btn-secondary text-xs"
                    >
                      ↪ 전달
                    </button>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => markRead.mutate({ id: email.id, isRead: !email.isRead })}
                        className="btn-ghost text-xs"
                        title={email.isRead ? '읽지 않음으로 표시' : '읽음으로 표시'}
                      >
                        {email.isRead ? '읽지 않음' : '읽음'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick reply area */}
      <div className="flex-shrink-0 border-t border-gray-200 px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => onReply(thread.lastEmail)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
          >
            <span>↩</span>
            <span>{thread.lastEmail.from.name || thread.lastEmail.from.email}님께 답장</span>
          </button>
          <button
            onClick={() => onForward(thread.lastEmail)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-4 text-sm text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
          >
            ↪ 전달
          </button>
        </div>
      </div>
    </div>
  );
}
