import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin.server";

type ActivityItem = {
  id: string;
  kind: "online" | "leader" | "highlight";
  game: string;
  title: string;
  text?: string;
  meta?: string;
};

type RoomRow = {
  id: string;
  status?: string;
  is_active?: boolean;
  updated_at?: string;
};

type GameConfig = {
  key: string;
  label: string;
  rooms: string;
  players: string;
  score?: string;
};

const GAME_CONFIG: GameConfig[] = [
  { key: "vecherinkach", label: "Р’РµС‡РµСЂРёРЅРєР°С‡", rooms: "rooms", players: "players", score: "points" },
  { key: "jokester", label: "РџРѕС€СѓС‚РёРєР°С‡", rooms: "jokester_rooms", players: "jokester_players", score: "total_points" },
  { key: "creativach", label: "РљСЂРµР°С‚РёРІР°С‡", rooms: "creativach_rooms", players: "creativach_players", score: "total_points" },
  { key: "draw", label: "Р РёСЃСѓРЅРєР°С‡", rooms: "draw_rooms", players: "draw_players", score: "score" },
  { key: "uno", label: "UNO", rooms: "uno_rooms", players: "uno_players" },
  { key: "survivach", label: "Р’С‹Р¶РёРІР°С‡", rooms: "survivach_rooms", players: "survivach_players", score: "total_correct" },
];

const HIDDEN_ROOM_STATUSES = new Set(["finished", "credits"]);

function isRoomActive(room: RoomRow, recentCutoff: number) {
  if (room.is_active === false || HIDDEN_ROOM_STATUSES.has(room.status ?? "")) return false;
  if (!room.updated_at) return true;
  return new Date(room.updated_at).getTime() >= recentCutoff;
}

