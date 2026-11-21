import type {
  BotProfile,
  BotRule,
  HdEnhancementSettings,
  ReplyType,
  TemplatePresetId,
  VideoHdPresetId,
} from '../types/bot.ts';

export const DEFAULT_PROFILE: BotProfile = {
  businessName: 'Wabot HD Video',
  phoneNumberDisplay: '+62 811-2345-6789',
  greetingFallback:
    'Halo {{nama}}! Kirimkan video Anda langsung ke chat ini (atau beri caption *.hd*), maka bot akan menjernihkan resolusinya menjadi HD agar tetap tajam saat diteruskan ke Status WhatsApp.\n\nKetik */menu* untuk melihat daftar perintah.',
  isBotActive: true,
};

export const DEFAULT_HD_SETTINGS: HdEnhancementSettings = {
  defaultPreset: 'status_hd_1080',
  autoProcessWithoutCaption: true,
  sharpnessLevel: 'normal',
  maxStatusSizeMb: 15,
  statusForwardCaption:
    'Video HD siap diteruskan ke Status WhatsApp!\nResolusi sudah dioptimalkan dengan profil H.264 High + yuv420p + faststart di bawah 15 MB agar tidak dikompres ulang menjadi buram oleh WhatsApp.',
};

export const VIDEO_PRESET_INFO: Record<
  VideoHdPresetId,
  { label: string; shortDesc: string; command: string }
> = {
  status_hd_1080: {
    label: 'Status WA HD 1080p (Anti Buram)',
    shortDesc: 'Upscale 1080p Lanczos + penajaman tepi + bitrate aman < 15 MB',
    command: '.hd',
  },
  status_60fps_smooth: {
    label: 'Status WA Mulus 60fps (720p)',
    shortDesc: 'Gerakan halus 60fps dengan profil warna yuv420p untuk Status WA',
    command: '.hd60',
  },
  hd_max_doc: {
    label: 'Dokumen / HD Maksimal 1080p',
    shortDesc: 'Kualitas tertinggi CRF 18 untuk dikirim sebagai file atau chat HD',
    command: '.hddoc',
  },
};

