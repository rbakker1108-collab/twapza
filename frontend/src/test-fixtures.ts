import type { Account, Clip, Project, PublicConfig } from "./api/client";

export const makeProject = (w = 1920, h = 1080, over: Partial<Project> = {}): Project => ({
  id: "p1", filename: "talk.mp4", size_bytes: 1, status: "ready", error: null, created_at: "",
  expires_at: "", rights_confirmed_at: "", duration: 600, width: w, height: h, fps: 25,
  has_audio: true, source_url: null, source_title: null, source_channel: null,
  source_channel_url: null, jobs: [], ...over,
});

export const makeClip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1", project_id: "p1", source: "simple", index: 1, start: 0, end: 60, duration: 60,
  text: "hello", title: null, hook: null, score: null, reason: null, suggested_start: 0,
  suggested_end: 60, thumbnail_url: "/t.jpg", overlays: [], ...over,
});

export const makeConfig = (over: Partial<PublicConfig> = {}): PublicConfig => ({
  max_upload_bytes: 1e10, max_duration_seconds: 10800, allowed_extensions: ["mp4"],
  retention_hours: 24, min_clip_seconds: 15, max_clip_seconds: 180, ai_enabled: true,
  claude_model: "claude-sonnet-5-5", youtube_enabled: true, billing_enabled: false, billing_plans: [], ...over,
});

export const makeAccount = (plan: Account["plan"]["id"] = "free", over: Partial<Account> = {}): Account => ({
  id: "u1", email: "ann@example.com", email_verified: true, lang: "en", created_at: "2026-11-01T00:00:00Z",
  plan: {
    id: plan, minutes: plan === "pro" ? 1200 : plan === "creator" ? 300 : 60,
    max_video_minutes: plan === "pro" ? 180 : plan === "creator" ? 120 : 60,
    watermark: plan === "free", editing: plan !== "free", zip: plan === "pro", priority: plan === "pro",
    ai_per_day: plan === "pro" ? 200 : plan === "creator" ? 60 : 10,
  },
  usage: { used_minutes: 12, limit_minutes: plan === "pro" ? 1200 : plan === "creator" ? 300 : 60, resets_at: "2026-12-01T00:00:00Z" },
  subscription: null, billing_enabled: true, ...over,
});
