'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, KpiCard, MetricRow, SectionCard, StatusBadge, type SeriesPoint } from '@/components/admin/AdminWidgets';
import { describeLikeQuestionId } from '@/shared/logic/questionLikes';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RoomDetails = {
  room: Record<string, unknown>;
  players: Array<{ id: string; name: string; total_points: number; joined_at: string | null }>;
  logs: Array<{
    id: string;
    created_at: string;
    level: string;
    channel: string;
    message: string;
    event_name: string | null;
    player_id?: string | null;
    player_name?: string | null;
    context?: Record<string, unknown> | null;
  }>;
  bestQuestion?: { question_id: number; likes: number } | null;
};

type LogEntry = RoomDetails['logs'][number];

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
  errorLogs: LogEntry[];
};

type ErrorExplanation = {
  title: string;
  short: string;
  details?: string;
};

type LogLike = {
  event_name?: string | null;
  channel?: string | null;
  level?: string | null;
  message?: string | null;
  created_at?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  context?: Record<string, unknown> | null;
};

type ExplanationContext = {
  playersMap?: Map<string, string>;
};

type ExplanationBuilder = (log: LogLike, ctx?: ExplanationContext) => ErrorExplanation;

const asBuilder = (payload: ErrorExplanation): ExplanationBuilder => () => payload;

const getPlayerLabel = (log: LogLike, ctx?: ExplanationContext) => {
  if (typeof log.player_name === 'string' && log.player_name.trim()) {
    return log.player_name.trim();
  }
  const id = typeof log.player_id === 'string' && log.player_id ? log.player_id : null;
  if (id) {
    const resolved = ctx?.playersMap?.get(id);
    if (resolved && resolved.trim()) {
      return resolved.trim();
    }
    return `Игрок ${id.slice(0, 6)}`;
  }
  return 'Неизвестный игрок';
};

const getCtxValue = (log: LogLike, key: string) => {
  if (!log.context || typeof log.context !== 'object') return undefined;
  return (log.context as Record<string, unknown>)[key];
};

const getCtxString = (log: LogLike, key: string) => {
  const value = getCtxValue(log, key);
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
};

