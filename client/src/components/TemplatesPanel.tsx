import { useState } from 'react';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesApi } from '../api/client';
import { Template } from '../types';
import toast from 'react-hot-toast';

interface TemplatesPanelProps {
  onUseTemplate: (template: Template) => void;
}

const CATEGORIES = ['일반', '업무', '보고', '자동회신', '기타'];

export function TemplatesPanel({ onUseTemplate }: TemplatesPanelProps) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
  });

  const createTemplate = useMutation({
    mutationFn: templatesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('템플릿을 저장했습니다');
      setCreating(false);
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Template> }) =>
      templatesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('템플릿을 수정했습니다');
      setEditingId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('템플릿을 삭제했습니다');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    subject: '',
    body: '',
    category: '일반',
  });

  const resetForm = () => setForm({ name: '', subject: '', body: '', category: '일반' });

  const templates = data?.templates || [];
  const grouped = data?.grouped || {};

  const displayTemplates = selectedCategory
    ? templates.filter(t => t.category === selectedCategory)
    : templates;

  const startEdit = (tmpl: Template) => {
    setEditingId(tmpl.id);
    setForm({ name: tmpl.name, subject: tmpl.subject, body: tmpl.body, category: tmpl.category });
  };

  const TemplateForm = ({ onSubmit, onCancel, isLoading }: { onSubmit: () => void; onCancel: () => void; isLoading: boolean }) => (
    <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">템플릿 이름 *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="input text-sm"
            placeholder="미팅 요청"
            required
          />
        </div>
        <div>
          <label className="label">카테고리</label>
          <select
            value={form.category}
            onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
            className="input text-sm"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">제목</label>
        <input
          type="text"
          value={form.subject}
          onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
          className="input text-sm"
          placeholder="[미팅 요청] {주제}"
        />
        <p className="mt-1 text-xs text-gray-400">중괄호({'{변수명}'})를 사용해 변수를 지정할 수 있습니다</p>
      </div>
      <div>
        <label className="label">본문</label>
        <textarea
          value={form.body}
          onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
          className="input text-sm resize-y"
          rows={8}
          placeholder="이메일 본문 내용..."
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={!form.name || isLoading}
          className="btn-primary text-sm"
        >
          {isLoading ? '저장 중...' : '저장'}
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">
          취소
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">이메일 템플릿</h1>
        <button
          onClick={() => { setCreating(true); setEditingId(null); resetForm(); }}
          className="btn-primary text-sm"
        >
          + 새 템플릿
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">새 템플릿 만들기</h3>
          <TemplateForm
            onSubmit={() => createTemplate.mutate(form)}
            onCancel={() => { setCreating(false); resetForm(); }}
            isLoading={createTemplate.isPending}
          />
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory(null)}
          className={clsx(
            'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
            !selectedCategory ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          전체 ({templates.length})
        </button>
        {Object.entries(grouped).map(([cat, tmpls]) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {cat} ({(tmpls as Template[]).length})
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center py-8 text-gray-400 animate-pulse">로딩 중...</div>
      )}

      {/* Template grid */}
      {displayTemplates.length === 0 && !isLoading && !creating && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">템플릿이 없습니다</p>
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {displayTemplates.map(tmpl => (
          <div key={tmpl.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
            {editingId === tmpl.id ? (
              <div className="p-4">
                <TemplateForm
                  onSubmit={() => updateTemplate.mutate({ id: tmpl.id, data: form })}
                  onCancel={() => setEditingId(null)}
                  isLoading={updateTemplate.isPending}
                />
              </div>
            ) : (
              <>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">{tmpl.name}</h3>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                        {tmpl.category}
                      </span>
                    </div>
                  </div>
                  {tmpl.subject && (
                    <p className="text-xs text-gray-500 mb-2">
                      <span className="font-medium text-gray-600">제목: </span>
                      {tmpl.subject}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 line-clamp-3">
                    {tmpl.body.replace(/<[^>]*>/g, '').slice(0, 150)}
                  </p>
                </div>
                <div className="flex items-center gap-1 px-4 pb-3">
                  <button
                    onClick={() => onUseTemplate(tmpl)}
                    className="btn-primary text-xs flex-1 justify-center"
                  >
                    ✉️ 이 템플릿 사용
                  </button>
                  <button
                    onClick={() => startEdit(tmpl)}
                    className="btn-secondary text-xs px-2"
                    title="수정"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`"${tmpl.name}" 템플릿을 삭제하시겠습니까?`))
                        deleteTemplate.mutate(tmpl.id);
                    }}
                    className="p-1.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400 text-xs transition-colors"
                    title="삭제"
                  >
                    🗑️
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