export function getPresetRules(preset: TemplatePresetId): BotRule[] {
  const now = new Date().toISOString();

  if (preset === 'toko') {
    return [
      {
        id: 'rule-toko-menu',
        name: 'Menu Layanan Toko',
        triggerType: 'command',
        pattern: '/menu, menu, halo, hai',
        replyType: 'buttons',
        replyText:
          'Halo {{nama}}! Selamat datang di *Wabot HD Video & Store*. Pilih layanan di bawah:',
        buttons: [
          { id: 'btn_hd_guide', title: '.hd' },
          { id: 'btn_katalog', title: 'harga' },
          { id: 'btn_admin', title: 'admin' },
        ],
        listTitle: 'Menu',
        listItems: [],
        priority: 1,
        enabled: true,
        hitCount: 0,
        updatedAt: now,
      },
      {
        id: 'rule-toko-harga',
        name: 'Daftar Paket Bot HD',
        triggerType: 'keyword',
        pattern: 'harga, paket, biaya, langganan',
        replyType: 'text',
        replyText:
          'Paket berlangganan Bot Peng-HD Video WhatsApp:\n- Harian: Rp 5.000 (sepuasnya)\n- Bulanan: Rp 35.000 (prioritas cepat)\n\nKirim video untuk coba gratis sekarang!',
        buttons: [],
        listTitle: 'Menu',
        listItems: [],
        priority: 2,
        enabled: true,
        hitCount: 0,
        updatedAt: now,
      },
    ];
  }

  if (preset === 'saas') {
    return [
      {
        id: 'rule-saas-menu',
        name: 'Menu Support Teknis',
        triggerType: 'command',
        pattern: '/menu, /help, halo, bantuan',
        replyType: 'buttons',
        replyText: 'Halo {{nama}}, butuh bantuan terkait pemrosesan video HD WhatsApp?',
        buttons: [
          { id: 'btn_panduan', title: '/panduan' },
          { id: 'btn_preset', title: '/preset' },
          { id: 'btn_admin', title: 'admin' },
        ],
        listTitle: 'Menu',
        listItems: [],
        priority: 1,
        enabled: true,
        hitCount: 0,
        updatedAt: now,
      },
    ];
  }

  // Default: Bot Peng-HD Video WhatsApp
  return [
    {
      id: 'rule-hd-menu',
      name: 'Menu Utama Bot Peng-HD Video',
      triggerType: 'command',
      pattern: '/menu, /start, menu, halo, hai, assalamualaikum',
      replyType: 'buttons',
      replyText:
        'Halo {{nama}}! Saya *Bot Peng-HD Video WhatsApp*.\nKirimkan video apa saja ke chat ini agar dijernihkan menjadi HD dan tetap tajam saat diteruskan ke Status WA.',
      buttons: [
        { id: 'btn_preset', title: '/preset' },
        { id: 'btn_panduan', title: '/panduan' },
        { id: 'btn_tips', title: 'Kenapa Status WA Buram?' },
      ],
      listTitle: 'Menu Utama',
      listItems: [],
      priority: 1,
      enabled: true,
      hitCount: 12,
      updatedAt: now,
    },
    {
      id: 'rule-hd-preset',
      name: 'Pilih Preset Peng-HD (.hd / .hd60 / .hddoc)',
      triggerType: 'command',
      pattern: '/preset, preset, mode, kualitas',
      replyType: 'list',
      replyText:
        'Berikut mode Peng-HD yang tersedia. Tambahkan kode perintah pada caption video Anda (atau kirim video langsung untuk mode otomatis 1080p):',
      buttons: [],
      listTitle: 'Lihat Mode HD',
      listItems: [
        {
          id: 'mode_hd',
          title: '.hd (Status WA 1080p)',
          description: 'Anti-buram: Lanczos 1080p + tajam + aman < 15 MB',
        },
        {
          id: 'mode_hd60',
          title: '.hd60 (Mulus 60fps)',
          description: '720p 60fps halus untuk video jedag-jedug / gaming',
        },
        {
          id: 'mode_hddoc',
          title: '.hddoc (HD Maksimal)',
          description: 'Kualitas Full HD CRF 18 untuk dikirim ke chat / dokumen',
        },
      ],
      priority: 2,
      enabled: true,
      hitCount: 8,
      updatedAt: now,
    },
    {
      id: 'rule-hd-cmd',
      name: 'Perintah Caption .hd / .hd60 / .hddoc',
      triggerType: 'command',
      pattern: '.hd, /hd, .hd60, /hd60, .hddoc, /hddoc',
      replyType: 'text',
      replyText:
        'Siap {{nama}}! Silakan unggah atau kirim video Anda sekarang (gunakan tombol klip / upload video di simulator, atau kirim langsung di WhatsApp dengan caption *{{pesan}}*). Bot akan otomatis memprosesnya.',
      buttons: [],
      listTitle: 'Menu',
      listItems: [],
      priority: 3,
      enabled: true,
      hitCount: 6,
      updatedAt: now,
    },
    {
      id: 'rule-hd-panduan',
      name: 'Panduan Teruskan ke Status WA Tetap HD',
      triggerType: 'keyword',
      pattern: 'panduan, /panduan, cara, tutorial, teruskan, forward',
      replyType: 'text',
      replyText:
        '*Cara Agar Video Tetap HD di Status WhatsApp:*\n1. Kirim video buram/biasa ke bot ini.\n2. Tunggu balasan video hasil proses dari bot (sudah dikunci di < 15 MB, profil H.264 High, yuv420p, dan faststart).\n3. Tekan tahan video balasan bot -> pilih *Teruskan (Forward)* -> pilih *Status Saya*.\n4. Jangan memotong durasi ulang di editor Status WA agar file tidak di-encode ulang oleh WhatsApp.',
      buttons: [],
      listTitle: 'Menu',
      listItems: [],
      priority: 4,
      enabled: true,
      hitCount: 5,
      updatedAt: now,
    },
    {
      id: 'rule-hd-buram',
      name: 'Penjelasan Anti-Kompresi Status WA',
      triggerType: 'keyword',
      pattern: 'buram, pecah, blur, kompres, kenapa',
      replyType: 'text',
      replyText:
        'WhatsApp mengompres Status hingga pecah jika ukuran file > 16 MB, bitrate tidak stabil, atau format piksel bukan `yuv420p`.\nBot ini menaikkan ketajaman (*unsharp* + *Lanczos upscale*), membersihkan noise kompresi lama (*hqdn3d*), lalu mengunci bitrate & ukuran < 15 MB supaya server WhatsApp meloloskan video tetap jernih.',
      buttons: [],
      listTitle: 'Menu',
      listItems: [],
      priority: 5,
      enabled: true,
      hitCount: 4,
      updatedAt: now,
    },
    {
      id: 'rule-hd-admin',
      name: 'Hubungi Admin',
      triggerType: 'keyword',
      pattern: 'admin, cs, operator, bantuan',
      replyType: 'text',
      replyText:
        'Halo {{nama}}, laporan Anda pada pukul {{waktu}} sudah diteruskan ke admin pengelola bot.',
      buttons: [],
      listTitle: 'Menu',
      listItems: [],
      priority: 6,
      enabled: true,
      hitCount: 2,
      updatedAt: now,
    },
  ];
}

