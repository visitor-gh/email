import { useState } from 'react';
import clsx from 'clsx';
import { useAccounts } from '../hooks/useAccounts';
import { useQuery } from '@tanstack/react-query';
import { labelsApi } from '../api/client';
import { FolderType, Template } from '../types';
import { ActiveView } from '../App';

interface SidebarProps {
  selectedFolder: FolderType;
  selectedAccountId?: string;
  selectedLabelId?: string;
  activeView: ActiveView;
  collapsed: boolean;
  onFolderSelect: (folder: FolderType) => void;
  onAccountSelect: (accountId: string | undefined) => void;
  onLabelSelect: (labelId: string) => void;
  onViewChange: (view: ActiveView) => void;
  onCompose: () => void;
  onAddAccount: () => void;
  onCollapse: () => void;
}

const FOLDERS: { id: FolderType; label: string; icon: string }[] = [
  { id: 'inbox', label: '받은편지함', icon: '📥' },
  { id: 'unread', label: '읽지 않음', icon: '●' },
  { id: 'starred', label: '중요편지함', icon: '⭐' },
  { id: 'important', label: '우선순위', icon: '🔴' },
  { id: 'sent', label: '보낸편지함', icon: '📤' },
  { id: 'drafts', label: '임시보관함', icon: '📝' },
  { id: 'archive', label: '보관함', icon: '📦' },
  { id: 'trash', label: '휴지통', icon: '🗑️' },
];

const SYSTEM_LABEL_IDS = [
  'label_inbox', 'label_sent', 'label_drafts', 'label_starred',
  'label_archive', 'label_trash', 'label_spam',
];

export function Sidebar({
  selectedFolder,
  selectedAccountId,
  selectedLabelId,
  activeView,
  collapsed,
  onFolderSelect,
  onAccountSelect,
  onLabelSelect,
  onViewChange,
  onCompose,
  onAddAccount,
  onCollapse,
}: SidebarProps) {
  const { data: accounts = [] } = useAccounts();
  const { data: labels = [] } = useQuery({
    queryKey: ['labels', selectedAccountId],
    queryFn: () => labelsApi.list(selectedAccountId),
    staleTime: 30000,
  });

  const [accountsExpanded, setAccountsExpanded] = useState(true);
  const [labelsExpanded, setLabelsExpanded] = useState(true);

  const customLabels = labels.filter(l => !l.isSystem && !SYSTEM_LABEL_IDS.includes(l.id));
  const totalUnread = accounts.reduce((sum, acc) => sum + (acc.unreadCount || 0), 0);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-14 bg-gray-900 text-white border-r border-gray-800 py-4 gap-3">
        <button onClick={onCollapse} className="p-2 hover:bg-gray-700 rounded-lg text-gray-300" title="펼치기">
          ☰
        </button>
        <button onClick={onCompose} className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg" title="편지 작성">
          ✏️
        </button>
        {FOLDERS.slice(0, 6).map(f => (
          <button
            key={f.id}
            onClick={() => onFolderSelect(f.id)}
            className={clsx('p-2 rounded-lg text-lg', selectedFolder === f.id && activeView === 'emails' ? 'bg-blue-600' : 'hover:bg-gray-700')}
            title={f.label}
          >
            {f.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-64 bg-gray-900 text-white border-r border-gray-800 overflow-y-auto flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xl">📧</span>
          <span className="font-bold text-sm text-white">기업 이메일</span>
        </div>
        <button
          onClick={onCollapse}
          className="p-1 hover:bg-gray-700 rounded text-gray-400"
        >
          ◀
        </button>
      </div>

      {/* Compose button */}
      <div className="px-3 py-3">
        <button
          onClick={onCompose}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          <span>✏️</span>
          <span>편지 작성</span>
        </button>
      </div>

      {/* Accounts */}
      <div className="px-3 mb-1">
        <button
          onClick={() => setAccountsExpanded(p => !p)}
          className="w-full flex items-center justify-between py-1.5 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 rounded"
        >
          <span>계정</span>
          <span>{accountsExpanded ? '▲' : '▼'}</span>
        </button>

        {accountsExpanded && (
          <div className="mt-1 space-y-0.5">
            <button
              onClick={() => onAccountSelect(undefined)}
              className={clsx(
                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                !selectedAccountId ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">📨</span>
                <span className="truncate">통합 받은편지함</span>
              </div>
              {totalUnread > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </button>

            {accounts.map(account => (
              <button
                key={account.id}
                onClick={() => onAccountSelect(account.id)}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                  selectedAccountId === account.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={clsx(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      account.isActive ? 'bg-green-400' : 'bg-gray-500'
                    )}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{account.name}</div>
                    <div className={clsx('text-xs truncate', selectedAccountId === account.id ? 'text-blue-200' : 'text-gray-500')}>
                      {account.email}
                    </div>
                  </div>
                </div>
                {(account.unreadCount || 0) > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">
                    {(account.unreadCount || 0) > 99 ? '99+' : account.unreadCount}
                  </span>
                )}
              </button>
            ))}

            <button
              onClick={onAddAccount}
              className="w-full flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              <span>+</span>
              <span>계정 추가</span>
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 my-1 border-t border-gray-700" />

      {/* Folders */}
      <div className="px-3 mb-1">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider py-1.5 px-2">
          폴더
        </div>
        <div className="space-y-0.5">
          {FOLDERS.map(folder => (
            <button
              key={folder.id}
              onClick={() => { onFolderSelect(folder.id); onViewChange('emails'); }}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                selectedFolder === folder.id && activeView === 'emails' && !selectedLabelId
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              )}
            >
              <span className="text-base w-5 text-center">{folder.icon}</span>
              <span>{folder.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Labels */}
      <div className="mx-3 my-1 border-t border-gray-700" />
      <div className="px-3 mb-1">
        <button
          onClick={() => setLabelsExpanded(p => !p)}
          className="w-full flex items-center justify-between py-1.5 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 rounded"
        >
          <span>라벨</span>
          <span>{labelsExpanded ? '▲' : '▼'}</span>
        </button>

        {labelsExpanded && (
          <div className="mt-1 space-y-0.5">
            {customLabels.map(label => (
              <button
                key={label.id}
                onClick={() => { onLabelSelect(label.id); onViewChange('emails'); }}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                  selectedLabelId === label.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="truncate">{label.name}</span>
                </div>
                {(label.emailCount || 0) > 0 && (
                  <span className="text-xs text-gray-400">{label.emailCount}</span>
                )}
              </button>
            ))}

            <button
              onClick={() => onViewChange('labels')}
              className="w-full flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              <span>+</span>
              <span>라벨 관리</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="mt-auto mx-3 mb-3 border-t border-gray-700 pt-3">
        <div className="space-y-0.5">
          <button
            onClick={() => onViewChange('templates')}
            className={clsx(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              activeView === 'templates' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            )}
          >
            <span>📋</span>
            <span>이메일 템플릿</span>
          </button>
        </div>
      </div>
    </div>
  );
}
