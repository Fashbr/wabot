import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {
  buildMetaCloudPayload,
  DEFAULT_HD_SETTINGS,
  DEFAULT_PROFILE,
  getPresetRules,
  interpolateVariables,
  matchRule,
  VIDEO_PRESET_INFO,
} from './src/lib/botEngine.ts';
import { generateBaileysScript, generateCloudApiSnippet } from './src/lib/codeGenerator.ts';
import {
  cleanupOldVideos,
  createDemoLowResVideo,
  enhanceVideoForWhatsApp,
  ensureVideoDir,
  probeVideo,
  safeResolveVideoPath,
  VIDEO_STORAGE_DIR,
} from './src/lib/videoProcessor.ts';
import type {
  BotProfile,
  BotRule,
  HdEnhancementSettings,
  ReplyType,
  TemplatePresetId,
  VideoHdPresetId,
  VideoJobResult,
  WebhookLogEntry,
} from './src/types/bot.ts';

dotenv.config();
ensureVideoDir();

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

app.use(
  express.json({
    limit: '1mb',
    verify: (req: RequestWithRawBody, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

let botProfile: BotProfile = { ...DEFAULT_PROFILE };
let botRules: BotRule[] = getPresetRules('video_hd');
let hdSettings: HdEnhancementSettings = { ...DEFAULT_HD_SETTINGS };
const webhookLogs: WebhookLogEntry[] = [];
const processedMessageIds = new Set<string>();
const videoJobs = new Map<string, { inputPath: string; outputPath: string; originalName: string }>();

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/3gpp',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureVideoDir();
      cb(null, VIDEO_STORAGE_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.mp4', '.mov', '.webm', '.mkv', '.3gp'].includes(ext) ? ext : '.mp4';
      cb(null, `upload-${crypto.randomUUID()}${safeExt}`);
    },
  }),
  limits: {
    fileSize: 60 * 1024 * 1024, // 60 MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const validExt = ['.mp4', '.mov', '.webm', '.mkv', '.3gp'].includes(ext);
    if (ALLOWED_VIDEO_MIMES.has(file.mimetype) || validExt) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Unggah video MP4, MOV, WebM, atau MKV.'));
    }
  },
});

function pushLog(entry: WebhookLogEntry) {
  webhookLogs.unshift(entry);
  if (webhookLogs.length > 200) {
    webhookLogs.length = 200;
  }
}

function getValidatedPhoneNumberId(): string | null {
  const raw = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '';
  if (!/^\d{5,30}$/.test(raw)) {
    return null;
  }
  return raw;
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyMetaSignature(req: RequestWithRawBody): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) {
    return true;
  }
  const signatureHeader = req.header('x-hub-signature-256') || '';
  if (!signatureHeader.startsWith('sha256=') || !req.rawBody) {
    return false;
  }
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
  return timingSafeCompare(signatureHeader, expected);
}

function isAllowedMetaMediaUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    return (
      parsed.hostname === 'lookaside.fbsbx.com' ||
      parsed.hostname.endsWith('.fbsbx.com') ||
      parsed.hostname === 'graph.facebook.com'
    );
  } catch {
    return false;
  }
}

async function sendToWhatsAppGraphApi(
  payload: Record<string, unknown>
): Promise<{ status: 'sent' | 'failed' | 'skipped'; response?: unknown }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = getValidatedPhoneNumberId();

  if (!accessToken || !phoneNumberId) {
    return { status: 'skipped' };
  }

  try {
    const endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    return { status: res.ok ? 'sent' : 'failed', response: data };
  } catch (err) {
    return { status: 'failed', response: { error: String(err) } };
  }
}

