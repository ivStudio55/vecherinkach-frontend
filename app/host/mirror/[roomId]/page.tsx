// app/host/mirror/[roomId]/page.tsx
// Зеркало трансляции «Вечеринкач» — только просмотр экрана ведущего
'use client';

import { HostRoomContent } from '../../[roomId]/page';

export default function VecherinkachMirrorPage() {
  return <HostRoomContent isMirror />;
}
