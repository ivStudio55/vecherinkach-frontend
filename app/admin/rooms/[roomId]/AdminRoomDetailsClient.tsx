'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, KpiCard, MetricRow, SectionCard, StatusBadge, type SeriesPoint } from '@/components/admin/AdminWidgets';
import { describeLikeQuestionId } from '@/shared/logic/questionLikes';

type RoomDetails = {
  room: Record<string, unknown>;
  players: Array<{ id: string; name: string; total_points: number; joined_at: string | null }>;
  logs: Array<{ id: string; created_at: string; level: string; message: string; event_name: string | null }>;
  bestQuestion?: { question_id: number; likes: number } | null;
};

type SummaryResponse = {
  room: Record<string, unknown>;
  counts: {
    answers: number;
    round2Answers: number;
    round3Answers: number;
    round3Votes: number;
    round4Answers: number;
    round5Answers: number;
    likes: number;
    logs: number;
  };
  topLikes: Array<{ questionId: number; likes: number }>;
  breakdowns: {
    round1: Array<{ id: number; total: number; correct: number }>;
    round2: Array<{ id: number; total: number; correct: number }>;
    round3Answers: Array<{ id: number; total: number; correct: number }>;
    round3Votes: Array<{ id: number; total: number; correct: number }>;
    round4: Array<{ id: number; total: number; correct: number }>;
    round5: Array<{ id: number; total: number; correct: number }>;
  };
  errorLogs: Array<{ id: string; created_at: string; level: string; channel: string; event_name: string | null; message: string }>;
};

const formatIso = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');

function statusBadge(status?: string | null) {
  if (!status) return <StatusBadge label="—" status="neutral" />;
  if (status === 'running') return <StatusBadge label={status} status="success" />;
  if (status.includes('round')) return <StatusBadge label={status} status="warning" />;
  if (status === 'final-results') return <StatusBadge label={status} status="info" />;
  if (status === 'finished') return <StatusBadge label={status} status="neutral" />;
  return <StatusBadge label={status} status="neutral" />;
}

function toSeries(rows: Array<{ id: number; total: number }>, prefix: string): SeriesPoint[] {
  return rows.slice(0, 24).map((row) => ({ label: `${prefix}${row.id}`, value: row.total }));
}