async function fetchAndEnhanceMetaVideo(params: {
  mediaId: string;
  preset: VideoHdPresetId;
}): Promise<{ mediaId: string } | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = getValidatedPhoneNumberId();
  if (!accessToken || !phoneNumberId) return null;
  if (!/^[a-zA-Z0-9_-]{5,120}$/.test(params.mediaId)) return null;

  const metaInfoRes = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(params.mediaId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaInfoRes.ok) return null;
  const metaInfo = (await metaInfoRes.json()) as { url?: string };
  if (!metaInfo.url || !isAllowedMetaMediaUrl(metaInfo.url)) return null;

  const mediaDownload = await fetch(metaInfo.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaDownload.ok) return null;

  const arrayBuf = await mediaDownload.arrayBuffer();
  const jobId = crypto.randomUUID();
  const inPath = safeResolveVideoPath(`meta-in-${jobId}.mp4`);
  const outPath = safeResolveVideoPath(`meta-hd-${jobId}.mp4`);

  try {
    await fs.promises.writeFile(inPath, Buffer.from(arrayBuf));
    const before = await probeVideo(inPath);
    await enhanceVideoForWhatsApp({
      inputPath: inPath,
      outputPath: outPath,
      preset: params.preset,
      settings: hdSettings,
      before,
    });

    const outBuffer = await fs.promises.readFile(outPath);
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', new Blob([outBuffer], { type: 'video/mp4' }), `hd-${jobId}.mp4`);

    const uploadRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      }
    );
    if (!uploadRes.ok) return null;
    const uploaded = (await uploadRes.json()) as { id?: string };
    return uploaded.id ? { mediaId: uploaded.id } : null;
  } finally {
    await fs.promises.unlink(inPath).catch(() => {});
    await fs.promises.unlink(outPath).catch(() => {});
  }
}

async function runVideoEnhancementJob(params: {
  inputPath: string;
  originalName: string;
  preset: VideoHdPresetId;
  senderName: string;
  from: string;
}): Promise<VideoJobResult> {
  await cleanupOldVideos();

  const started = performance.now();
  const jobId = crypto.randomUUID();
  const outputPath = safeResolveVideoPath(`hd-output-${jobId}.mp4`);

  const before = await probeVideo(params.inputPath);
  const { ffmpegArgs } = await enhanceVideoForWhatsApp({
    inputPath: params.inputPath,
    outputPath,
    preset: params.preset,
    settings: hdSettings,
    before,
  });
  const after = await probeVideo(outputPath);
  const processTimeMs = Math.max(1, Math.round(performance.now() - started));

  videoJobs.set(jobId, {
    inputPath: params.inputPath,
    outputPath,
    originalName: params.originalName,
  });

  // Cap stored in-memory job references
  if (videoJobs.size > 20) {
    const oldestKey = videoJobs.keys().next().value;
    if (oldestKey) {
      const oldJob = videoJobs.get(oldestKey);
      videoJobs.delete(oldestKey);
      if (oldJob) {
        fs.promises.unlink(oldJob.inputPath).catch(() => {});
        fs.promises.unlink(oldJob.outputPath).catch(() => {});
      }
    }
  }

  const maxBytes = hdSettings.maxStatusSizeMb * 1024 * 1024;
  const statusChecklist = {
    underSizeLimit: after.sizeBytes <= maxBytes,
    h264Yuv420p: after.codec === 'h264' && after.pixelFormat === 'yuv420p',
    fastStartAtom: true,
    optimalBitrate: after.bitrateKbps <= 4200,
  };

  const statusCompatible =
    statusChecklist.underSizeLimit &&
    statusChecklist.h264Yuv420p &&
    statusChecklist.fastStartAtom;

  const cleanTo = params.from.replace(/[^0-9]/g, '') || '6281298765432';
  const outboundMetaPayload: Record<string, unknown> =
    params.preset === 'hd_max_doc'
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'document',
          document: {
            link: `/api/video/file/${jobId}/output`,
            filename: `HD-${params.originalName.replace(/\.[^.]+$/, '')}.mp4`,
            caption: hdSettings.statusForwardCaption,
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'video',
          video: {
            link: `/api/video/file/${jobId}/output`,
            caption: hdSettings.statusForwardCaption,
          },
        };

  pushLog({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source: 'video_engine',
    from: cleanTo,
    senderName: params.senderName,
    incomingText: `[Video: ${params.originalName}] Preset: ${VIDEO_PRESET_INFO[params.preset].command}`,
    matchedRuleId: null,
    matchedRuleName: VIDEO_PRESET_INFO[params.preset].label,
    matchType: 'FFmpeg Peng-HD',
    replyPreview: `${before.width}x${before.height} -> ${after.width}x${after.height} (${(
      after.sizeBytes /
      (1024 * 1024)
    ).toFixed(2)} MB)`,
    outboundStatus: 'simulated',
    latencyMs: processTimeMs,
    rawInboundPayload: {
      originalName: params.originalName,
      preset: params.preset,
      before,
    },
    rawOutboundPayload: outboundMetaPayload,
  });

  return {
    jobId,
    preset: params.preset,
    presetLabel: VIDEO_PRESET_INFO[params.preset].label,
    originalName: params.originalName,
    inputUrl: `/api/video/file/${jobId}/input`,
    outputUrl: `/api/video/file/${jobId}/output`,
    downloadUrl: `/api/video/file/${jobId}/output?download=1`,
    before,
    after,
    statusCompatible,
    statusChecklist,
    ffmpegArgs,
    processTimeMs,
    captionReply: hdSettings.statusForwardCaption,
    outboundMetaPayload,
  };
}

