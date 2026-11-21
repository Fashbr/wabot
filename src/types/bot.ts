export type TriggerType = 'keyword' | 'exact' | 'command' | 'regex';

export type ReplyType = 'text' | 'buttons' | 'list';

export type VideoHdPresetId = 'status_hd_1080' | 'status_60fps_smooth' | 'hd_max_doc';

export interface QuickButton {
  id: string;
  title: string;
}

export interface ListItem {
  id: string;
  title: string;
  description: string;
}

export interface BotRule {
  id: string;
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
  hitCount: number;
  updatedAt: string;
}

export interface HdEnhancementSettings {
  defaultPreset: VideoHdPresetId;
  autoProcessWithoutCaption: boolean;
  sharpnessLevel: 'normal' | 'strong';
  maxStatusSizeMb: number;
  statusForwardCaption: string;
}

export interface BotProfile {
  businessName: string;
  phoneNumberDisplay: string;
  greetingFallback: string;
  isBotActive: boolean;
}

export interface VideoMetadata {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  sizeBytes: number;
  bitrateKbps: number;
  codec: string;
  pixelFormat: string;
}

export interface VideoJobResult {
  jobId: string;
  preset: VideoHdPresetId;
  presetLabel: string;
  originalName: string;
  inputUrl: string;
  outputUrl: string;
  downloadUrl: string;
  before: VideoMetadata;
  after: VideoMetadata;
  statusCompatible: boolean;
  statusChecklist: {
    underSizeLimit: boolean;
    h264Yuv420p: boolean;
    fastStartAtom: boolean;
    optimalBitrate: boolean;
  };
  ffmpegArgs: string[];
  processTimeMs: number;
  captionReply: string;
  outboundMetaPayload: Record<string, unknown>;
}

export interface WebhookLogEntry {
  id: string;
  timestamp: string;
  source: 'simulator' | 'meta_webhook' | 'video_engine';
  from: string;
  senderName: string;
  incomingText: string;
  matchedRuleId: string | null;
  matchedRuleName: string;
  matchType: string;
  replyPreview: string;
  outboundStatus: 'simulated' | 'sent' | 'failed' | 'skipped';
  latencyMs: number;
  rawInboundPayload: Record<string, unknown>;
  rawOutboundPayload: Record<string, unknown> | null;
}

export interface ConfigStatus {
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  webhookEndpoint: string;
}

export interface SimulationResponse {
  matchedRule: BotRule | null;
  matchType: string;
  replyText: string;
  replyType: ReplyType;
  buttons: QuickButton[];
  listTitle: string;
  listItems: ListItem[];
  outboundPayload: Record<string, unknown>;
  latencyMs: number;
  logEntry: WebhookLogEntry;
}

export type TemplatePresetId = 'video_hd' | 'toko' | 'saas';
