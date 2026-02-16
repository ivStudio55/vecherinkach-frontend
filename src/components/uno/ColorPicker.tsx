"use client";

import type { UnoColor } from '@/lib/uno/types';

const COLORS: { value: UnoColor; bg: string; label: string }[] = [
  { value: 'red', bg: '#e5383b', label: 'Красный' },
  { value: 'blue', bg: '#2563eb', label: 'Синий' },
  { value: 'green', bg: '#16a34a', label: 'Зелёный' },
  { value: 'yellow', bg: '#eab308', label: 'Жёлтый' },
];

interface Props {
  onPick: (color: UnoColor) => void;
  onCancel: () => void;
}

export default function ColorPicker({ onPick, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#1a1f2e] border-2 border-white/20 rounded-3xl p-6 shadow-2xl max-w-xs w-full space-y-4 animate-scaleIn">
        <h3 className="text-center text-lg font-black text-white tracking-wide">Выбери цвет</h3>
        <div className="grid grid-cols-2 gap-3">
          {COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => onPick(c.value)}
              className="group relative rounded-2xl py-5 font-bold text-white text-sm tracking-wider
                         transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
              style={{ backgroundColor: c.bg }}
            >
              <span className="drop-shadow-md">{c.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full rounded-xl border border-white/20 bg-white/5 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
