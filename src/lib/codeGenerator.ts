import type { BotProfile, BotRule, HdEnhancementSettings } from '../types/bot.ts';

export function generateBaileysScript(
  profile: BotProfile,
  rules: BotRule[],
  hdSettings: HdEnhancementSettings
): string {
  const serializedRules = JSON.stringify(
    rules
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({
        name: r.name,
        triggerType: r.triggerType,
        pattern: r.pattern,
        replyText: r.replyText,
        buttons: r.buttons,
        listItems: r.listItems,
      })),
    null,
    2
  );

  return `/**
 * Bot WhatsApp Peng-HD Video & Anti-Kompresi Status WA (Baileys + FFmpeg)
 * Dihasilkan oleh Wabot Studio untuk: ${profile.businessName}
 *
 * Prasyarat:
 * 1. Pastikan Node.js (>= 18) dan FFmpeg sudah terpasang (cek: ffmpeg -version)
 * 2. mkdir wa-bot-hd && cd wa-bot-hd
 * 3. npm init -y && npm pkg set type=module
 * 4. npm install @whiskeysockets/baileys@^6.7.21 pino qrcode-terminal
 *
 * Cara Menjalankan & Menyambungkan ke Nomor WA Bot:
 * - Mode Scan QR Code:   node baileys-hd-bot.mjs
 * - Mode Kode Pairing:   node baileys-hd-bot.mjs --pairing 6281234567890
 *   (Cocok jika hanya pakai 1 HP: buka WA -> Perangkat Tertaut -> Tautkan dengan nomor telepon)
 */

import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const RULES = ${serializedRules};
const FALLBACK_REPLY = ${JSON.stringify(profile.greetingFallback)};
const HD_CONFIG = ${JSON.stringify(hdSettings, null, 2)};

const pairingIdx = process.argv.indexOf('--pairing');
const PAIRING_PHONE =
  pairingIdx !== -1 && process.argv[pairingIdx + 1]
    ? process.argv[pairingIdx + 1].replace(/[^0-9]/g, '')
    : '';

function interpolate(text, ctx) {
  const nowStr = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  return text
    .replace(/\\{\\{\\s*nama\\s*\\}\\}/gi, ctx.name)
    .replace(/\\{\\{\\s*nomor\\s*\\}\\}/gi, ctx.phone)
    .replace(/\\{\\{\\s*waktu\\s*\\}\\}/gi, nowStr)
    .replace(/\\{\\{\\s*pesan\\s*\\}\\}/gi, ctx.message);
}

function findReply(messageText, ctx) {
  const normalized = messageText.trim().toLowerCase();
  for (const rule of RULES) {
    let matched = false;
    if (rule.triggerType === 'regex') {
      try {
        matched = new RegExp(rule.pattern, 'i').test(messageText.trim());
      } catch {
        matched = false;
      }
    } else {
      const patterns = rule.pattern.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
      if (rule.triggerType === 'exact') {
        matched = patterns.some((p) => normalized === p);
      } else if (rule.triggerType === 'command') {
        const firstToken = normalized.split(/\\s+/)[0] || '';
        matched = patterns.some((p) => normalized === p || firstToken === p);
      } else {
        matched = patterns.some((p) => normalized.includes(p));
      }
    }
    if (matched) {
      let body = interpolate(rule.replyText, ctx);
      if (rule.buttons && rule.buttons.length > 0) {
        body += '\\n\\nPerintah cepat:\\n' + rule.buttons.map((b, i) => \`\${i + 1}. \${b.title}\`).join('\\n');
      }
      if (rule.listItems && rule.listItems.length > 0) {
        body += '\\n\\nOpsi:\\n' + rule.listItems.map((item) => \`- *\${item.title}*: \${item.description}\`).join('\\n');
      }
      return body;
    }
  }
  return interpolate(FALLBACK_REPLY, ctx);
}

async function getVideoDuration(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const dur = parseFloat(stdout.trim());
    return Number.isFinite(dur) && dur > 0 ? dur : 15;
  } catch {
    return 15;
  }
}

async function enhanceVideoForWhatsAppStatus(inputPath, outputPath, mode) {
  const durationSec = await getVideoDuration(inputPath);
  const maxBytesKbit = HD_CONFIG.maxStatusSizeMb * 8192;
  const safeBitrate = Math.max(900, Math.min(3400, Math.floor(maxBytesKbit / durationSec) - 128));

  const sharpFilter =
    HD_CONFIG.sharpnessLevel === 'strong'
      ? 'unsharp=5:5:1.15:3:3:0.5'
      : 'unsharp=5:5:0.85:3:3:0.4';

  const scaleFilter =
    mode === 'status_60fps_smooth'
      ? "scale='if(gt(iw,ih),min(1280,max(720,iw)),-2)':'if(gt(iw,ih),-2,min(1280,max(720,ih)))':flags=lanczos"
      : "scale='if(gt(iw,ih),min(1920,max(1080,iw)),-2)':'if(gt(iw,ih),-2,min(1920,max(1080,ih)))':flags=lanczos";

  const vf = [
    scaleFilter,
    'hqdn3d=1.2:1.2:4:4',
    sharpFilter,
    'eq=contrast=1.05:saturation=1.08',
    'setsar=1',
  ].join(',');

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', vf,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p',
  ];

  if (mode === 'hd_max_doc') {
    args.push('-crf', '18', '-preset', 'medium');
  } else {
    args.push(
      '-r', mode === 'status_60fps_smooth' ? '60' : '30',
      '-b:v', \`\${safeBitrate}k\`,
      '-maxrate', \`\${Math.round(safeBitrate * 1.15)}k\`,
      '-bufsize', \`\${safeBitrate * 2}k\`,
      '-preset', 'medium'
    );
  }

  args.push(
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    outputPath
  );

  await execFileAsync('ffmpeg', args);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  if (PAIRING_PHONE && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PAIRING_PHONE);
        console.log('\\n========================================');
        console.log('KODE PAIRING WHATSAPP:', code);
        console.log('Masukkan di WA -> Perangkat Tertaut -> Tautkan dengan nomor telepon');
        console.log('========================================\\n');
      } catch (err) {
        console.error('Gagal membuat kode pairing:', err);
      }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && !PAIRING_PHONE) {
      console.log('Scan QR code berikut dari WhatsApp (Perangkat Tertaut):');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('Bot Peng-HD Video WhatsApp terhubung dan siap digunakan!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us')) continue;

      const videoMsg =
        msg.message.videoMessage ||
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

      const caption = (
        msg.message.videoMessage?.caption ||
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      ).trim();

      const lowerCaption = caption.toLowerCase();
      const wantsHdCommand =
        lowerCaption.startsWith('.hd') ||
        lowerCaption.startsWith('/hd') ||
        HD_CONFIG.autoProcessWithoutCaption;

      if (videoMsg && wantsHdCommand) {
        const mode = lowerCaption.includes('60')
          ? 'status_60fps_smooth'
          : lowerCaption.includes('doc')
            ? 'hd_max_doc'
            : HD_CONFIG.defaultPreset;

        await sock.sendMessage(
          jid,
          { text: 'Sedang menjernihkan video & mengoptimalkan profil Anti-Kompresi Status WA...' },
          { quoted: msg }
        );

        const tmpDir = os.tmpdir();
        const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const inFile = path.join(tmpDir, \`wa-in-\${id}.mp4\`);
        const outFile = path.join(tmpDir, \`wa-hd-\${id}.mp4\`);

        try {
          const targetMsg = msg.message.videoMessage
            ? msg
            : { ...msg, message: { videoMessage: videoMsg } };
          const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
          await fs.promises.writeFile(inFile, buffer);

          await enhanceVideoForWhatsAppStatus(inFile, outFile, mode);
          const hdBuffer = await fs.promises.readFile(outFile);

          if (mode === 'hd_max_doc') {
            await sock.sendMessage(
              jid,
              {
                document: hdBuffer,
                mimetype: 'video/mp4',
                fileName: \`video-hd-\${id}.mp4\`,
                caption: HD_CONFIG.statusForwardCaption,
              },
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(
              jid,
              {
                video: hdBuffer,
                mimetype: 'video/mp4',
                caption: HD_CONFIG.statusForwardCaption,
              },
              { quoted: msg }
            );
          }
        } catch (err) {
          await sock.sendMessage(
            jid,
            { text: 'Maaf, gagal memproses video. Pastikan format video valid.' },
            { quoted: msg }
          );
          console.error(err);
        } finally {
          await fs.promises.unlink(inFile).catch(() => {});
          await fs.promises.unlink(outFile).catch(() => {});
        }
        continue;
      }

      if (!caption) continue;
      const reply = findReply(caption, {
        name: msg.pushName || 'Pelanggan',
        phone: jid.split('@')[0],
        message: caption,
      });
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    }
  });
}

startBot();
`;
}

export function generateCloudApiSnippet(webhookUrl: string): string {
  return `# Pengujian Webhook WhatsApp Cloud API (Pesan Teks & Video)

# 1. Uji Verifikasi Webhook (GET)
curl -G "${webhookUrl}" \\
  --data-urlencode "hub.mode=subscribe" \\
  --data-urlencode "hub.verify_token=TOKEN_VERIFIKASI_ANDA" \\
  --data-urlencode "hub.challenge=1158201444"

# 2. Simulasi Pesan Masuk Menu dari Meta Webhook (POST)
curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "contacts": [{ "profile": { "name": "Rina Wijaya" }, "wa_id": "6281234567890" }],
          "messages": [{
            "from": "6281234567890",
            "id": "wamid.HBgNNjI4MTIzNDU2Nzg5MA==",
            "timestamp": "${Math.floor(Date.now() / 1000)}",
            "type": "text",
            "text": { "body": "/menu" }
          }]
        }
      }]
    }]
  }'`;
}
