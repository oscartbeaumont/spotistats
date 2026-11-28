import { For, Show } from "solid-js";

import type { WeeklySummary } from "~/api";
import { formatDayShort } from "~/lib/insights";
import { formatWeekRange, shiftWeek } from "~/lib/weeks";

export function WeekNavigator(props: {
  selectedWeek: () => string;
  currentWeek: string;
  earliestWeek: string;
  navigating: boolean;
  partial?: boolean;
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
              const week = shiftWeek(event.currentTarget.value, 0);

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
          {props.navigating
            ? "Loading_"
            : formatWeekRange(props.selectedWeek())}
        </span>
        <Show when={props.partial !== undefined}>
          <span class="border-[3px] border-[#0a0a0a] px-2 py-1 text-[0.6rem] font-black uppercase tracking-widest">
            {props.partial ? "Week in progress" : "Complete week"}
          </span>
        </Show>
      </div>
    </section>
  );
}

export function WeekHistory(props: {
  weeks: ReadonlyArray<WeeklySummary>;
  selectedWeek: () => string;
  page: number;
  busy: boolean;
  hasMore: boolean;
  error: string | null;
  onSelect: (week: string) => void;
  onPageChange: (page: number) => void;
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
          props.busy ? (
            <progress
              aria-label="Loading observed weeks"
              class="h-3 w-full"
            ></progress>
          ) : (
            <p class="border-[3px] border-dashed border-[#0a0a0a] p-4 text-sm leading-7 text-[#555]">
              {props.error
                ? "The week list is unavailable."
                : props.page > 1
                  ? "No weeks on this page. Try the previous page."
                  : "No listens have been synced yet. Your first week will appear here."}
            </p>
          )
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
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={props.busy || props.page <= 1}
          onClick={() => props.onPageChange(props.page - 1)}
          class="border-[3px] border-[#0a0a0a] px-4 py-2 text-xs font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous page
        </button>
        <span class="text-xs font-black uppercase tracking-widest text-[#5c5c5c]">
          Page {props.page}
        </span>
        <button
          type="button"
          disabled={props.busy || !props.hasMore}
          onClick={() => props.onPageChange(props.page + 1)}
          class="border-[3px] border-[#0a0a0a] px-4 py-2 text-xs font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next page →
        </button>
      </div>
    </section>
  );
}
