import { useSearchParams } from "@solidjs/router";
import { Predicate } from "effect";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
} from "solid-js";

import type {
  WeeklyInsights,
  WeeklySummary,
} from "~/api";
import { accountApi } from "~/client/api";
import {
  reloadWeeklyStatsAccess,
  weeklyStatsAccess,
  weeklyStatsEnabled,
  weeklyStatsState,
} from "~/client/weeklyStats";
import { ListeningInsights } from "~/components/ListeningInsights";
import { PageHeader } from "~/components/PageHeader";
import { errorMessage } from "~/lib/errors";
import {
  browserTimezoneOffset,
  formatDayShort,
  formatListeningTime,
} from "~/lib/insights";
import {
  currentWeekStart,
  formatWeekRange,
  shiftWeek,
  startOfWeek,
  weekKeyFromTimestamp,
} from "~/lib/weeks";
import { runViewTransition } from "~/lib/viewTransition";
import NotFoundPage from "./NotFound";

interface WeekResult {
  readonly data: WeeklyInsights | null;
  readonly error: string | null;
}

function WeeklyLoading() {
  return (
    <main class="app-main flex-1 p-8 md:p-16">
      <div class="mb-4 h-3 w-40 bg-[#ddd7cd]" />
      <div class="mb-8 h-10 w-full max-w-lg bg-[#ddd7cd]" />
      <progress
        aria-label="Loading weekly statistics"
        class="h-3 w-full max-w-lg"
      ></progress>
    </main>
  );
}

function WeekError(props: { message: string; onRetry: () => void }) {
  return (
    <section class="border-4 border-red-800 p-6">
      <h2 class="text-2xl font-black uppercase tracking-tight">
        This week could not be loaded
      </h2>
      <p role="alert" class="mt-3 text-sm leading-7 text-red-900">
        {props.message}
      </p>
      <button
        type="button"
        onClick={props.onRetry}
        class="mt-5 border-[3px] border-[#0a0a0a] px-4 py-2 text-xs font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
      >
        Try again
      </button>
    </section>
  );
}

function WeekNavigator(props: {
  selectedWeek: () => string;
  currentWeek: string;
  earliestWeek: string;
  navigating: boolean;
  onSelect: (week: string) => void;
}) {
  const previousWeek = () => shiftWeek(props.selectedWeek(), -1);
  const nextWeek = () => shiftWeek(props.selectedWeek(), 1);
  const atEarliest = () => props.selectedWeek() <= props.earliestWeek;
  const atCurrent = () => props.selectedWeek() >= props.currentWeek;

  return (
    <section
      aria-labelledby="week-picker-heading"
      class="border-4 border-[#0a0a0a] bg-[#fff7c2] p-5 md:p-6"
    >
      <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="week-picker-heading"
            class="text-xl font-black uppercase tracking-tight"
          >
            Choose a week
          </h2>
          <p class="mt-1 text-xs leading-6 text-[#3b3200]">
            Monday through Sunday, in your local timezone.
          </p>
        </div>
        <label class="grid gap-1 text-[0.6rem] font-black uppercase tracking-widest text-[#3b3200]">
          Jump to week of
          <input
            type="date"
            value={props.selectedWeek()}
            min={props.earliestWeek}
            max={props.currentWeek}
            disabled={props.navigating}
            onInput={(event) => {
              const week = startOfWeek(event.currentTarget.value);

              if (week !== null) props.onSelect(week);
            }}
            class="border-[3px] border-[#0a0a0a] bg-transparent px-3 py-2 text-sm font-bold text-[#0a0a0a]"
          />
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={props.navigating || atEarliest()}
          onClick={() => {
            const week = previousWeek();

            if (week !== null) props.onSelect(week);
          }}
          class="border-[3px] border-[#0a0a0a] px-3 py-2 text-xs font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous week
        </button>
        <button
          type="button"
          disabled={props.navigating || atCurrent()}
          onClick={() => {
            const week = nextWeek();

            if (week !== null) props.onSelect(week);
          }}
          class="border-[3px] border-[#0a0a0a] px-3 py-2 text-xs font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next week →
        </button>
        <button
          type="button"
          disabled={props.navigating || atCurrent()}
          onClick={() => props.onSelect(props.currentWeek)}
          class="border-[3px] border-[#0a0a0a] px-3 py-2 text-xs font-black uppercase tracking-widest transition hover:bg-[#1DB954] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          This week
        </button>
        <span
          aria-live="polite"
          aria-atomic="true"
          class="ml-auto text-sm font-black uppercase tracking-tight"
        >
          {props.navigating ? "Loading week_ " : formatWeekRange(props.selectedWeek())}
        </span>
      </div>
    </section>
  );
}