export default function AdminRoomDetailsClient({ roomId }: { roomId?: string }) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const hasValidRoomId = typeof roomId === 'string' && uuidRegex.test(roomId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [details, setDetails] = useState<RoomDetails | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const load = useCallback(async () => {
    if (!roomId) {
      setLoading(false);
      return;
    }
    if (!hasValidRoomId) {
      setError('Некорректный id комнаты');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const roomRes = await fetch(`/api/admin/get-room?roomId=${encodeURIComponent(roomId)}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    const roomPayload = await roomRes.json().catch(() => null);
    if (!roomRes.ok) {
      setError(roomPayload?.error ?? 'Не удалось загрузить комнату');
      setLoading(false);
      return;
    }

    const playersRes = await fetch(`/api/admin/get-players?roomId=${encodeURIComponent(roomId)}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    const playersPayload = await playersRes.json().catch(() => null);
    if (!playersRes.ok) {
      setError(playersPayload?.error ?? 'Не удалось загрузить игроков');
      setLoading(false);
      return;
    }

    const logsRes = await fetch(`/api/admin/get-logs?roomId=${encodeURIComponent(roomId)}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    const logsPayload = await logsRes.json().catch(() => null);
    if (!logsRes.ok) {
      setError(logsPayload?.error ?? 'Не удалось загрузить логи');
      setLoading(false);
      return;
    }

    const answersRes = await fetch(`/api/admin/get-answers?roomId=${encodeURIComponent(roomId)}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    const answersPayload = await answersRes.json().catch(() => null);
    if (!answersRes.ok) {
      setError(answersPayload?.error ?? 'Не удалось загрузить ответы');
      setLoading(false);
      return;
    }

    setDetails({
      room: roomPayload?.room ?? null,
      players: playersPayload?.items ?? [],
      logs: logsPayload?.items ?? [],
    } as RoomDetails);
    setSummary({
      ...(answersPayload as Omit<SummaryResponse, 'room'>),
      room: roomPayload?.room ?? {},
    } as SummaryResponse);

    setLoading(false);
  }, [hasValidRoomId, roomId]);

  useEffect(() => {
    if (!roomId) return;
    void load();
  }, [load, roomId]);

  const closeRoom = useCallback(async () => {
    const code = String(details?.room?.code ?? '');
    if (!/^[0-9]{4}$/.test(code)) {
      setError('Некорректный код комнаты');
      return;
    }
    setActionMessage(null);
    setError(null);
    if (!confirm(`Закрыть комнату ${code}?`)) return;
    const res = await fetch('/api/admin/room/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось закрыть комнату');
      return;
    }
    setActionMessage(`Комната ${code} закрыта`);
    void load();
  }, [details?.room, load]);

  const hasResolvedRoomId = Boolean(roomId && hasValidRoomId);

  const restartRoom = useCallback(async () => {
    if (!hasResolvedRoomId) {
      setError('Некорректный id комнаты');
      return;
    }
    setActionMessage(null);
    setError(null);
    if (!confirm('Перезапустить комнату?')) return;
    const res = await fetch('/api/admin/room/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось перезапустить комнату');
      return;
    }
    setActionMessage('Комната перезапущена');
    void load();
  }, [hasResolvedRoomId, load, roomId]);

  const forceEndRound = useCallback(async () => {
    if (!hasResolvedRoomId) {
      setError('Некорректный id комнаты');
      return;
    }
    setActionMessage(null);
    setError(null);
    if (!confirm('Принудительно завершить текущий раунд?')) return;
    const res = await fetch('/api/admin/room/force-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось завершить раунд');
      return;
    }
    setActionMessage('Раунд принудительно завершён');
    void load();
  }, [hasResolvedRoomId, load, roomId]);

  const startRound3Rpc = useCallback(async () => {
    if (!hasResolvedRoomId) {
      setError('Некорректный id комнаты');
      return;
    }
    setActionMessage(null);
    setError(null);
    if (!confirm('Запустить Round 3 через RPC?')) return;
    const res = await fetch('/api/admin/room/start-round3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось запустить Round 3 через RPC');
      return;
    }
    setActionMessage('Round 3 запущен через RPC');
    void load();
  }, [hasResolvedRoomId, load, roomId]);

  const exportRoom = useCallback(async () => {
    if (!hasResolvedRoomId) {
      setError('Некорректный id комнаты');
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/export/room?roomId=${encodeURIComponent(roomId ?? '')}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      setError('Не удалось выгрузить room export');
      return;
    }
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `room-${roomId ?? 'export'}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [hasResolvedRoomId, roomId]);

  const topLikesLabel = useMemo(() => {
    if (!summary?.topLikes?.length) return '—';
    const top = summary.topLikes[0];
    return `${describeLikeQuestionId(top.questionId)} (${top.likes})`;
  }, [summary?.topLikes]);

  const roomSnapshot = summary?.room;
  const questionStartedAt = typeof roomSnapshot?.question_started_at === 'string' ? roomSnapshot.question_started_at : null;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Комната"
        actions={
          <>
            <Link
              href="/admin/rooms"
              className="px-4 py-2 rounded-2xl border-[3px] border-[#142a45] bg-white font-black tracking-[0.2em] hover:bg-[#142a45]/5"
            >
              ← К списку
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2 rounded-2xl border-[3px] border-[#142a45] bg-white font-black tracking-[0.2em] hover:bg-[#142a45]/5"
            >
              Обновить
            </button>
            <button
              type="button"
              onClick={() => void exportRoom()}
              className="px-4 py-2 rounded-2xl border-[3px] border-[#142a45] bg-white font-black tracking-[0.2em] hover:bg-[#142a45]/5"
            >
              Export JSON
            </button>
          </>
        }
      >
        {error ? <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] p-4 font-black">{error}</div> : null}
        {actionMessage ? (
          <div className="rounded-2xl border-[3px] border-[#2f7a3b] bg-[#dff7e3] p-4 font-black">{actionMessage}</div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <KpiCard label="CODE" value={String(details?.room?.code ?? '—')} />
          <KpiCard label="STATUS" value={String(roomSnapshot?.status ?? '—')} />
          <KpiCard label="PLAYERS" value={details?.players?.length ?? 0} />
          <KpiCard label="LIKES TOP" value={topLikesLabel} />
        </div>

        <div className="flex flex-wrap gap-2">
          {statusBadge(String(roomSnapshot?.status ?? ''))}
          {roomSnapshot?.is_active ? <StatusBadge label="active" status="success" /> : <StatusBadge label="inactive" status="neutral" />}
          {roomSnapshot?.pack_id ? <StatusBadge label={`pack:${roomSnapshot.pack_id}`} status="info" /> : null}
          {roomSnapshot?.transitioning_to_next ? <StatusBadge label="transitioning" status="warning" /> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-3xl border-[3px] border-[#142a45] bg-white p-5 space-y-2">
            <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">SNAPSHOT</p>
            <MetricRow label="createdAt" value={formatIso(String(roomSnapshot?.created_at ?? ''))} />
            <MetricRow label="stateVersion" value={String(roomSnapshot?.state_version ?? '—')} />
            <MetricRow label="currentQuestionIndex" value={String(roomSnapshot?.current_question_index ?? '—')} />
            <MetricRow label="questionStartedAt" value={formatIso(questionStartedAt)} />
            <MetricRow label="allPlayersAnswered" value={String(Boolean(roomSnapshot?.all_players_answered))} />
            <MetricRow label="round2Phase" value={String(roomSnapshot?.round2_phase ?? '—')} />
            <MetricRow label="round2ItemIndex" value={String(roomSnapshot?.round2_item_index ?? '—')} />
          </div>

          <div className="rounded-3xl border-[3px] border-[#142a45] bg-white p-5 space-y-2">
            <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">ACTIONS</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void closeRoom()}
                className="px-4 py-3 rounded-2xl border-[3px] border-[#b68c1d] font-black hover:bg-[#fff2c8]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void restartRoom()}
                className="px-4 py-3 rounded-2xl border-[3px] border-[#142a45] font-black hover:bg-[#142a45]/5"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={() => void forceEndRound()}
                className="px-4 py-3 rounded-2xl border-[3px] border-[#142a45] font-black hover:bg-[#142a45]/5"
              >
                Force end
              </button>
              <button
                type="button"
                onClick={() => void startRound3Rpc()}
                className="px-4 py-3 rounded-2xl border-[3px] border-[#142a45] font-black hover:bg-[#142a45]/5"
              >
                Start Round3 RPC
              </button>
            </div>
            <p className="text-xs font-semibold text-[#142a45]/60">*Delete доступен в списке комнат</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Счётчики">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <KpiCard label="Round1 answers" value={summary?.counts.answers ?? 0} />
          <KpiCard label="Round2 answers" value={summary?.counts.round2Answers ?? 0} />
          <KpiCard label="Round3 answers" value={summary?.counts.round3Answers ?? 0} />
          <KpiCard label="Round3 votes" value={summary?.counts.round3Votes ?? 0} />
          <KpiCard label="Round4 answers" value={summary?.counts.round4Answers ?? 0} />
          <KpiCard label="Round5 answers" value={summary?.counts.round5Answers ?? 0} />
          <KpiCard label="Likes" value={summary?.counts.likes ?? 0} />
          <KpiCard label="Logs" value={summary?.counts.logs ?? 0} />
        </div>
      </SectionCard>

      <SectionCard title="Активность по вопросам">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarChart title="Round 1: ответы" series={toSeries(summary?.breakdowns.round1 ?? [], 'Q')} />
          <BarChart title="Round 2: ответы" series={toSeries(summary?.breakdowns.round2 ?? [], 'I')} />
          <BarChart title="Round 3: ответы" series={toSeries(summary?.breakdowns.round3Answers ?? [], 'Q')} />
          <BarChart title="Round 3: голоса" series={toSeries(summary?.breakdowns.round3Votes ?? [], 'Q')} />
          <BarChart title="Round 4: ответы" series={toSeries(summary?.breakdowns.round4 ?? [], 'P')} />
          <BarChart title="Round 5: ответы" series={toSeries(summary?.breakdowns.round5 ?? [], 'Q')} />
        </div>
      </SectionCard>

      <SectionCard title="Игроки">
        <div className="overflow-auto rounded-3xl border-[3px] border-[#142a45]">
          <table className="min-w-[700px] w-full bg-white">
            <thead className="bg-[#142a45] text-[#ffeccd]">
              <tr>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">NAME</th>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">POINTS</th>
                <th className="text-left px-4 py-3 text-xs tracking-[0.3em]">JOINED</th>
              </tr>
            </thead>
            <tbody>
              {(details?.players ?? [])
                .slice()
                .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))
                .map((p) => (
                  <tr key={p.id} className="border-t border-[#142a45]/10">
                    <td className="px-4 py-3 font-black">{p.name}</td>
                    <td className="px-4 py-3 font-semibold">{(p.total_points ?? 0).toLocaleString('ru-RU')}</td>
                    <td className="px-4 py-3 font-semibold">{formatIso(p.joined_at)}</td>
                  </tr>
                ))}
              {!loading && (details?.players?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center font-black text-[#142a45]/60">
                    Игроков нет
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Ошибки (warn/error)">
        <div className="space-y-2">
          {(summary?.errorLogs ?? []).slice(0, 20).map((row) => (
            <div key={row.id} className="rounded-2xl border-[3px] border-[#142a45] bg-white p-4">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-2 items-center">
                  <StatusBadge label={row.level} status={row.level === 'error' ? 'error' : 'warning'} />
                  <span className="text-xs font-black tracking-[0.25em] text-[#142a45]/60">{row.channel}</span>
                  {row.event_name ? <StatusBadge label={row.event_name} status="neutral" /> : null}
                </div>
                <span className="text-xs font-semibold text-[#142a45]/60">{formatIso(row.created_at)}</span>
              </div>
              <p className="mt-2 font-semibold">{row.message}</p>
            </div>
          ))}
          {!loading && (summary?.errorLogs?.length ?? 0) === 0 ? (
            <p className="font-black text-[#142a45]/60">Ошибок нет</p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Последние логи">
        <div className="space-y-2">
          {(details?.logs ?? []).slice(0, 40).map((log) => (
            <div key={log.id} className="rounded-2xl border-[3px] border-[#142a45] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge label={log.level} status={log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : 'neutral'} />
                  {log.event_name ? <StatusBadge label={log.event_name} status="neutral" /> : null}
                </div>
                <span className="text-xs font-semibold text-[#142a45]/60">{formatIso(log.created_at)}</span>
              </div>
              <p className="mt-2 font-semibold">{log.message}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
