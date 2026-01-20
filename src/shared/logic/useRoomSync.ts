import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logError, logEvent } from './logger';
import { ROOM_SELECT_FIELDS, getRoomStateVersion, shouldApplyRoomUpdate } from './roomEventUtils';
import { throttle } from './throttle';
import type { RoomSyncRow } from './roomTypes';

export type ConnectionMode = 'realtime' | 'polling' | 'reconnecting';

export type ConnectionStatus = {
  mode: ConnectionMode;
  lastEventAt: number | null;
  isFallbackPolling: boolean;
};

export type UseRoomSyncOptions = {
  pollIntervalMs?: number;
  throttleMs?: number;
  enableRealtime?: boolean;
};

const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_THROTTLE_MS = 120;
const STALE_EVENT_THRESHOLD_MS = 6500;

export const useRoomSync = (roomId?: string | null, options?: UseRoomSyncOptions) => {
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
  const throttleMs = options?.throttleMs ?? DEFAULT_THROTTLE_MS;
  const enableRealtime = options?.enableRealtime ?? true;

  const [room, setRoom] = useState<RoomSyncRow | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    mode: enableRealtime ? 'realtime' : 'polling',
    lastEventAt: null,
    isFallbackPolling: !enableRealtime,
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

  const applyRoomUpdateImmediate = useCallback((nextRoom: RoomSyncRow) => {
    const shouldApply = shouldApplyRoomUpdate(nextRoom, lastStateVersionRef.current);
    if (!shouldApply) {
      return;
    }

    const nextVersion = getRoomStateVersion(nextRoom);
    if (nextVersion !== null) {
      lastStateVersionRef.current = nextVersion;
    }

    setRoom(nextRoom);
    setConnectionStatus((prev) => ({ ...prev, lastEventAt: Date.now() }));
  }, []);

  const throttledApply = useMemo(() => throttle(applyRoomUpdateImmediate, throttleMs), [applyRoomUpdateImmediate, throttleMs]);

  useEffect(() => () => throttledApply.cancel(), [throttledApply]);

  const fetchRoomSnapshot = useCallback(async () => {
    if (!roomId) return;
    const { data, error } = await supabase
      .from('rooms')
      .select(ROOM_SELECT_FIELDS)
      .eq('id', roomId)
      .single();
    if (error) {
      logError('room-sync', 'Room snapshot fetch failed', error, { roomId });
      return;
    }
    if (data) {
      throttledApply(data as RoomSyncRow);
    }
  }, [roomId, throttledApply]);

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

    if (!enableRealtime) {
      startPolling();
      return () => stopPolling();
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
          throttledApply(payload.new);
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
          logEvent('warn', 'room-sync', 'Realtime channel status changed', { status, roomId });
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
  }, [enableRealtime, roomId, startPolling, stopPolling, throttledApply]);

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
      if (error) {
        logError('room-sync', 'Room update failed', error, { roomId, patch });
      }
      if (!error && data) {
        throttledApply(data as RoomSyncRow);
      }
      return { data: (data as RoomSyncRow | null) ?? null, error };
    },
    [room, roomId, throttledApply]
  );

  return {
    room,
    updateRoom,
    connectionStatus,
  };
};