export function interpolateVariables(
  template: string,
  ctx: { senderName: string; from: string; message: string }
): string {
  const nowStr = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  return template
    .replace(/\{\{\s*nama\s*\}\}/gi, ctx.senderName || 'Pelanggan')
    .replace(/\{\{\s*nomor\s*\}\}/gi, ctx.from || '-')
    .replace(/\{\{\s*waktu\s*\}\}/gi, nowStr)
    .replace(/\{\{\s*pesan\s*\}\}/gi, ctx.message || '');
}

function splitPatterns(pattern: string): string[] {
  return pattern
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function matchRule(
  rules: BotRule[],
  incomingText: string
): { rule: BotRule | null; matchType: string } {
  const normalized = incomingText.trim().toLowerCase();
  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (rule.triggerType === 'regex') {
      if (rule.pattern.length > 160) {
        continue;
      }
      try {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(incomingText.trim())) {
          return { rule, matchType: 'Regex' };
        }
      } catch {
        continue;
      }
    } else if (rule.triggerType === 'exact') {
      const patterns = splitPatterns(rule.pattern);
      if (patterns.some((p) => normalized === p.toLowerCase())) {
        return { rule, matchType: 'Persis (Exact)' };
      }
    } else if (rule.triggerType === 'command') {
      const patterns = splitPatterns(rule.pattern);
      const firstToken = normalized.split(/\s+/)[0] || '';
      if (
        patterns.some((p) => {
          const lp = p.toLowerCase();
          return normalized === lp || firstToken === lp;
        })
      ) {
        return { rule, matchType: 'Perintah / Sapaan' };
      }
    } else {
      const patterns = splitPatterns(rule.pattern);
      if (patterns.some((p) => normalized.includes(p.toLowerCase()))) {
        return { rule, matchType: 'Kata Kunci' };
      }
    }
  }

  return { rule: null, matchType: 'Fallback Default' };
}

export function buildMetaCloudPayload(params: {
  to: string;
  replyType: ReplyType;
  replyText: string;
  buttons?: { id: string; title: string }[];
  listTitle?: string;
  listItems?: { id: string; title: string; description: string }[];
}): Record<string, unknown> {
  const cleanTo = params.to.replace(/[^0-9]/g, '') || '6281234567890';

  if (params.replyType === 'buttons' && params.buttons && params.buttons.length > 0) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: params.replyText },
        action: {
          buttons: params.buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: {
              id: b.id.slice(0, 256),
              title: b.title.slice(0, 20),
            },
          })),
        },
      },
    };
  }

  if (params.replyType === 'list' && params.listItems && params.listItems.length > 0) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: params.replyText },
        action: {
          button: (params.listTitle || 'Pilih Menu').slice(0, 20),
          sections: [
            {
              title: 'Opsi Tersedia',
              rows: params.listItems.slice(0, 10).map((item) => ({
                id: item.id.slice(0, 200),
                title: item.title.slice(0, 24),
                description: item.description.slice(0, 72),
              })),
            },
          ],
        },
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
    type: 'text',
    text: {
      preview_url: false,
      body: params.replyText,
    },
  };
}
