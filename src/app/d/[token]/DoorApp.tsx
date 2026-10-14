"use client";

import { type IDBPDatabase, openDB } from "idb";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/ui/components/Icon";
import { doorMatch, type DoorMatch } from "./search";

/**
 * Ф8 door helper `/d/{token}` (DESIGN 8.21, mockup 08, plan 8): works offline after one online open.
 * - snapshot and outbox in IndexedDB (`idb`), per token;
 * - search on the device: 2–3 letters, start of any word, highlighted;
 * - «Келді» → outbox + instant update; «Белгіні алу»; toast at the top for 4 s with «Қайтару»;
 * - sync when online, every 30 s and on open; snapshot refreshed silently when older than 2 h and online;
 * - service worker `/d/sw.js` (scope /d/) keeps the page and its assets for offline reloads.
 */
type Family = {
  id: string;
  name: string;
  tableNo: number | null;
  seats: number;
  categoryLabel: string;
  categoryCode: string | null;
  rsvp: "pending" | "yes" | "no";
  arrivedAt: string | null;
};
type Snapshot = { event: { title: string }; families: Family[]; generatedAt: string };
type Op = { opId: string; familyId: string; arrived: boolean; clientAt: string };
type State = "loading" | "ready" | "first" | "revoked";

const STALE_MS = 2 * 3_600_000;
const SYNC_MS = 30_000;
const TOAST_MS = 4_000;

function db(token: string): Promise<IDBPDatabase> {
  return openDB(`toi-door-${token}`, 1, {
    upgrade(d) {
      d.createObjectStore("kv");
      d.createObjectStore("outbox", { keyPath: "opId" });
    },
  });
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false });

