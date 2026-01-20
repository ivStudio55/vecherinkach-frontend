import type { RoomSyncRow } from './roomTypes';

export const ROOM_SELECT_FIELDS =
  'id, status, is_active, current_question_index, question_started_at, all_players_answered, selected_question_ids, round2_item_index, round2_showing_fact, round2_phase, pack_id, code, state_version, transitioning_to_next';

export const getRoomStateVersion = (room: RoomSyncRow) => {
  if (typeof room.state_version === 'number') {
    return room.state_version;
  }
  return null;
};

export const shouldApplyRoomUpdate = (room: RoomSyncRow, lastVersion: number | null) => {
  const nextVersion = getRoomStateVersion(room);
  if (nextVersion === null) {
    return true;
  }
  if (lastVersion === null) {
    return true;
  }
  return nextVersion > lastVersion;
};