function processIncomingMessage(params: {
  source: 'simulator' | 'meta_webhook';
  from: string;
  senderName: string;
  incomingText: string;
  rawInboundPayload: Record<string, unknown>;
}) {
  const started = performance.now();
  const cleanText = params.incomingText.slice(0, 1000).trim();

  if (!botProfile.isBotActive) {
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    const logEntry: WebhookLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: params.source,
      from: params.from,
      senderName: params.senderName,
      incomingText: cleanText,
      matchedRuleId: null,
      matchedRuleName: 'Bot Nonaktif',
      matchType: 'Paused',
      replyPreview: '(Bot sedang dijeda — tidak ada balasan dikirim)',
      outboundStatus: 'skipped',
      latencyMs,
      rawInboundPayload: params.rawInboundPayload,
      rawOutboundPayload: null,
    };
    pushLog(logEntry);
    return {
      matchedRule: null,
      matchType: 'Paused',
      replyText: '',
      replyType: 'text' as ReplyType,
      buttons: [],
      listTitle: '',
      listItems: [],
      outboundPayload: {},
      latencyMs,
      logEntry,
    };
  }

  const { rule, matchType } = matchRule(botRules, cleanText);
  if (rule) {
    rule.hitCount += 1;
  }

  const replyType: ReplyType = rule ? rule.replyType : 'text';
  const rawReplyText = rule ? rule.replyText : botProfile.greetingFallback;
  const replyText = interpolateVariables(rawReplyText, {
    senderName: params.senderName,
    from: params.from,
    message: cleanText,
  });

  const buttons = rule?.buttons ?? [];
  const listTitle = rule?.listTitle ?? 'Pilih Menu';
  const listItems = rule?.listItems ?? [];

  const outboundPayload = buildMetaCloudPayload({
    to: params.from,
    replyType,
    replyText,
    buttons,
    listTitle,
    listItems,
  });

  const latencyMs = Math.max(1, Math.round(performance.now() - started));

  const logEntry: WebhookLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source: params.source,
    from: params.from,
    senderName: params.senderName,
    incomingText: cleanText,
    matchedRuleId: rule ? rule.id : null,
    matchedRuleName: rule ? rule.name : 'Balasan Default (Fallback)',
    matchType,
    replyPreview: replyText.slice(0, 140),
    outboundStatus: params.source === 'simulator' ? 'simulated' : 'skipped',
    latencyMs,
    rawInboundPayload: params.rawInboundPayload,
    rawOutboundPayload: outboundPayload,
  };

  pushLog(logEntry);

  return {
    matchedRule: rule,
    matchType,
    replyText,
    replyType,
    buttons,
    listTitle,
    listItems,
    outboundPayload,
    latencyMs,
    logEntry,
  };
}

// Health & Config Status
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'wabot-hd-studio' });
});

app.get('/api/config/status', (req: Request, res: Response) => {
  const baseUrl =
    process.env.APP_URL?.replace(/\/$/, '') ||
    `${req.protocol}://${req.get('host')}`;
  res.json({
    hasAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
    hasPhoneNumberId: Boolean(getValidatedPhoneNumberId()),
    hasVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
    hasAppSecret: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
    webhookEndpoint: `${baseUrl}/api/webhook/whatsapp`,
  });
});

