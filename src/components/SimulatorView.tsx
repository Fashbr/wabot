import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Copy,
  Download,
  Film,
  Forward,
  List,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import type {
  BotProfile,
  ListItem,
  QuickButton,
  ReplyType,
  SimulationResponse,
  VideoHdPresetId,
  VideoJobResult,
} from '../types/bot';
import { WhatsAppText } from './WhatsAppText';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  replyType?: ReplyType;
  buttons?: QuickButton[];
  listTitle?: string;
  listItems?: ListItem[];
  matchedRuleName?: string;
  videoUrl?: string;
  videoMetaSummary?: string;
  downloadUrl?: string;
  videoJob?: VideoJobResult;
}

interface SimulatorViewProps {
  profile: BotProfile;
  defaultPreset: VideoHdPresetId;
  onToggleBotActive: (next: boolean) => Promise<void>;
  onSimulationCompleted: () => void;
}

const DEMO_CONTACTS = [
  { name: 'Budi Santoso', phone: '6281298765432' },
  { name: 'Rina Wijaya', phone: '6281355501928' },
  { name: 'Andi Pratama', phone: '6285711223344' },
];

const QUICK_TEST_PROMPTS = ['/menu', '/preset', '/panduan', 'kenapa buram?'];

const PRESET_OPTIONS: Array<{ id: VideoHdPresetId; label: string }> = [
  { id: 'status_hd_1080', label: '.hd Status 1080p' },
  { id: 'status_60fps_smooth', label: '.hd60 Mulus 60fps' },
  { id: 'hd_max_doc', label: '.hddoc HD Maksimal' },
];

