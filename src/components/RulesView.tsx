import React, { useEffect, useState } from 'react';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import type {
  BotProfile,
  BotRule,
  HdEnhancementSettings,
  ListItem,
  QuickButton,
  ReplyType,
  TemplatePresetId,
  TriggerType,
  VideoHdPresetId,
} from '../types/bot';

interface RulesViewProps {
  rules: BotRule[];
  profile: BotProfile;
  hdSettings: HdEnhancementSettings;
  onCreateRule: (rule: Omit<BotRule, 'id' | 'hitCount' | 'updatedAt'>) => Promise<void>;
  onUpdateRule: (id: string, patch: Partial<BotRule>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onApplyPreset: (preset: TemplatePresetId) => Promise<void>;
  onUpdateProfile: (patch: Partial<BotProfile>) => Promise<void>;
  onUpdateHdSettings: (patch: Partial<HdEnhancementSettings>) => Promise<void>;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  keyword: 'Kata Kunci',
  exact: 'Persis (Exact)',
  command: 'Perintah / Sapaan',
  regex: 'Regex',
};

const REPLY_LABELS: Record<ReplyType, string> = {
  text: 'Teks',
  buttons: 'Tombol Cepat',
  list: 'Daftar Menu',
};

interface RuleFormState {
  id?: string;
  name: string;
  triggerType: TriggerType;
  pattern: string;
  replyType: ReplyType;
  replyText: string;
  buttons: QuickButton[];
  listTitle: string;
  listItems: ListItem[];
  priority: number;
  enabled: boolean;
}

const EMPTY_FORM: RuleFormState = {
  name: '',
  triggerType: 'keyword',
  pattern: '',
  replyType: 'text',
  replyText: '',
  buttons: [{ id: 'btn_1', title: 'Menu Utama' }],
  listTitle: 'Pilih Opsi',
  listItems: [{ id: 'item_1', title: 'Opsi Pertama', description: 'Deskripsi singkat opsi' }],
  priority: 10,
  enabled: true,
};

export function RulesView({
  rules,
  profile,
  hdSettings,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onApplyPreset,
  onUpdateProfile,
  onUpdateHdSettings,
}: RulesViewProps) {
  const [search, setSearch] = useState('');
  const [editingForm, setEditingForm] = useState<RuleFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [bizName, setBizName] = useState(profile.businessName);
  const [bizPhone, setBizPhone] = useState(profile.phoneNumberDisplay);
  const [fallbackText, setFallbackText] = useState(profile.greetingFallback);
  const [profileSaved, setProfileSaved] = useState(false);

  const [hdPreset, setHdPreset] = useState<VideoHdPresetId>(hdSettings.defaultPreset);
  const [sharpness, setSharpness] = useState<'normal' | 'strong'>(hdSettings.sharpnessLevel);
  const [maxSizeMb, setMaxSizeMb] = useState(hdSettings.maxStatusSizeMb);
  const [autoCaptionless, setAutoCaptionless] = useState(
    hdSettings.autoProcessWithoutCaption
  );
  const [statusCaption, setStatusCaption] = useState(hdSettings.statusForwardCaption);
  const [hdSaved, setHdSaved] = useState(false);

  useEffect(() => {
    setBizName(profile.businessName);
    setBizPhone(profile.phoneNumberDisplay);
    setFallbackText(profile.greetingFallback);
  }, [profile]);

  useEffect(() => {
    setHdPreset(hdSettings.defaultPreset);
    setSharpness(hdSettings.sharpnessLevel);
    setMaxSizeMb(hdSettings.maxStatusSizeMb);
    setAutoCaptionless(hdSettings.autoProcessWithoutCaption);
    setStatusCaption(hdSettings.statusForwardCaption);
  }, [hdSettings]);

  const filteredRules = [...rules]
    .sort((a, b) => a.priority - b.priority)
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.pattern.toLowerCase().includes(q) ||
        r.replyText.toLowerCase().includes(q)
      );
    });

  function openNewRule() {
    setFormError(null);
    setEditingForm({
      ...EMPTY_FORM,
      priority: rules.length + 1,
    });
  }

  function openEditRule(rule: BotRule) {
    setFormError(null);
    setEditingForm({
      id: rule.id,
      name: rule.name,
      triggerType: rule.triggerType,
      pattern: rule.pattern,
      replyType: rule.replyType,
      replyText: rule.replyText,
      buttons:
        rule.buttons.length > 0 ? rule.buttons : [{ id: 'btn_1', title: 'Menu Utama' }],
      listTitle: rule.listTitle || 'Pilih Opsi',
      listItems:
        rule.listItems.length > 0
          ? rule.listItems
          : [{ id: 'item_1', title: 'Opsi Pertama', description: 'Deskripsi singkat' }],
      priority: rule.priority,
      enabled: rule.enabled,
    });
  }

  function insertVariable(variable: string) {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      replyText: editingForm.replyText
        ? `${editingForm.replyText} ${variable}`
        : variable,
    });
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!editingForm) return;
    setFormError(null);

    if (!editingForm.name.trim() || !editingForm.pattern.trim() || !editingForm.replyText.trim()) {
      setFormError('Nama aturan, pola pemicu, dan teks balasan wajib diisi.');
      return;
    }

    if (editingForm.triggerType === 'regex') {
      try {
        new RegExp(editingForm.pattern);
      } catch {
        setFormError('Ekspresi Regex tidak valid. Periksa tanda kurung atau karakter khusus.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        name: editingForm.name.trim(),
        triggerType: editingForm.triggerType,
        pattern: editingForm.pattern.trim(),
        replyType: editingForm.replyType,
        replyText: editingForm.replyText.trim(),
        buttons: editingForm.replyType === 'buttons' ? editingForm.buttons : [],
        listTitle: editingForm.listTitle,
        listItems: editingForm.replyType === 'list' ? editingForm.listItems : [],
        priority: editingForm.priority,
        enabled: editingForm.enabled,
      };

      if (editingForm.id) {
        await onUpdateRule(editingForm.id, payload);
      } else {
        await onCreateRule(payload);
      }
      setEditingForm(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan aturan.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveHdSettings(e: React.FormEvent) {
    e.preventDefault();
    await onUpdateHdSettings({
      defaultPreset: hdPreset,
      sharpnessLevel: sharpness,
      maxStatusSizeMb: maxSizeMb,
      autoProcessWithoutCaption: autoCaptionless,
      statusForwardCaption: statusCaption,
    });
    setHdSaved(true);
    setTimeout(() => setHdSaved(false), 1800);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    await onUpdateProfile({
      businessName: bizName,
      phoneNumberDisplay: bizPhone,
      greetingFallback: fallbackText,
    });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1800);
  }

  return (
    <div className="space-y-6">
      {/* HD Video Engine Configuration */}
      <form
        onSubmit={handleSaveHdSettings}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Konfigurasi Mesin Peng-HD Video &amp; Anti-Kompresi Status WA
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Berlaku pada Simulator, Webhook Meta Cloud API, dan skrip Baileys yang diekspor.
            </p>
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {hdSaved ? 'Pengaturan HD Tersimpan' : 'Simpan Pengaturan HD'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Mode Default Peng-HD
            </label>
            <select
              value={hdPreset}
              onChange={(e) => setHdPreset(e.target.value as VideoHdPresetId)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="status_hd_1080">Status WA 1080p (.hd)</option>
              <option value="status_60fps_smooth">Status WA 60fps (.hd60)</option>
              <option value="hd_max_doc">Dokumen HD Maks (.hddoc)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tingkat Penajaman (Unsharp)
            </label>
            <select
              value={sharpness}
              onChange={(e) => setSharpness(e.target.value as 'normal' | 'strong')}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="normal">Normal (Alami &amp; Bersih)</option>
              <option value="strong">Kuat (Video Sangat Buram)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Batas Ukuran Status WA (MB)
            </label>
            <input
              type="number"
              min={5}
              max={16}
              value={maxSizeMb}
              onChange={(e) => setMaxSizeMb(Number(e.target.value) || 15)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Pemicu Video di Chat WA
            </label>
            <select
              value={autoCaptionless ? 'auto' : 'caption'}
              onChange={(e) => setAutoCaptionless(e.target.value === 'auto')}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="auto">Otomatis semua video masuk</option>
              <option value="caption">Hanya jika diberi caption .hd</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Caption Balasan Setelah Video Menjadi HD
          </label>
          <textarea
            rows={2}
            value={statusCaption}
            onChange={(e) => setStatusCaption(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </form>

      {/* Toolbar & Presets */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari aturan atau perintah..."
              className="pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 w-64"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onApplyPreset('video_hd')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Bot Peng-HD Video
            </button>
            <button
              type="button"
              onClick={() => onApplyPreset('toko')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Jasa HD Berbayar
            </button>
            <button
              type="button"
              onClick={() => onApplyPreset('saas')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              CS Bantuan
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={openNewRule}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Aturan</span>
        </button>
      </div>

      {/* Rules Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredRules.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-sm font-semibold text-slate-800">Tidak ada aturan yang cocok</p>
            <p className="text-xs text-slate-500 mt-1">
              Tambahkan aturan baru atau muat ulang template Bot Peng-HD Video di atas.
            </p>
            <button
              type="button"
              onClick={openNewRule}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Aturan Baru</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-16">Prioritas</th>
                  <th className="py-3 px-4">Nama Aturan</th>
                  <th className="py-3 px-4">Pemicu &amp; Pola</th>
                  <th className="py-3 px-4">Format Balasan</th>
                  <th className="py-3 px-4 text-right">Terpicu</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums">
                      #{rule.priority}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{rule.name}</div>
                      <div className="text-xs text-slate-500 truncate max-w-xs mt-0.5">
                        {rule.replyText}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs text-slate-500">{TRIGGER_LABELS[rule.triggerType]}</div>
                      <div className="font-mono text-xs text-slate-800 truncate max-w-[220px] mt-0.5">
                        {rule.pattern}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      {REPLY_LABELS[rule.replyType]}
                      {rule.replyType === 'buttons' && ` (${rule.buttons.length})`}
                      {rule.replyType === 'list' && ` (${rule.listItems.length})`}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {rule.hitCount}x
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}
                        className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          rule.enabled
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {rule.enabled ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditRule(rule)}
                          title="Edit aturan"
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRule(rule.id)}
                          title="Hapus aturan"
                          className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bot Profile & Fallback Settings */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Identitas Bot &amp; Balasan Default
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Digunakan saat pesan teks masuk tidak cocok dengan aturan perintah mana pun.
            </p>
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {profileSaved ? 'Tersimpan' : 'Simpan Profil'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Bot / Bisnis
            </label>
            <input
              type="text"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nomor Tampilan WhatsApp
            </label>
            <input
              type="text"
              value={bizPhone}
              onChange={(e) => setBizPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Pesan Balasan Default
          </label>
          <textarea
            rows={2}
            value={fallbackText}
            onChange={(e) => setFallbackText(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </form>

      {/* Modal Rule Editor */}
      {editingForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {editingForm.id ? 'Edit Aturan Bot' : 'Tambah Aturan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingForm(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto p-6 space-y-4">
              {formError && (
                <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Aturan
                  </label>
                  <input
                    type="text"
                    value={editingForm.name}
                    onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                    placeholder="Mis. Panduan Status WA HD"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Prioritas (1 = tertinggi)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={editingForm.priority}
                    onChange={(e) =>
                      setEditingForm({ ...editingForm, priority: Number(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tipe Pemicu
                  </label>
                  <select
                    value={editingForm.triggerType}
                    onChange={(e) =>
                      setEditingForm({
                        ...editingForm,
                        triggerType: e.target.value as TriggerType,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="keyword">Kata Kunci (Mengandung)</option>
                    <option value="command">Perintah / Sapaan</option>
                    <option value="exact">Persis (Exact Match)</option>
                    <option value="regex">Regex (Ekspresi Reguler)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pola Pemicu {editingForm.triggerType !== 'regex' && '(pisahkan dengan koma)'}
                  </label>
                  <input
                    type="text"
                    value={editingForm.pattern}
                    onChange={(e) => setEditingForm({ ...editingForm, pattern: e.target.value })}
                    placeholder=".hd, /hd, /panduan"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Format Balasan WhatsApp
                </label>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                  {(['text', 'buttons', 'list'] as ReplyType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEditingForm({ ...editingForm, replyType: type })}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        editingForm.replyType === type
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {REPLY_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-700">
                    Isi Pesan Balasan (dukung *tebal* dan _miring_)
                  </label>
                  <div className="flex items-center gap-1">
                    {['{{nama}}', '{{nomor}}', '{{waktu}}', '{{pesan}}'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
                      >
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={editingForm.replyText}
                  onChange={(e) => setEditingForm({ ...editingForm, replyText: e.target.value })}
                  placeholder="Tulis balasan bot Anda di sini..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {editingForm.replyType === 'buttons' && (
                <div className="border-t border-slate-200 pt-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Tombol Balasan Cepat (Maks. 3)
                    </span>
                    {editingForm.buttons.length < 3 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingForm({
                            ...editingForm,
                            buttons: [
                              ...editingForm.buttons,
                              {
                                id: `btn_${editingForm.buttons.length + 1}`,
                                title: 'Tombol Baru',
                              },
                            ],
                          })
                        }
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                      >
                        + Tambah Tombol
                      </button>
                    )}
                  </div>

                  {editingForm.buttons.map((btn, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={20}
                        value={btn.title}
                        onChange={(e) => {
                          const next = [...editingForm.buttons];
                          next[idx] = { ...next[idx], title: e.target.value };
                          setEditingForm({ ...editingForm, buttons: next });
                        }}
                        className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                      />
                      {editingForm.buttons.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingForm({
                              ...editingForm,
                              buttons: editingForm.buttons.filter((_, i) => i !== idx),
                            })
                          }
                          className="p-1.5 text-slate-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editingForm.replyType === 'list' && (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Daftar Menu Interaktif
                    </span>
                    {editingForm.listItems.length < 6 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingForm({
                            ...editingForm,
                            listItems: [
                              ...editingForm.listItems,
                              {
                                id: `item_${editingForm.listItems.length + 1}`,
                                title: 'Opsi Baru',
                                description: 'Keterangan opsi',
                              },
                            ],
                          })
                        }
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                      >
                        + Tambah Opsi
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Judul Tombol Pembuka List
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={editingForm.listTitle}
                      onChange={(e) =>
                        setEditingForm({ ...editingForm, listTitle: e.target.value })
                      }
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>

                  {editingForm.listItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        maxLength={24}
                        value={item.title}
                        onChange={(e) => {
                          const next = [...editingForm.listItems];
                          next[idx] = { ...next[idx], title: e.target.value };
                          setEditingForm({ ...editingForm, listItems: next });
                        }}
                        className="col-span-5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        maxLength={72}
                        value={item.description}
                        onChange={(e) => {
                          const next = [...editingForm.listItems];
                          next[idx] = { ...next[idx], description: e.target.value };
                          setEditingForm({ ...editingForm, listItems: next });
                        }}
                        className="col-span-6 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                      />
                      {editingForm.listItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingForm({
                              ...editingForm,
                              listItems: editingForm.listItems.filter((_, i) => i !== idx),
                            })
                          }
                          className="col-span-1 p-1.5 text-slate-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingForm(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Aturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
