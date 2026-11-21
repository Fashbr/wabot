import React, { useState } from 'react';
import { RefreshCw, Search, Trash2, X } from 'lucide-react';
import type { WebhookLogEntry } from '../types/bot';

interface LogsViewProps {
  logs: WebhookLogEntry[];
  onRefresh: () => Promise<void>;
  onClearLogs: () => Promise<void>;
  onGoToSimulator: () => void;
}

const OUTBOUND_LABELS: Record<WebhookLogEntry['outboundStatus'], string> = {
  simulated: 'Simulasi Lokal',
  sent: 'Terkirim via Graph API',
  failed: 'Gagal Mengirim',
  skipped: 'Dilewati (Tanpa Token)',
};

const SOURCE_LABELS: Record<WebhookLogEntry['source'], string> = {
  video_engine: 'Mesin Peng-HD',
  simulator: 'Simulator Teks',
  meta_webhook: 'Webhook Meta',
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function LogsView({
  logs,
  onRefresh,
  onClearLogs,
  onGoToSimulator,
}: LogsViewProps) {
  const [sourceFilter, setSourceFilter] = useState<
    'all' | 'video_engine' | 'simulator' | 'meta_webhook'
  >('all');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<WebhookLogEntry | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filtered = logs.filter((entry) => {
    if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      entry.senderName.toLowerCase().includes(q) ||
      entry.from.includes(q) ||
      entry.incomingText.toLowerCase().includes(q) ||
      entry.matchedRuleName.toLowerCase().includes(q)
    );
  });

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter & Action Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor, video, atau pesan..."
              className="pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 w-64"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['all', 'Semua'],
                ['video_engine', 'Peng-HD Video'],
                ['simulator', 'Teks'],
                ['meta_webhook', 'Webhook Meta'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setSourceFilter(val)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sourceFilter === val
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Muat Ulang</span>
          </button>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan Log</span>
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-sm font-semibold text-slate-800">Belum ada aktivitas tercatat</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Setiap pemrosesan video Peng-HD, simulasi perintah, maupun permintaan POST dari
              webhook Meta akan dicatat di sini.
            </p>
            <button
              type="button"
              onClick={onGoToSimulator}
              className="mt-4 px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg cursor-pointer"
            >
              Buka Simulator Peng-HD
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Sumber</th>
                  <th className="py-3 px-4">Pengirim</th>
                  <th className="py-3 px-4">Input / Video</th>
                  <th className="py-3 px-4">Preset / Aturan</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Durasi</th>
                  <th className="py-3 px-4 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {formatDateTime(entry.timestamp)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {SOURCE_LABELS[entry.source]}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs font-medium text-slate-900">{entry.senderName}</div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {entry.from}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-800 max-w-[220px] truncate">
                      {entry.incomingText}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs font-medium text-slate-900">
                        {entry.matchedRuleName}
                      </div>
                      <div className="text-[11px] text-slate-500">{entry.replyPreview}</div>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <span
                        className={
                          entry.outboundStatus === 'failed'
                            ? 'text-red-700 font-medium'
                            : entry.outboundStatus === 'sent'
                              ? 'text-emerald-700 font-medium'
                              : 'text-slate-600'
                        }
                      >
                        {OUTBOUND_LABELS[entry.outboundStatus]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 tabular-nums">
                      {entry.latencyMs} ms
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(entry)}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                      >
                        Lihat JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Detail Event — {selectedLog.senderName}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5 tabular-nums">
                  {formatDateTime(selectedLog.timestamp)} · {selectedLog.from}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2">
                  Data Masuk / Metadata Awal
                </h4>
                <pre className="bg-slate-950 text-slate-100 rounded-lg p-3.5 text-xs font-mono overflow-auto max-h-[420px]">
                  {JSON.stringify(selectedLog.rawInboundPayload, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2">
                  Payload Balasan Outbound
                </h4>
                <pre className="bg-slate-950 text-slate-100 rounded-lg p-3.5 text-xs font-mono overflow-auto max-h-[420px]">
                  {JSON.stringify(selectedLog.rawOutboundPayload ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
