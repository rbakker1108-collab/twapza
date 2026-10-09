import type { Clip, Project, PublicConfig } from "./api/client";

export const makeProject = (w = 1920, h = 1080, over: Partial<Project> = {}): Project => ({
  id: "p1", filename: "talk.mp4", size_bytes: 1, status: "ready", error: null, created_at: "",
  expires_at: "", rights_confirmed_at: "", duration: 600, width: w, height: h, fps: 25,
  has_audio: true, jobs: [], ...over,
});

export const makeClip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1", project_id: "p1", source: "simple", index: 1, start: 0, end: 60, duration: 60,
  text: "hello", title: null, hook: null, score: null, reason: null, suggested_start: 0,
  suggested_end: 60, thumbnail_url: "/t.jpg", ...over,
});

export const makeConfig = (over: Partial<PublicConfig> = {}): PublicConfig => ({
  max_upload_bytes: 1e10, max_duration_seconds: 10800, allowed_extensions: ["mp4"],
  retention_hours: 24, min_clip_seconds: 15, max_clip_seconds: 180, ai_enabled: true,
  claude_model: "claude-sonnet-5-5", ...over,
});
