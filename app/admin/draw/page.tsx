'use client';

import { useCallback, useEffect, useState } from 'react';

type DrawRoomRow = {
  id: string;
  code: string;
  mode: string;
  status: string;
  current_round: number;
  current_step: number;
  total_steps: number;
  voting_chain_index: number;
  step_duration: number;
  created_at: string;
  player_count: number;
};

const STATUS_LABELS: Record<string, string> = {
  lobby: '⏳ Лобби',
  playing: '🎮 Играет',
  voting: '🗳️ Голосование',
  results: '📊 Результаты',
  finished: '🏆 Завершена',
  closed: '🔒 Закрыта',
};

const MODE_LABELS: Record<string, string> = {
  russian: '🇷🇺 Русский',
  english: '🇬🇧 English',
  free: '✏️ Свободный',
};

export default function AdminDrawRoomsPage() {
  const [rooms, setRooms] = useState<DrawRoomRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [modeFilter, setModeFilter] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (modeFilter) params.set('mode', modeFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/admin/draw-rooms?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRooms(data.rooms || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, modeFilter]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const handleClose = async (roomId: string) => {
    if (!confirm('Закрыть комнату?')) return;
    try {
      const res = await fetch('/api/admin/draw-rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: roomId, status: 'finished' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMessage('Комната закрыта');
      fetchRooms();
    } catch {
      setActionMessage('Ошибка закрытия');
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleDelete = async (roomId: string) => {
    if (!confirm('Удалить комнату и все данные? Это действие необратимо.')) return;
    try {
      const res = await fetch(`/api/admin/draw-rooms?id=${roomId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMessage('Комната удалена');
      fetchRooms();
    } catch {
      setActionMessage('Ошибка удаления');
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="retro-panel bg-white px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">🎨 Рисункач — Комнаты</h2>
            <p className="text-sm text-[#142a45]/60">Всего: {total}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="rounded-xl border-2 border-[#142a45]/20 px-3 py-2 text-sm font-bold bg-white"
            >
              <option value="">Все статусы</option>
              <option value="lobby">Лобби</option>
              <option value="playing">Играет</option>
              <option value="voting">Голосование</option>
              <option value="results">Результаты</option>
              <option value="finished">Завершена</option>
            </select>
            <select
              value={modeFilter}
              onChange={e => setModeFilter(e.target.value)}
              className="rounded-xl border-2 border-[#142a45]/20 px-3 py-2 text-sm font-bold bg-white"
            >
              <option value="">Все режимы</option>
              <option value="russian">Русский</option>
              <option value="english">English</option>
              <option value="free">Свободный</option>
            </select>
            <button
              onClick={fetchRooms}
              className="px-4 py-2 rounded-xl border-2 border-[#142a45]/20 text-sm font-bold hover:bg-[#142a45]/5 transition"
            >
              🔄 Обновить
            </button>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="retro-panel bg-green-100 border-green-400 px-4 py-3 text-green-800 text-sm font-bold">
          {actionMessage}
        </div>
      )}

      {error && (
        <div className="retro-panel bg-red-100 border-red-400 px-4 py-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="retro-panel bg-white px-6 py-8 text-center text-[#142a45]/60">
          Загрузка…
        </div>
      ) : rooms.length === 0 ? (
        <div className="retro-panel bg-white px-6 py-8 text-center text-[#142a45]/60">
          Нет комнат
        </div>
      ) : (
        <div className="retro-panel bg-white px-2 py-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#142a45]/10">
                <th className="px-3 py-2 text-left font-black">Код</th>
                <th className="px-3 py-2 text-left font-black">Режим</th>
                <th className="px-3 py-2 text-left font-black">Статус</th>
                <th className="px-3 py-2 text-center font-black">Раунд</th>
                <th className="px-3 py-2 text-center font-black">Игроки</th>
                <th className="px-3 py-2 text-left font-black">Создана</th>
                <th className="px-3 py-2 text-right font-black">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(room => (
                <tr key={room.id} className="border-b border-[#142a45]/5 hover:bg-[#142a45]/3">
                  <td className="px-3 py-2 font-mono font-bold text-purple-700">{room.code}</td>
                  <td className="px-3 py-2">{MODE_LABELS[room.mode] || room.mode}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[room.status] || room.status}</td>
                  <td className="px-3 py-2 text-center">
                    {room.status !== 'lobby' ? `${room.current_round} (шаг ${room.current_step}/${room.total_steps})` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center font-bold">{room.player_count}</td>
                  <td className="px-3 py-2 text-xs text-[#142a45]/60">
                    {new Date(room.created_at).toLocaleString('ru-RU')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {room.status !== 'finished' && (
                        <button
                          onClick={() => handleClose(room.id)}
                          className="px-2 py-1 rounded-lg border border-orange-400 text-orange-600 text-xs font-bold hover:bg-orange-50 transition"
                          title="Завершить комнату"
                        >
                          Закрыть
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(room.id)}
                        className="px-2 py-1 rounded-lg border border-red-400 text-red-600 text-xs font-bold hover:bg-red-50 transition"
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
      )}
    </div>
  );
}
