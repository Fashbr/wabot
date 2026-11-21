import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Code2,
  Film,
  ListChecks,
  Menu,
  MessageSquare,
  X,
} from 'lucide-react';
import { ConnectExportView } from './components/ConnectExportView';
import { LogsView } from './components/LogsView';
import { RulesView } from './components/RulesView';
import { SimulatorView } from './components/SimulatorView';
import type {
  BotProfile,
  BotRule,
  ConfigStatus,
  HdEnhancementSettings,
  TemplatePresetId,
  WebhookLogEntry,
} from './types/bot';

type ActiveTab = 'simulator' | 'rules' | 'logs' | 'connect';

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'simulator', label: 'Simulator Peng-HD', icon: MessageSquare },
  { id: 'rules', label: 'Preset & Aturan Bot', icon: ListChecks },
  { id: 'logs', label: 'Riwayat & Webhook', icon: Activity },
  { id: 'connect', label: 'Pasang ke WA', icon: Code2 },
];

const TAB_TITLES: Record<ActiveTab, string> = {
  simulator: 'Bot Peng-HD Video & Simulator Status WhatsApp',
  rules: 'Pengaturan Peng-HD Video & Aturan Perintah Bot',
  logs: 'Riwayat Pemrosesan Video & Log Webhook',
  connect: 'Hubungkan ke WhatsApp & Ekspor Skrip Bot',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [profile, setProfile] = useState<BotProfile | null>(null);
  const [hdSettings, setHdSettings] = useState<HdEnhancementSettings | null>(null);
  const [rules, setRules] = useState<BotRule[]>([]);
  const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
  const [configStatus, setConfigStatus] = useState<ConfigStatus>({
    hasAccessToken: false,
    hasPhoneNumberId: false,
    hasVerifyToken: false,
    hasAppSecret: false,
    webhookEndpoint: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [profileRes, hdRes, rulesRes, logsRes, cfgRes] = await Promise.all([
        fetch('/api/bot/profile'),
        fetch('/api/hd-settings'),
        fetch('/api/rules'),
        fetch('/api/logs'),
        fetch('/api/config/status'),
      ]);
      if (!profileRes.ok || !hdRes.ok || !rulesRes.ok || !logsRes.ok || !cfgRes.ok) {
        throw new Error('Gagal memuat konfigurasi server bot.');
      }
      const [pData, hdData, rData, lData, cData] = await Promise.all([
        profileRes.json(),
        hdRes.json(),
        rulesRes.json(),
        logsRes.json(),
        cfgRes.json(),
      ]);
      setProfile(pData);
      setHdSettings(hdData);
      setRules(rData);
      setLogs(lData);
      setConfigStatus(cData);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal terhubung ke server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const refreshLogsAndRules = useCallback(async () => {
    const [rulesRes, logsRes] = await Promise.all([
      fetch('/api/rules'),
      fetch('/api/logs'),
    ]);
    if (rulesRes.ok) setRules(await rulesRes.json());
    if (logsRes.ok) setLogs(await logsRes.json());
  }, []);

  async function handleUpdateProfile(patch: Partial<BotProfile>) {
    const res = await fetch('/api/bot/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setProfile(await res.json());
    }
  }

  async function handleUpdateHdSettings(patch: Partial<HdEnhancementSettings>) {
    const res = await fetch('/api/hd-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setHdSettings(await res.json());
    }
  }

  async function handleCreateRule(
    rule: Omit<BotRule, 'id' | 'hitCount' | 'updatedAt'>
  ) {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal membuat aturan.');
    }
    await refreshLogsAndRules();
  }

  async function handleUpdateRule(id: string, patch: Partial<BotRule>) {
    const res = await fetch(`/api/rules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memperbarui aturan.');
    }
    await refreshLogsAndRules();
  }

  async function handleDeleteRule(id: string) {
    const res = await fetch(`/api/rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function handleApplyPreset(preset: TemplatePresetId) {
    const res = await fetch('/api/rules/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset }),
    });
    if (res.ok) {
      const data = (await res.json()) as { profile: BotProfile; rules: BotRule[] };
      setProfile(data.profile);
      setRules(data.rules);
    }
  }

  async function handleClearLogs() {
    const res = await fetch('/api/logs', { method: 'DELETE' });
    if (res.ok) {
      setLogs([]);
    }
  }

  const activeRulesCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white border-r border-slate-200">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 whitespace-nowrap">
            Wabot Studio
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-600 space-y-2">
          <div className="flex items-center justify-between">
            <span>Mesin Video</span>
            <span className="font-mono font-semibold text-emerald-700">FFmpeg Siap</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Aturan Aktif</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {activeRulesCount} / {rules.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Aktivitas</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {logs.length}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="font-display font-bold text-base text-slate-900">
                Wabot Studio
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg ${
                      active
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-base font-semibold text-slate-900 truncate">
              {TAB_TITLES[activeTab]}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() =>
                setActiveTab(activeTab === 'connect' ? 'simulator' : 'connect')
              }
              className="px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeTab === 'connect' ? 'Uji Peng-HD Video' : 'Unduh Skrip Bot WA'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1360px] w-full mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 h-[520px] bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="lg:col-span-5 h-[520px] bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : loadError || !profile || !hdSettings ? (
            <div className="bg-white border border-red-200 rounded-xl p-6 text-center max-w-md mx-auto mt-12">
              <p className="text-sm font-semibold text-red-800">
                {loadError || 'Data bot tidak tersedia'}
              </p>
              <button
                type="button"
                onClick={fetchAll}
                className="mt-4 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'simulator' && (
                <SimulatorView
                  profile={profile}
                  defaultPreset={hdSettings.defaultPreset}
                  onToggleBotActive={(next) =>
                    handleUpdateProfile({ isBotActive: next })
                  }
                  onSimulationCompleted={refreshLogsAndRules}
                />
              )}

              {activeTab === 'rules' && (
                <RulesView
                  rules={rules}
                  profile={profile}
                  hdSettings={hdSettings}
                  onCreateRule={handleCreateRule}
                  onUpdateRule={handleUpdateRule}
                  onDeleteRule={handleDeleteRule}
                  onApplyPreset={handleApplyPreset}
                  onUpdateProfile={handleUpdateProfile}
                  onUpdateHdSettings={handleUpdateHdSettings}
                />
              )}

              {activeTab === 'logs' && (
                <LogsView
                  logs={logs}
                  onRefresh={refreshLogsAndRules}
                  onClearLogs={handleClearLogs}
                  onGoToSimulator={() => setActiveTab('simulator')}
                />
              )}

              {activeTab === 'connect' && (
                <ConnectExportView
                  configStatus={configStatus}
                  onWebhookTestDone={refreshLogsAndRules}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
