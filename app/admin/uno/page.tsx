'use client';

import { useCallback, useEffect, useState } from 'react';

type UnoRoomRow = {
  id: string;
  code: string;
  mode: string;
  status: string;
  host_id: string | null;
  winner_id: string | null;
  verb_count: number;
  state_version: number;
  player_count: number;
  created_at: string | null;
  updated_at: string | null;
};

const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleString('ru-RU') : '—');

const statusColors: Record<string, string> = {
  lobby: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  playing: 'bg-green-500/20 text-green-300 border-green-500/40',
  finished: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
};

const modeLabels: Record<string, string> = {
  classic: 'Классический',
  'irregular-verbs': 'Все формы',
  'verb-match': 'Угадай глагол',
};

export default function AdminUnoPage() {
  const [rooms, setRooms] = useState<UnoRoomRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterMode, setFilterMode] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 30;

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (filterStatus) params.set('status', filterStatus);
      if (filterMode) params.set('mode', filterMode);

      const res = await fetch(`/api/admin/uno-rooms?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRooms(data.rooms || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterMode]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const handleClose = async (id: string) => {
    if (!confirm('Завершить эту комнату?')) return;
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/uno-rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'finished' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMsg('Комната завершена');
      fetchRooms();
    } catch (e: any) {
      setActionMsg(`Ошибка: ${e?.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить комнату и все данные? Это действие нельзя отменить.')) return;
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/uno-rooms?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMsg('Комната удалена');
      fetchRooms();
    } catch (e: any) {
      setActionMsg(`Ошибка: ${e?.message}`);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const activeCount = rooms.filter(r => r.status === 'playing').length;
  const lobbyCount = rooms.filter(r => r.status === 'lobby').length;
  const totalPlayers = rooms.reduce((s, r) => s + r.player_count, 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Всего комнат', value: total },
          { label: 'Активных', value: activeCount },
          { label: 'В лобби', value: lobbyCount },
          { label: 'Игроков', value: totalPlayers },
        ].map(s => (
          <div key={s.label} className="retro-panel bg-white px-4 py-3">
            <p className="text-xs text-[#142a45]/60 uppercase tracking-widest">{s.label}</p>
            <p className="text-2xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="retro-panel bg-white px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold">Фильтры:</span>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-lg border-2 border-[#142a45]/20 px-3 py-1.5 text-sm bg-white"
        >
          <option value="">Все статусы</option>
          <option value="lobby">Лобби</option>
          <option value="playing">Играют</option>
          <option value="finished">Завершены</option>
        </select>
        <select
          value={filterMode}
          onChange={e => { setFilterMode(e.target.value); setPage(1); }}
          className="rounded-lg border-2 border-[#142a45]/20 px-3 py-1.5 text-sm bg-white"
        >
          <option value="">Все режимы</option>
          <option value="classic">Классический</option>
          <option value="irregular-verbs">Все формы</option>
          <option value="verb-match">Угадай глагол</option>
        </select>
        <button
          onClick={() => fetchRooms()}
          className="ml-auto rounded-lg border-2 border-[#142a45] px-4 py-1.5 text-sm font-bold hover:bg-[#142a45]/10 transition"
        >
          Обновить
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="retro-panel bg-red-50 border-red-300 px-4 py-2 text-red-700 text-sm font-semibold">
          {error}
        </div>
      )}
      {actionMsg && (
        <div className="retro-panel bg-green-50 border-green-300 px-4 py-2 text-green-700 text-sm font-semibold">
          {actionMsg}
        </div>
      )}

      {/* Table */}
      <div className="retro-panel bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[#142a45]/10 text-left text-xs uppercase tracking-widest text-[#142a45]/60">
              <th className="px-4 py-3">Код</th>
              <th className="px-4 py-3">Режим</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Игроки</th>
              <th className="px-4 py-3">Глаголов</th>
              <th className="px-4 py-3">Создана</th>
              <th className="px-4 py-3">Обновлена</th>
              <th className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#142a45]/40">Загрузка…</td>
              </tr>
            ) : rooms.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#142a45]/40">Нет комнат</td>
              </tr>
            ) : rooms.map(room => (
              <tr key={room.id} className="border-b border-[#142a45]/5 hover:bg-[#142a45]/[0.02] transition">
                <td className="px-4 py-3">
                  <span className="font-mono font-bold tracking-widest">{room.code}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs">{modeLabels[room.mode] ?? room.mode}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusColors[room.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {room.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center font-bold">{room.player_count}</td>
                <td className="px-4 py-3 text-center">{room.mode !== 'classic' ? room.verb_count : '—'}</td>
                <td className="px-4 py-3 text-xs text-[#142a45]/60">{formatDate(room.created_at)}</td>
                <td className="px-4 py-3 text-xs text-[#142a45]/60">{formatDate(room.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {room.status !== 'finished' && (
                      <button
                        onClick={() => handleClose(room.id)}
                        className="rounded-lg border-2 border-yellow-500 px-3 py-1 text-xs font-bold text-yellow-700 hover:bg-yellow-50 transition"
                        title="Завершить комнату"
                      >
                        Закрыть
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(room.id)}
                      className="rounded-lg border-2 border-red-400 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 transition"
                      title="Удалить комнату"
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-lg border-2 border-[#142a45]/20 px-3 py-1.5 text-sm font-bold disabled:opacity-30 hover:bg-[#142a45]/5 transition"
          >
            ←
          </button>
          <span className="text-sm">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border-2 border-[#142a45]/20 px-3 py-1.5 text-sm font-bold disabled:opacity-30 hover:bg-[#142a45]/5 transition"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
