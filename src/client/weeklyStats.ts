import { createEffect, createMemo, createSignal } from "solid-js";

import type { WeeklyAccess } from "~/api";

import { accountApi } from "./api";
import { authStore } from "./storage";

export type WeeklyAccessState = "loading" | "enabled" | "disabled";

/** Missing, failed and pending access checks all fail closed. */
export function weeklyAccessState(
  access: WeeklyAccess | null,
  pending: boolean,
): WeeklyAccessState {
  if (pending) return "loading";

  return access?.enabled === true ? "enabled" : "disabled";
}

const [accessTick, setAccessTick] = createSignal(0);
const [access, setAccess] = createSignal<WeeklyAccess | null>(null);
const [state, setState] = createSignal<WeeklyAccessState>("loading");

// Depend on the token, not the whole session object: caching a Spotify profile
// must not re-run the gate check.
const accessToken = createMemo(() => {
  const session = authStore();

  return session.status === "authenticated" ? session.accessToken : null;
});

let started = false;

/** Starts the shared gate check inside the app layout's reactive owner. */
export function initWeeklyStats(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  createEffect(
    () => ({ token: accessToken(), tick: accessTick() }),
    ({ token }) => {
      if (token === null) {
        setAccess(null);
        setState("disabled");

        return;
      }

      let active = true;
      setAccess(null);
      setState("loading");

      void accountApi
        .weeklyAccess()
        .then((value) => {
          if (!active) return;
          setAccess(value);
          setState(weeklyAccessState(value, false));
        })
        .catch(() => {
          if (!active) return;
          setAccess(null);
          setState("disabled");
        });

      return () => {
        active = false;
      };
    },
  );
}

export function weeklyStatsAccess(): WeeklyAccess | null {
  return access();
}

export function weeklyStatsState(): WeeklyAccessState {
  return state();
}

export function weeklyStatsEnabled(): boolean {
  return state() === "enabled";
}

export function reloadWeeklyStatsAccess(): void {
  setAccessTick((value) => value + 1);
}
