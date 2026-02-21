"use client";

import type { UnoColor } from '@/lib/uno/types';

const COLORS: { value: UnoColor; bg: string; label: string }[] = [
  { value: 'red', bg: '#ef4444', label: 'КРАСНЫЙ' },
  { value: 'blue', bg: '#3b82f6', label: 'СИНИЙ' },
  { value: 'green', bg: '#4ade80', label: 'ЗЕЛЁНЫЙ' },
  { value: 'yellow', bg: '#facc15', label: 'ЖЁЛТЫЙ' },
];

interface Props {
  onPick: (color: UnoColor) => void;
  onCancel: () => void;
}

export default function ColorPicker({ onPick, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="comic-panel bg-white p-8 max-w-sm w-full mx-4 space-y-6 relative animate-scaleIn">
        <div className="absolute -top-6 -left-6 rotate-[-10deg] comic-speech-bubble bg-yellow-400 text-black font-black text-xl px-4 py-2 z-20">
          ВЫБЕРИ ЦВЕТ!
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4">
          {COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => onPick(c.value)}
              className="comic-button py-6 text-xl transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ backgroundColor: c.bg, color: c.value === 'yellow' ? '#000' : '#fff' }}
            >
              <span className="drop-shadow-[2px_2px_0_#000]">{c.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full comic-button bg-gray-200 text-black py-3 text-lg mt-4"
        >
          ОТМЕНА
        </button>
      </div>
    </div>
  );
}
