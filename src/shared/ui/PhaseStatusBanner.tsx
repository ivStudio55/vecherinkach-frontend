import type { ConnectionStatus } from '@/shared/logic/useRoomSync';

type PhaseStatusBannerProps = {
  phaseLabel?: string;
  connectionStatus?: ConnectionStatus | null;
  className?: string;
};

const getConnectionLabel = (status?: ConnectionStatus | null) => {
  if (!status) {
    return null;
  }
  if (status.mode === 'polling') {
    return status.isFallbackPolling ? 'Связь нестабильна — включён резервный опрос' : 'Связь нестабильна — пытаемся восстановиться';
  }
  if (status.mode === 'reconnecting') {
    return 'Связь нестабильна — пытаемся восстановиться';
  }
  return 'Связь: Realtime';
};

export const PhaseStatusBanner = ({ phaseLabel, connectionStatus, className }: PhaseStatusBannerProps) => {
  const connectionLabel = getConnectionLabel(connectionStatus);
  const shouldShow = Boolean(phaseLabel) || (connectionStatus?.mode && connectionStatus.mode !== 'realtime');

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      className={`phase-transition rounded-3xl border-[3px] border-[#142a45]/15 bg-white px-4 py-3 text-sm font-semibold text-[#142a45] ${className ?? ''}`}
    >
      {phaseLabel && <p>{phaseLabel}</p>}
      {connectionLabel && <p className="text-xs text-[#142a45]/70">{connectionLabel}</p>}
    </div>
  );
};
