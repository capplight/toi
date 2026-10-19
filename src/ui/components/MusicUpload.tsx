"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * Music upload (Ф5, mockup 10 `#music…`, `wizard.music.*`): pick a file → PUT to storage with progress →
 * server processing (first 90 s, MP3 96 kbit/s) → 30 s preview player, «Басқасын жүктеу», «Алып тастау».
 * Server calls are passed in (src/ui has no server code).
 */
export type MusicValue = { assetId: string; url: string; name: string } | null;
export type MusicActions = {
  createUpload: (input: {
    mime: string;
    bytes: number;
  }) => Promise<
    { ok: true; assetId: string; url: string; headers: Record<string, string> } | { ok: false; error: string }
  >;
  finalize: (assetId: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  remove?: () => Promise<void>;
};

const MIMES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"];
const MAX_MB = 20;

function guessMime(f: File): string {
  if (f.type && MIMES.includes(f.type)) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  return ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : ext === "aac" ? "audio/aac" : f.type;
}

export function MusicUpload({
  value,
  onChange,
  actions,
  onBusyChange,
}: {
  /** True while a file is uploading or processing (the wizard waits with «Жалғастыру»). */
  onBusyChange?: (busy: boolean) => void;
  value: MusicValue;
  onChange: (v: MusicValue) => void;
  actions: MusicActions;
}) {
  const t = useTranslations("wizard.music");
  const tErr = useTranslations("errors");
  const input = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [stage, setStage] = useState<"idle" | "up" | "proc" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    onBusyChange?.(stage === "up" || stage === "proc");
  }, [stage, onBusyChange]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    // The preview plays 30 s, like the guest hears the beginning.
    const stop = () => {
      if (a.currentTime >= 30) {
        a.pause();
        a.currentTime = 0;
      }
    };
    const end = () => setPlaying(false);
    a.addEventListener("timeupdate", stop);
    a.addEventListener("pause", end);
    return () => {
      a.removeEventListener("timeupdate", stop);
      a.removeEventListener("pause", end);
    };
  }, [value]);

  const pick = () => input.current?.click();

  async function upload(f: File) {
    setError(null);
    const mime = guessMime(f);
    if (!MIMES.includes(mime)) return fail(t("wrongType"));
    if (f.size > MAX_MB * 1_000_000) return fail(t("tooBig", { maxMb: MAX_MB }));
    setName(f.name);
    setStage("up");
    setPct(0);
    const target = await actions.createUpload({ mime, bytes: f.size }).catch(() => null);
    if (!target || !target.ok)
      return fail(target && target.error === "size" ? t("tooBig", { maxMb: MAX_MB }) : t("failed"));
    const ok = await new Promise<boolean>((done) => {
      const x = new XMLHttpRequest();
      x.open("PUT", target.url);
      for (const [k, v] of Object.entries(target.headers)) x.setRequestHeader(k, v);
      x.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
      x.onload = () => done(x.status >= 200 && x.status < 300);
      x.onerror = () => done(false);
      x.send(f);
    });
    if (!ok) return fail(t("failed"));
    setStage("proc");
    const r = await actions.finalize(target.assetId).catch(() => null);
    if (!r || !r.ok) return fail(r && r.error === "rateLimited" ? tErr("rateLimited") : t("failed"));
    setStage("idle");
    onChange({ assetId: target.assetId, url: r.url, name: f.name });
  }

  function fail(msg: string) {
    setError(msg);
    setStage("error");
  }

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) a.pause();
    else
      void a.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
  };

  return (
    <div className="music-up" data-testid="music-upload">
      <input
        ref={input}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/aac,.mp3,.m4a,.aac"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      {stage === "up" || stage === "proc" ? (
        <div className="player">
          <span className="play idle" aria-hidden="true">
            <Icon name="music" />
          </span>
          <div className="meta">
            <b>{name}</b>
            {stage === "up" ? (
              <>
                <span className="muted">{t("uploading", { percent: pct })}</span>
                <div
                  className="up-progress"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : (
              <span className="msg-proc" role="status">
                <span className="spin" aria-hidden="true" />
                {t("processing")}
              </span>
            )}
          </div>
        </div>
      ) : value ? (
        <>
          <div className="player">
            <button
              type="button"
              className="play"
              aria-label={t("playerLabel")}
              aria-pressed={playing}
              onClick={toggle}
            >
              <Icon name={playing ? "mute" : "vol"} />
            </button>
            <div className="meta">
              <b>{value.name}</b>
              <span className="ok">
                <Icon name="check" size="sm" />
                {t("ready")}
              </span>
            </div>
            <audio ref={audio} src={value.url} preload="metadata" />
          </div>
          <div className="inline-actions mt-3">
            <Button variant="secondary" size="row" width="auto" onClick={pick}>
              {t("replace")}
            </Button>
            <Button
              variant="text"
              width="auto"
              onClick={() => {
                void actions.remove?.();
                onChange(null);
              }}
            >
              {t("remove")}
            </Button>
          </div>
        </>
      ) : (
        <div className={stage === "error" ? "drop err" : "drop"}>
          <Icon name="music" />
          <Button width="auto" onClick={pick} data-testid="music-pick">
            {t("upload")}
          </Button>
          <p className="note m-0">{t("hint", { maxMb: MAX_MB })}</p>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          <Icon name="alert" size="sm" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
