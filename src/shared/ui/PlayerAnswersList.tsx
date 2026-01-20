'use client';

type PlayerAnswerItem = {
  id: string;
  name: string;
  text: string;
  likes?: number | null;
};

type PlayerAnswersListProps = {
  title?: string;
  items: PlayerAnswerItem[];
  emptyLabel?: string;
  className?: string;
};

export function PlayerAnswersList({
  title = 'Ответы игроков',
  items,
  emptyLabel = 'Пока нет ответов.',
  className,
}: PlayerAnswersListProps) {
  return (
    <div className={`rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-4 space-y-3 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <p className="retro-heading text-[11px] tracking-[0.35em] text-[#142a45]/60">{title}</p>
        <span className="text-[11px] font-black text-[#142a45]/60">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[#142a45]/70">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl border-[2px] border-[#142a45]/20 bg-white px-3 py-2"
              style={{ animationDelay: `${index * 25}ms` }}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#142a45] truncate">{item.text || '—'}</p>
                <p className="text-[11px] text-[#142a45]/60 truncate">{item.name}</p>
              </div>
              {typeof item.likes === 'number' ? (
                <span className="text-xs font-black text-[#f1532f]">❤️ {item.likes}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
