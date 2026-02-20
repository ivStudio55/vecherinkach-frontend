import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const roomId = url.searchParams.get('roomId');
  if (!roomId) return Response.json({ error: 'roomId required' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  // Room
  const { data: room } = await supabase
    .from('jokester_rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  if (!room) return Response.json({ error: 'Room not found' }, { status: 404 });

  // Players
  const { data: players } = await supabase
    .from('jokester_players')
    .select('id, name, role, is_host, total_points, player_votes, spectator_votes, avatar, seat, joined_at')
    .eq('room_id', roomId)
    .order('total_points', { ascending: false });

  // Duels
  const { data: duels } = await supabase
    .from('jokester_duels')
    .select('id, round, duel_index, player1_id, player2_id, question1_text, question1_cat, question2_text, question2_cat, winner_id, status, created_at')
    .eq('room_id', roomId)
    .order('round', { ascending: true })
    .order('duel_index', { ascending: true });

  const duelIds = (duels ?? []).map(d => d.id);

  // Answers
  let answers: Array<{
    id: string; duel_id: string; player_id: string; question_index: number;
    answer_text: string | null; submitted_at: string | null;
  }> = [];
  if (duelIds.length > 0) {
    const { data } = await supabase
      .from('jokester_answers')
      .select('id, duel_id, player_id, question_index, answer_text, submitted_at')
      .in('duel_id', duelIds);
    answers = data ?? [];
  }

  // Votes
  let votes: Array<{
    id: string; duel_id: string; voter_id: string; question_index: number;
    voted_for_id: string; voter_role: string; created_at: string | null;
  }> = [];
  if (duelIds.length > 0) {
    const { data } = await supabase
      .from('jokester_votes')
      .select('id, duel_id, voter_id, question_index, voted_for_id, voter_role, created_at')
      .in('duel_id', duelIds);
    votes = data ?? [];
  }

  // Category votes
  const { data: categoryVotes } = await supabase
    .from('jokester_category_votes')
    .select('id, round, voter_id, category')
    .eq('room_id', roomId);

  // Build player name lookup
  const playerMap = new Map((players ?? []).map(p => [p.id, p.name]));

  // Build duel detail with answers + votes
  const duelDetails = (duels ?? []).map(d => {
    const duelAnswers = answers.filter(a => a.duel_id === d.id);
    const duelVotes = votes.filter(v => v.duel_id === d.id);

    const q1Answers = duelAnswers.filter(a => a.question_index === 0);
    const q2Answers = duelAnswers.filter(a => a.question_index === 1);
    const q1Votes = duelVotes.filter(v => v.question_index === 0);
    const q2Votes = duelVotes.filter(v => v.question_index === 1);

    return {
      ...d,
      player1Name: playerMap.get(d.player1_id) ?? '???',
      player2Name: playerMap.get(d.player2_id) ?? '???',
      winnerName: d.winner_id ? playerMap.get(d.winner_id) ?? '???' : null,
      questions: [
        {
          index: 0,
          text: d.question1_text,
          category: d.question1_cat,
          answers: q1Answers.map(a => ({
            playerName: playerMap.get(a.player_id) ?? '???',
            text: a.answer_text,
            votesReceived: q1Votes.filter(v => v.voted_for_id === a.player_id).length,
          })),
          totalVotes: q1Votes.length,
        },
        {
          index: 1,
          text: d.question2_text,
          category: d.question2_cat,
          answers: q2Answers.map(a => ({
            playerName: playerMap.get(a.player_id) ?? '???',
            text: a.answer_text,
            votesReceived: q2Votes.filter(v => v.voted_for_id === a.player_id).length,
          })),
          totalVotes: q2Votes.length,
        },
      ],
    };
  });

  // Game duration
  let durationMin: number | null = null;
  if (room.created_at && room.updated_at) {
    const dur = (Date.parse(room.updated_at) - Date.parse(room.created_at)) / 60000;
    if (dur > 0 && dur < 300) durationMin = +dur.toFixed(1);
  }

  return Response.json({
    room,
    players: players ?? [],
    duels: duelDetails,
    categoryVotes: categoryVotes ?? [],
    stats: {
      totalPlayers: (players ?? []).filter(p => !p.is_host && p.role === 'player').length,
      totalSpectators: (players ?? []).filter(p => p.role === 'spectator').length,
      totalDuels: (duels ?? []).length,
      completedDuels: (duels ?? []).filter(d => d.status === 'done').length,
      totalAnswers: answers.length,
      totalVotes: votes.length,
      durationMin,
    },
  });
}