function cleanText(value: unknown, maxLength = 150) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export async function GET() {
  const db = getSupabaseAdminClient();
  const recentCutoff = Date.now() - 12 * 60 * 60 * 1000;
  const items: ActivityItem[] = [];

  const roomResults = await Promise.all(
    GAME_CONFIG.map(async (game) => {
      const { data, error } = await db
        .from(game.rooms)
        .select("id,status,is_active,updated_at")
        .order("updated_at", { ascending: false })
        .limit(12);

      if (error) {
        const fallback = await db
          .from(game.rooms)
          .select("id,status,updated_at")
          .order("updated_at", { ascending: false })
          .limit(12);
        return { game, rooms: (fallback.data ?? []) as RoomRow[] };
      }

      return { game, rooms: (data ?? []) as RoomRow[] };
    }),
  );

  const activeRoomIds = new Map<string, string[]>();
  for (const result of roomResults) {
    activeRoomIds.set(
      result.game.key,
      result.rooms.filter((room) => isRoomActive(room, recentCutoff)).map((room) => room.id),
    );
  }

  const playerResults = await Promise.all(
    GAME_CONFIG.map(async (game) => {
      const roomIds = activeRoomIds.get(game.key) ?? [];
      if (roomIds.length === 0) return { game, players: [] as Record<string, unknown>[] };

      const fields = game.score
        ? `id,room_id,name,is_host,${game.score}`
        : "id,room_id,name,is_host";
      const { data } = await db
        .from(game.players)
        .select(fields)
        .in("room_id", roomIds)
        .limit(80);

      return { game, players: (data ?? []) as unknown as Record<string, unknown>[] };
    }),
  );

  const leaderboardResults = await Promise.all(
    GAME_CONFIG.filter((game) => game.score).map(async (game) => {
      const scoreField = game.score!;
      const { data } = await db
        .from(game.players)
        .select(`id,name,is_host,${scoreField}`)
        .eq("is_host", false)
        .gt(scoreField, 0)
        .order(scoreField, { ascending: false })
        .limit(1);

      return { game, player: (data?.[0] ?? null) as Record<string, unknown> | null };
    }),
  );

  for (const result of playerResults) {
    const players = result.players.filter((player) => player.is_host !== true);
    if (players.length === 0) continue;

    const roomCount = new Set(players.map((player) => String(player.room_id))).size;
    items.push({
      id: `online-${result.game.key}`,
      kind: "online",
      game: result.game.label,
      title: `${players.length} ${players.length === 1 ? "РёРіСЂРѕРє" : "РёРіСЂРѕРєРѕРІ"} СЃРµР№С‡Р°СЃ РІ РёРіСЂРµ`,
      meta: roomCount > 1 ? `${roomCount} Р°РєС‚РёРІРЅС‹Рµ РєРѕРјРЅР°С‚С‹` : "Р°РєС‚РёРІРЅР°СЏ РєРѕРјРЅР°С‚Р°",
    });

    const scoreField = result.game.score;
    if (!scoreField) continue;

    const leader = [...players]
      .filter((player) => Number(player[scoreField]) > 0)
      .sort((a, b) => Number(b[scoreField]) - Number(a[scoreField]))[0];
    if (!leader) continue;

    const score = Number(leader[scoreField]);
    items.push({
      id: `leader-${result.game.key}-${leader.id}`,
      kind: "leader",
      game: result.game.label,
      title: cleanText(leader.name, 40),
      text: `${score} ${result.game.key === "survivach" ? "РїСЂР°РІРёР»СЊРЅС‹С… РѕС‚РІРµС‚РѕРІ" : "РѕС‡РєРѕРІ"}`,
      meta: "Р»РёРґРµСЂ Р°РєС‚РёРІРЅРѕР№ РёРіСЂС‹",
    });
  }

  for (const result of leaderboardResults) {
    const player = result.player;
    if (!player || items.some((item) => item.kind === "leader" && item.game === result.game.label)) {
      continue;
    }

    const score = Number(player[result.game.score!]);
    items.push({
      id: `leader-all-${result.game.key}-${player.id}`,
      kind: "leader",
      game: result.game.label,
      title: cleanText(player.name, 40) || "РРіСЂРѕРє",
      text: `${score} ${result.game.key === "survivach" ? "РїСЂР°РІРёР»СЊРЅС‹С… РѕС‚РІРµС‚РѕРІ" : "РѕС‡РєРѕРІ"}`,
      meta: "Р»СѓС‡С€РёР№ СЂРµР·СѓР»СЊС‚Р°С‚",
    });
  }

  if (items.length === 0) {
    items.push(
      {
        id: "highlight-live",
        kind: "highlight",
        game: "Р’РµС‡РµСЂРёРЅРєР°С‡",
        title: "РРіСЂРѕРІРѕР№ СЌС„РёСЂ РіРѕС‚РѕРІ Рє РЅРѕРІС‹Рј РёСЃС‚РѕСЂРёСЏРј",
        text: "Р—РґРµСЃСЊ РїРѕСЏРІСЏС‚СЃСЏ Р»СѓС‡С€РёРµ РґРѕСЃС‚РёР¶РµРЅРёСЏ РёРіСЂРѕРєРѕРІ.",
        meta: "Р»РµРЅС‚Р° Р°РєС‚РёРІРЅРѕСЃС‚Рё",
      },
      {
        id: "highlight-party",
        kind: "highlight",
        game: "РљРѕР»Р»РµРєС†РёСЏ РёРіСЂ",
        title: "Р’С‹Р±РёСЂР°Р№С‚Рµ РёРіСЂСѓ Рё СЃРѕР±РёСЂР°Р№С‚Рµ РєРѕРјРїР°РЅРёСЋ",
        text: "Р“Р»Р°РІРЅР°СЏ РїРѕРєР°Р·С‹РІР°РµС‚ С‚РѕР»СЊРєРѕ Р±РµР·РѕРїР°СЃРЅС‹Рµ СЃРёРіРЅР°Р»С‹ Р°РєС‚РёРІРЅРѕСЃС‚Рё.",
        meta: "РІ С†РµРЅС‚СЂРµ СЃРѕР±С‹С‚РёР№",
      },
    );
  }

  return NextResponse.json(
    { items: items.slice(0, 30) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60",
      },
    },
  );
}
