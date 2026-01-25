'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KpiCard, SectionCard, StatusBadge } from '@/components/admin/AdminWidgets';

type RoomListItem = {
  id: string;
  code: string;
  status: string | null;
  isActive: boolean | null;
  createdAt: string | null;
  packId: string | null;
  stateVersion: number | null;
  transitioningToNext: boolean | null;
  currentQuestionIndex: number | null;
  questionStartedAt: string | null;
  playersCount: number | null;
};

type RoomsResponse = {
  items: RoomListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const formatIso = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');

const isUuid = (value: string | null | undefined) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function statusToBadge(status?: string | null) {
  if (!status) return <StatusBadge label="—" status="neutral" />;
  if (status === 'finished') return <StatusBadge label={status} status="neutral" />;
  if (status === 'final-results') return <StatusBadge label={status} status="info" />;
  if (status.includes('round')) return <StatusBadge label={status} status="warning" />;
  if (status === 'running') return <StatusBadge label={status} status="success" />;
  if (status === 'waiting') return <StatusBadge label={status} status="neutral" />;
  return <StatusBadge label={status} status="neutral" />;
}

export default function AdminRoomsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [data, setData] = useState<RoomsResponse | null>(null);

  const [page, setPage] = useState(1);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const [isActive, setIsActive] = useState<string>('');
  const [packId, setPackId] = useState('');

  const query = useMemo(() => {
    const qs = new URLSearchParams({ page: String(page), limit: '50' });
    if (code.trim()) qs.set('code', code.trim());
    if (status) qs.set('status', status);
    if (isActive) qs.set('isActive', isActive);
    if (packId) qs.set('packId', packId);
    return qs;
  }, [code, isActive, page, packId, status]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil((data.total ?? 0) / (data.pageSize ?? 50)));
  }, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/rooms?${query.toString()}`, { cache: 'no-store', credentials: 'include' });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось загрузить комнаты');
      setLoading(false);
      return;
    }

    setData(payload as RoomsResponse);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // Reset page when filters change
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [code, status, isActive, packId]);

  const closeRoom = useCallback(
    async (roomCode: string) => {
      setActionMessage(null);
      setError(null);
      if (!confirm(`Закрыть комнату ${roomCode}?`)) return;
      const res = await fetch('/api/admin/room/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: roomCode }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error ?? 'Не удалось закрыть комнату');
        return;
      }
      setActionMessage(`Комната ${roomCode} закрыта`);
      void load();
    },
    [load]
  );

  const deleteRoom = useCallback(
    async (roomCode: string) => {
      setActionMessage(null);
      setError(null);
      if (!confirm(`Удалить комнату ${roomCode}? (данные игроков/ответы/логи/лайки)`)) return;
      const res = await fetch('/api/admin/room/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: roomCode }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error ?? 'Не удалось удалить комнату');
        return;
      }
      setActionMessage(`Комната ${roomCode} удалена`);
      void load();
    },
    [load]
  );

  const exportRoom = useCallback(async (roomId: string) => {
    setError(null);
    const res = await fetch(`/api/admin/export/room?roomId=${encodeURIComponent(roomId)}`, { credentials: 'include' });
    if (!res.ok) {
      setError('Не удалось выгрузить room export');
      return;
    }
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `room-${roomId}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, []);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Комнаты"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="px-4 py-2 rounded-2xl border-[3px] border-[#142a45] bg-white font-black tracking-[0.2em] hover:bg-[#142a45]/5"
          >
            Обновить
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-black tracking-[0.25em] text-[#142a45]/60">CODE</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="1234"
              className="w-full px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black tracking-[0.25em] text-[#142a45]/60">STATUS</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
            >
              <option value="">Все</option>
              <option value="waiting">waiting</option>
              <option value="running">running</option>
              <option value="round2-ready">round2-ready</option>
              <option value="round2-running">round2-running</option>
              <option value="round3-running">round3-running</option>
              <option value="round4-running">round4-running</option>
              <option value="round5-running">round5-running</option>
              <option value="round5-explanation">round5-explanation</option>
              <option value="final-results">final-results</option>
              <option value="finished">finished</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black tracking-[0.25em] text-[#142a45]/60">ACTIVE</span>
            <select
              value={isActive}
              onChange={(e) => setIsActive(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
            >
              <option value="">Все</option>
              <option value="true">Только активные</option>
              <option value="false">Только неактивные</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black tracking-[0.25em] text-[#142a45]/60">PACK</span>
            <select
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
            >
              <option value="">Все</option>
              <option value="classic">classic</option>
              <option value="03012026">03012026</option>
            </select>
          </label>
        </div>

        {error ? <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] p-4 font-black">{error}</div> : null}
        {actionMessage ? (
          <div className="rounded-2xl border-[3px] border-[#2f7a3b] bg-[#dff7e3] p-4 font-black">{actionMessage}</div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <KpiCard label="Найдено" value={data?.total ?? 0} />
          <KpiCard label="Страница" value={`${data?.page ?? 1} / ${totalPages}`} />
          <KpiCard label="На странице" value={data?.pageSize ?? 50} />
          <KpiCard label="Состояние" value={loading ? 'loading' : 'ok'} status={loading ? 'warning' : 'success'} />
        </div>

        <div className="overflow-auto rounded-3xl border-[3px] border-[#142a45]">
          <table className="min-w-[980px] w-full bg-white">
            <thead className="bg-[#142a45] text-[#ffeccd]">
              <tr>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">CODE</th>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">STATUS</th>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">ACTIVE</th>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">PACK</th>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">PLAYERS</th>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">CREATED</th>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((room) => (
                <tr key={room.id} className="border-t border-[#142a45]/10">
                  <td className="px-4 py-3 font-black">
                    {isUuid(room.id) ? (
                      <Link className="underline" href={`/admin/rooms/${encodeURIComponent(room.id)}`}>
                        {room.code}
                      </Link>
                    ) : (
                      <span className="text-[#b23324]">{room.code}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{statusToBadge(room.status)}</td>
                  <td className="px-4 py-3">
                    {room.isActive ? <StatusBadge label="active" status="success" /> : <StatusBadge label="inactive" status="neutral" />}
                  </td>
                  <td className="px-4 py-3 font-semibold">{room.packId ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold">{room.playersCount ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold">{formatIso(room.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {isUuid(room.id) ? (
                        <Link
                          href={`/admin/rooms/${encodeURIComponent(room.id)}`}
                          className="px-3 py-2 rounded-xl border-[2px] border-[#142a45] font-black text-xs hover:bg-[#142a45]/5"
                        >
                          Открыть
                        </Link>
                      ) : (
                        <span className="px-3 py-2 rounded-xl border-[2px] border-[#b23324] font-black text-xs text-[#b23324]">
                          Нет ID
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void exportRoom(room.id)}
                        disabled={!isUuid(room.id)}
                        className="px-3 py-2 rounded-xl border-[2px] border-[#142a45] font-black text-xs hover:bg-[#142a45]/5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        onClick={() => void closeRoom(room.code)}
                        className="px-3 py-2 rounded-xl border-[2px] border-[#b68c1d] font-black text-xs hover:bg-[#fff2c8]"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteRoom(room.code)}
                        className="px-3 py-2 rounded-xl border-[2px] border-[#b23324] font-black text-xs hover:bg-[#ffd7d0]"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && (data?.items?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center font-black text-[#142a45]/60">
                    Комнаты не найдены
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-black disabled:opacity-40"
          >
            Назад
          </button>
          <p className="font-black">
            Страница {page} из {totalPages}
          </p>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-black disabled:opacity-40"
          >
            Вперед
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
