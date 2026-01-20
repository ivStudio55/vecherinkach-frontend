import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ConnectionMode = 'realtime' | 'polling' | 'reconnecting';

export type ConnectionStatus = {
  mode: ConnectionMode;
  lastEventAt: number | null;
  isFallbackPolling: boolean;
};

export type RoomSyncRow = {
  id: string;
  status?: string | null;
  is_active?: boolean | null;
  current_question_index?: number | string | null;
  question_started_at?: string | null;
  all_players_answered?: boolean | null;
  selected_question_ids?: number[] | null;
  round2_item_index?: number | null;
  round2_showing_fact?: boolean | null;
  round2_phase?: string | null;
  pack_id?: string | null;
  code?: string | null;
  state_version?: number | null;
  transitioning_to_next?: boolean | null;
};

type UseRoomSyncOptions = {
  pollIntervalMs?: number;
};

const DEFAULT_POLL_INTERVAL = 2000;
const STALE_EVENT_THRESHOLD_MS = 6500;

export const useRoomSync = (roomId?: string | null, options?: UseRoomSyncOptions) => {
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
  const [room, setRoom] = useState<RoomSyncRow | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    mode: 'realtime',
    lastEventAt: null,
    isFallbackPolling: false,
  });
  const lastStateVersionRef = useRef<number | null>(null);
  const lastRoomIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setConnectionStatus((prev) => ({ ...prev, isFallbackPolling: false }));
  }, []);

  const applyRoomUpdate = useCallback((nextRoom: RoomSyncRow) => {
    if (typeof nextRoom.state_version === 'number') {
      const last = lastStateVersionRef.current ?? -1;
      if (nextRoom.state_version <= last) {
        return;
      }
      lastStateVersionRef.current = nextRoom.state_version;
    }
    setRoom(nextRoom);
    setConnectionStatus((prev) => ({ ...prev, lastEventAt: Date.now() }));
  }, []);

  const fetchRoomSnapshot = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from('rooms')
      .select(
        'id, status, is_active, current_question_index, question_started_at, all_players_answered, selected_question_ids, round2_item_index, round2_showing_fact, round2_phase, pack_id, code, state_version, transitioning_to_next'
      )
      .eq('id', roomId)
      .single();
    if (data) {
      applyRoomUpdate(data as RoomSyncRow);
    }
  }, [applyRoomUpdate, roomId]);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setConnectionStatus((prev) => ({ ...prev, mode: 'polling', isFallbackPolling: true }));
    pollingIntervalRef.current = setInterval(() => {
      void fetchRoomSnapshot();
    }, pollIntervalMs);
  }, [fetchRoomSnapshot, pollIntervalMs]);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      return;
    }
    if (lastRoomIdRef.current !== roomId) {
      lastRoomIdRef.current = roomId;
      lastStateVersionRef.current = null;
      setRoom(null);
    }
    void fetchRoomSnapshot();
  }, [fetchRoomSnapshot, roomId]);

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    let mounted = true;
    const channelId = `${roomId}-${Date.now()}`;

    const roomChannel = supabase
      .channel(`room-sync-${roomId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload: { new: RoomSyncRow }) => {
          if (!mounted) return;
          applyRoomUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        if (!mounted) return;
        if (status === 'SUBSCRIBED') {
          setConnectionStatus((prev) => ({ ...prev, mode: 'realtime' }));
          stopPolling();
          return;
        }
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setConnectionStatus((prev) => ({ ...prev, mode: 'polling' }));
          startPolling();
        }
      });

    heartbeatIntervalRef.current = setInterval(() => {
      setConnectionStatus((prev) => {
        if (!prev.lastEventAt) {
          return prev;
        }
        const isStale = Date.now() - prev.lastEventAt > STALE_EVENT_THRESHOLD_MS;
        if (isStale && prev.mode === 'realtime') {
          startPolling();
          return { ...prev, mode: 'reconnecting', isFallbackPolling: true };
        }
        return prev;
      });
    }, STALE_EVENT_THRESHOLD_MS);

    return () => {
      mounted = false;
      stopPolling();
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      roomChannel.unsubscribe().then(() => {
        supabase.removeChannel(roomChannel);
      });
    };
  }, [applyRoomUpdate, roomId, startPolling, stopPolling]);

  const updateRoom = useCallback(
    async (patch: Partial<RoomSyncRow>) => {
      if (!roomId) {
        return { data: null, error: new Error('Room is not set') };
      }
      const nextVersion = (room?.state_version ?? 0) + 1;
      const updatePayload = {
        ...patch,
        state_version: nextVersion,
      };
      const { data, error } = await supabase.from('rooms').update(updatePayload).eq('id', roomId).select().single();
      if (!error && data) {
        applyRoomUpdate(data as RoomSyncRow);
      }
      return { data, error };
    },
    [applyRoomUpdate, room, roomId]
  );

  return {
    room,
    updateRoom,
    connectionStatus,
  };
};