// HD Enhancement Settings
app.get('/api/hd-settings', (_req: Request, res: Response) => {
  res.json(hdSettings);
});

app.put('/api/hd-settings', (req: Request, res: Response) => {
  const body = req.body as Partial<HdEnhancementSettings>;
  if (
    body.defaultPreset &&
    ['status_hd_1080', 'status_60fps_smooth', 'hd_max_doc'].includes(body.defaultPreset)
  ) {
    hdSettings.defaultPreset = body.defaultPreset;
  }
  if (typeof body.autoProcessWithoutCaption === 'boolean') {
    hdSettings.autoProcessWithoutCaption = body.autoProcessWithoutCaption;
  }
  if (body.sharpnessLevel === 'normal' || body.sharpnessLevel === 'strong') {
    hdSettings.sharpnessLevel = body.sharpnessLevel;
  }
  if (typeof body.maxStatusSizeMb === 'number' && Number.isFinite(body.maxStatusSizeMb)) {
    hdSettings.maxStatusSizeMb = Math.max(5, Math.min(16, Math.round(body.maxStatusSizeMb)));
  }
  if (typeof body.statusForwardCaption === 'string' && body.statusForwardCaption.trim()) {
    hdSettings.statusForwardCaption = body.statusForwardCaption.trim().slice(0, 800);
  }
  res.json(hdSettings);
});

// Video Upload & FFmpeg HD Processing
app.post('/api/video/enhance', (req: Request, res: Response) => {
  upload.single('video')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Gagal mengunggah video.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Pilih file video terlebih dahulu.' });
      return;
    }

    const rawPreset = String((req.body as { preset?: string })?.preset || hdSettings.defaultPreset);
    const preset: VideoHdPresetId = ['status_hd_1080', 'status_60fps_smooth', 'hd_max_doc'].includes(
      rawPreset
    )
      ? (rawPreset as VideoHdPresetId)
      : hdSettings.defaultPreset;

    const senderName = String((req.body as { senderName?: string })?.senderName || 'Budi Santoso')
      .trim()
      .slice(0, 60);
    const from = String((req.body as { from?: string })?.from || '6281298765432').trim();

    try {
      const result = await runVideoEnhancementJob({
        inputPath: req.file.path,
        originalName: req.file.originalname,
        preset,
        senderName,
        from,
      });
      res.json(result);
    } catch (procErr) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      console.error('FFmpeg enhance error:', procErr);
      res.status(500).json({
        error: 'Gagal memproses video dengan FFmpeg. Pastikan file memiliki stream video yang valid.',
      });
    }
  });
});

// Instant 1-Click Demo Low-Res Video -> HD Output
app.post('/api/video/demo', async (req: Request, res: Response) => {
  const rawPreset = String((req.body as { preset?: string })?.preset || hdSettings.defaultPreset);
  const preset: VideoHdPresetId = ['status_hd_1080', 'status_60fps_smooth', 'hd_max_doc'].includes(
    rawPreset
  )
    ? (rawPreset as VideoHdPresetId)
    : hdSettings.defaultPreset;

  const senderName = String((req.body as { senderName?: string })?.senderName || 'Budi Santoso')
    .trim()
    .slice(0, 60);
  const from = String((req.body as { from?: string })?.from || '6281298765432').trim();

  try {
    const demo = await createDemoLowResVideo();
    const result = await runVideoEnhancementJob({
      inputPath: demo.filePath,
      originalName: demo.originalName,
      preset,
      senderName,
      from,
    });
    res.json(result);
  } catch (err) {
    console.error('Demo video error:', err);
    res.status(500).json({ error: 'Gagal membuat video contoh di server.' });
  }
});

