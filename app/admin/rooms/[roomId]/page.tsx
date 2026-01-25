import AdminRoomDetailsClient from './AdminRoomDetailsClient';

export default async function AdminRoomDetailsPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <AdminRoomDetailsClient roomId={roomId} />;
}
