import { useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import clsx from 'clsx';
import { useEmails, useSearchEmails, useMarkThreadRead, useStar, useArchive, useDeleteEmail, useBatchAction } from '../hooks/useEmails';
import { Thread, Email, ComposeData, FolderType } from '../types';

interface EmailListProps {
  folder: FolderType;
  accountId?: string;
  labelId?: string;
  searchQuery: string;
  selectedThreadId?: string;
  onSelectThread: (thread: Thread) => void;
  onSearchChange: (q: string) => void;
  onCompose: (data?: Partial<ComposeData>) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return formatDistanceToNow(date, { addSuffix: false, locale: ko });
  } else {
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }
}

const FOLDER_LABELS: Record<string, string> = {
  inbox: '받은편지함',
  sent: '보낸편지함',
  drafts: '임시보관함',
  starred: '중요편지함',
  important: '우선순위',
  archive: '보관함',
  trash: '휴지통',
  unread: '읽지 않음',
};

export function EmailList({
  folder,
  accountId,
  labelId,
  searchQuery,
  selectedThreadId,
  onSelectThread,
  onSearchChange,
  onCompose,
}: EmailListProps) {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const { data: emailData, isLoading, error, refetch } = useEmails({
    folder,
    accountId,
    labelId,
    page,
    limit: 50,
    q: searchQuery || undefined,
    threaded: true,
  });

  const { data: searchData } = useSearchEmails(searchQuery, accountId);

  const markRead = useMarkThreadRead();
  const star = useStar();
  const archive = useArchive();
  const deleteEmail = useDeleteEmail();
  const batchAction = useBatchAction();

  const threads = emailData?.threads || [];
  const total = emailData?.total || 0;
  const totalPages = emailData?.totalPages || 1;

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(localSearch);
    setPage(1);
  }, [localSearch, onSearchChange]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === threads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(threads.map(t => t.id)));
    }
  }, [selectedIds, threads]);

  const handleToggleSelect = useCallback((threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }, []);

  const handleBatchAction = useCallback((action: 'read' | 'unread' | 'archive' | 'delete' | 'star' | 'unstar') => {
    const allEmailIds = threads
      .filter(t => selectedIds.has(t.id))
      .flatMap(t => t.emails.map(e => e.id));

    if (allEmailIds.length > 0) {
      batchAction.mutate({ ids: allEmailIds, action });
      setSelectedIds(new Set());
    }
  }, [threads, selectedIds, batchAction]);

  const folderTitle = labelId
    ? '라벨'
    : searchQuery
    ? `"${searchQuery}" 검색 결과`
    : FOLDER_LABELS[folder] || folder;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-4 py-3 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800 text-sm">{folderTitle}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refetch()}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="새로고침"
            >
              🔄
            </button>
            <button
              onClick={() => onCompose()}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="편지 작성"
            >
              ✏️
            </button>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch}>
          <div className="relative">
            <input
              type="text"
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              placeholder="이메일 검색..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            {localSearch && (
              <button
                type="button"
                onClick={() => { setLocalSearch(''); onSearchChange(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </form>

        {/* Batch actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1 mt-2 py-1.5 px-2 bg-blue-50 rounded-lg">
            <span className="text-xs text-blue-700 font-medium mr-1">{selectedIds.size}개 선택</span>
            <button onClick={() => handleBatchAction('read')} className="btn-ghost text-xs py-1 px-2">읽음</button>
            <button onClick={() => handleBatchAction('unread')} className="btn-ghost text-xs py-1 px-2">읽지 않음</button>
            <button onClick={() => handleBatchAction('archive')} className="btn-ghost text-xs py-1 px-2">보관</button>
            <button onClick={() => handleBatchAction('star')} className="btn-ghost text-xs py-1 px-2">⭐</button>
            <button onClick={() => handleBatchAction('delete')} className="btn-ghost text-xs py-1 px-2 text-red-600">삭제</button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">취소</button>
          </div>
        )}
      </div>

      {/* Count */}
      {!isLoading && (
        <div className="flex items-center px-4 py-1.5 border-b border-gray-100 bg-gray-50">
          <input
            type="checkbox"
            checked={selectedIds.size === threads.length && threads.length > 0}
            onChange={handleSelectAll}
            className="mr-2 rounded text-blue-600"
          />
          <span className="text-xs text-gray-500">
            총 {total}개 {searchQuery && `(검색 결과)`}
          </span>
        </div>
      )}

      {/* Email thread list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-gray-500 animate-pulse">로딩 중...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-red-500">오류가 발생했습니다</div>
          </div>
        )}

        {!isLoading && threads.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <span className="text-4xl mb-3">📭</span>
            <span className="text-sm">
              {searchQuery ? '검색 결과가 없습니다' : '이메일이 없습니다'}
            </span>
          </div>
        )}

        {threads.map(thread => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            selected={selectedThread => selectedThread === thread.id}
            checked={selectedIds.has(thread.id)}
            isActive={selectedThreadId === thread.id}
            onSelect={() => {
              onSelectThread(thread);
              if (!thread.isRead) {
                const emailIds = thread.emails.map(e => e.id);
                batchAction.mutate({ ids: emailIds, action: 'read' });
              }
            }}
            onCheck={(e) => handleToggleSelect(thread.id, e)}
            onStar={(e) => {
              e.stopPropagation();
              const emailId = thread.lastEmail.id;
              star.mutate({ id: emailId, isStarred: !thread.isStarred });
            }}
          />
        ))}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-gray-100">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary text-xs disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-xs text-gray-500">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-secondary text-xs disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ThreadRowProps {
  thread: Thread;
  selected: (id: string) => boolean;
  checked: boolean;
  isActive: boolean;
  onSelect: () => void;
  onCheck: (e: React.MouseEvent) => void;
  onStar: (e: React.MouseEvent) => void;
}

function ThreadRow({ thread, checked, isActive, onSelect, onCheck, onStar }: ThreadRowProps) {
  const [hovered, setHovered] = useState(false);
  const lastEmail = thread.lastEmail;

  return (
    <div
      className={clsx(
        'flex items-start px-3 py-2.5 cursor-pointer border-b border-gray-100 transition-colors group',
        isActive ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50',
        !thread.isRead && !isActive && 'bg-white',
        thread.isRead && !isActive && 'bg-gray-50/50'
      )}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0 mt-0.5 mr-2" onClick={onCheck}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => {}}
          className="rounded text-blue-600 cursor-pointer"
        />
      </div>

      {/* Star */}
      <button
        className={clsx(
          'flex-shrink-0 mt-0.5 mr-2 text-sm transition-colors',
          thread.isStarred ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'
        )}
        onClick={onStar}
      >
        ⭐
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Sender & date */}
        <div className="flex items-center justify-between mb-0.5">
          <span className={clsx('text-sm truncate', !thread.isRead ? 'font-semibold text-gray-900' : 'text-gray-700')}>
            {lastEmail.from.name || lastEmail.from.email}
            {thread.emailCount > 1 && (
              <span className="ml-1 text-xs text-gray-400 font-normal">({thread.emailCount})</span>
            )}
          </span>
          <span className="flex-shrink-0 text-xs text-gray-400 ml-2">
            {formatDate(lastEmail.date)}
          </span>
        </div>

        {/* Subject */}
        <div className={clsx('text-xs truncate mb-0.5', !thread.isRead ? 'font-medium text-gray-800' : 'text-gray-600')}>
          {lastEmail.subject || '(제목 없음)'}
        </div>

        {/* Snippet */}
        <div className="text-xs text-gray-400 truncate">
          {lastEmail.snippet || lastEmail.bodyText?.slice(0, 100) || ''}
        </div>

        {/* Labels */}
        {thread.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {thread.labels.slice(0, 3).map(labelId => (
              <span key={labelId} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                {labelId}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Indicators */}
      <div className="flex flex-col items-end gap-1 ml-1 flex-shrink-0">
        {lastEmail.attachments?.length > 0 && (
          <span className="text-xs text-gray-400">📎</span>
        )}
        {lastEmail.isImportant && (
          <span className="text-xs text-red-400">🔴</span>
        )}
        {!thread.isRead && (
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
        )}
      </div>
    </div>
  );
}
