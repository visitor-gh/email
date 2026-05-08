import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { accountsApi } from '../api/client';
import { Account } from '../types';

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: accountsApi.list,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: ['accounts', id],
    queryFn: () => accountsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateImapAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountsApi.createImap,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('계정이 추가되었습니다');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Account> & { password?: string } }) =>
      accountsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('계정이 업데이트되었습니다');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('계정이 삭제되었습니다');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSyncAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountsApi.sync,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(`${data.synced}개 이메일을 동기화했습니다`);
    },
    onError: (err: Error) => toast.error(`동기화 실패: ${err.message}`),
  });
}