// Serve Confined Processed / Original Video Stream
app.get('/api/video/file/:jobId/:variant', (req: Request, res: Response) => {
  const jobId = String(req.params.jobId || '');
  const variant = String(req.params.variant || '');

  if (!/^[a-f0-9-]{36}$/i.test(jobId) || (variant !== 'input' && variant !== 'output')) {
    res.sendStatus(400);
    return;
  }

  const job = videoJobs.get(jobId);
  if (!job) {
    res.sendStatus(404);
    return;
  }

  const targetPath = variant === 'input' ? job.inputPath : job.outputPath;
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(VIDEO_STORAGE_DIR + path.sep) || !fs.existsSync(resolved)) {
    res.sendStatus(404);
    return;
  }

  if (req.query.download === '1') {
    const baseName = job.originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.download(resolved, `WA-HD-${baseName}.mp4`);
    return;
  }

  res.type('video/mp4').sendFile(resolved);
});

// Bot Profile
app.get('/api/bot/profile', (_req: Request, res: Response) => {
  res.json(botProfile);
});

app.put('/api/bot/profile', (req: Request, res: Response) => {
  const body = req.body as Partial<BotProfile>;
  if (typeof body.businessName === 'string' && body.businessName.trim()) {
    botProfile.businessName = body.businessName.trim().slice(0, 80);
  }
  if (typeof body.phoneNumberDisplay === 'string' && body.phoneNumberDisplay.trim()) {
    botProfile.phoneNumberDisplay = body.phoneNumberDisplay.trim().slice(0, 32);
  }
  if (typeof body.greetingFallback === 'string' && body.greetingFallback.trim()) {
    botProfile.greetingFallback = body.greetingFallback.trim().slice(0, 1000);
  }
  if (typeof body.isBotActive === 'boolean') {
    botProfile.isBotActive = body.isBotActive;
  }
  res.json(botProfile);
});

// Rules CRUD
app.get('/api/rules', (_req: Request, res: Response) => {
  const sorted = [...botRules].sort((a, b) => a.priority - b.priority);
  res.json(sorted);
});

app.post('/api/rules', (req: Request, res: Response) => {
  const body = req.body as Partial<BotRule>;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const pattern = typeof body.pattern === 'string' ? body.pattern.trim().slice(0, 240) : '';
  const replyText =
    typeof body.replyText === 'string' ? body.replyText.trim().slice(0, 1500) : '';

  if (!name || !pattern || !replyText) {
    res.status(400).json({ error: 'Nama aturan, pemicu (pattern), dan teks balasan wajib diisi.' });
    return;
  }

  const triggerType =
    body.triggerType && ['keyword', 'exact', 'command', 'regex'].includes(body.triggerType)
      ? body.triggerType
      : 'keyword';

  if (triggerType === 'regex') {
    try {
      new RegExp(pattern);
    } catch {
      res.status(400).json({ error: 'Pola Regex tidak valid. Periksa sintaks ekspresi reguler Anda.' });
      return;
    }
  }

  const replyType: ReplyType =
    body.replyType && ['text', 'buttons', 'list'].includes(body.replyType)
      ? body.replyType
      : 'text';

  const newRule: BotRule = {
    id: `rule-${crypto.randomUUID().slice(0, 8)}`,
    name,
    triggerType,
    pattern,
    replyType,
    replyText,
    buttons: Array.isArray(body.buttons)
      ? body.buttons.slice(0, 3).map((b, idx) => ({
          id: String(b.id || `btn_${idx + 1}`).slice(0, 40),
          title: String(b.title || `Tombol ${idx + 1}`).slice(0, 20),
        }))
      : [],
    listTitle:
      typeof body.listTitle === 'string' && body.listTitle.trim()
        ? body.listTitle.trim().slice(0, 20)
        : 'Pilih Menu',
    listItems: Array.isArray(body.listItems)
      ? body.listItems.slice(0, 10).map((item, idx) => ({
          id: String(item.id || `item_${idx + 1}`).slice(0, 40),
          title: String(item.title || `Item ${idx + 1}`).slice(0, 24),
          description: String(item.description || '').slice(0, 72),
        }))
      : [],
    priority:
      typeof body.priority === 'number' && Number.isFinite(body.priority)
        ? Math.max(1, Math.min(999, Math.round(body.priority)))
        : botRules.length + 1,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
    hitCount: 0,
    updatedAt: new Date().toISOString(),
  };

  botRules.push(newRule);
  res.status(201).json(newRule);
});

