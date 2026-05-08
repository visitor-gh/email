import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { useAccounts, useCreateImapAccount, useUpdateAccount, useDeleteAccount, useSyncAccount } from '../hooks/useAccounts';
import { accountsApi } from '../api/client';
import { Account } from '../types';
import toast from 'react-hot-toast';

interface AccountModalProps {
  accountId?: string;
  onClose: () => void;
  onEditAccount: (id: string) => void;
}

type Tab = 'list' | 'add_gmail' | 'add_imap' | 'edit';

export function AccountModal({ accountId, onClose, onEditAccount }: AccountModalProps) {
  const { data: accounts = [] } = useAccounts();
  const createImap = useCreateImapAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const syncAccount = useSyncAccount();

  const [tab, setTab] = useState<Tab>(accountId ? 'edit' : 'list');
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // IMAP form state
  const [imapForm, setImapForm] = useState({
    name: '',
    email: '',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    password: '',
    signature: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    signature: '',
    isActive: true,
  });

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (accountId) {
      const acc = accounts.find(a => a.id === accountId);
      if (acc) {
        setEditingAccount(acc);
        setEditForm({
          name: acc.name,
          signature: acc.signature || '',
          isActive: acc.isActive,
        });
        setTab('edit');
      }
    }
  }, [accountId, accounts]);

  const handleGmailConnect = async () => {
    try {
      const url = await accountsApi.getOAuthUrl();
      window.location.href = url;
    } catch (err) {
      toast.error('Gmail 연결 URL을 가져오지 못했습니다');
    }
  };

  const handleImapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createImap.mutateAsync(imapForm);
    setTab('list');
    setImapForm({
      name: '',
      email: '',
      imapHost: '',
      imapPort: 993,
      imapSecure: true,
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      password: '',
      signature: '',
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    await updateAccount.mutateAsync({ id: editingAccount.id, data: editForm });
    setTab('list');
  };

  const handleDelete = async (id: string) => {
    await deleteAccount.mutateAsync(id);
    setConfirmDelete(null);
    if (tab === 'edit') setTab('list');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {tab !== 'list' && (
              <button onClick={() => setTab('list')} className="p-1 hover:bg-gray-100 rounded text-gray-400">
                ←
              </button>
            )}
            <h2 className="font-semibold text-gray-800">
              {tab === 'list' && '계정 관리'}
              {tab === 'add_gmail' && 'Gmail 계정 추가'}
              {tab === 'add_imap' && 'IMAP/SMTP 계정 추가'}
              {tab === 'edit' && '계정 설정'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded text-gray-400">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Account list */}
          {tab === 'list' && (
            <div className="space-y-3">
              {accounts.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-4xl mb-3">📭</p>
                  <p>연결된 계정이 없습니다</p>
                </div>
              )}

              {accounts.map(account => (
                <div key={account.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold',
                      account.type === 'gmail' ? 'bg-red-500' : 'bg-blue-500'
                    )}>
                      {account.type === 'gmail' ? 'G' : 'M'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-900">{account.name}</div>
                      <div className="text-xs text-gray-500">{account.email}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <span className={clsx('w-1.5 h-1.5 rounded-full', account.isActive ? 'bg-green-400' : 'bg-gray-400')} />
                        <span>{account.type === 'gmail' ? 'Gmail' : 'IMAP'}</span>
                        {account.unreadCount !== undefined && account.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs">
                            {account.unreadCount} 읽지 않음
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => syncAccount.mutate(account.id)}
                      disabled={syncAccount.isPending}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-400 text-xs"
                      title="동기화"
                    >
                      🔄
                    </button>
                    <button
                      onClick={() => { setEditingAccount(account); setEditForm({ name: account.name, signature: account.signature || '', isActive: account.isActive }); setTab('edit'); }}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-400 text-xs"
                      title="설정"
                    >
                      ⚙️
                    </button>
                    {confirmDelete === account.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(account.id)} className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">
                          삭제 확인
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded">
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(account.id)}
                        className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded text-gray-400 text-xs"
                        title="삭제"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add account buttons */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <button
                  onClick={() => setTab('add_gmail')}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-sm">G</div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900">Gmail 계정 추가</div>
                    <div className="text-xs text-gray-500">OAuth2로 안전하게 연결</div>
                  </div>
                  <span className="ml-auto text-gray-400">→</span>
                </button>

                <button
                  onClick={() => setTab('add_imap')}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">@</div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900">IMAP/SMTP 계정 추가</div>
                    <div className="text-xs text-gray-500">Outlook, Yahoo, 사내 메일 등</div>
                  </div>
                  <span className="ml-auto text-gray-400">→</span>
                </button>
              </div>
            </div>
          )}

          {/* Gmail connect */}
          {tab === 'add_gmail' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">G</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Gmail 계정 연결</h3>
              <p className="text-sm text-gray-500 mb-6">
                Google OAuth2를 통해 안전하게 Gmail 계정을 연결합니다.
                <br />
                이메일 읽기/쓰기 권한이 요청됩니다.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-left">
                <p className="text-xs text-blue-700 font-medium mb-1">사전 준비 사항:</p>
                <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
                  <li>GOOGLE_CLIENT_ID 환경변수 설정</li>
                  <li>GOOGLE_CLIENT_SECRET 환경변수 설정</li>
                  <li>Google Cloud Console에서 OAuth 앱 구성</li>
                </ul>
              </div>
              <button
                onClick={handleGmailConnect}
                className="btn-primary w-full justify-center"
              >
                Google 계정으로 연결
              </button>
            </div>
          )}

          {/* IMAP form */}
          {tab === 'add_imap' && (
            <form onSubmit={handleImapSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">이름 *</label>
                  <input
                    type="text"
                    value={imapForm.name}
                    onChange={e => setImapForm(p => ({ ...p, name: e.target.value }))}
                    className="input"
                    placeholder="홍길동"
                    required
                  />
                </div>
                <div>
                  <label className="label">이메일 주소 *</label>
                  <input
                    type="email"
                    value={imapForm.email}
                    onChange={e => setImapForm(p => ({ ...p, email: e.target.value }))}
                    className="input"
                    placeholder="user@example.com"
                    required
                  />
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">IMAP 설정 (수신)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">IMAP 서버 *</label>
                    <input
                      type="text"
                      value={imapForm.imapHost}
                      onChange={e => setImapForm(p => ({ ...p, imapHost: e.target.value }))}
                      className="input"
                      placeholder="imap.example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">포트 *</label>
                    <input
                      type="number"
                      value={imapForm.imapPort}
                      onChange={e => setImapForm(p => ({ ...p, imapPort: parseInt(e.target.value) }))}
                      className="input"
                      min={1}
                      max={65535}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={imapForm.imapSecure}
                    onChange={e => setImapForm(p => ({ ...p, imapSecure: e.target.checked }))}
                    className="rounded text-blue-600"
                  />
                  <span className="text-sm text-gray-600">SSL/TLS 사용</span>
                </label>
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase">SMTP 설정 (발신)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">SMTP 서버 *</label>
                    <input
                      type="text"
                      value={imapForm.smtpHost}
                      onChange={e => setImapForm(p => ({ ...p, smtpHost: e.target.value }))}
                      className="input"
                      placeholder="smtp.example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">포트 *</label>
                    <input
                      type="number"
                      value={imapForm.smtpPort}
                      onChange={e => setImapForm(p => ({ ...p, smtpPort: parseInt(e.target.value) }))}
                      className="input"
                      min={1}
                      max={65535}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={imapForm.smtpSecure}
                    onChange={e => setImapForm(p => ({ ...p, smtpSecure: e.target.checked }))}
                    className="rounded text-blue-600"
                  />
                  <span className="text-sm text-gray-600">SSL/TLS 사용</span>
                </label>
              </div>

              <div>
                <label className="label">비밀번호 *</label>
                <input
                  type="password"
                  value={imapForm.password}
                  onChange={e => setImapForm(p => ({ ...p, password: e.target.value }))}
                  className="input"
                  placeholder="이메일 비밀번호"
                  required
                />
              </div>

              <div>
                <label className="label">서명 (선택)</label>
                <textarea
                  value={imapForm.signature}
                  onChange={e => setImapForm(p => ({ ...p, signature: e.target.value }))}
                  className="input resize-none"
                  rows={3}
                  placeholder="이메일 서명을 입력하세요..."
                />
              </div>

              <button
                type="submit"
                disabled={createImap.isPending}
                className="btn-primary w-full justify-center"
              >
                {createImap.isPending ? '연결 중...' : '계정 추가'}
              </button>
            </form>
          )}

          {/* Edit account */}
          {tab === 'edit' && editingAccount && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white font-bold',
                  editingAccount.type === 'gmail' ? 'bg-red-500' : 'bg-blue-500'
                )}>
                  {editingAccount.type === 'gmail' ? 'G' : 'M'}
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900">{editingAccount.email}</div>
                  <div className="text-xs text-gray-500">{editingAccount.type === 'gmail' ? 'Gmail OAuth2' : 'IMAP/SMTP'}</div>
                </div>
              </div>

              <div>
                <label className="label">표시 이름</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className="input"
                  placeholder="이름"
                />
              </div>

              <div>
                <label className="label">이메일 서명</label>
                <textarea
                  value={editForm.signature}
                  onChange={e => setEditForm(p => ({ ...p, signature: e.target.value }))}
                  className="input resize-none"
                  rows={4}
                  placeholder="이메일 서명을 입력하세요..."
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={e => setEditForm(p => ({ ...p, isActive: e.target.checked }))}
                  className="rounded text-blue-600"
                />
                <span className="text-sm text-gray-700">계정 활성화</span>
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={updateAccount.isPending}
                  className="btn-primary flex-1 justify-center"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => syncAccount.mutate(editingAccount.id)}
                  disabled={syncAccount.isPending}
                  className="btn-secondary"
                >
                  {syncAccount.isPending ? '동기화 중...' : '🔄 동기화'}
                </button>
              </div>

              <div className="border-t border-gray-200 pt-4">
                {confirmDelete === editingAccount.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600 font-medium">정말 삭제하시겠습니까?</span>
                    <button onClick={() => handleDelete(editingAccount.id)} className="btn-danger text-xs">
                      삭제 확인
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="btn-secondary text-xs">
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(editingAccount.id)}
                    className="btn-ghost text-red-500 hover:text-red-700 text-sm"
                  >
                    🗑️ 이 계정 삭제
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
