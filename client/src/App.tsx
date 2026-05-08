import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { EmailList } from './components/EmailList';
import { EmailDetail } from './components/EmailDetail';
import { ComposeModal } from './components/ComposeModal';
import { AccountModal } from './components/AccountModal';
import { LabelsPanel } from './components/LabelsPanel';
import { TemplatesPanel } from './components/TemplatesPanel';
import { Thread, ComposeData, FolderType } from './types';

export type ActiveView = 'emails' | 'labels' | 'templates';

export default function App() {
  const [selectedFolder, setSelectedFolder] = useState<FolderType>('inbox');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<Partial<ComposeData>>({});
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | undefined>();
  const [activeView, setActiveView] = useState<ActiveView>('emails');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState<string | undefined>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_success')) {
      window.history.replaceState({}, '', '/');
    }
    if (params.get('oauth_error')) {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleCompose = useCallback((data: Partial<ComposeData> = {}) => {
    setComposeData(data);
    setComposeOpen(true);
  }, []);

  const handleSelectThread = useCallback((thread: Thread) => {
    setSelectedThread(thread);
  }, []);

  const handleFolderSelect = useCallback((folder: FolderType) => {
    setSelectedFolder(folder);
    setSelectedLabelId(undefined);
    setSelectedThread(null);
    setActiveView('emails');
    setSearchQuery('');
  }, []);

  const handleLabelSelect = useCallback((labelId: string) => {
    setSelectedLabelId(labelId);
    setSelectedThread(null);
    setActiveView('emails');
  }, []);

  const handleAccountSelect = useCallback((accountId: string | undefined) => {
    setSelectedAccountId(accountId);
    setSelectedThread(null);
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        selectedFolder={selectedFolder}
        selectedAccountId={selectedAccountId}
        selectedLabelId={selectedLabelId}
        activeView={activeView}
        collapsed={sidebarCollapsed}
        onFolderSelect={handleFolderSelect}
        onAccountSelect={handleAccountSelect}
        onLabelSelect={handleLabelSelect}
        onViewChange={setActiveView}
        onCompose={handleCompose}
        onAddAccount={() => { setEditAccountId(undefined); setAccountModalOpen(true); }}
        onCollapse={() => setSidebarCollapsed(p => !p)}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {activeView === 'emails' && (
          <>
            {/* Email list panel */}
            <div className={`flex flex-col border-r border-gray-200 bg-white ${selectedThread ? 'w-80 flex-shrink-0' : 'flex-1'}`}>
              <EmailList
                folder={selectedFolder}
                accountId={selectedAccountId}
                labelId={selectedLabelId}
                searchQuery={searchQuery}
                selectedThreadId={selectedThread?.id}
                onSelectThread={handleSelectThread}
                onSearchChange={setSearchQuery}
                onCompose={handleCompose}
              />
            </div>

            {/* Email detail panel */}
            {selectedThread && (
              <div className="flex-1 overflow-hidden">
                <EmailDetail
                  thread={selectedThread}
                  onClose={() => setSelectedThread(null)}
                  onReply={(email) =>
                    handleCompose({
                      to: [email.from],
                      cc: [],
                      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
                      accountId: email.accountId,
                      inReplyTo: email.messageId,
                      references: [...(email.references || []), email.messageId],
                      threadId: email.threadId,
                    })
                  }
                  onReplyAll={(email) =>
                    handleCompose({
                      to: [email.from, ...email.to.filter(a => a.email !== email.accountEmail)],
                      cc: email.cc,
                      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
                      accountId: email.accountId,
                      inReplyTo: email.messageId,
                      references: [...(email.references || []), email.messageId],
                      threadId: email.threadId,
                    })
                  }
                  onForward={(email) =>
                    handleCompose({
                      to: [],
                      subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
                      body: `<br/><br/>---------- 전달된 메시지 ----------<br/><b>보낸 사람:</b> ${email.from.name || ''} &lt;${email.from.email}&gt;<br/><b>날짜:</b> ${new Date(email.date).toLocaleString('ko-KR')}<br/><b>제목:</b> ${email.subject}<br/><br/>${email.body}`,
                      accountId: email.accountId,
                    })
                  }
                />
              </div>
            )}
          </>
        )}

        {activeView === 'labels' && (
          <div className="flex-1 overflow-auto bg-white">
            <LabelsPanel />
          </div>
        )}

        {activeView === 'templates' && (
          <div className="flex-1 overflow-auto bg-white">
            <TemplatesPanel onUseTemplate={(t) => handleCompose({ subject: t.subject, body: t.body })} />
          </div>
        )}
      </div>

      {/* Modals */}
      {composeOpen && (
        <ComposeModal
          initialData={composeData}
          onClose={() => { setComposeOpen(false); setComposeData({}); }}
        />
      )}

      {accountModalOpen && (
        <AccountModal
          accountId={editAccountId}
          onClose={() => { setAccountModalOpen(false); setEditAccountId(undefined); }}
          onEditAccount={(id) => { setEditAccountId(id); }}
        />
      )}
    </div>
  );
}