app.put('/api/rules/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = botRules.findIndex((r) => r.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'Aturan tidak ditemukan.' });
    return;
  }

  const existing = botRules[idx];
  const body = req.body as Partial<BotRule>;

  const nextTriggerType =
    body.triggerType && ['keyword', 'exact', 'command', 'regex'].includes(body.triggerType)
      ? body.triggerType
      : existing.triggerType;
  const nextPattern =
    typeof body.pattern === 'string' ? body.pattern.trim().slice(0, 240) : existing.pattern;

  if (nextTriggerType === 'regex') {
    try {
      new RegExp(nextPattern);
    } catch {
      res.status(400).json({ error: 'Pola Regex tidak valid.' });
      return;
    }
  }

  const updated: BotRule = {
    ...existing,
    name:
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().slice(0, 80)
        : existing.name,
    triggerType: nextTriggerType,
    pattern: nextPattern || existing.pattern,
    replyType:
      body.replyType && ['text', 'buttons', 'list'].includes(body.replyType)
        ? body.replyType
        : existing.replyType,
    replyText:
      typeof body.replyText === 'string' && body.replyText.trim()
        ? body.replyText.trim().slice(0, 1500)
        : existing.replyText,
    buttons: Array.isArray(body.buttons)
      ? body.buttons.slice(0, 3).map((b, i) => ({
          id: String(b.id || `btn_${i + 1}`).slice(0, 40),
          title: String(b.title || `Tombol ${i + 1}`).slice(0, 20),
        }))
      : existing.buttons,
    listTitle:
      typeof body.listTitle === 'string' && body.listTitle.trim()
        ? body.listTitle.trim().slice(0, 20)
        : existing.listTitle,
    listItems: Array.isArray(body.listItems)
      ? body.listItems.slice(0, 10).map((item, i) => ({
          id: String(item.id || `item_${i + 1}`).slice(0, 40),
          title: String(item.title || `Item ${i + 1}`).slice(0, 24),
          description: String(item.description || '').slice(0, 72),
        }))
      : existing.listItems,
    priority:
      typeof body.priority === 'number' && Number.isFinite(body.priority)
        ? Math.max(1, Math.min(999, Math.round(body.priority)))
        : existing.priority,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled,
    updatedAt: new Date().toISOString(),
  };

  botRules[idx] = updated;
  res.json(updated);
});

app.delete('/api/rules/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const before = botRules.length;
  botRules = botRules.filter((r) => r.id !== id);
  if (botRules.length === before) {
    res.status(404).json({ error: 'Aturan tidak ditemukan.' });
    return;
  }
  res.json({ deleted: true });
});

app.post('/api/rules/template', (req: Request, res: Response) => {
  const preset = (req.body as { preset?: string })?.preset;
  if (preset !== 'video_hd' && preset !== 'toko' && preset !== 'saas') {
    res.status(400).json({ error: 'Preset template tidak dikenal.' });
    return;
  }
  botRules = getPresetRules(preset as TemplatePresetId);
  if (preset === 'toko') {
    botProfile.businessName = 'Wabot HD Store';
  } else if (preset === 'saas') {
    botProfile.businessName = 'CloudDesk HD Support';
  } else {
    botProfile.businessName = 'Wabot HD Video';
  }
  res.json({ profile: botProfile, rules: botRules });
});

// Simulator Endpoint
app.post('/api/bot/simulate', (req: Request, res: Response) => {
  const body = req.body as {
    message?: string;
    senderName?: string;
    from?: string;
  };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
    return;
  }

  const senderName =
    typeof body.senderName === 'string' && body.senderName.trim()
      ? body.senderName.trim().slice(0, 60)
      : 'Budi Santoso';
  const from =
    typeof body.from === 'string' && body.from.trim()
      ? body.from.replace(/[^0-9+]/g, '').slice(0, 20) || '6281298765432'
      : '6281298765432';

  const result = processIncomingMessage({
    source: 'simulator',
    from,
    senderName,
    incomingText: message,
    rawInboundPayload: {
      simulated: true,
      from,
      senderName,
      text: message,
      timestamp: new Date().toISOString(),
    },
  });

  res.json(result);
});