function formatClock(date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SimulatorView({
  profile,
  defaultPreset,
  onToggleBotActive,
  onSimulationCompleted,
}: SimulatorViewProps) {
  const [contactIdx, setContactIdx] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<VideoHdPresetId>(defaultPreset);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'bot',
      text: `Halo! Saya *${profile.businessName}*.\nUnggah video buram Anda (klik ikon klip di bawah atau *Uji Video Contoh*) — bot akan memprosesnya dengan FFmpeg menjadi *1080p HD Anti-Kompresi Status WA*.`,
      timestamp: formatClock(),
      replyType: 'buttons',
      buttons: [
        { id: 'init_preset', title: '/preset' },
        { id: 'init_panduan', title: '/panduan' },
      ],
      matchedRuleName: 'Sambutan Bot Peng-HD',
    },
  ]);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [lastTrace, setLastTrace] = useState<SimulationResponse | null>(null);
  const [lastVideoJob, setLastVideoJob] = useState<VideoJobResult | null>(null);
  const [inspectorMode, setInspectorMode] = useState<'video' | 'text'>('video');
  const [statusPreviewJob, setStatusPreviewJob] = useState<VideoJobResult | null>(null);
  const [activeListDrawer, setActiveListDrawer] = useState<{
    title: string;
    items: ListItem[];
  } | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeContact = DEMO_CONTACTS[contactIdx];

  useEffect(() => {
    setSelectedPreset(defaultPreset);
  }, [defaultPreset]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending, isProcessingVideo]);

  async function sendSimulatedMessage(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || isSending || isProcessingVideo) return;

    setErrorMsg(null);
    setActiveListDrawer(null);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: formatClock(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          senderName: activeContact.name,
          from: activeContact.phone,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal menjalankan simulasi bot.');
      }

      const data = (await res.json()) as SimulationResponse;
      setLastTrace(data);
      setInspectorMode('text');

      if (data.replyText) {
        const botMsg: ChatMessage = {
          id: `b-${Date.now()}`,
          sender: 'bot',
          text: data.replyText,
          timestamp: formatClock(),
          replyType: data.replyType,
          buttons: data.buttons,
          listTitle: data.listTitle,
          listItems: data.listItems,
          matchedRuleName: data.matchedRule
            ? data.matchedRule.name
            : 'Balasan Default (Fallback)',
        };
        setMessages((prev) => [...prev, botMsg]);
      }

      onSimulationCompleted();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan jaringan.');
    } finally {
      setIsSending(false);
    }
  }

  function appendVideoResultToChat(job: VideoJobResult, fileLabel: string) {
    const presetCmd =
      PRESET_OPTIONS.find((p) => p.id === job.preset)?.label || job.preset;

    const userMsg: ChatMessage = {
      id: `uv-${Date.now()}`,
      sender: 'user',
      text: `Mengirim video: *${fileLabel}*\nMode: ${presetCmd}`,
      timestamp: formatClock(),
      videoUrl: job.inputUrl,
      videoMetaSummary: `Asli: ${job.before.width}×${job.before.height} · ${job.before.fps}fps · ${formatMb(job.before.sizeBytes)}`,
    };

    const botMsg: ChatMessage = {
      id: `bv-${Date.now() + 1}`,
      sender: 'bot',
      text: job.captionReply,
      timestamp: formatClock(),
      matchedRuleName: job.presetLabel,
      videoUrl: job.outputUrl,
      downloadUrl: job.downloadUrl,
      videoJob: job,
      videoMetaSummary: `Hasil HD: ${job.after.width}×${job.after.height} · ${job.after.fps}fps · ${formatMb(job.after.sizeBytes)}`,
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setLastVideoJob(job);
    setInspectorMode('video');
    onSimulationCompleted();
  }

  async function handleUploadVideo(file: File) {
    if (isProcessingVideo || isSending) return;
    setErrorMsg(null);
    setIsProcessingVideo(true);

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('preset', selectedPreset);
      formData.append('senderName', activeContact.name);
      formData.append('from', activeContact.phone);

      const res = await fetch('/api/video/enhance', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal memproses video di server.');
      }

      const job = (await res.json()) as VideoJobResult;
      appendVideoResultToChat(job, file.name);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengunggah video.');
    } finally {
      setIsProcessingVideo(false);
    }
  }

  async function handleRunDemoVideo() {
    if (isProcessingVideo || isSending) return;
    setErrorMsg(null);
    setIsProcessingVideo(true);

    try {
      const res = await fetch('/api/video/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: selectedPreset,
          senderName: activeContact.name,
          from: activeContact.phone,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal menjalankan demo peng-HD video.');
      }

      const job = (await res.json()) as VideoJobResult;
      appendVideoResultToChat(job, job.originalName);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses video contoh.');
    } finally {
      setIsProcessingVideo(false);
    }
  }

  function handleResetChat() {
    setMessages([
      {
        id: `reset-${Date.now()}`,
        sender: 'bot',
        text: `Sesi obrolan direset. Unggah video atau ketik */menu* untuk menguji *${profile.businessName}*.`,
        timestamp: formatClock(),
        replyType: 'buttons',
        buttons: [
          { id: 'r_preset', title: '/preset' },
          { id: 'r_panduan', title: '/panduan' },
        ],
      },
    ]);
    setLastTrace(null);
    setLastVideoJob(null);
    setErrorMsg(null);
  }

  function handleCopyPayload() {
    const targetPayload =
      inspectorMode === 'video' && lastVideoJob
        ? lastVideoJob.outboundMetaPayload
        : lastTrace?.outboundPayload;
    if (!targetPayload) return;
    navigator.clipboard.writeText(JSON.stringify(targetPayload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 1800);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Left: WhatsApp Chat & Video HD Simulator */}
      <section className="lg:col-span-7 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden min-h-[660px] max-h-[800px]">
        {/* Phone Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {!avatarFailed ? (
              <img
                src="/src/assets/images/wabot_business_avatar_1795257057115.jpg"
                alt={profile.businessName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-10 h-10 rounded-full object-cover border border-white/15 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-emerald-700 flex items-center justify-center shrink-0">
                <Film className="w-5 h-5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">{profile.businessName}</h2>
              <p className="text-xs text-slate-300 truncate font-mono">
                {profile.phoneNumberDisplay} · {profile.isBotActive ? 'Bot Aktif' : 'Bot Dijeda'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Pilih kontak penguji"
              value={contactIdx}
              onChange={(e) => setContactIdx(Number(e.target.value))}
              className="bg-slate-800 text-slate-100 text-xs rounded-lg px-2.5 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {DEMO_CONTACTS.map((c, idx) => (
                <option key={c.phone} value={idx}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleResetChat}
              title="Reset percakapan"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chat Messages Canvas */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#EFEAE2]"
          style={{
            backgroundImage:
              'radial-gradient(rgba(15, 23, 42, 0.04) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <div className="flex justify-center pb-1">
            <span className="text-[11px] font-medium text-slate-600 bg-white/85 px-3 py-1 rounded-md border border-slate-200/70">
              Simulasi sebagai {activeContact.name} · {activeContact.phone}
            </span>
          </div>

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-[#D9FDD3] text-slate-900 rounded-tr-xs'
                    : 'bg-white text-slate-900 rounded-tl-xs border border-slate-200/80'
                }`}
              >
                {msg.videoUrl && (
                  <div className="mb-2.5 overflow-hidden rounded-lg bg-slate-950 border border-slate-200">
                    <video
                      src={msg.videoUrl}
                      controls
                      playsInline
                      className="w-full max-h-64 object-contain bg-black"
                    />
                    {msg.videoMetaSummary && (
                      <div className="px-2.5 py-1.5 bg-slate-900 text-slate-200 font-mono text-[11px] tabular-nums">
                        {msg.videoMetaSummary}
                      </div>
                    )}
                  </div>
                )}

                <WhatsAppText text={msg.text} />

                {msg.sender === 'bot' && msg.videoJob && (
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
                    <a
                      href={msg.downloadUrl}
                      download
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-md transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh Video HD</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setStatusPreviewJob(msg.videoJob || null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors cursor-pointer"
                    >
                      <Forward className="w-3.5 h-3.5" />
                      <span>Pratinjau Status WA</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-end gap-1.5 mt-1.5 text-[11px] text-slate-500 tabular-nums">
                  {msg.matchedRuleName && (
                    <>
                      <span className="truncate max-w-[200px]">{msg.matchedRuleName}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{msg.timestamp}</span>
                  {msg.sender === 'user' && (
                    <CheckCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  )}
                </div>
              </div>

              {msg.sender === 'bot' &&
                msg.replyType === 'buttons' &&
                msg.buttons &&
                msg.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[85%]">
                    {msg.buttons.map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => sendSimulatedMessage(btn.title)}
                        className="px-3.5 py-2 text-xs font-medium text-emerald-800 bg-white hover:bg-emerald-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {btn.title}
                      </button>
                    ))}
                  </div>
                )}

              {msg.sender === 'bot' &&
                msg.replyType === 'list' &&
                msg.listItems &&
                msg.listItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveListDrawer({
                        title: msg.listTitle || 'Pilih Menu',
                        items: msg.listItems || [],
                      })
                    }
                    className="mt-1.5 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <List className="w-3.5 h-3.5" />
                    {msg.listTitle || 'Pilih Menu'}
                  </button>
                )}
            </div>
          ))}

          {(isSending || isProcessingVideo) && (
            <div className="flex items-start">
              <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-600">
                {isProcessingVideo
                  ? 'FFmpeg sedang menjernihkan video & mengunci profil Status WA HD...'
                  : 'Bot sedang memproses pesan...'}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* List Menu Drawer */}
        {activeListDrawer && (
          <div className="border-t border-slate-200 bg-white px-5 py-3.5 shrink-0">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold text-slate-900">
                {activeListDrawer.title}
              </h3>
              <button
                type="button"
                onClick={() => setActiveListDrawer(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
              {activeListDrawer.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => sendSimulatedMessage(item.title)}
                  className="w-full text-left py-2 px-2 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold text-slate-900">{item.title}</div>
                  {item.description && (
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.description}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Video Preset Selector + Quick Chips + Input Bar */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 space-y-2.5 shrink-0">
          {/* Preset Mode & Demo Video Trigger */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              {PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedPreset(opt.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedPreset === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={isProcessingVideo || isSending}
              onClick={handleRunDemoVideo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Uji Video Contoh 360p</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="text-[11px] text-slate-500 shrink-0 mr-1">Perintah teks:</span>
            {QUICK_TEST_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendSimulatedMessage(prompt)}
                className="px-2.5 py-1 text-[11px] font-mono text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">
              {errorMsg}
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleUploadVideo(file);
                e.target.value = '';
              }
            }}
          />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendSimulatedMessage(input);
            }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              disabled={isProcessingVideo || isSending}
              onClick={() => fileInputRef.current?.click()}
              title="Unggah video untuk di-HD-kan"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Paperclip className="w-4 h-4" />
              <span>Upload Video</span>
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Atau ketik perintah (/menu, /panduan)..."
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending || isProcessingVideo}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Kirim</span>
            </button>
          </form>
        </div>
      </section>

      {/* Right: Technical FFmpeg Inspector & Anti-Compression Checklist */}
      <aside className="lg:col-span-5 flex flex-col gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Status Bot Peng-HD Video</h3>
              <p className="text-xs text-slate-500 mt-1">
                Otomatis memproses video masuk dan webhook WhatsApp Cloud API.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleBotActive(!profile.isBotActive)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                profile.isBotActive
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
              }`}
            >
              {profile.isBotActive ? 'Bot Aktif' : 'Bot Dijeda'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 text-xs">
            <div>
              <div className="text-slate-500">Kontak Penguji</div>
              <div className="font-medium text-slate-900 mt-0.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>{activeContact.name}</span>
              </div>
            </div>
            <div>
              <div className="text-slate-500">Target Anti-Buram WA</div>
              <div className="font-mono text-slate-700 mt-0.5">
                H.264 · yuv420p · &lt; 15 MB
              </div>
            </div>
          </div>
        </div>

        {/* Inspector Panel */}
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setInspectorMode('video')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  inspectorMode === 'video'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inspeksi Video HD
              </button>
              <button
                type="button"
                onClick={() => setInspectorMode('text')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  inspectorMode === 'text'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Payload Webhook
              </button>
            </div>

            {(lastVideoJob || lastTrace) && (
              <button
                type="button"
                onClick={handleCopyPayload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedPayload ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin JSON</span>
                  </>
                )}
              </button>
            )}
          </div>

          {inspectorMode === 'video' ? (
            !lastVideoJob ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4">
                <Film className="w-8 h-8 text-slate-300 mb-2.5" />
                <p className="text-sm font-medium text-slate-700">
                  Belum ada video yang di-HD-kan
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Klik <strong>Upload Video</strong> atau <strong>Uji Video Contoh 360p</strong> di
                  simulator untuk melihat perbandingan resolusi, bitrate, dan kompatibilitas Status
                  WhatsApp.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col mt-4 space-y-4">
                {/* Before vs After Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2 px-3 font-medium">Parameter</th>
                        <th className="py-2 px-3 font-medium">Sebelum</th>
                        <th className="py-2 px-3 font-medium text-emerald-800">Sesudah (HD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      <tr>
                        <td className="py-2 px-3 font-sans text-slate-600">Resolusi</td>
                        <td className="py-2 px-3 text-slate-700">
                          {lastVideoJob.before.width}×{lastVideoJob.before.height}
                        </td>
                        <td className="py-2 px-3 font-semibold text-emerald-800">
                          {lastVideoJob.after.width}×{lastVideoJob.after.height}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans text-slate-600">FPS</td>
                        <td className="py-2 px-3 text-slate-700">{lastVideoJob.before.fps}</td>
                        <td className="py-2 px-3 font-semibold text-emerald-800">
                          {lastVideoJob.after.fps}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans text-slate-600">Bitrate</td>
                        <td className="py-2 px-3 text-slate-700">
                          {lastVideoJob.before.bitrateKbps} kbps
                        </td>
                        <td className="py-2 px-3 font-semibold text-emerald-800">
                          {lastVideoJob.after.bitrateKbps} kbps
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans text-slate-600">Ukuran</td>
                        <td className="py-2 px-3 text-slate-700">
                          {formatMb(lastVideoJob.before.sizeBytes)}
                        </td>
                        <td className="py-2 px-3 font-semibold text-emerald-800">
                          {formatMb(lastVideoJob.after.sizeBytes)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* WhatsApp Status Safe Checklist */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span>Kesiapan Teruskan ke Status WA</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {lastVideoJob.processTimeMs} ms
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="text-slate-700">
                      {lastVideoJob.statusChecklist.underSizeLimit ? 'Lolos:' : 'Melebihi:'} Ukuran
                      Aman
                    </div>
                    <div className="text-slate-700">
                      {lastVideoJob.statusChecklist.h264Yuv420p ? 'Lolos:' : 'Perlu cek:'} H.264
                      yuv420p
                    </div>
                    <div className="text-slate-700">Lolos: Faststart Moov</div>
                    <div className="text-slate-700">
                      {lastVideoJob.statusChecklist.optimalBitrate ? 'Lolos:' : 'Tinggi:'} Bitrate
                      Anti-Kompresi
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-600 mb-1.5">
                    Argumen FFmpeg yang Dijalankan Server
                  </div>
                  <pre className="bg-slate-950 text-slate-100 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-40 leading-relaxed">
                    {`ffmpeg ${lastVideoJob.ffmpegArgs.join(' ')}`}
                  </pre>
                </div>
              </div>
            )
          ) : !lastTrace && !lastVideoJob ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4">
              <MessageSquare className="w-8 h-8 text-slate-300 mb-2.5" />
              <p className="text-sm font-medium text-slate-700">Belum ada payload</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Kirim pesan teks atau video untuk melihat struktur JSON Meta Cloud API.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col mt-4 space-y-3">
              <pre className="flex-1 bg-slate-950 text-slate-100 rounded-lg p-3.5 text-xs font-mono overflow-auto max-h-[380px] leading-relaxed">
                {JSON.stringify(
                  lastTrace?.outboundPayload || lastVideoJob?.outboundMetaPayload || {},
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>
      </aside>

      {/* WhatsApp Status Forward Preview Modal */}
      {statusPreviewJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden text-white flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <div className="text-xs font-semibold">Pratinjau Status WhatsApp (9:16)</div>
                <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                  {statusPreviewJob.after.width}×{statusPreviewJob.after.height} ·{' '}
                  {formatMb(statusPreviewJob.after.sizeBytes)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatusPreviewJob(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-black flex items-center justify-center p-3">
              <video
                src={statusPreviewJob.outputUrl}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-[460px] w-full object-contain rounded-lg"
              />
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Video ini sudah dikunci pada profil <strong>H.264 High · yuv420p · faststart</strong>{' '}
                di bawah batas kompresi Status WA sehingga saat Anda tekan{' '}
                <strong>Teruskan → Status Saya</strong>, ketajamannya tetap terjaga.
              </p>
              <a
                href={statusPreviewJob.downloadUrl}
                download
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Simpan Video HD ke Perangkat</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