function deviceId(): string {
  try {
    let id = localStorage.getItem("toi.door.device");
    if (!id) localStorage.setItem("toi.door.device", (id = crypto.randomUUID()));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function DoorApp({ token, title }: { token: string; title: string }) {
  const t = useTranslations("door");
  const ta = useTranslations("common.actions");
  const tu = useTranslations("invite.table");
  const [state, setState] = useState<State>("loading");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [outbox, setOutbox] = useState<Op[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<{ name: string; familyId: string } | null>(null);
  const dbp = useRef<Promise<IDBPDatabase> | null>(null);
  const busy = useRef(false);
  const getDb = useCallback(() => (dbp.current ??= db(token)), [token]);

  const saveSnap = useCallback(
    async (s: Snapshot) => {
      setSnap(s);
      await (await getDb()).put("kv", s, "snapshot");
    },
    [getDb],
  );

  /** Server arrivals win, except families with ops still in the outbox (the device's newer intent). */
  const applyArrivals = useCallback(
    async (arrivals: { familyId: string; arrivedAt: string }[], pendingOps: Op[]) => {
      const cur = (await (await getDb()).get("kv", "snapshot")) as Snapshot | undefined;
      if (!cur) return;
      const server = new Map(arrivals.map((a) => [a.familyId, a.arrivedAt]));
      const pending = new Map(pendingOps.map((o) => [o.familyId, o]));
      await saveSnap({
        ...cur,
        families: cur.families.map((f) => {
          const p = pending.get(f.id);
          if (p) return { ...f, arrivedAt: p.arrived ? p.clientAt : null };
          return { ...f, arrivedAt: server.get(f.id) ?? null };
        }),
      });
    },
    [getDb, saveSnap],
  );

  const fetchSnapshot = useCallback(async () => {
    const res = await fetch(`/api/door/${token}/snapshot`, { cache: "no-store" });
    if (res.status === 404) {
      setState("revoked");
      return false;
    }
    if (!res.ok) return false;
    const s = (await res.json()) as Snapshot;
    const ops = ((await (await getDb()).getAll("outbox")) as Op[]) ?? [];
    await saveSnap(s);
    if (ops.length) await applyArrivals(
      s.families.filter((f) => f.arrivedAt).map((f) => ({ familyId: f.id, arrivedAt: f.arrivedAt! })),
      ops,
    );
    return true;
  }, [token, getDb, saveSnap, applyArrivals]);

  const sync = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    try {
      const d = await getDb();
      const ops = (await d.getAll("outbox")) as Op[];
      const cur = (await d.get("kv", "snapshot")) as Snapshot | undefined;
      if (cur && Date.now() - new Date(cur.generatedAt).getTime() > STALE_MS) await fetchSnapshot();
      if (!ops.length && cur) {
        // nothing to send: still pull other devices' marks
      }
      setSyncing(ops.length > 0);
      const res = await fetch(`/api/door/${token}/checkins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: deviceId(), ops }),
      });
      if (res.status === 404) {
        setState("revoked");
        return;
      }
      if (!res.ok) return;
      const r = (await res.json()) as { arrivals: { familyId: string; arrivedAt: string }[] };
      const tx = d.transaction("outbox", "readwrite");
      for (const o of ops) await tx.store.delete(o.opId);
      await tx.done;
      const left = (await d.getAll("outbox")) as Op[];
      setOutbox(left);
      await applyArrivals(r.arrivals, left);
    } catch {
      // offline or server error: the outbox stays, next tick tries again
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [token, getDb, fetchSnapshot, applyArrivals]);

  // open: local snapshot first, then network
  useEffect(() => {
    let alive = true;
    (async () => {
      setOnline(navigator.onLine);
      const d = await getDb();
      const s = (await d.get("kv", "snapshot")) as Snapshot | undefined;
      const ops = (await d.getAll("outbox")) as Op[];
      if (!alive) return;
      setOutbox(ops);
      if (s) {
        setSnap(s);
        setState("ready");
      }
      if (navigator.onLine) {
        const ok = await fetchSnapshot().catch(() => false);
        if (!alive) return;
        if (ok) {
          setState("ready");
          if (!s) setSavedHint(true);
          void sync();
        } else if (!s) setState((cur) => (cur === "revoked" ? cur : "first"));
      } else if (!s) setState("first");
    })();
    return () => {
      alive = false;
    };
  }, [getDb, fetchSnapshot, sync]);

  // service worker for offline reloads; hand it what this page already loaded
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/d/sw.js", { scope: "/d/" })
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        const urls = [
          location.pathname,
          ...performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((u) => !u.includes("/api/")),
        ];
        (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "precache", urls });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const timer = setInterval(() => void sync(), SYNC_MS);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(timer);
    };
  }, [sync]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const mark = useCallback(
    async (f: Family, arrived: boolean) => {
      const op: Op = { opId: crypto.randomUUID(), familyId: f.id, arrived, clientAt: new Date().toISOString() };
      const d = await getDb();
      await d.put("outbox", op);
      setOutbox((await d.getAll("outbox")) as Op[]);
      const cur = (await d.get("kv", "snapshot")) as Snapshot;
      await saveSnap({
        ...cur,
        families: cur.families.map((x) => (x.id === f.id ? { ...x, arrivedAt: arrived ? op.clientAt : null } : x)),
      });
      setToast(arrived ? { name: f.name, familyId: f.id } : null);
      void sync();
    },
    [getDb, saveSnap, sync],
  );

  const families = useMemo(() => snap?.families ?? [], [snap]);
  const total = useMemo(() => families.filter((f) => f.rsvp !== "no").reduce((s, f) => s + f.seats, 0), [families]);
  const arrivedPeople = useMemo(
    () => families.filter((f) => f.arrivedAt).reduce((s, f) => s + f.seats, 0),
    [families],
  );
  const results: { f: Family; m: DoorMatch }[] = useMemo(() => {
    if (q.trim().length < 2) return [];
    const out: { f: Family; m: DoorMatch }[] = [];
    for (const f of families) {
      const m = doorMatch(f.name, q);
      if (m) out.push({ f, m });
    }
    return out.slice(0, 30);
  }, [families, q]);
  const recent = useMemo(
    () =>
      families
        .filter((f) => f.arrivedAt)
        .sort((a, b) => b.arrivedAt!.localeCompare(a.arrivedAt!))
        .slice(0, 12),
    [families],
  );
  const pendingIds = useMemo(() => new Set(outbox.map((o) => o.familyId)), [outbox]);
  const lastToast = toast ? families.find((f) => f.id === toast.familyId) : null;

  const net = !online ? (
    <div className="net off" role="status">
      <Icon name="offline" />
      {t("status.offline", { count: outbox.length })}
    </div>
  ) : syncing ? (
    <div className="net" role="status">
      <span className="spin" aria-hidden="true" />
      {t("status.syncing")}
    </div>
  ) : snap ? (
    <div className="net" role="status">
      <Icon name="check" />
      {t("status.saved", { people: total, time: timeOf(snap.generatedAt) })}
    </div>
  ) : null;

  return (
    <div className="door" data-state={state} data-online={online ? "1" : "0"} data-ready={state === "ready" ? "1" : undefined}>
      <header className="door-top">
        <div className="row">
          <div className="ev">
            <b>{snap?.event.title ?? title}</b>
            <span>{t("header.subtitle")}</span>
          </div>
        </div>
        <div className="net-wrap">{net}</div>
      </header>
      {toast && lastToast && (
        <div className="door-toast" role="status">
          <span>{t("toast", { name: toast.name })}</span>
          <button type="button" className="btn text row" onClick={() => void mark(lastToast, false)}>
            {ta("undo")}
          </button>
        </div>
      )}
      <main className="door-main">
        {state === "first" && (
          <section className="card door-block" role="alert">
            <Icon name="offline" />
            <p>{t("status.firstLoadNeedsNet")}</p>
          </section>
        )}
        {state === "revoked" && (
          <section className="card door-block" role="alert">
            <Icon name="lock" />
            <p>{t("status.linkRevoked")}</p>
          </section>
        )}
        {state === "ready" && (
          <div className="door-grid">
            <div>
              {savedHint && (
                <div className="door-hint" role="status">
                  <Icon name="check" />
                  <span>{t("saveHint")}</span>
                </div>
              )}
              <label className="input search-big">
                <Icon name="search" />
                <span className="sr-only">{t("search.label")}</span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("search.placeholder")}
                  autoComplete="off"
                  enterKeyHint="search"
                />
                {q && (
                  <button type="button" className="clear" aria-label={t("search.clear")} onClick={() => setQ("")}>
                    <Icon name="x" />
                  </button>
                )}
              </label>
              <div className="stat-line">
                <span>{t("counter", { arrived: arrivedPeople, total })}</span>
                <span className="bar" aria-hidden="true">
                  <i style={{ width: `${total ? Math.min(100, Math.round((arrivedPeople / total) * 100)) : 0}%` }} />
                </span>
              </div>
              {q.trim().length >= 2 && results.length === 0 && <p className="hint-line">{t("notFound")}</p>}
              <div className="door-results">
                {results.map(({ f, m }) => (
                  <article key={f.id} className={f.arrivedAt ? "res arrived" : "res"} data-family={f.id}>
                    <div className="nm">
                      {f.name.slice(0, m.start)}
                      <mark>{f.name.slice(m.start, m.end)}</mark>
                      {f.name.slice(m.end)}
                    </div>
                    <div className="meta">
                      {f.rsvp === "no"
                        ? t("card.declined")
                        : t("card.meta", { people: f.seats, category: f.categoryLabel })}
                    </div>
                    <div className="tno" style={{ background: `var(--cat-${f.categoryCode ?? "baska"})` }}>
                      {f.tableNo ? (
                        <div>
                          <b>{f.tableNo}</b>
                          <span>{tu("unit")}</span>
                        </div>
                      ) : (
                        <div>
                          <span>{t("card.noTable")}</span>
                        </div>
                      )}
                    </div>
                    <div className="acts">
                      {f.arrivedAt ? (
                        <>
                          <span className="arr">
                            <Icon name="yes" />
                            {t("card.arrivedAt", { time: timeOf(f.arrivedAt) })}
                          </span>
                          {pendingIds.has(f.id) && (
                            <span className="pending">
                              <Icon name="clock" size="xs" />
                              {t("card.pendingSync")}
                            </span>
                          )}
                          <button type="button" className="btn text row" onClick={() => void mark(f, false)}>
                            {t("card.unmark")}
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn come" onClick={() => void mark(f, true)}>
                          <Icon name="check" />
                          {t("card.arrive")}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <aside className="door-side">
              <section className="card recent" aria-labelledby="door-recent">
                <h3 id="door-recent">{t("recent.title")}</h3>
                <ul>
                  {recent.map((f) => (
                    <li key={f.id}>
                      <span>{f.name}</span>
                      <span>
                        {f.tableNo
                          ? t("recent.item", { number: f.tableNo, time: timeOf(f.arrivedAt!) })
                          : timeOf(f.arrivedAt!)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
