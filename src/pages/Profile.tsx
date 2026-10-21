import {
  action,
  createEffect,
  createMemo,
  createSignal,
  For,
  isPending,
  latest,
  onSettled,
  Show,
} from "solid-js";

import { accountApi } from "~/client/api";
import { capture, identifyUser } from "~/client/analytics";
import {
  getCurrentlyPlaying,
  getProfile,
  runSpotify,
  SpotifyProfile,
} from "~/client/spotify";
import { setAuthStore } from "~/client/storage";
import { ListeningInsights } from "~/components/ListeningInsights";
import {
  ProfileHeaderSkeleton,
  StatsRailSkeleton,
} from "~/components/ProfileSkeleton";
import { errorMessage } from "~/lib/errors";
import { formatDate } from "~/lib/format";
import {
  DAY_MS,
  browserTimezoneOffset,
  formatDay,
  localDay,
} from "~/lib/insights";
import { createPreviewInsights } from "~/lib/previewInsights";
import { createShortcut, isEditableShortcutTarget } from "~/lib/shortcut";
import { reuseUnchanged } from "~/lib/stable";
import { externalHref } from "~/lib/url";
import type {
  InsightsQuery,
  InsightsRange,
  ListeningInsights as ListeningInsightsData,
  TrackingStatus,
} from "~/api";

type ProfileUser = typeof SpotifyProfile.Type;

const fetchStatus = async (): Promise<TrackingStatus> => {
  try {
    return await accountApi.status();
  } catch (error) {
    return {
      enabled: false,
      consentedAt: null,
      lastReadAt: null,
      disabledAt: null,
      lastPlayedAtMs: null,
      lastSuccessAt: null,
      lastError: errorMessage(error),
      listenCount: 0,
      recent: [],
    };
  }
};

interface InsightsState {
  data: ListeningInsightsData | null;
  error: string | null;
}

