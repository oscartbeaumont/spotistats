import { Predicate } from "effect";
import { createEffect, createMemo, createSignal } from "solid-js";

import type {
  ListeningInsights as ListeningInsightsData,
  WeeklyAccess,
  WeeklyHistory,
  WeeklyInsights,
} from "~/api";

import { accountApi } from "./api";
import { errorMessage } from "~/lib/errors";
import {
  currentWeekStart,
  formatWeekRange,
  startOfWeek,
  weekKeyFromTimestamp,
} from "~/lib/weeks";
import { runViewTransition } from "~/lib/viewTransition";

export interface WeeklyDetailState {
  data: ListeningInsightsData | null;
  error: string | null;
  weekly: WeeklyInsights | null;
  forbidden: boolean;
}

export interface WeeklyParamsSetter {
  (
    params: { week?: string | null; page?: number | null },
    options?: { replace?: boolean; scroll?: boolean },
  ): void;
}

interface WeeklyQueryUpdates {
  week?: string;
  page?: number;
}

export function parseHistoryPage(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) return 1;

  const page = Number(value);

  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** Weekly detail and observed-week pagination for the overview insights panel. */
export function createWeeklyDashboard(props: {
  timezone: number;
  enabled: () => boolean;
  active: () => boolean;
  week: () => string | undefined;
  page: () => string | undefined;
  setParams: WeeklyParamsSetter;
}) {
  const [now, setNow] = createSignal(Date.now());
  const currentWeek = createMemo(() => currentWeekStart(props.timezone, now()));
  const updateNow = () => setNow(Date.now());

  createEffect(
    () => ({ timezone: props.timezone, active: props.active() }),
    ({ active }) => {
      if (!active) return;

      setNow(Date.now());
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

  const selectedWeek = createMemo(
    () => startOfWeek(props.week() ?? "") ?? currentWeek(),
  );
  const historyPage = createMemo(() => parseHistoryPage(props.page()));

  createEffect(
    () => ({
      week: props.week(),
      page: props.page(),
      current: currentWeek(),
      enabled: props.enabled(),
    }),
    ({ week, page, current, enabled }) => {
      if (!enabled || (week === undefined && page === undefined)) return;

      const requestedWeek = startOfWeek(week ?? "");
      const normalizedWeek =
        requestedWeek !== null && requestedWeek <= current
          ? requestedWeek
          : current;
      const normalizedPage = parseHistoryPage(page);
      const updates: WeeklyQueryUpdates = {};

      if (week !== normalizedWeek) updates.week = normalizedWeek;
      if (page === undefined || page !== String(normalizedPage)) {
        updates.page = normalizedPage;
      }

      if (updates.week !== undefined || updates.page !== undefined) {
        props.setParams(updates, { replace: true, scroll: false });
      }
    },
  );

  const [access, setAccess] = createSignal<WeeklyAccess | null>(null);
  const [accessState, setAccessState] = createSignal<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  createEffect(
    () => ({ enabled: props.enabled(), active: props.active() }),
    ({ enabled, active }) => {
      if (!enabled || !active) {
        setAccessState("idle");

        return;
      }

      let current = true;
      setAccessState("loading");

      void accountApi
        .weeklyAccess()
        .then((value) => {
          if (current) setAccess(value);
          if (current) setAccessState("ready");
        })
        .catch(() => {
          if (current) setAccess(null);
          if (current) setAccessState("error");
        });

      return () => {
        current = false;
      };
    },
  );

  const earliestWeek = createMemo(() => {
    const firstPlayedAtMs = access()?.firstPlayedAtMs;

    if (accessState() !== "ready") return "1970-01-05";

    return firstPlayedAtMs === null || firstPlayedAtMs === undefined
      ? currentWeek()
      : weekKeyFromTimestamp(firstPlayedAtMs, props.timezone);
  });

  const [navigating, setNavigating] = createSignal(false);
  const [reloadTick, setReloadTick] = createSignal(0);
  let cacheEpoch = 0;
  const [detail, setDetail] = createSignal<WeeklyDetailState | null>(null);
  const [detailLoadedKey, setDetailLoadedKey] = createSignal<string | null>(null);
  const detailCache = new Map<string, WeeklyInsights>();

  const loadWeek = async (week: string): Promise<WeeklyDetailState> => {
    const cached = detailCache.get(week);

    if (cached !== undefined) {
      return {
        data: cached.insights,
        error: null,
        weekly: cached,
        forbidden: false,
      };
    }

    const epoch = cacheEpoch;
    try {
      const weekly = await accountApi.weeklyInsights(week, props.timezone);

      if (epoch !== cacheEpoch) return await loadWeek(week);

      detailCache.set(week, weekly);

      return {
        data: weekly.insights,
        error: null,
        weekly,
        forbidden: false,
      };
    } catch (error) {
      if (Predicate.isTagged(error, "Forbidden")) {
        return {
          data: null,
          error: errorMessage(error),
          weekly: null,
          forbidden: true,
        };
      }

      return {
        data: null,
        error: errorMessage(error),
        weekly: null,
        forbidden: false,
      };
    }
  };

  createEffect(
    () => ({
      week: selectedWeek(),
      tick: reloadTick(),
      active: props.active(),
    }),
    ({ week, tick, active }) => {
      if (!active) {
        setDetail(null);
        setDetailLoadedKey(null);

        return;
      }

      let current = true;

      void loadWeek(week).then((result) => {
        if (!current) return;
        setDetail(result);
        setDetailLoadedKey(`${week}:${tick}`);
        if (result.forbidden) {
          props.setParams(
            { week: null, page: null },
            { replace: true, scroll: false },
          );
        }
      });

      return () => {
        current = false;
      };
    },
  );

  const detailPending = createMemo(
    () =>
      props.active() &&
      detailLoadedKey() !== `${selectedWeek()}:${reloadTick()}`,
  );

  const selectWeek = async (week: string) => {
    if (
      !props.active() ||
      navigating() ||
      week === selectedWeek() ||
      week > currentWeek()
    ) {
      return;
    }

    setNavigating(true);
    const result = await loadWeek(week);

    if (result.forbidden) {
      setNavigating(false);

      return;
    }

    const transition = runViewTransition(
      () => props.setParams({ week, page: 1 }, { scroll: false }),
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

  const [history, setHistory] = createSignal<WeeklyHistory | null>(null);
  const [historyLoadedKey, setHistoryLoadedKey] = createSignal<string | null>(null);
  const [historyError, setHistoryError] = createSignal<string | null>(null);
  const [historyReloadTick, setHistoryReloadTick] = createSignal(0);
  const historyCache = new Map<number, WeeklyHistory>();

  const loadHistoryPage = async (page: number): Promise<WeeklyHistory> => {
    const cached = historyCache.get(page);

    if (cached !== undefined) return cached;

    const epoch = cacheEpoch;
    const result = await accountApi.weeklyHistory({
      tzOffset: props.timezone,
      page,
      limit: 12,
    });

    if (epoch !== cacheEpoch) return await loadHistoryPage(page);

    historyCache.set(page, result);

    return result;
  };

  createEffect(
    () => ({
      page: historyPage(),
      tick: historyReloadTick(),
      active: props.active(),
    }),
    ({ page, tick, active }) => {
      if (!active) {
        setHistory(null);
        setHistoryLoadedKey(null);

        return;
      }

      let current = true;
      setHistoryError(null);

      void loadHistoryPage(page)
        .then((result) => {
          if (current) {
            setHistory(result);
            setHistoryLoadedKey(`${page}:${tick}`);
          }
        })
        .catch((error: unknown) => {
          if (!current) return;
          if (Predicate.isTagged(error, "Forbidden")) {
            props.setParams(
              { week: null, page: null },
              { replace: true, scroll: false },
            );
          }
          setHistoryError(errorMessage(error));
          setHistoryLoadedKey(`${page}:${tick}`);
        })

      return () => {
        current = false;
      };
    },
  );

  const historyBusy = createMemo(
    () =>
      props.active() &&
      historyLoadedKey() !== `${historyPage()}:${historyReloadTick()}`,
  );

  const changePage = async (page: number) => {
    if (!props.active() || navigating() || page < 1 || page === historyPage()) {
      return;
    }

    setNavigating(true);

    try {
      await loadHistoryPage(page);
    } catch {
      // The effect reports the error after the URL changes.
    }

    const transition = runViewTransition(
      () => props.setParams({ page }, { scroll: false }),
      page < historyPage() ? "backward" : "forward",
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

  const reload = () => {
    detailCache.clear();
    historyCache.clear();
    cacheEpoch += 1;
    setReloadTick((value) => value + 1);
    setHistoryReloadTick((value) => value + 1);
  };

  const rangeLabel = () => {
    const weekly = detail()?.weekly;

    return weekly
      ? `${formatWeekRange(weekly.weekStart)}${weekly.isPartial ? " · in progress" : ""}`
      : formatWeekRange(selectedWeek());
  };

  return {
    currentWeek,
    selectedWeek,
    historyPage,
    earliestWeek,
    navigating,
    detail,
    detailPending,
    history,
    historyBusy,
    historyError,
    selectWeek,
    changePage,
    reload,
    rangeLabel,
  };
}
