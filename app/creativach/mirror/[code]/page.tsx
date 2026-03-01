// app/creativach/mirror/[code]/page.tsx
// Зеркало трансляции «Креативач» — только просмотр экрана ведущего
'use client';

import { CreativachHostContent } from '../../host/[code]/page';

export default function CreativachMirrorPage() {
  return <CreativachHostContent isMirror />;
}