// Logs
app.get('/api/logs', (_req: Request, res: Response) => {
  res.json(webhookLogs);
});

app.delete('/api/logs', (_req: Request, res: Response) => {
  webhookLogs.length = 0;
  res.json({ cleared: true });
});

// Meta WhatsApp Cloud API Webhook Verification
app.get('/api/webhook/whatsapp', (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '';

  if (!expectedToken) {
    res.status(503).send('WHATSAPP_VERIFY_TOKEN belum dikonfigurasi di server.');
    return;
  }

  if (mode === 'subscribe' && timingSafeCompare(token, expectedToken)) {
    res.status(200).type('text/plain').send(challenge);
    return;
  }

  res.sendStatus(403);
});

// Meta WhatsApp Cloud API Webhook Receiver (Text + Interactive + Video Auto-HD)
app.post('/api/webhook/whatsapp', (req: RequestWithRawBody, res: Response) => {
  if (!verifyMetaSignature(req)) {
    res.sendStatus(403);
    return;
  }

  const body = req.body as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
            video?: { id?: string; caption?: string };
            interactive?: {
              button_reply?: { title?: string; id?: string };
              list_reply?: { title?: string; id?: string };
            };
            button?: { text?: string };
          }>;
        };
      }>;
    }>;
  };

  if (body?.object !== 'whatsapp_business_account') {
    res.sendStatus(404);
    return;
  }

  // Acknowledge immediately so Meta does not retry while FFmpeg encodes videos
  res.status(200).json({ received: true });

  void (async () => {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        const contacts = value?.contacts || [];
        for (const msg of value?.messages || []) {
          if (msg.id) {
            if (processedMessageIds.has(msg.id)) {
              continue;
            }
            processedMessageIds.add(msg.id);
            if (processedMessageIds.size > 500) {
              const firstKey = processedMessageIds.values().next().value;
              if (firstKey) processedMessageIds.delete(firstKey);
            }
          }

          const from = String(msg.from || 'unknown').replace(/[^0-9]/g, '');
          const contact = contacts.find((c) => c.wa_id === msg.from) || contacts[0];
          const senderName = contact?.profile?.name || 'Pengguna WhatsApp';

          if (msg.type === 'video' && msg.video?.id && botProfile.isBotActive) {
            const caption = (msg.video.caption || '').trim().toLowerCase();
            const shouldEnhance =
              hdSettings.autoProcessWithoutCaption ||
              caption.includes('.hd') ||
              caption.includes('/hd');

            if (shouldEnhance) {
              const mode: VideoHdPresetId = caption.includes('60')
                ? 'status_60fps_smooth'
                : caption.includes('doc')
                  ? 'hd_max_doc'
                  : hdSettings.defaultPreset;

              const started = performance.now();
              await sendToWhatsAppGraphApi({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: from,
                type: 'text',
                text: {
                  body: 'Video diterima. Sedang menjernihkan resolusi & mengoptimalkan profil Anti-Kompresi Status WA...',
                },
              });

              const uploaded = await fetchAndEnhanceMetaVideo({
                mediaId: msg.video.id,
                preset: mode,
              });

              const latencyMs = Math.max(1, Math.round(performance.now() - started));

              if (uploaded) {
                const mediaPayload =
                  mode === 'hd_max_doc'
                    ? {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: from,
                        type: 'document',
                        document: {
                          id: uploaded.mediaId,
                          filename: 'video-hd-status.mp4',
                          caption: hdSettings.statusForwardCaption,
                        },
                      }
                    : {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: from,
                        type: 'video',
                        video: {
                          id: uploaded.mediaId,
                          caption: hdSettings.statusForwardCaption,
                        },
                      };
                const delivery = await sendToWhatsAppGraphApi(mediaPayload);
                pushLog({
                  id: crypto.randomUUID(),
                  timestamp: new Date().toISOString(),
                  source: 'meta_webhook',
                  from,
                  senderName,
                  incomingText: `[Video Media ID: ${msg.video.id}] ${msg.video.caption || ''}`.trim(),
                  matchedRuleId: null,
                  matchedRuleName: VIDEO_PRESET_INFO[mode].label,
                  matchType: 'Auto-HD Video',
                  replyPreview: 'Video HD diunggah & dikirim ulang ke WhatsApp',
                  outboundStatus: delivery.status,
                  latencyMs,
                  rawInboundPayload: body as unknown as Record<string, unknown>,
                  rawOutboundPayload:
                    delivery.status === 'failed'
                      ? { payload: mediaPayload, error: delivery.response }
                      : mediaPayload,
                });
              } else {
                const failReply = {
                  messaging_product: 'whatsapp',
                  recipient_type: 'individual',
                  to: from,
                  type: 'text',
                  text: {
                    body: 'Maaf, gagal mengunduh atau memproses video tersebut. Pastikan ukuran dan format video didukung.',
                  },
                };
                await sendToWhatsAppGraphApi(failReply);
                pushLog({
                  id: crypto.randomUUID(),
                  timestamp: new Date().toISOString(),
                  source: 'meta_webhook',
                  from,
                  senderName,
                  incomingText: `[Video Media ID: ${msg.video.id}]`,
                  matchedRuleId: null,
                  matchedRuleName: VIDEO_PRESET_INFO[mode].label,
                  matchType: 'Auto-HD Video',
                  replyPreview: 'Gagal mengunduh/memproses media dari Meta',
                  outboundStatus: 'failed',
                  latencyMs,
                  rawInboundPayload: body as unknown as Record<string, unknown>,
                  rawOutboundPayload: failReply,
                });
              }
              continue;
            }
          }

          const incomingText =
            msg.text?.body ||
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            msg.button?.text ||
            '';

          if (!incomingText.trim()) {
            continue;
          }

          const result = processIncomingMessage({
            source: 'meta_webhook',
            from,
            senderName,
            incomingText,
            rawInboundPayload: body as unknown as Record<string, unknown>,
          });

          if (
            botProfile.isBotActive &&
            result.outboundPayload &&
            Object.keys(result.outboundPayload).length > 0
          ) {
            const delivery = await sendToWhatsAppGraphApi(result.outboundPayload);
            result.logEntry.outboundStatus = delivery.status;
            if (delivery.status === 'failed' && delivery.response) {
              result.logEntry.rawOutboundPayload = {
                payload: result.outboundPayload,
                graphApiError: delivery.response,
              };
            }
          }
        }
      }
    }
  })();
});

