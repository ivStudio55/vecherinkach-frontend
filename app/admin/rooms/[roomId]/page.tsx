import AdminRoomDetailsClient from './AdminRoomDetailsClient';

export default function AdminRoomDetailsPage({ params }: { params: { roomId: string } }) {
  return <AdminRoomDetailsClient roomId={params.roomId} />;
}
