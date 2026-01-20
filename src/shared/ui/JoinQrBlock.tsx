'use client';

import React from 'react';

const DEFAULT_JOIN_URL = 'https://vecherinkach.vercel.app/join';

const sizeStyles = {
  md: {
    image: 'h-44 w-44 sm:h-52 sm:w-52',
    container: 'px-5 py-6',
  },
  lg: {
    image: 'h-64 w-64 sm:h-72 sm:w-72',
    container: 'px-6 py-7',
  },
} as const;

type JoinQrBlockProps = {
  roomCode: string;
  joinUrl?: string;
  qrImageSrc?: string;
  qrWindowUrl?: string;
  size?: keyof typeof sizeStyles;
  showInstructions?: boolean;
  className?: string;
};

export function JoinQrBlock({
  roomCode,
  joinUrl = DEFAULT_JOIN_URL,
  qrImageSrc = '/qr-code.png',
  qrWindowUrl,
  size = 'md',
  showInstructions = true,
  className,
}: JoinQrBlockProps) {
  const styles = sizeStyles[size];
  const handleOpenQr = () => {
    if (!qrWindowUrl) return;
    window.open(qrWindowUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`w-full ${className ?? ''}`}>
      <div className={`flex flex-col items-center text-center gap-4 ${styles.container}`}>
        <p className="text-sm font-black tracking-[0.3em] text-[#142a45]/70">Подключайтесь к игре!</p>
        <div className="qr-glow-frame rounded-3xl border-[4px] border-[#142a45] bg-white p-4">
          <img
            src={qrImageSrc}
            alt="QR код для подключения"
            className={`mx-auto rounded-2xl border-[3px] border-[#142a45]/15 bg-white ${styles.image}`}
          />
        </div>

        {qrWindowUrl && (
          <button
            type="button"
            onClick={handleOpenQr}
            className="hover:scale-105 hover:shadow-lg transition-all duration-200 px-4 py-2 rounded-2xl border-[3px] border-[#142a45] font-semibold bg-[#ffe184]"
          >
            Открыть QR
          </button>
        )}

        {showInstructions && (
          <div className="space-y-4 max-w-xl">
            <p className="text-sm font-semibold text-[#142a45]/90">Чтобы подключиться к комнате:</p>
            <ol className="space-y-2 text-sm font-semibold text-[#142a45]/80 text-left">
              <li className="flex gap-3">
                <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">1</span>
                Наведите камеру на QR-код
              </li>
              <li className="flex gap-3">
                <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">2</span>
                Вы попадёте на экран подключения
              </li>
              <li className="flex gap-3">
                <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">3</span>
                Введите имя и код комнаты
              </li>
            </ol>
            <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-[#fff6da] px-4 py-3 text-xs text-[#142a45]/80">
              Если QR не работает — откройте{' '}
              <span className="font-semibold">{joinUrl}</span> и введите код комнаты: <span className="font-black">{roomCode}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
