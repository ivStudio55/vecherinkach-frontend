'use client';

import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

type JoinQrCodeProps = {
  value: string;
  size?: number;
  className?: string;
};

export function JoinQrCode({ value, size = 220, className }: JoinQrCodeProps) {
  return (
    <div className={className}>
      <QRCodeCanvas value={value} size={size} bgColor="#ffffff" fgColor="#142a45" includeMargin={false} />
    </div>
  );
}
