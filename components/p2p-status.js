"use client";

import useP2PEvents from '@/hooks/useP2PEvents';

export default function P2PStatus() {
  const { connectedPeers, lastMessage, telemetry } = useP2PEvents(2000);

  return (
    <div className="p-3 bg-white/5 rounded-md text-sm text-gray-200">
      <div className="flex items-center justify-between mb-2">
        <strong>P2P Status</strong>
        <span className="text-xs text-gray-400">live</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>Connected peers: <span className="font-medium">{connectedPeers}</span></div>
        <div>Polls: <span className="font-medium">{telemetry.polls ?? 0}</span></div>
        <div>Signals sent: <span className="font-medium">{telemetry.signalsSent ?? 0}</span></div>
        <div>Offers sent: <span className="font-medium">{telemetry.offersSent ?? 0}</span></div>
        <div>Offer failures: <span className="font-medium">{telemetry.offerFailures ?? 0}</span></div>
      </div>
      {lastMessage && (
        <div className="mt-2 text-xs text-gray-300">
          <div className="font-semibold">Last message</div>
          <div className="truncate">{String(lastMessage.message).slice(0, 120)}</div>
        </div>
      )}
    </div>
  );
}