const getCtxNumber = (log: LogLike, key: string) => {
  const value = getCtxValue(log, key);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const PLAYER_EXIT_REASONS: Record<string, string> = {
  unload: 'закрыл вкладку/браузер',
  background: 'свернул приложение или переключил вкладку',
  unmount: 'ушёл на другой экран',
};

const EVENT_EXPLANATIONS: Record<string, ExplanationBuilder> = {
  'round1:missing-question-data': asBuilder({
    title: 'Нет данных для вопроса раунда 1',
    short: 'Система не смогла получить текст вопроса. Обычно это происходит, если пак обновился во время игры.',
    details:
      'Попросите ведущего перезапустить игру или выбрать вопрос заново. Проверьте, что пак вопросов синхронизирован и игроки не находятся в состоянии паузы.',
  }),
  'round2:fact-desync': asBuilder({
    title: 'Несовпадение факта в раунде 2',
    short: 'Игроки отвечали уже после того, как ведущий переключил карточку.',
    details:
      'Причина чаще всего в нестабильном соединении. Рекомендуется обновить страницу ведущего и при необходимости перезапустить раунд 2 кнопкой Restart.',
  }),
  'round3:sync-timeout': asBuilder({
    title: 'Тайм-аут синхронизации раунда 3',
    short: 'Не все клиенты подтвердили загрузку вопроса в отведённое время.',
    details:
      'Проверьте, что ведущий открыл комнату в режиме host и все игроки находятся онлайн. Можно воспользоваться кнопкой «Force end round», чтобы перевести игру к следующему состоянию.',
  }),
  'round4:puzzle-cancelled': asBuilder({
    title: 'Головоломка была пропущена',
    short: 'Ведущий вручную пропустил puzzle, поэтому ответы не были сохранены.',
    details:
      'Это штатное поведение. Если пропуск был случайным, выберите ту же загадку повторно или начните раунд заново через Restart.',
  }),
  'round5:final-answer-error': asBuilder({
    title: 'Ошибка финального ответа',
    short: 'Supabase вернул ошибку при записи итогового ответа команды.',
    details:
      'Проверьте соединение и попробуйте сохранить ответ ещё раз. Если проблема повторяется, выполните Export room и обратитесь к разработчикам с файлом логов.',
  }),
  player_join: (log, ctx) => ({
    title: 'Игрок подключился',
    short: `${getPlayerLabel(log, ctx)} вошёл в комнату`,
    details: log.player_id ? `ID игрока: ${log.player_id}` : undefined,
  }),
  player_exit: (log, ctx) => {
    const reasonKey = getCtxString(log, 'reason') ?? '';
    const reason = PLAYER_EXIT_REASONS[reasonKey] ?? 'неизвестная причина';
    const status = getCtxString(log, 'status');
    const leftAtLabel =
      typeof log.created_at === 'string' && log.created_at
        ? new Date(log.created_at).toLocaleTimeString('ru-RU', { hour12: false })
        : null;
    return {
      title: 'Игрок отключился',
      short: `${getPlayerLabel(log, ctx)} покинул комнату`,
      details: `Причина: ${reason}${status ? `, статус игры: ${status}` : ''}${leftAtLabel ? `, время выхода: ${leftAtLabel}` : ''}.`,
    };
  },
  room_status_change: (log) => {
    const from = getCtxString(log, 'from');
    const to = getCtxString(log, 'to');
    return {
      title: 'Статус комнаты изменён',
      short: from && to ? `${from} → ${to}` : 'Комната перешла в новое состояние',
      details: from && to ? `Предыдущее состояние: ${from}. Новое состояние: ${to}.` : undefined,
    };
  },
  round_start: (log) => ({
    title: 'Запуск раунда',
    short: `Стартовал ${getCtxString(log, 'round') ?? 'новый раунд'}`,
    details: 'Инициировано автоматически после смены статуса комнаты.',
  }),
  realtime_latency: (log) => {
    const latency = getCtxNumber(log, 'latencyMs');
    return {
      title: 'Высокая задержка',
      short: 'Realtime-соединение отвечает медленно',
      details: latency ? `Текущая задержка: ${Math.round(latency)} мс.` : undefined,
    };
  },
  realtime_reconnect: (log) => ({
    title: 'Переподключение Realtime',
    short: 'Канал переходит в режим повторного соединения',
    details: getCtxString(log, 'status') ? `Состояние канала: ${getCtxString(log, 'status')}.` : undefined,
  }),
  realtime_fallback: (log) => {
    const lastEvent = getCtxNumber(log, 'lastEventAt');
    return {
      title: 'Включён fallback polling',
      short: 'Не поступают события из Realtime, включён опрос',
      details: lastEvent ? `Последнее событие: ${new Date(lastEvent).toLocaleTimeString()}.` : undefined,
    };
  },
  start_round3_error: asBuilder({
    title: 'Round 3 не запущен',
    short: 'RPC start_round3 вернул ошибку.',
    details: 'Проверьте состояние комнаты и повторите действие.',
  }),
  start_round3_empty: asBuilder({
    title: 'Round 3 вернул пустой ответ',
    short: 'Сервер не прислал payload после start_round3.',
    details: 'Повторите запуск или откройте раунд вручную.',
  }),
  create_room_limit: asBuilder({
    title: 'Лимит комнат',
    short: 'Достигнут предел активных комнат для аккаунта.',
    details: 'Завершите одну из текущих игр и попробуйте снова.',
  }),
  create_room_error: asBuilder({
    title: 'Не удалось создать комнату',
    short: 'Supabase вернул ошибку при создании комнаты.',
    details: 'Проверьте лог и повторите запрос. Если ошибка повторяется, обратитесь к разработчикам.',
  }),
  create_room_exception: asBuilder({
    title: 'Клиентская ошибка при создании комнаты',
    short: 'Браузер не смог завершить операцию.',
    details: 'Проверьте соединение и состояние Supabase.',
  }),
};

const CHANNEL_EXPLANATIONS: Record<string, ExplanationBuilder> = {
  round1: asBuilder({
    title: 'Раунд 1',
    short: 'Проблемы с отображением вопросов или подсчётом очков.',
    details:
      'Убедитесь, что все игроки подключены к комнате и пак вопросов содержит корректные данные. При необходимости выполните Restart комнаты.',
  }),
  round2: asBuilder({
    title: 'Раунд 2',
    short: 'Система заметила рассинхронизацию фактов.',
    details:
      'Чаще всего помогает перезагрузка страницы ведущего. Если игроки жалуются на задержки, проверьте их подключение.',
  }),
  round3: asBuilder({
    title: 'Раунд 3',
    short: 'Замечены задержки подтверждения вопросов или голосования.',
    details:
      'Запустите Round 3 ещё раз через кнопку «Start round 3 RPC» или завершите его принудительно, если игроки не могут продолжить.',
  }),
  round4: asBuilder({
    title: 'Раунд 4',
    short: 'Ответы на загадки не были сохранены.',
    details:
      'Проверьте соединение ведущего и состояние комнаты. Воспользуйтесь кнопкой Force End, чтобы перейти к следующему этапу.',
  }),
  round5: asBuilder({
    title: 'Раунд 5',
    short: 'Финальные ответы не подтвердились.',
    details:
      'Убедитесь, что у ведущего открыт экран host. В крайнем случае сделайте Export room и сообщите команде поддержки.',
  }),
  system: asBuilder({
    title: 'Системный канал',
    short: 'Общая техническая ошибка.',
    details:
      'Обычно связано с соединением с Supabase. Переподключите интернет или повторите действие спустя минуту. Если ошибка сохраняется, создайте issue.',
  }),
  'room-sync': asBuilder({
    title: 'Состояние соединения',
    short: 'Система переключилась между Realtime и Polling.',
    details: 'Проверьте стабильность сети. Если опрос включается часто, перезапустите комнату.',
  }),
  analytics: asBuilder({
    title: 'Аналитика',
    short: 'Фиксируются действия игроков и ведущего.',
    details: 'Используйте эти записи для воспроизведения хода игры.',
  }),
};

const DEFAULT_EXPLANATIONS: Record<'error' | 'warning' | 'info', ExplanationBuilder> = {
  error: (log) => ({
    title: 'Необработанная ошибка',
    short: 'Система зафиксировала критическую ошибку.',
    details: log.message ? `Сообщение сервера: ${log.message}` : undefined,
  }),
  warning: (log) => ({
    title: 'Предупреждение',
    short: log.message ?? 'Система заметила нестандартное поведение, но игра продолжилась.',
    details: log.message ? undefined : undefined,
  }),
  info: (log) => ({
    title: 'Информационное событие',
    short: log.message ?? 'Записано действие в комнате.',
  }),
};

const resolveLogExplanation = (log?: LogLike, ctx?: ExplanationContext): ErrorExplanation | null => {
  if (!log) return null;
  const byEvent = log.event_name ? EVENT_EXPLANATIONS[log.event_name] : undefined;
  if (byEvent) return byEvent(log, ctx);
  const byChannel = log.channel ? CHANNEL_EXPLANATIONS[log.channel] : undefined;
  if (byChannel) return byChannel(log, ctx);
  const levelKey: 'error' | 'warning' | 'info' = log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : 'info';
  return DEFAULT_EXPLANATIONS[levelKey](log, ctx);
};

const statusBadge = (status?: string | null) => {
  if (!status) return <StatusBadge label="—" status="neutral" />;
  if (status === 'finished') return <StatusBadge label={status} status="neutral" />;
  if (status === 'final-results') return <StatusBadge label={status} status="info" />;
  if (status.includes('round')) return <StatusBadge label={status} status="warning" />;
  if (status === 'running') return <StatusBadge label={status} status="success" />;
  if (status === 'waiting') return <StatusBadge label={status} status="neutral" />;
  return <StatusBadge label={status} status="neutral" />;
};

const formatIso = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');

const toSeries = (items: Array<{ id: number; total: number }>, prefix: string): SeriesPoint[] =>
  items.map((item) => ({ label: `${prefix}${item.id}`, value: Number(item.total) || 0 }));
export default function AdminRoomDetailsClient({ roomId }: { roomId: string }) {
  const hasValidRoomId = useMemo(() => {
    return typeof roomId === 'string' && roomId.length > 0 && UUID_REGEX.test(roomId);
  }, [roomId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [details, setDetails] = useState<RoomDetails | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [activeExplanation, setActiveExplanation] = useState<{ title: string; details: string } | null>(null);

  const load = useCallback(async () => {
    // CRITICAL: Не выполнять запросы, если roomId невалиден
    if (!hasValidRoomId) {
      setError('Некорректный UUID комнаты');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // CRITICAL: Все запросы используют один и тот же roomId из замыкания
      const roomRes = await fetch(`/api/admin/get-room?roomId=${encodeURIComponent(roomId)}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const roomPayload = await roomRes.json().catch(() => null);
      if (!roomRes.ok) throw new Error(roomPayload?.error ?? 'Не удалось загрузить комнату');

      const playersRes = await fetch(`/api/admin/get-players?roomId=${encodeURIComponent(roomId)}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const playersPayload = await playersRes.json().catch(() => null);
      if (!playersRes.ok) throw new Error(playersPayload?.error ?? 'Не удалось загрузить игроков');

      const logsRes = await fetch(`/api/admin/get-logs?roomId=${encodeURIComponent(roomId)}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const logsPayload = await logsRes.json().catch(() => null);
      if (!logsRes.ok) throw new Error(logsPayload?.error ?? 'Не удалось загрузить логи');

      const answersRes = await fetch(`/api/admin/get-answers?roomId=${encodeURIComponent(roomId)}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const answersPayload = await answersRes.json().catch(() => null);
      if (!answersRes.ok) throw new Error(answersPayload?.error ?? 'Не удалось загрузить ответы');

      setDetails({
        room: roomPayload?.room ?? null,
        players: playersPayload?.items ?? [],
        logs: logsPayload?.items ?? [],
      } as RoomDetails);
      setSummary({
        ...(answersPayload as Omit<SummaryResponse, 'room'>),
        room: roomPayload?.room ?? {},
      } as SummaryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [hasValidRoomId, roomId]);

  useEffect(() => {
    // CRITICAL: Запускать load только если roomId валиден
    if (!hasValidRoomId) return;
    void load();
  }, [hasValidRoomId, load]);

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

  const restartRoom = useCallback(async () => {
    if (!hasValidRoomId) {
      setError('Некорректный UUID комнаты');
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
  }, [hasValidRoomId, load, roomId]);

  const forceEndRound = useCallback(async () => {
    if (!hasValidRoomId) {
      setError('Некорректный UUID комнаты');
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
  }, [hasValidRoomId, load, roomId]);

  const startRound3Rpc = useCallback(async () => {
    if (!hasValidRoomId) {
      setError('Некорректный UUID комнаты');
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
  }, [hasValidRoomId, load, roomId]);

  const exportRoom = useCallback(async () => {
    if (!hasValidRoomId) {
      setError('Некорректный UUID комнаты');
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/export/room?roomId=${encodeURIComponent(roomId)}`, {
      credentials: 'include',
    });
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
  }, [hasValidRoomId, roomId]);

  const topLikesLabel = useMemo(() => {
    if (!summary?.topLikes?.length) return '—';
    const top = summary.topLikes[0];
    return `${describeLikeQuestionId(top.questionId)} (${top.likes})`;
  }, [summary?.topLikes]);

  const roomSnapshot = summary?.room;
  const questionStartedAt = typeof roomSnapshot?.question_started_at === 'string' ? roomSnapshot.question_started_at : null;
  const playersMap = useMemo(() => {
    if (!details?.players?.length) return undefined;
    return new Map(details.players.map((player) => [player.id, player.name]));
  }, [details?.players]);
  const explanationContext = useMemo<ExplanationContext | undefined>(() => {
    if (!playersMap) return undefined;
    return { playersMap };
  }, [playersMap]);

  // Показываем ошибку, если roomId невалиден
  if (!hasValidRoomId) {
    return (
      <div className="space-y-6">
        <SectionCard title="Ошибка">
          <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] p-6 text-center">
            <p className="font-black text-xl mb-2">Некорректный UUID комнаты</p>
            <p className="font-semibold mb-4">roomId = "{roomId}"</p>
            <Link
              href="/admin/rooms"
              className="inline-block px-6 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-black tracking-[0.2em] hover:bg-[#142a45]/5"
            >
              ← К списку комнат
            </Link>
          </div>
        </SectionCard>
      </div>
    );
  }

  if (loading && !details) {
    return (
      <div className="space-y-6">
        <SectionCard title="Загрузка...">
          <div className="p-12 text-center text-[#142a45]/60 font-black animate-pulse">
            LOADING ROOM DATA...
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <>
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
            <MetricRow label="round2ShowingFact" value={String(roomSnapshot?.round2_showing_fact ?? '—')} />
            <MetricRow label="transitioningToNext" value={String(Boolean(roomSnapshot?.transitioning_to_next))} />
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
          {(summary?.errorLogs ?? []).slice(0, 20).map((row) => {
            const explanation = resolveLogExplanation(row, explanationContext);
            const longDetails = (explanation?.details ?? '').length > 220;
            return (
              <div key={row.id} className="rounded-2xl border-[3px] border-[#142a45] bg-white p-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="flex gap-2 items-center">
                    <StatusBadge label={row.level} status={row.level === 'error' ? 'error' : 'warning'} />
                    <span className="text-xs font-black tracking-[0.25em] text-[#142a45]/60">{row.channel}</span>
                    {row.event_name ? <StatusBadge label={row.event_name} status="neutral" /> : null}
                  </div>
                  <span className="text-xs font-semibold text-[#142a45]/60">{formatIso(row.created_at)}</span>
                </div>
                <p className="text-sm font-semibold text-[#142a45]">{row.message}</p>
                {explanation ? (
                  <div className="rounded-2xl border-[2px] border-[#b68c1d]/40 bg-[#fff9e7] p-3 space-y-2">
                    <p className="text-xs font-black tracking-[0.2em] text-[#7a5a0f]">{explanation.title}</p>
                    <p className="text-sm font-semibold text-[#4e3708]">{explanation.short}</p>
                    {explanation.details ? (
                      longDetails ? (
                        <button
                          type="button"
                          onClick={() => setActiveExplanation({ title: explanation.title, details: explanation.details ?? '' })}
                          className="px-4 py-2 rounded-xl border-[2px] border-[#b68c1d] text-xs font-black text-[#7a5a0f] hover:bg-[#fff2c8]"
                        >
                          Читать пояснение
                        </button>
                      ) : (
                        <p className="text-xs text-[#4e3708] whitespace-pre-wrap">{explanation.details}</p>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
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
                {(() => {
                  const explanation = resolveLogExplanation(log, explanationContext);
                  if (!explanation) return null;
                  return (
                    <div className="mt-3 rounded-2xl border-[2px] border-[#1f6ac6]/30 bg-[#e9f0ff] p-3 space-y-1">
                      <p className="text-[11px] font-black tracking-[0.25em] text-[#1f3d6b]/80">{explanation.title}</p>
                      <p className="text-sm font-semibold text-[#1f3d6b]">{explanation.short}</p>
                      {explanation.details ? (
                        <p className="text-xs text-[#1f3d6b]/80 whitespace-pre-wrap">{explanation.details}</p>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
      {activeExplanation ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setActiveExplanation(null)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border-[3px] border-[#142a45] bg-white p-6 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.4em] text-[#142a45]/60">ПОЯСНЕНИЕ</p>
                <p className="text-xl font-black text-[#142a45]">{activeExplanation.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveExplanation(null)}
                className="px-3 py-1 rounded-xl border-[2px] border-[#142a45] text-xs font-black text-[#142a45] hover:bg-[#142a45]/5"
              >
                Закрыть
              </button>
            </div>
            <p className="text-sm font-semibold text-[#142a45]/80 whitespace-pre-wrap">{activeExplanation.details}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
