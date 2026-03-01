// app/draw/mirror/[code]/page.tsx
// Зеркало трансляции «Рисункач» — только просмотр экрана ведущего
'use client';

import { DrawHostContent } from '../../host/[code]/page';

export default function DrawMirrorPage() {
  return <DrawHostContent isMirror />;
}
