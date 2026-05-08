import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { emailsApi, EmailListParams } from '../api/client';

export function useEmails(params: EmailListParams) {
  return useQuery({
    queryKey: ['emails', params],
    queryFn: () => emailsApi.list(params),
    placeholderData: keepPreviousData,
    staleTime: 15000,
  });
}

export function useEmail(id: string) {
  return useQuery({
    queryKey: ['email', id],
    queryFn: () => emailsApi.get(id),
    enabled: !!id,
  });
}

export function useThread(threadId: string) {
  return useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => emailsApi.getThread(threadId),
    enabled: !!threadId,
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: emailsApi.send,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      toast.success('이메일을 전송했습니다');
    },
    onError: (err: Error) => toast.error(`전송 실패: ${err.message}`),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) =>
      emailsApi.markRead(id, isRead),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, isRead }: { threadId: string; isRead: boolean }) =>
      emailsApi.markThreadRead(threadId, isRead),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useStar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isStarred }: { id: string; isStarred: boolean }) =>
      emailsApi.star(id, isStarred),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      emailsApi.archive(id, isArchived),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      toast.success('이메일을 보관했습니다');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permanent }: { id: string; permanent?: boolean }) =>
      emailsApi.delete(id, permanent),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      toast.success('이메일을 삭제했습니다');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ emailId, labelId }: { emailId: string; labelId: string }) =>
      emailsApi.addLabel(emailId, labelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRemoveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ emailId, labelId }: { emailId: string; labelId: string }) =>
      emailsApi.removeLabel(emailId, labelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSearchEmails(query: string, accountId?: string) {
  return useQuery({
    queryKey: ['emails', 'search', query, accountId],
    queryFn: () => emailsApi.search(query, accountId),
    enabled: query.length >= 2,
    staleTime: 10000,
  });
}

export function useBatchAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      action,
    }: {
      ids: string[];
      action: 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'unarchive' | 'delete' | 'restore';
    }) => emailsApi.batch(ids, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
