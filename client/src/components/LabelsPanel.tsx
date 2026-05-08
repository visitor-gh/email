import { useState } from 'react';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { labelsApi } from '../api/client';
import { Label } from '../types';
import toast from 'react-hot-toast';

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
];

export function LabelsPanel() {
  const qc = useQueryClient();
  const { data: labels = [], isLoading } = useQuery({
    queryKey: ['labels'],
    queryFn: () => labelsApi.list(),
  });

  const createLabel = useMutation({
    mutationFn: labelsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      toast.success('라벨을 만들었습니다');
      setNewLabelName('');
      setCreating(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateLabel = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      labelsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      toast.success('라벨을 수정했습니다');
      setEditingId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteLabel = useMutation({
    mutationFn: labelsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      toast.success('라벨을 삭제했습니다');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [creating, setCreating] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const systemLabels = labels.filter(l => l.isSystem);
  const customLabels = labels.filter(l => !l.isSystem);

  const startEdit = (label: Label) => {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">라벨 관리</h1>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary text-sm"
        >
          + 새 라벨
        </button>
      </div>

      {/* Create label form */}
      {creating && (
        <div className="mb-6 p-4 border border-blue-200 rounded-xl bg-blue-50">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">새 라벨 만들기</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newLabelName}
              onChange={e => setNewLabelName(e.target.value)}
              placeholder="라벨 이름"
              className="input flex-1"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') createLabel.mutate({ name: newLabelName, color: newLabelColor });
                if (e.key === 'Escape') { setCreating(false); setNewLabelName(''); }
              }}
            />
          </div>
          <div className="flex gap-1.5 mb-3">
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setNewLabelColor(color)}
                className={clsx(
                  'w-6 h-6 rounded-full border-2 transition-transform',
                  newLabelColor === color ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: newLabelColor + '20', color: newLabelColor }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: newLabelColor }} />
              {newLabelName || '미리보기'}
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => { setCreating(false); setNewLabelName(''); }}
                className="btn-secondary text-sm"
              >
                취소
              </button>
              <button
                onClick={() => createLabel.mutate({ name: newLabelName, color: newLabelColor })}
                disabled={!newLabelName || createLabel.isPending}
                className="btn-primary text-sm"
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8 text-gray-400 animate-pulse">로딩 중...</div>
      )}

      {/* System labels */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          시스템 라벨
        </h2>
        <div className="space-y-1">
          {systemLabels.map(label => (
            <div key={label.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="text-sm font-medium text-gray-700">{label.name}</span>
                <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-200 rounded-full">시스템</span>
              </div>
              <span className="text-xs text-gray-400">{(label as typeof label & { emailCount?: number }).emailCount || 0}개</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom labels */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          사용자 라벨 ({customLabels.length})
        </h2>
        {customLabels.length === 0 && !creating && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">🏷️</p>
            <p className="text-sm">사용자 라벨이 없습니다</p>
            <p className="text-xs mt-1">새 라벨을 만들어 이메일을 분류하세요</p>
          </div>
        )}
        <div className="space-y-2">
          {customLabels.map(label => (
            <div key={label.id} className="border border-gray-200 rounded-lg overflow-hidden">
              {editingId === label.id ? (
                <div className="p-3">
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="input flex-1 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-1.5 mb-3">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditColor(color)}
                        className={clsx(
                          'w-5 h-5 rounded-full border-2',
                          editColor === color ? 'border-gray-800' : 'border-transparent'
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateLabel.mutate({ id: label.id, data: { name: editName, color: editColor } })}
                      disabled={!editName || updateLabel.isPending}
                      className="btn-primary text-xs"
                    >
                      저장
                    </button>
                    <button onClick={() => setEditingId(null)} className="btn-secondary text-xs">
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: label.color }} />
                    <div
                      className="px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ backgroundColor: label.color + '20', color: label.color }}
                    >
                      {label.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 mr-1">{(label as typeof label & { emailCount?: number }).emailCount || 0}개</span>
                    <button
                      onClick={() => startEdit(label)}
                      className="p-1 hover:bg-gray-200 rounded text-gray-400 text-xs"
                      title="수정"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`"${label.name}" 라벨을 삭제하시겠습니까?`))
                          deleteLabel.mutate(label.id);
                      }}
                      className="p-1 hover:bg-red-100 hover:text-red-500 rounded text-gray-400 text-xs"
                      title="삭제"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
