import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Play, Smartphone, Terminal } from 'lucide-react';
import type { ConfigStatus, SimulationResponse } from '../types/bot';

interface ConnectExportViewProps {
  configStatus: ConfigStatus;
  onWebhookTestDone: () => void;
}

export function ConnectExportView({
  configStatus,
  onWebhookTestDone,
}: ConnectExportViewProps) {
  const [platformTab, setPlatformTab] = useState<'termux' | 'desktop'>('termux');
  const [codeTab, setCodeTab] = useState<'baileys' | 'curl'>('baileys');
  const [baileysCode, setBaileysCode] = useState('');
  const [curlCode, setCurlCode] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pairingNumber, setPairingNumber] = useState('6281234567890');

  const [testMessage, setTestMessage] = useState('/menu');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<SimulationResponse | null>(null);

  useEffect(() => {
    fetch('/api/export/code')
      .then((res) => res.json())
      .then((data: { baileysScript: string; cloudApiCurl: string }) => {
        setBaileysCode(data.baileysScript);
        setCurlCode(data.cloudApiCurl);
      })
      .catch(() => {});
  }, []);

  function copyText(key: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  function downloadScript() {
    const blob = new Blob([baileysCode], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'baileys-hd-bot.mjs';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runMetaWebhookTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testMessage.trim() || isTesting) return;
    setIsTesting(true);
    try {
      const res = await fetch('/api/webhook/test-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMessage.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as SimulationResponse;
        setTestResult(data);
        onWebhookTestDone();
      }
    } finally {
      setIsTesting(false);
    }
  }

  const cleanPairingPhone = pairingNumber.replace(/[^0-9]/g, '') || '6281234567890';
  const installCommands =
    platformTab === 'termux'
      ? `pkg update -y
pkg install nodejs ffmpeg -y
mkdir wa-bot-hd
cd wa-bot-hd
npm init -y
npm pkg set type=module
npm install @whiskeysockets/baileys@^6.7.21 pino qrcode-terminal
# Pindahkan file baileys-hd-bot.mjs ke folder ini, lalu jalankan:
node baileys-hd-bot.mjs --pairing ${cleanPairingPhone}`
      : `mkdir wa-bot-hd
cd wa-bot-hd
npm init -y
npm pkg set type=module
npm install @whiskeysockets/baileys@^6.7.21 pino qrcode-terminal
# Cek FFmpeg (di Windows bisa pasang lewat: winget install Gyan.FFmpeg)
# Pindahkan file baileys-hd-bot.mjs ke folder ini, lalu pilih salah satu:
node baileys-hd-bot.mjs
# Atau pakai Kode Pairing 8 digit:
node baileys-hd-bot.mjs --pairing ${cleanPairingPhone}`;

  const envItems = [
    {
      name: 'WHATSAPP_VERIFY_TOKEN',
      configured: configStatus.hasVerifyToken,
      desc: 'Token rahasia buatan Anda sendiri untuk verifikasi Webhook di Meta Developer Console',
    },
    {
      name: 'WHATSAPP_ACCESS_TOKEN',
      configured: configStatus.hasAccessToken,
      desc: 'Token Graph API dari Meta untuk mengunduh video masuk & mengirim balasan video HD',
    },
    {
      name: 'WHATSAPP_PHONE_NUMBER_ID',
      configured: configStatus.hasPhoneNumberId,
      desc: 'ID Nomor Telepon WhatsApp Business dari menu API Setup Meta',
    },
    {
      name: 'WHATSAPP_APP_SECRET',
      configured: configStatus.hasAppSecret,
      desc: 'Opsional: memverifikasi tanda tangan HMAC X-Hub-Signature-256 pada setiap pesan masuk',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Section 1: Panduan & Ekspor Bot WA Pribadi (QR / Kode Pairing) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Cara 1 · Sambungkan ke Nomor WhatsApp Biasa (Scan QR atau Kode Pairing)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Gunakan cara ini jika ingin memakai nomor WhatsApp biasa/kedua sebagai bot tanpa
              harus mendaftar Meta Business API.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadScript}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Unduh baileys-hd-bot.mjs</span>
          </button>
        </div>

        {/* Step-by-step */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div>
            <div className="font-semibold text-slate-900">1. Siapkan Perangkat Penjalan</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Bot bisa dijalankan di <strong>Laptop (Windows/Mac)</strong>, <strong>VPS</strong>,
              atau langsung di <strong>HP Android (Termux)</strong>. Pastikan{' '}
              <code className="font-mono">Node.js</code> dan{' '}
              <code className="font-mono">FFmpeg</code> terpasang.
            </p>
          </div>
          <div>
            <div className="font-semibold text-slate-900">2. Jalankan Skrip &amp; Tautkan WA</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Pilih mode <strong>Scan QR</strong> atau masukkan nomor WA Anda untuk mendapatkan{' '}
              <strong>Kode Pairing 8 digit</strong> (praktis jika hanya pakai 1 HP).
            </p>
          </div>
          <div>
            <div className="font-semibold text-slate-900">3. Buka Menu Perangkat Tertaut</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Di WhatsApp yang mau dijadikan bot: buka <strong>Pengaturan → Perangkat Tertaut →
              Tautkan Perangkat</strong> (atau pilih <em>Tautkan dengan nomor telepon</em>).
            </p>
          </div>
        </div>

        {/* Platform Switcher + Pairing Number Helper */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setPlatformTab('termux')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  platformTab === 'termux'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                HP Android (Termux)
              </button>
              <button
                type="button"
                onClick={() => setPlatformTab('desktop')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  platformTab === 'desktop'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Laptop / VPS Linux
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
              <label className="text-xs text-slate-600 whitespace-nowrap">
                Nomor WA Bot:
              </label>
              <input
                type="text"
                value={pairingNumber}
                onChange={(e) => setPairingNumber(e.target.value)}
                placeholder="6281234567890"
                className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg w-36 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="relative">
            <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed">
              {installCommands}
            </pre>
            <button
              type="button"
              onClick={() => copyText('cmd', installCommands)}
              className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md cursor-pointer"
            >
              {copiedKey === 'cmd' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Salin Perintah</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Source Code Viewer */}
        <div className="pt-2 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setCodeTab('baileys')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  codeTab === 'baileys'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                baileys-hd-bot.mjs
              </button>
              <button
                type="button"
                onClick={() => setCodeTab('curl')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  codeTab === 'curl'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                cURL Cloud API
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                copyText('code', codeTab === 'baileys' ? baileysCode : curlCode)
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md cursor-pointer"
            >
              {copiedKey === 'code' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Kode Skrip</span>
                </>
              )}
            </button>
          </div>

          <pre className="bg-slate-950 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-auto max-h-[340px] leading-relaxed">
            {codeTab === 'baileys' ? baileysCode : curlCode}
          </pre>
        </div>
      </section>

      {/* Section 2: Meta Cloud API Webhook (24/7 Server Ini) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Cara 2 · Sambungkan via Meta WhatsApp Cloud API (Aktif Langsung di Server Ini)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Tanpa scan QR dan tidak perlu menyalakan laptop/Termux. Cocok untuk nomor baru atau
              nomor bisnis resmi melalui dashboard Meta Developer.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 max-w-full">
            <code className="text-xs font-mono text-slate-800 truncate max-w-[320px]">
              {configStatus.webhookEndpoint}
            </code>
            <button
              type="button"
              onClick={() => copyText('webhook', configStatus.webhookEndpoint)}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 shrink-0 cursor-pointer"
            >
              {copiedKey === 'webhook' ? 'Tersalin' : 'Salin URL'}
            </button>
          </div>
        </div>

        {(configStatus.webhookEndpoint.includes('ais-dev-') ||
          configStatus.webhookEndpoint.includes('ais-pre-')) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 space-y-1">
            <div className="font-semibold">
              Perhatian: URL Preview AI Studio (ais-dev / ais-pre) Tidak Bisa Menerima Webhook Meta
            </div>
            <p className="leading-relaxed">
              Domain preview <code className="font-mono">ais-dev-*</code> dan{' '}
              <code className="font-mono">ais-pre-*</code> mewajibkan login cookie Google sehingga
              permintaan dari server Meta akan dialihkan (HTTP 302) dan gagal verifikasi. Untuk
              memakai Webhook Meta, gunakan tombol <strong>Deploy to Cloud Run</strong> agar
              mendapatkan URL publik <code className="font-mono">*.run.app</code> tanpa login, atau
              gunakan <strong>Cara 1 (baileys-hd-bot.mjs)</strong> di atas yang tidak memerlukan
              URL Webhook.
            </p>
          </div>
        )}

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-slate-50 border border-slate-200 rounded-lg p-4">
          <li>
            <div className="font-semibold text-slate-900">1. Buat App di Meta Developers</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Buka <code className="font-mono">developers.facebook.com</code> → buat aplikasi tipe{' '}
              <strong>Business</strong> → tambahkan produk <strong>WhatsApp</strong>.
            </p>
          </li>
          <li>
            <div className="font-semibold text-slate-900">2. Isi Secrets di Proyek Ini</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Salin <strong>Temporary/Permanent Access Token</strong> &amp;{' '}
              <strong>Phone Number ID</strong> lalu masukkan ke panel <strong>Secrets</strong> di
              pengaturan AI Studio.
            </p>
          </li>
          <li>
            <div className="font-semibold text-slate-900">3. Tempel URL Webhook</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Di menu <strong>WhatsApp → Configuration</strong>, tempel URL Webhook di atas beserta{' '}
              <code className="font-mono">WHATSAPP_VERIFY_TOKEN</code> Anda, lalu centang{' '}
              <strong>messages</strong>.
            </p>
          </li>
        </ol>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {envItems.map((item) => (
            <div
              key={item.name}
              className="border border-slate-200 rounded-lg p-3.5 flex items-start justify-between gap-3"
            >
              <div>
                <div className="font-mono text-xs font-semibold text-slate-900">{item.name}</div>
                <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                  item.configured ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {item.configured ? 'Terkonfigurasi' : 'Belum Diatur'}
              </span>
            </div>
          ))}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Terminal className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  Uji Parser Webhook Format Meta
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pastikan server merespons payload Meta Cloud API dengan benar sebelum
                  disambungkan.
                </p>
              </div>
            </div>
            <form onSubmit={runMetaWebhookTest} className="flex items-center gap-2">
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="/menu"
                className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <button
                type="submit"
                disabled={isTesting}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isTesting ? 'Mengirim...' : 'Kirim Event Webhook'}</span>
              </button>
            </form>
          </div>

          {testResult && (
            <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-700 flex flex-wrap items-center gap-3">
              <span>
                Aturan cocok: <strong>{testResult.matchedRule?.name || 'Fallback'}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Status:{' '}
                <strong>
                  {testResult.logEntry.outboundStatus === 'sent'
                    ? 'Terkirim ke WhatsApp'
                    : testResult.logEntry.outboundStatus === 'skipped'
                      ? 'Diproses (isi WHATSAPP_ACCESS_TOKEN di Secrets untuk kirim nyata)'
                      : 'Gagal'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{testResult.latencyMs} ms</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