const localDateStart = (value: string) => {
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const localDateEnd = (value: string) => {
  const ms = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const fetchInsights = async (query: InsightsQuery): Promise<InsightsState> => {
  try {
    return {
      data: await accountApi.insights(query),
      error: null,
    };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
};

function ProfileHeader(props: { user: ProfileUser }) {
  return (
    <header class="content-fade-in order-1 border-b-4 border-[#0a0a0a] pb-6 xl:col-start-1 xl:row-start-1">
      <div class="flex flex-wrap items-start gap-5">
        <a
          href={externalHref(props.user.external_urls.spotify)}
          target="_blank"
          rel="noopener"
          class="shrink-0"
        >
          <img
            src={props.user.images?.[0]?.url ?? "/assets/placeholder.svg"}
            alt={props.user.display_name ?? "Profile"}
            class="h-24 w-24 border-4 border-[#0a0a0a] object-cover md:h-28 md:w-28"
          />
        </a>
        <div class="min-w-0 flex-1">
          <div class="mb-1 text-[0.65rem] uppercase tracking-[0.25em] text-[#5c5c5c]">
            Your profile
          </div>
          <h1 class="text-4xl font-black uppercase leading-none tracking-tighter md:text-5xl">
            {props.user.display_name ?? props.user.id}
          </h1>
          <p class="mt-2 truncate text-xs uppercase tracking-widest text-[#666]">
            {props.user.email}
          </p>
          <div class="mt-2 flex items-center gap-2">
            <span class="text-sm font-bold">
              {props.user.followers.total.toLocaleString()}
            </span>
            <span class="text-[0.65rem] uppercase tracking-widest text-[#666]">
              followers
            </span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 md:ml-auto">
          <a
            href="/favourites/tracks"
            class="border-[3px] border-[#0a0a0a] px-4 py-2 text-[0.65rem] font-black uppercase tracking-widest transition hover:bg-[#1DB954] hover:text-black"
          >
            Top Music →
          </a>
          <a
            href={externalHref(props.user.external_urls.spotify)}
            target="_blank"
            rel="noopener"
            class="border-[3px] border-[#0a0a0a] px-4 py-2 text-[0.65rem] font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
          >
            Open Spotify ↗
          </a>
        </div>
      </div>
    </header>
  );
}

function StatsRail(props: {
  status: TrackingStatus;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div class="content-fade-in space-y-4 xl:sticky xl:top-24">
      <section class="border-4 border-[#0a0a0a] p-5">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <div class="text-xs uppercase tracking-[0.2em] text-[#5c5c5c]">
              Recently Listened
            </div>
            <p class="mt-1 text-[0.6rem] uppercase tracking-widest text-[#666]">
              {props.status.lastSuccessAt
                ? `Synced ${formatDate(props.status.lastSuccessAt)}`
                : "Spotify stats"}
            </p>
          </div>
          <button
            type="button"
            disabled={props.refreshing || !props.status.enabled}
            onClick={props.onRefresh}
            class="shrink-0 border-[3px] border-[#0a0a0a] px-2 py-1.5 text-[0.6rem] font-black uppercase tracking-widest transition disabled:opacity-40 hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
            title="Shortcut: R"
          >
            {props.refreshing ? "Queued_" : "Refresh (R)"}
          </button>
        </div>
        <Show
          when={props.status.enabled}
          fallback={
            <div class="border-[3px] border-dashed border-[#0a0a0a] p-4">
              <p class="text-xs font-black uppercase tracking-tight">
                Stats are off
              </p>
              <p class="mt-2 text-xs leading-6 text-[#555]">
                Connect stats to keep recent plays here.
              </p>
              <a
                href="/account"
                class="mt-3 inline-block text-[0.65rem] font-black uppercase tracking-widest underline"
              >
                Connect stats →
              </a>
            </div>
          }
        >
          <Show
            when={props.status.recent.length > 0}
            fallback={
              <div class="border-[3px] border-dashed border-[#0a0a0a] p-4">
                <p class="text-xs font-black uppercase tracking-tight">
                  No listening data yet
                </p>
                <p class="mt-2 text-xs leading-6 text-[#555]">
                  Use Refresh to queue a sync, then this list will update when
                  Spotify returns recent plays.
                </p>
              </div>
            }
          >
            <div>
              <For each={props.status.recent}>
                {(item) => (
                  <a
                    href={externalHref(item.externalUrl) ?? "#"}
                    target="_blank"
                    rel="noopener"
                    onClick={() =>
                      capture("spotify_item_opened", {
                        kind: "track",
                        surface: "recent",
                      })
                    }
                    class="flex items-center gap-3 border-b-[3px] border-[#0a0a0a] py-3 text-left transition last:border-b-0 hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                  >
                    <img
                      src={item.imageUrl ?? "/assets/placeholder.svg"}
                      alt={item.name}
                      class="h-9 w-9 shrink-0 border-2 border-[#0a0a0a] object-cover"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-xs font-black uppercase tracking-tight">
                        {item.name}
                      </p>
                      <p class="mt-0.5 truncate text-[0.65rem] text-[#5c5c5c]">
                        {item.artistNames}
                      </p>
                      <p class="mt-0.5 text-[0.6rem] uppercase tracking-widest text-[#5c5c5c]">
                        {formatDate(item.playedAt)}
                      </p>
                    </div>
                  </a>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </section>

      <section class="border-4 border-[#0a0a0a] p-5">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="text-xs uppercase tracking-[0.2em] text-[#5c5c5c]">
            Stats Sync
          </div>
          <span
            class={`border-[3px] border-[#0a0a0a] px-2 py-1 text-[0.6rem] font-black uppercase tracking-widest ${
              props.status.enabled
                ? "bg-[#1DB954] text-[#0a0a0a]"
                : "bg-[#0a0a0a] text-[#f0ede8]"
            }`}
          >
            {props.status.enabled ? "On" : "Off"}
          </span>
        </div>
        <Show
          when={props.status.enabled}
          fallback={
            <p class="text-xs leading-6 text-[#555]">
              Turn on stats to keep a history Spotify does not expose.
            </p>
          }
        >
          <dl class="space-y-2 text-[0.6rem] uppercase tracking-widest text-[#666]">
            <div class="flex items-baseline justify-between gap-2">
              <dt>Last sync</dt>
              <dd class="text-right font-bold text-[#0a0a0a]">
                {formatDate(props.status.lastSuccessAt)}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <dt>Newest listen</dt>
              <dd class="text-right font-bold text-[#0a0a0a]">
                {formatDate(props.status.lastPlayedAtMs)}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <dt>Listens tracked</dt>
              <dd class="text-right font-bold text-[#0a0a0a]">
                {props.status.listenCount.toLocaleString()}
              </dd>
            </div>
          </dl>
        </Show>
        <Show when={props.status.lastError}>
          {(error) => (
            <p class="mt-3 text-[0.65rem] leading-5 text-red-700">{error()}</p>
          )}
        </Show>
        <a
          href="/account"
          class="mt-3 inline-block text-[0.65rem] font-black uppercase tracking-widest underline"
        >
          Manage stats →
        </a>
      </section>
    </div>
  );
}

const rangeOptions: ReadonlyArray<{ value: InsightsRange; label: string }> = [
  { value: "week", label: "7D" },
  { value: "month", label: "30D" },
  { value: "sixMonths", label: "6M" },
  { value: "all", label: "ALL" },
  { value: "custom", label: "CUSTOM" },
];

function InsightsRangeControl(props: {
  value: InsightsRange;
  fromDate: string;
  toDate: string;
  updating: boolean;
  onChange: (value: InsightsRange) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <span class="mr-1 text-[0.6rem] font-black uppercase tracking-[0.2em] text-[#5c5c5c]">
        Range
      </span>
      <For each={rangeOptions}>
        {(option) => (
          <button
            type="button"
            aria-pressed={props.value === option.value ? "true" : "false"}
            onClick={() => props.onChange(option.value)}
            class={`border-[3px] border-[#0a0a0a] px-2.5 py-1 text-[0.6rem] font-black uppercase tracking-widest transition ${
              props.value === option.value
                ? "bg-[#0a0a0a] text-[#f0ede8]"
                : "hover:bg-[#1DB954] hover:text-black"
            }`}
          >
            {option.label}
          </button>
        )}
      </For>
      <Show when={props.value === "custom"}>
        <label class="flex items-center gap-2 border-[3px] border-[#0a0a0a] px-2 py-1 text-[0.55rem] font-black uppercase tracking-widest text-[#5c5c5c]">
          From
          <input
            type="date"
            value={props.fromDate}
            max={props.toDate || undefined}
            onInput={(event) => props.onFromChange(event.currentTarget.value)}
            class="bg-transparent text-[0.6rem] font-bold uppercase tracking-wider text-[#0a0a0a] outline-none"
          />
        </label>
        <label class="flex items-center gap-2 border-[3px] border-[#0a0a0a] px-2 py-1 text-[0.55rem] font-black uppercase tracking-widest text-[#5c5c5c]">
          To
          <input
            type="date"
            value={props.toDate}
            min={props.fromDate || undefined}
            onInput={(event) => props.onToChange(event.currentTarget.value)}
            class="bg-transparent text-[0.6rem] font-bold uppercase tracking-wider text-[#0a0a0a] outline-none"
          />
        </label>
      </Show>
      <Show when={props.updating}>
        <span class="text-[0.6rem] font-black uppercase tracking-widest text-[#5c5c5c]">
          Updating_
        </span>
      </Show>
    </div>
  );
}

export default function ProfilePage() {
  const [tick, setTick] = createSignal(0);
  const [insightsTick, setInsightsTick] = createSignal(0);
  const [preview, setPreview] = createSignal<ListeningInsightsData | null>(null);
  const [refreshing, setRefreshing] = createSignal(false);
  const timezone = browserTimezoneOffset();
  const [range, setRange] = createSignal<InsightsRange>("all");
  const [fromDate, setFromDate] = createSignal(
    localDay(Date.now() - 29 * DAY_MS, timezone),
  );
  const [toDate, setToDate] = createSignal(localDay(Date.now(), timezone));

  const profile = createMemo(() => runSpotify(getProfile()));
  const stats = createMemo(() => {
    tick();
    return fetchStatus();
  });
  const currentlyPlaying = createMemo(() => {
    tick();
    return runSpotify(getCurrentlyPlaying());
  });
  const insights = createMemo(() => {
    insightsTick();
    const selected = range();
    return fetchInsights({
      tzOffset: timezone,
      range: selected,
      fromMs: selected === "custom" ? localDateStart(fromDate()) : null,
      toMs: selected === "custom" ? localDateEnd(toDate()) : null,
    });
  });

  // `latest` keeps the last settled value while a poll is in flight, so the
  // 10-second refresh does not tear down and re-mount the dashboard (which can
  // leave a `<Show>` child reading its narrowed accessor after it unmounts).
  // It only throws before the first value arrives, which is the skeleton case.
  const profileNow = () => {
    try {
      return latest(profile) ?? null;
    } catch {
      return null;
    }
  };
  const statsNow = () => {
    try {
      return latest(stats) ?? null;
    } catch {
      return null;
    }
  };
  // The dashboard polls every 10s and each poll parses fresh objects, so
  // `<For>` would rebuild the recent list (and reload its covers) every time.
  // Reuse the previous object for a row that has not changed.
  let previousRecent: TrackingStatus["recent"] = [];
  const stableStats = createMemo(() => {
    const status = statsNow();
    if (!status) return null;
    const recent = reuseUnchanged(
      previousRecent,
      status.recent,
      (item) => `${item.playedAtMs}:${item.name}`,
    );
    previousRecent = recent;
    return { ...status, recent };
  });
  const playingNow = () => {
    try {
      return latest(currentlyPlaying) ?? null;
    } catch {
      return null;
    }
  };
  const insightsNow = () => {
    try {
      return latest(insights) ?? null;
    } catch {
      return null;
    }
  };
  const insightsPending = () => {
    try {
      return isPending(insights);
    } catch {
      return false;
    }
  };
  const readyInsights = () => {
    const state = insightsNow();
    const status = statsNow();
    return state && status ? { state, status } : null;
  };

  const reloadInsights = () => setInsightsTick((value) => value + 1);
  const showPreview = () => {
    setPreview(createPreviewInsights());
    capture("insights_preview_opened", {});
  };
  const exitPreview = () => {
    setPreview(null);
    capture("insights_preview_exited", {});
  };

  const changeRange = (next: InsightsRange) => {
    setRange(next);
    capture("insights_range_changed", { range: next });
  };
  const changeFromDate = (value: string) => {
    setFromDate(value);
    if (value && toDate() && value > toDate()) setToDate(value);
  };
  const changeToDate = (value: string) => {
    setToDate(value);
    if (value && fromDate() && value < fromDate()) setFromDate(value);
  };
  const rangeLabel = () => {
    switch (range()) {
      case "week":
        return "Last 7 days";
      case "month":
        return "Last 30 days";
      case "sixMonths":
        return "Last 6 months";
      case "custom":
        return fromDate() && toDate()
          ? `${formatDay(fromDate())} – ${formatDay(toDate())}`
          : "Custom range";
      default:
        return "All time";
    }
  };

  createEffect(
    () => profileNow(),
    (data) => {
      if (!data) return;
      const displayName = data.display_name ?? data.id;
      identifyUser(data.id, {
        username: displayName,
        email: data.email,
      });
      setAuthStore((current) =>
        current.status === "authenticated"
          ? {
              ...current,
              profile: {
                icon: data.images?.[0]?.url,
                url:
                  current.linkToUri && data.uri
                    ? data.uri
                    : data.external_urls.spotify,
                displayName,
                email: data.email,
                followers: data.followers.total,
              },
            }
          : current,
      );
    },
  );

  onSettled(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 10000);
    return () => clearInterval(interval);
  });

  const queueRefresh = action(function* () {
    yield accountApi.refresh();
    setTick((value) => value + 1);
    reloadInsights();
  });
  const refreshStats = async () => {
    if (refreshing() || !statsNow()?.enabled) return;
    setRefreshing(true);
    try {
      await queueRefresh();
      capture("stats_refresh_requested", {});
    } finally {
      setRefreshing(false);
    }
  };

  let lastListenCount: number | null = null;
  createEffect(
    () => statsNow()?.listenCount,
    (count) => {
      if (typeof count !== "number") return;
      if (lastListenCount === null) {
        lastListenCount = count;
        return;
      }
      if (count !== lastListenCount) {
        lastListenCount = count;
        reloadInsights();
      }
    },
  );

  createShortcut(
    ["r"],
    (event) => {
      if (isEditableShortcutTarget(event)) return;
      void refreshStats();
    },
    { preventDefault: false },
  );

  return (
    <main class="app-main flex-1 p-8 md:p-16">
      <div class="space-y-8">
        <Show when={playingNow()?.is_playing && playingNow()?.item}>
          {(track) => (
            <a
              href={externalHref(track().external_urls.spotify)}
              target="_blank"
              rel="noopener"
              class="content-fade-in group flex items-center gap-4 border-4 border-[#0a0a0a] bg-[#1DB954] p-4 text-[#0a0a0a] shadow-[8px_8px_0_#0a0a0a] transition hover:-translate-y-0.5 hover:shadow-[10px_10px_0_#0a0a0a]"
            >
              <img
                src={
                  track().album?.images?.[0]?.url ??
                  track().images?.[0]?.url ??
                  "/assets/placeholder.svg"
                }
                alt={track().name}
                class="h-16 w-16 shrink-0 border-[3px] border-[#0a0a0a] object-cover"
              />
              <div class="min-w-0 flex-1">
                <div class="mb-1 text-[0.65rem] font-black uppercase tracking-[0.25em]">
                  Playing Now
                </div>
                <p class="truncate text-xl font-black uppercase tracking-tight md:text-2xl">
                  {track().name}
                </p>
                <p class="truncate text-xs font-bold uppercase tracking-widest opacity-75">
                  {track()
                    .artists?.map((artist) => artist.name)
                    .join(", ") ?? "Spotify"}
                </p>
              </div>
              <span class="hidden shrink-0 border-[3px] border-[#0a0a0a] px-3 py-2 text-xs font-black uppercase tracking-widest transition group-hover:bg-[#0a0a0a] group-hover:text-[#1DB954] md:inline-block">
                Open Spotify →
              </span>
            </a>
          )}
        </Show>

        <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] xl:items-start">
          <Show when={profileNow()} fallback={<ProfileHeaderSkeleton />}>
            {(user) => <ProfileHeader user={user()} />}
          </Show>

          <aside class="order-2 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <Show when={stableStats()} fallback={<StatsRailSkeleton />}>
              {(status) => (
                <StatsRail
                  status={status()}
                  refreshing={refreshing()}
                  onRefresh={refreshStats}
                />
              )}
            </Show>
          </aside>

          <div class="order-3 min-w-0 xl:col-start-1 xl:row-start-2">
            <Show when={preview()}>
              {(data) => (
                <div class="content-fade-in">
                  <ListeningInsights
                    data={data()}
                    onReload={reloadInsights}
                    rangeLabel="Sample data"
                    preview
                    onExitPreview={exitPreview}
                  />
                </div>
              )}
            </Show>
            <Show when={!preview() && readyInsights()}>
              {(ready) => (
                <div class="content-fade-in">
                  <Show
                    when={ready().state.data}
                    fallback={
                      <InsightsUnavailable
                        message={
                          ready().state.error ??
                          "Insights could not be loaded. Try again."
                        }
                        onRetry={reloadInsights}
                        onPreview={showPreview}
                      />
                    }
                  >
                    {(data) => (
                      <Show
                        when={
                          data().totals.listens > 0 ||
                          ready().status.listenCount > 0
                        }
                        fallback={
                          <InsightsGate
                            status={ready().status}
                            refreshing={refreshing()}
                            onPreview={showPreview}
                            onRefresh={refreshStats}
                          />
                        }
                      >
                        <ListeningInsights
                          data={data()}
                          onReload={reloadInsights}
                          rangeLabel={rangeLabel()}
                          controls={
                            <InsightsRangeControl
                              value={range()}
                              fromDate={fromDate()}
                              toDate={toDate()}
                              updating={insightsPending()}
                              onChange={changeRange}
                              onFromChange={changeFromDate}
                              onToChange={changeToDate}
                            />
                          }
                        />
                      </Show>
                    )}
                  </Show>
                </div>
              )}
            </Show>
          </div>
        </div>
      </div>
    </main>
  );
}

function InsightsGate(props: {
  status: TrackingStatus;
  refreshing: boolean;
  onPreview: () => void;
  onRefresh: () => void;
}) {
  return (
    <section
      id="insights"
      class="scroll-mt-28 border-4 border-[#0a0a0a] p-6 md:p-8"
    >
      <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#5c5c5c]">
        Listening Insights
      </div>
      <h2 class="max-w-3xl text-3xl font-black uppercase leading-none tracking-tighter md:text-5xl">
        {props.status.enabled
          ? "Your first listens are on the way"
          : "See what your listening says about you"}
      </h2>
      <p class="mt-4 max-w-2xl text-sm leading-7 text-[#555]">
        {props.status.enabled
          ? "Stats sync is on. Spotify's recent-play window lands shortly, then this page will fill in on its own."
          : "Spotistats can only graph the plays you choose to store. Connect listening stats to build a history Spotify does not keep, or preview the overview with sample data first."}
      </p>
      <div class="mt-6 grid gap-3 sm:grid-cols-3">
        <div class="border-[3px] border-[#0a0a0a] p-4">
          <p class="text-xs font-black uppercase tracking-widest">
            Top artists & tracks
          </p>
          <p class="mt-2 text-xs leading-6 text-[#5c5c5c]">
            All-time favourites, not just Spotify's last 50 plays.
          </p>
        </div>
        <div class="border-[3px] border-[#0a0a0a] p-4">
          <p class="text-xs font-black uppercase tracking-widest">When you listen</p>
          <p class="mt-2 text-xs leading-6 text-[#5c5c5c]">
            Your local hours, weekdays and the shape of the last year.
          </p>
        </div>
        <div class="border-[3px] border-[#0a0a0a] p-4">
          <p class="text-xs font-black uppercase tracking-widest">Streaks & quirks</p>
          <p class="mt-2 text-xs leading-6 text-[#5c5c5c]">
            Listening streaks, long-tail tracks and your night-owl share.
          </p>
        </div>
      </div>
      <Show when={props.status.lastError}>
        {(error) => (
          <pre class="mt-5 overflow-auto border-[3px] border-[#0a0a0a] bg-[#0a0a0a] p-3 text-xs text-red-500">
            <samp>{error()}</samp>
          </pre>
        )}
      </Show>
      <div class="mt-6 flex flex-wrap gap-3">
        <Show
          when={props.status.enabled}
          fallback={
            <a
              href="/account"
              class="border-4 border-[#0a0a0a] bg-[#0a0a0a] px-6 py-3 text-sm font-black uppercase tracking-wide text-[#f0ede8] transition hover:bg-[#1DB954] hover:text-black"
            >
              Connect listening stats →
            </a>
          }
        >
          <button
            type="button"
            disabled={props.refreshing}
            onClick={props.onRefresh}
            class="border-4 border-[#0a0a0a] px-6 py-3 text-sm font-black uppercase tracking-wide transition disabled:opacity-50 hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
          >
            {props.refreshing ? "Refreshing_" : "Refresh now"}
          </button>
        </Show>
        <button
          type="button"
          onClick={props.onPreview}
          class="border-4 border-[#0a0a0a] bg-[#1DB954] px-6 py-3 text-sm font-black uppercase tracking-wide transition hover:bg-[#0a0a0a] hover:text-[#1DB954]"
        >
          Preview with sample data →
        </button>
      </div>
    </section>
  );
}

function InsightsUnavailable(props: {
  message: string;
  onRetry: () => void;
  onPreview: () => void;
}) {
  return (
    <section
      id="insights"
      class="scroll-mt-28 border-4 border-red-800 p-6 md:p-8"
    >
      <div class="mb-2 text-xs uppercase tracking-[0.2em] text-red-700">
        Listening Insights
      </div>
      <h2 class="text-2xl font-black uppercase leading-none tracking-tighter">
        Could not load your insights
      </h2>
      <p class="mt-3 max-w-2xl text-sm leading-7 text-[#555]">{props.message}</p>
      <div class="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={props.onRetry}
          class="border-4 border-[#0a0a0a] px-6 py-3 text-sm font-black uppercase tracking-wide transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={props.onPreview}
          class="border-4 border-[#0a0a0a] bg-[#1DB954] px-6 py-3 text-sm font-black uppercase tracking-wide transition hover:bg-[#0a0a0a] hover:text-[#1DB954]"
        >
          Preview with sample data →
        </button>
      </div>
    </section>
  );
}
