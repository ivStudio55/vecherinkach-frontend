'use client';

import React, { useMemo } from 'react';
import { JoinQrCode } from '@/shared/ui/JoinQrCode';

const DEFAULT_JOIN_URL = 'https://vecherinkach.ru/join';

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
  qrWindowUrl?: string;
  size?: keyof typeof sizeStyles;
  showInstructions?: boolean;
  className?: string;
};

export function JoinQrBlock({
  roomCode,
  joinUrl,
  qrWindowUrl,
  size = 'md',
  showInstructions = true,
  className,
}: JoinQrBlockProps) {
  const styles = sizeStyles[size];
  const resolvedJoinBase = useMemo(() => {
    if (joinUrl) return joinUrl;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/join`;
    }
    return DEFAULT_JOIN_URL;
  }, [joinUrl]);
  const joinUrlWithCode = roomCode ? `${resolvedJoinBase}?code=${encodeURIComponent(roomCode)}` : resolvedJoinBase;
  const qrSize = size === 'lg' ? 256 : 176;
  const handleOpenQr = () => {
    if (!qrWindowUrl) return;
    window.open(qrWindowUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`w-full ${className ?? ''}`}>
      <div className={`flex flex-col items-center text-center gap-4 ${styles.container}`}>
        <p className="text-sm font-black tracking-[0.3em] text-[#142a45]/70">Подключайтесь к игре!</p>
        <div className="qr-glow-frame rounded-3xl border-[4px] border-[#142a45] bg-white p-4">
          <div className={`mx-auto rounded-2xl border-[3px] border-[#142a45]/15 bg-white flex items-center justify-center ${styles.image}`}>
            <JoinQrCode value={joinUrlWithCode} size={qrSize} />
          </div>
        </div>

        {/* Instructions and the separate 'Open QR' button were removed per UX update.
            Fallback link is now shown on the dedicated host QR page under the QR block. */}
      </div>
    </div>
  );
}
