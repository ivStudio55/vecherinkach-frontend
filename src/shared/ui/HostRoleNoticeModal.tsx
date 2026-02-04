'use client';

import React from 'react';

type HostRoleNoticeModalProps = {
  isOpen: boolean;
  onContinue: () => void;
  onPlayer: () => void;
};

export function HostRoleNoticeModal({ isOpen, onContinue, onPlayer }: HostRoleNoticeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-3xl border-[4px] border-[#142a45] bg-white shadow-2xl p-6 space-y-5 text-[#142a45]">
        <div className="space-y-2">
          <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Важное сообщение</p>
          <h2 className="text-3xl sm:text-4xl font-black">Это экран ведущего.</h2>
          <p className="text-lg sm:text-xl text-[#142a45]/90 leading-snug">
            Пожалуйста, используйте ноутбук, планшет или смартTV.
            <br />
            Если вы игрок — нажмите ниже.
          </p>
          <div className="space-y-1 text-sm sm:text-base text-[#142a45]/80">
            <p className="font-semibold">QR на экране ведут сюда:</p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://t.me/vecherinkach"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-[2px] border-[#142a45] font-semibold hover:bg-[#142a45]/5"
              >
                Telegram канал
              </a>
              <a
                href="https://vk.com/vecherinkach"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-[2px] border-[#142a45] font-semibold hover:bg-[#142a45]/5"
              >
                Сообщество VK
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onPlayer}
            className="w-full py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#ffe184] font-black"
          >
            Я игрок, у меня телефон
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="w-full py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
          >
            Далее, включен большой экран
          </button>
        </div>
      </div>
    </div>
  );
}
