import { JoinQrBlock } from '@/shared/ui/JoinQrBlock';

export default function HostQrPage({
  params,
  searchParams,
}: {
  params: { roomId: string };
  searchParams?: { code?: string };
}) {
  const roomCode = searchParams?.code ?? '';
  const qrWindowUrl = `/host/${params.roomId}/qr?code=${encodeURIComponent(roomCode)}`;

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5 text-center">
          <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/80">QR для подключения</p>
          <h1 className="text-3xl font-black leading-tight">Сканируйте, чтобы подключиться</h1>
          {roomCode && (
            <p className="text-sm text-[#ffeccd]/80 mt-2">
              Код комнаты: <span className="font-black">{roomCode}</span>
            </p>
          )}
        </header>

        <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl">
          <JoinQrBlock
            roomCode={roomCode}
            size="lg"
            qrWindowUrl={qrWindowUrl}
            showInstructions={false}
            className="py-8"
          />
          <div className="px-6 pb-8">
            <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-[#fff6da] px-4 py-3 text-sm text-[#142a45]/80 text-center">
              Если QR не работает — откройте <span className="font-semibold">https://vecherinkach.vercel.app/join</span> и введите код комнаты: <span className="font-black">{roomCode}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
