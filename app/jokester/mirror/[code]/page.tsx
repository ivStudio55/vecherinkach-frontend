// app/jokester/mirror/[code]/page.tsx
// Зеркало трансляции «Пошути-кач» — только просмотр экрана ведущего
'use client';

import { JokesterHostContent } from '../../host/[code]/page';

export default function JokesterMirrorPage() {
  return <JokesterHostContent isMirror />;
}