function WeekHistory(props: {
  weeks: ReadonlyArray<WeeklySummary>;
  selectedWeek: () => string;
  busy: boolean;
  hasMore: boolean;
  error: string | null;
  onSelect: (week: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const maxListens = () =>
    Math.max(1, ...props.weeks.map((week) => week.listens));

  return (
    <section aria-labelledby="week-history-heading" class="space-y-4">
      <div class="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="week-history-heading"
          class="text-lg font-black uppercase tracking-tight"
        >
          Weeks with listens
        </h2>
        <p class="text-xs leading-6 text-[#5c5c5c]">
          Quiet weeks are still available with the controls above.
        </p>
      </div>
      <Show when={props.error}>
        {(message) => (
          <div class="border-[3px] border-dashed border-red-800 p-4">
            <p role="alert" class="text-sm text-red-900">{message()}</p>
            <button
              type="button"
              onClick={props.onRetry}
              class="mt-3 text-xs font-black uppercase tracking-widest underline"
            >
              Retry week list
            </button>
          </div>
        )}
      </Show>
      <Show
        when={props.weeks.length > 0}
        fallback={
          <p class="border-[3px] border-dashed border-[#0a0a0a] p-4 text-sm leading-7 text-[#555]">
            {props.error
              ? "The week list is unavailable."
              : "No listens have been synced yet. Your first week will appear here."}
          </p>
        }
      >
        <nav
          aria-label="Observed listening weeks"
          class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        >
          <For each={props.weeks}>
            {(week) => (
              <button
                type="button"
                aria-current={
                  week.weekStart === props.selectedWeek() ? "date" : undefined
                }
                aria-label={`${formatWeekRange(week.weekStart)}, ${week.listens} listens`}
                disabled={props.busy}
                onClick={() => props.onSelect(week.weekStart)}
                class={`min-w-0 border-[3px] border-[#0a0a0a] p-3 text-left transition hover:bg-[#1DB954] hover:text-black disabled:opacity-50 ${
                  week.weekStart === props.selectedWeek()
                    ? "bg-[#0a0a0a] text-[#f0ede8]"
                    : "bg-transparent"
                }`}
              >
                <span class="block truncate text-xs font-black uppercase tracking-tight">
                  {formatDayShort(week.weekStart)}
                </span>
                <span class="mt-1 block text-[0.6rem] font-bold uppercase tracking-widest opacity-70">
                  {week.listens.toLocaleString()} plays
                </span>
                <span class="mt-3 flex h-8 items-end bg-[#ddd7cd] p-1">
                  <span
                    class="insight-bar block w-full origin-bottom bg-[#1DB954]"
                    style={`height:${Math.max(8, (week.listens / maxListens()) * 100)}%`}
                  />
                </span>
              </button>
            )}
          </For>
        </nav>
      </Show>
      <Show when={props.hasMore}>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onLoadMore}
          class="border-[3px] border-[#0a0a0a] px-4 py-2 text-xs font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8] disabled:opacity-50"
        >
          {props.busy ? "Loading_ " : "Load older weeks"}
        </button>
      </Show>
    </section>
  );
}

function WeeklyStats() {
  const [params, setParams] = useSearchParams<{ week?: string }>();
  const timezone = browserTimezoneOffset();
  const [now, setNow] = createSignal(Date.now());
  const currentWeek = createMemo(() => currentWeekStart(timezone, now()));
  const updateNow = () => setNow(Date.now());

  createEffect(
    () => timezone,
    () => {
      const interval = setInterval(updateNow, 60_000);
      window.addEventListener("focus", updateNow);
      document.addEventListener("visibilitychange", updateNow);

      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", updateNow);
        document.removeEventListener("visibilitychange", updateNow);
      };
    },
  );

  const access = createMemo(() => weeklyStatsAccess());
  const earliestWeek = createMemo(() => {
    const firstPlayedAtMs = access()?.firstPlayedAtMs;

    return firstPlayedAtMs === null || firstPlayedAtMs === undefined
      ? currentWeek()
      : weekKeyFromTimestamp(firstPlayedAtMs, timezone);
  });

  const selectedWeek = createMemo(
    () => startOfWeek(params.week ?? "") ?? currentWeek(),
  );

  createEffect(
    () => params.week,
    (requested) => {

      if (requested === undefined) return;

      const normalized = startOfWeek(requested) ?? currentWeek();

      if (normalized !== requested) {
        setParams({ week: normalized }, { replace: true, scroll: false });
      }
    },
  );

  const [navigating, setNavigating] = createSignal(false);
  const [reloadTick, setReloadTick] = createSignal(0);
  const cache = new Map<string, WeeklyInsights>();

  const loadWeek = async (week: string): Promise<WeekResult> => {
    const cached = cache.get(week);

    if (cached !== undefined) return { data: cached, error: null };

    try {
      const data = await accountApi.weeklyInsights(week, timezone);
      cache.set(week, data);

      return { data, error: null };
    } catch (error) {
      if (Predicate.isTagged(error, "Forbidden")) {
        reloadWeeklyStatsAccess();
      }

      return { data: null, error: errorMessage(error) };
    }
  };

  const [detail, setDetail] = createSignal<WeekResult | null>(null);
  const [detailPending, setDetailPending] = createSignal(false);

  createEffect(
    () => ({ week: selectedWeek(), tick: reloadTick() }),
    ({ week }) => {
      let active = true;
      setDetailPending(true);

      void loadWeek(week).then((result) => {
        if (!active) return;
        setDetail(result);
        setDetailPending(false);
      });

      return () => {
        active = false;
      };
    },
  );

  const selectWeek = async (week: string) => {
    if (navigating() || week === selectedWeek() || week > currentWeek()) return;

    setNavigating(true);

    // Warm the destination before the snapshot swap so the transition never
    // reveals a loading skeleton in place of the new week's data.
    await loadWeek(week);

    const transition = runViewTransition(
      () => setParams({ week }, { scroll: false }),
      week < selectedWeek() ? "backward" : "forward",
    );

    if (transition === null) {
      setNavigating(false);
    } else {
      void transition.finished.then(
        () => setNavigating(false),
        () => setNavigating(false),
      );
    }
  };

  const reloadWeek = () => {
    cache.delete(selectedWeek());
    setReloadTick((value) => value + 1);
  };

  const [history, setHistory] = createSignal<WeeklySummary[]>([]);
  const [historyBusy, setHistoryBusy] = createSignal(false);
  const [historyHasMore, setHistoryHasMore] = createSignal(false);
  const [historyError, setHistoryError] = createSignal<string | null>(null);
  let historyRequest = 0;

  const loadHistory = async (before: string | null) => {
    const request = ++historyRequest;
    setHistoryBusy(true);
    setHistoryError(null);

    try {
      const page = await accountApi.weeklyHistory({
        tzOffset: timezone,
        before,
        limit: 12,
      });

      if (request !== historyRequest) return;

      setHistory((current) => {
        if (before === null) return [...page.weeks];

        const known = new Set(current.map((week) => week.weekStart));

        return [
          ...current,
          ...page.weeks.filter((week) => !known.has(week.weekStart)),
        ];
      });
      setHistoryHasMore(page.hasMore);
    } catch (error) {
      if (request !== historyRequest) return;
      if (Predicate.isTagged(error, "Forbidden")) {
        reloadWeeklyStatsAccess();
      }
      setHistoryError(errorMessage(error));
    } finally {
      if (request === historyRequest) setHistoryBusy(false);
    }
  };

  createEffect(
    () => weeklyStatsEnabled(),
    (enabled) => {
      if (enabled) void loadHistory(null);
    },
  );

  const rangeLabel = () => {
    const result = detail();

    return result?.data
      ? `${formatWeekRange(result.data.weekStart)}${result.data.isPartial ? " · in progress" : ""}`
      : formatWeekRange(selectedWeek());
  };

  return (
    <main class="app-main flex-1 p-8 md:p-12">
      <PageHeader
        title="Weekly listening"
        eyebrow="Your history, one week at a time"
      />
      <p class="mb-8 max-w-3xl text-sm leading-7 text-[#555]">
        Explore every week Spotistats has recorded, with the same listening
        insights as your profile. Weeks before sync began, and gaps while sync
        was unavailable, have no data to show.
      </p>

      <div
        class="weekly-week space-y-8"
        aria-busy={detailPending() ? "true" : "false"}
      >
        <WeekNavigator
          selectedWeek={selectedWeek}
          currentWeek={currentWeek()}
          earliestWeek={earliestWeek()}
          navigating={navigating()}
          onSelect={(week) => void selectWeek(week)}
        />

        <Show when={detail()} fallback={
          <progress
            aria-label="Loading weekly statistics"
            class="h-3 w-full"
          ></progress>
        }>
          {(result) => (
            <Show
              keyed
              when={result().data}
              fallback={
                <WeekError
                  message={result().error ?? "Weekly statistics are unavailable."}
                  onRetry={reloadWeek}
                />
              }
            >
              {(data) => (
                <ListeningInsights
                  data={data.insights}
                  onReload={reloadWeek}
                  rangeLabel={rangeLabel()}
                  controls={
                    <div class="flex flex-wrap gap-x-6 gap-y-2 text-[0.65rem] font-black uppercase tracking-widest text-[#5c5c5c]">
                      <span>
                        {data.insights.totals.activeDays.toLocaleString()} active days
                      </span>
                      <span>
                        {formatListeningTime(data.insights.totals.listeningMs)} of music
                      </span>
                      <span>
                        {data.isPartial ? "Week in progress" : "Complete week"}
                      </span>
                    </div>
                  }
                />
              )}
            </Show>
          )}
        </Show>
      </div>

      <div class="mt-12">
        <WeekHistory
          weeks={history()}
          selectedWeek={selectedWeek}
          busy={historyBusy() || navigating()}
          hasMore={historyHasMore()}
          error={historyError()}
          onSelect={(week) => void selectWeek(week)}
          onLoadMore={() => {
            const oldest = history().at(-1)?.weekStart;

            if (oldest !== undefined) void loadHistory(oldest);
          }}
          onRetry={() => void loadHistory(null)}
        />
      </div>
    </main>
  );
}

/** The route exists for everyone, but only enabled listening syncs can use it. */
export default function WeeklyStatsPage() {
  return (
    <Show
      when={weeklyStatsState() !== "loading"}
      fallback={<WeeklyLoading />}
    >
      <Show when={weeklyStatsEnabled()} fallback={<NotFoundPage />}>
        <WeeklyStats />
      </Show>
    </Show>
  );
}