app.post('/api/webhook/test-meta', async (req: Request, res: Response) => {
  const message =
    typeof (req.body as { message?: string })?.message === 'string' &&
    (req.body as { message?: string }).message!.trim()
      ? (req.body as { message: string }).message.trim().slice(0, 300)
      : '/menu';

  const syntheticMetaPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DEMO_001',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: botProfile.phoneNumberDisplay,
                phone_number_id: getValidatedPhoneNumberId() || '1049281726354',
              },
              contacts: [{ profile: { name: 'Rina Wijaya' }, wa_id: '6281234567890' }],
              messages: [
                {
                  from: '6281234567890',
                  id: `wamid.test_${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: message },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = processIncomingMessage({
    source: 'meta_webhook',
    from: '6281234567890',
    senderName: 'Rina Wijaya',
    incomingText: message,
    rawInboundPayload: syntheticMetaPayload,
  });

  if (botProfile.isBotActive) {
    const delivery = await sendToWhatsAppGraphApi(result.outboundPayload);
    result.logEntry.outboundStatus = delivery.status;
  }

  res.json(result);
});

// Code Export Endpoint
app.get('/api/export/code', (req: Request, res: Response) => {
  const baseUrl =
    process.env.APP_URL?.replace(/\/$/, '') ||
    `${req.protocol}://${req.get('host')}`;
  const webhookUrl = `${baseUrl}/api/webhook/whatsapp`;

  res.json({
    baileysScript: generateBaileysScript(botProfile, botRules, hdSettings),
    cloudApiCurl: generateCloudApiSnippet(webhookUrl),
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Wabot HD Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
