import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import type {
  HdEnhancementSettings,
  VideoHdPresetId,
  VideoMetadata,
} from '../types/bot.ts';

const execFileAsync = promisify(execFile);

export const VIDEO_STORAGE_DIR = path.resolve(process.cwd(), '.tmp_videos');

export function ensureVideoDir(): void {
  if (!fs.existsSync(VIDEO_STORAGE_DIR)) {
    fs.mkdirSync(VIDEO_STORAGE_DIR, { recursive: true });
  }
}

export function safeResolveVideoPath(filename: string): string {
  ensureVideoDir();
  const base = path.basename(filename);
  const resolved = path.resolve(VIDEO_STORAGE_DIR, base);
  if (!resolved.startsWith(VIDEO_STORAGE_DIR + path.sep)) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

export async function cleanupOldVideos(maxAgeMs = 30 * 60 * 1000): Promise<void> {
  try {
    ensureVideoDir();
    const entries = await fs.promises.readdir(VIDEO_STORAGE_DIR);
    const now = Date.now();
    await Promise.all(
      entries.map(async (file) => {
        const full = path.join(VIDEO_STORAGE_DIR, file);
        const stat = await fs.promises.stat(full).catch(() => null);
        if (stat && now - stat.mtimeMs > maxAgeMs) {
          await fs.promises.unlink(full).catch(() => {});
        }
      })
    );
  } catch {
    // Ignore cleanup errors
  }
}

export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  const stat = await fs.promises.stat(filePath);
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      pix_fmt?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
    }>;
  };

  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  const durationSec = Math.max(0.5, Number(parsed.format?.duration || 0) || 1);

  let fps = 30;
  const rateStr = videoStream?.avg_frame_rate || videoStream?.r_frame_rate || '30/1';
  const [num, den] = rateStr.split('/').map(Number);
  if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
    fps = Math.round((num / den) * 10) / 10;
  }

  const bitrateKbps = parsed.format?.bit_rate
    ? Math.round(Number(parsed.format.bit_rate) / 1000)
    : Math.round((stat.size * 8) / durationSec / 1000);

  return {
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    fps,
    durationSec: Math.round(durationSec * 10) / 10,
    sizeBytes: stat.size,
    bitrateKbps,
    codec: videoStream?.codec_name || 'unknown',
    pixelFormat: videoStream?.pix_fmt || 'unknown',
  };
}

export async function createDemoLowResVideo(): Promise<{
  filePath: string;
  originalName: string;
}> {
  ensureVideoDir();
  const id = crypto.randomUUID();
  const outPath = safeResolveVideoPath(`demo-input-${id}.mp4`);

  // Generate a crisp-source-degraded 360x640 (9:16 vertical Status format) noisy/soft test clip
  // so users can immediately test the real FFmpeg HD upscaler without uploading a file first.
  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=360x640:rate=24:duration=4',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=4',
    '-vf',
    'gblur=sigma=0.9,drawbox=x=24:y=460:w=312:h=88:color=black@0.55:t=fill',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-shortest',
    outPath,
  ];

  await execFileAsync('ffmpeg', args);
  return {
    filePath: outPath,
    originalName: 'contoh-status-buram-360p.mp4',
  };
}

export async function enhanceVideoForWhatsApp(params: {
  inputPath: string;
  outputPath: string;
  preset: VideoHdPresetId;
  settings: HdEnhancementSettings;
  before: VideoMetadata;
}): Promise<{ ffmpegArgs: string[] }> {
  const { inputPath, outputPath, preset, settings, before } = params;

  const isPortrait = before.height >= before.width;
  const maxDim = preset === 'status_60fps_smooth' ? 1280 : 1920;
  const minTargetDim = preset === 'status_60fps_smooth' ? 720 : 1080;

  // Upscale low-res video to crisp 720p/1080p while keeping even dimensions (-2) and aspect ratio
  const scaleFilter = isPortrait
    ? `scale='if(lt(iw,${minTargetDim}),${minTargetDim},min(${maxDim},iw))':-2:flags=lanczos`
    : `scale=-2:'if(lt(ih,${minTargetDim}),${minTargetDim},min(${maxDim},ih))':flags=lanczos`;

  const unsharp =
    settings.sharpnessLevel === 'strong'
      ? 'unsharp=5:5:1.15:3:3:0.5'
      : 'unsharp=5:5:0.85:3:3:0.4';

  const vf = [
    scaleFilter,
    'hqdn3d=1.2:1.2:4:4',
    unsharp,
    'eq=contrast=1.05:saturation=1.08',
    'setsar=1',
  ].join(',');

  const durationSec = Math.max(1, before.durationSec);
  const maxKbits = settings.maxStatusSizeMb * 8192;
  const safeVideoBitrate = Math.max(
    900,
    Math.min(3400, Math.floor(maxKbits / durationSec) - 128)
  );

  const args: string[] = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-level',
    '4.1',
    '-pix_fmt',
    'yuv420p',
  ];

  if (preset === 'hd_max_doc') {
    args.push('-crf', '18', '-preset', 'fast');
  } else {
    args.push(
      '-r',
      preset === 'status_60fps_smooth' ? '60' : '30',
      '-b:v',
      `${safeVideoBitrate}k`,
      '-maxrate',
      `${Math.round(safeVideoBitrate * 1.15)}k`,
      '-bufsize',
      `${safeVideoBitrate * 2}k`,
      '-preset',
      'fast'
    );
  }

  args.push(
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '44100',
    outputPath
  );

  await execFileAsync('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 });
  return { ffmpegArgs: args };
}
