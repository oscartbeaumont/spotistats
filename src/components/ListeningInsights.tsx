import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { ListeningInsights as ListeningInsightsData } from "~/api";
import { formatDate } from "~/lib/format";
import {
  busiestIndex,
  formatDay,
  formatHour,
  formatListeningTime,
  formatMonth,
  listeningHours,
  percentage,
  weekdayNames,
} from "~/lib/insights";
import { externalHref } from "~/lib/url";

/** Counts up once data arrives; static at once for reduced-motion users. */
function AnimatedNumber(props: {
  value: number;
  format?: (value: number) => string;
}) {
  const [display, setDisplay] = createSignal(0);

  createEffect(
    () => props.value,
    (target) => {
      const reduced =
        typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || target === 0) {
        setDisplay(target);
        return;
      }

      const started = performance.now();
      const duration = 900;
      let frame = 0;
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(target * eased);
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frame);
    },
  );

  return (
    <>{props.format ? props.format(display()) : Math.round(display()).toLocaleString()}</>
  );
}

function StatCard(props: {
  label: string;
  value: JSX.Element;
  detail: string;
  accent?: boolean;
  delay: number;
}) {
  return (
    <div
      class={`insight-rise border-4 border-[#0a0a0a] p-5 ${
        props.accent ? "bg-[#1DB954] text-[#0a0a0a]" : "bg-transparent"
      }`}
      style={`animation-delay:${props.delay}ms`}
    >
      <div class="mb-3 text-[0.65rem] font-black uppercase tracking-[0.25em] opacity-70">
        {props.label}
      </div>
      <div class="text-3xl font-black uppercase leading-none tracking-tighter md:text-4xl">
        {props.value}
      </div>
      <p class="mt-3 text-xs leading-6 opacity-75">{props.detail}</p>
    </div>
  );
}

function BucketChart(props: {
  label: string;
  values: ReadonlyArray<number>;
  labels: (index: number) => string;
  highlight?: number | null;
}) {
  const max = () => Math.max(1, ...props.values);
  return (
    <figure aria-label={props.label}>
      <div
        class="flex h-36 items-end gap-[3px] border-b-4 border-[#0a0a0a] pb-1"
        role="img"
        aria-label={props.label}
      >
        <For each={props.values}>
          {(count, index) => (
            <div
              class="group relative flex-1"
              style={`height:${Math.max(2, (count / max()) * 100)}%`}
              title={`${props.labels(index())}: ${count.toLocaleString()}`}
              aria-hidden="true"
            >
              <div
                class={`insight-bar h-full w-full origin-bottom ${
                  index() === props.highlight ? "bg-[#1DB954]" : "bg-[#0a0a0a]"
                }`}
                style={`animation-delay:${index() * 24}ms`}
              />
            </div>
          )}
        </For>
      </div>
      <div class="mt-2 flex justify-between text-[0.6rem] font-black uppercase tracking-widest text-[#5c5c5c]">
        <span>{props.labels(0)}</span>
        <span>{props.labels(Math.floor(props.values.length / 2))}</span>
        <span>{props.labels(props.values.length - 1)}</span>
      </div>
    </figure>
  );
}

function InsightsContent(props: { data: ListeningInsightsData }) {
  const busiestHour = () => busiestIndex(props.data.hours);
  const busiestWeekday = () => busiestIndex(props.data.weekdays);
  const peak = createMemo(() => {
    const hour = busiestHour();
    return hour === null ? null : { hour, listens: props.data.hours[hour] ?? 0 };
  });
  const topTrack = () => props.data.topTracks[0];
  const topArtist = () => props.data.topArtists[0];
  const repeatShare = () =>
    percentage(topTrack()?.listens ?? 0, props.data.totals.listens);
  const discoveryShare = () =>
    percentage(props.data.onePlayTracks, props.data.totals.tracks);
  const lateNightShare = () =>
    percentage(props.data.lateNightListens, props.data.totals.listens);
  const averagePerDay = () =>
    props.data.totals.activeDays === 0
      ? 0
      : Math.round(props.data.totals.listens / props.data.totals.activeDays);

  return (
    <div class="space-y-10">
      <section class="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Listens tracked"
          value={<AnimatedNumber value={props.data.totals.listens} />}
          detail={`Across ${props.data.totals.activeDays.toLocaleString()} active days — about ${averagePerDay()} a day.`}
          delay={0}
          accent
        />
        <StatCard
          label="Time with music"
          value={
            <AnimatedNumber
              value={listeningHours(props.data.totals.listeningMs)}
              format={(value) => `${value.toFixed(1)}h`}
            />
          }
          detail={`${formatListeningTime(props.data.totals.listeningMs)} of tracks, counted at full length — skips included.`}
          delay={80}
        />
        <StatCard
          label="Artists"
          value={<AnimatedNumber value={props.data.totals.artists} />}
          detail={`${props.data.totals.tracks.toLocaleString()} different tracks, including features.`}
          delay={160}
        />
        <StatCard
          label="Listening streak"
          value={`${props.data.streak.current} ${props.data.streak.current === 1 ? "day" : "days"}`}
          detail={
            props.data.streak.longest > props.data.streak.current
              ? `Your record is ${props.data.streak.longest} days, ending ${formatDay(props.data.streak.longestEndedOn ?? "")}.`
              : "Keep it going: a listen a day keeps the record alive."
          }
          delay={240}
        />
      </section>

      <section class="grid gap-6 border-4 border-[#0a0a0a] p-5 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div>
          <div class="mb-1 flex items-baseline justify-between gap-4">
            <h3 class="text-xl font-black uppercase tracking-tight">When you listen</h3>
            <span class="text-[0.65rem] font-black uppercase tracking-widest text-[#5c5c5c]">
              Local time
            </span>
          </div>
          <p class="mb-5 max-w-xl text-xs leading-6 text-[#5c5c5c]">
            Every hour of the day, stacked. Your peak is{" "}
            <Show when={peak()} fallback="still loading">
              {(value) => (
                <strong class="text-[#0a0a0a]">
                  {formatHour(value().hour)} with{" "}
                  {value().listens.toLocaleString()} listens
                </strong>
              )}
            </Show>
            .
          </p>
          <BucketChart
            label="Listens by local hour of day"
            values={props.data.hours}
            labels={(index) => formatHour(index)}
            highlight={busiestHour()}
          />
        </div>
        <div class="grid content-start gap-4">
          <div class="border-[3px] border-[#0a0a0a] bg-[#fff7c2] p-4">
            <div class="mb-2 text-[0.65rem] font-black uppercase tracking-[0.25em] text-[#3b3200]">
              Night owl index
            </div>
            <p class="text-3xl font-black uppercase leading-none tracking-tighter">
              {lateNightShare()}%
            </p>
            <p class="mt-2 text-xs leading-6 text-[#3b3200]">
              of listens happen after 10pm, when the day is finally yours.
            </p>
          </div>
          <div class="border-[3px] border-[#0a0a0a] p-4">
            <div class="mb-2 text-[0.65rem] font-black uppercase tracking-[0.25em] text-[#5c5c5c]">
              Favourite day
            </div>
            <p class="text-3xl font-black uppercase leading-none tracking-tighter">
              {busiestWeekday() === null
                ? "—"
                : weekdayNames[busiestWeekday() ?? 0]}
            </p>
            <p class="mt-2 text-xs leading-6 text-[#555]">
              {(props.data.weekdays[busiestWeekday() ?? 0] ?? 0).toLocaleString()}{" "}
              listens on your busiest weekday.
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-2">
        <div class="border-4 border-[#0a0a0a] p-5 md:p-6">
          <div class="mb-1 flex items-baseline justify-between gap-4">
            <h3 class="text-xl font-black uppercase tracking-tight">Last 12 months</h3>
            <span class="text-[0.65rem] font-black uppercase tracking-widest text-[#5c5c5c]">
              Monthly
            </span>
          </div>
          <p class="mb-5 text-xs leading-6 text-[#5c5c5c]">
            The shape of your year in plays. Bars are relative, so a quiet month
            still reads at a glance.
          </p>
          <Show
            when={props.data.months.length > 0}
            fallback={
              <p class="border-[3px] border-dashed border-[#0a0a0a] p-4 text-xs text-[#555]">
                No monthly history yet.
              </p>
            }
          >
            <BucketChart
              label="Listens by month"
              values={props.data.months.map((month) => month.listens)}
              labels={(index) => formatMonth(props.data.months[index]?.month ?? "")}
            />
          </Show>
        </div>

        <div class="border-4 border-[#0a0a0a] p-5 md:p-6">
          <div class="mb-1 flex items-baseline justify-between gap-4">
            <h3 class="text-xl font-black uppercase tracking-tight">On repeat</h3>
            <span class="text-[0.65rem] font-black uppercase tracking-widest text-[#5c5c5c]">
              Top artists
            </span>
          </div>
          <p class="mb-5 text-xs leading-6 text-[#5c5c5c]">
            Your most-played artists, with featured credits included.
          </p>
          <Show
            when={props.data.topArtists.length > 0}
            fallback={
              <p class="border-[3px] border-dashed border-[#0a0a0a] p-4 text-xs text-[#555]">
                No artists to rank yet.
              </p>
            }
          >
            <For each={props.data.topArtists}>
              {(artist, index) => (
                <div class="mb-4">
                  <div class="mb-1 flex items-baseline justify-between gap-4">
                    <span class="min-w-0 truncate text-sm font-black uppercase tracking-tight">
                      <span class="mr-2 text-[#5c5c5c]">{index() + 1}</span>
                      {artist.name}
                    </span>
                    <span class="shrink-0 text-[0.65rem] font-bold uppercase tracking-widest text-[#5c5c5c]">
                      {artist.listens.toLocaleString()} plays
                    </span>
                  </div>
                  <div class="h-3 border-[2px] border-[#0a0a0a]">
                    <div
                      class="insight-stretch h-full origin-left bg-[#0a0a0a]"
                      style={`width:${Math.max(
                        4,
                        (artist.listens / (props.data.topArtists[0]?.listens ?? 1)) * 100,
                      )}%;animation-delay:${index() * 80}ms`}
                    />
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </section>

      <section class="border-4 border-[#0a0a0a] p-5 md:p-6">
        <div class="mb-1 flex items-baseline justify-between gap-4">
          <h3 class="text-xl font-black uppercase tracking-tight">Most played tracks</h3>
          <span class="text-[0.65rem] font-black uppercase tracking-widest text-[#5c5c5c]">
            Top 5
          </span>
        </div>
        <p class="mb-5 text-xs leading-6 text-[#5c5c5c]">
          {topTrack()
            ? `${topTrack()?.name} makes up ${repeatShare()}% of everything you play here.`
            : "Your top tracks will appear after a sync."}
        </p>
        <Show
          when={props.data.topTracks.length > 0}
          fallback={
            <p class="border-[3px] border-dashed border-[#0a0a0a] p-4 text-xs text-[#555]">
              No track history yet. Enable listening stats and let the sync run.
            </p>
          }
        >
          <For each={props.data.topTracks}>
            {(track, index) => (
              <a
                href={externalHref(track.externalUrl) ?? "#"}
                target="_blank"
                rel="noopener"
                class="insight-rise flex items-center gap-4 border-b-[3px] border-[#0a0a0a] py-3 transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
                style={`animation-delay:${index() * 60}ms`}
              >
                <span class="w-7 shrink-0 text-lg font-black text-[#5c5c5c]">
                  {index() + 1}
                </span>
                <img
                  src={track.imageUrl ?? "/assets/placeholder.svg"}
                  alt={track.name}
                  class="h-12 w-12 shrink-0 border-2 border-[#0a0a0a] object-cover"
                />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-black uppercase tracking-tight">
                    {track.name}
                  </p>
                  <p class="mt-0.5 truncate text-xs text-[#5c5c5c]">
                    {track.artistNames}
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="text-sm font-black">{track.listens.toLocaleString()}</p>
                  <p class="text-[0.6rem] uppercase tracking-widest text-[#5c5c5c]">
                    plays
                  </p>
                </div>
              </a>
            )}
          </For>
        </Show>
      </section>

      <section class="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Long tail"
          value={`${discoveryShare()}%`}
          detail={`${props.data.onePlayTracks.toLocaleString()} tracks you have heard exactly once.`}
          delay={0}
        />
        <StatCard
          label="Heavy rotation"
          value={`${repeatShare()}%`}
          detail={
            topTrack()
              ? `${topTrack()?.name} is your most repeated track.`
              : "No repeat champion yet."
          }
          delay={60}
        />
        <StatCard
          label="Top artist"
          value={topArtist()?.name ?? "—"}
          detail={
            topArtist()
              ? `${topArtist()?.listens.toLocaleString()} plays across ${topArtist()?.tracks.toLocaleString()} tracks.`
              : "Ranking starts after your first sync."
          }
          delay={120}
        />
        <StatCard
          label="Busiest day"
          value={
            props.data.busiestDay
              ? `${props.data.busiestDay.listens.toLocaleString()} plays`
              : "—"
          }
          detail={
            props.data.busiestDay
              ? `On ${formatDay(props.data.busiestDay.date)}, you could not stop.`
              : "No standout day yet."
          }
          delay={180}
        />
      </section>
    </div>
  );
}

export function ListeningInsights(props: {
  data: ListeningInsightsData;
  onReload: () => void;
  preview?: boolean;
  onExitPreview?: () => void;
}) {
  return (
    <section
      id="insights"
      aria-labelledby="insights-heading"
      class="scroll-mt-28 space-y-6"
    >
      <Show when={props.preview}>
        <div
          class="insight-rise border-4 border-[#0a0a0a] bg-[#fff7c2] p-4 md:p-5"
          role="status"
        >
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="mb-1 text-xs font-black uppercase tracking-[0.25em] text-[#3b3200]">
                Sample data
              </p>
              <p class="max-w-2xl text-sm leading-6 text-[#3b3200]">
                This is a preview of the insights you get once listening stats
                are connected. None of these plays are from your account.
              </p>
            </div>
            <button
              type="button"
              onClick={props.onExitPreview}
              class="shrink-0 border-[3px] border-[#0a0a0a] px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
            >
              Exit preview
            </button>
          </div>
        </div>
      </Show>

      <div class="flex flex-wrap items-end justify-between gap-4 border-b-4 border-[#0a0a0a] pb-4">
        <div class="flex items-center gap-4">
          <div class="insight-vinyl h-12 w-12 shrink-0 rounded-full border-4 border-[#0a0a0a] bg-[#0a0a0a]">
            <div class="flex h-full w-full items-center justify-center">
              <div class="h-4 w-4 rounded-full border-[3px] border-[#0a0a0a] bg-[#1DB954]" />
            </div>
          </div>
          <div>
            <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#5c5c5c]">
              {props.preview
                ? "A preview with sample data"
                : props.data.totals.firstPlayedAtMs
                  ? `Since ${formatDate(props.data.totals.firstPlayedAtMs)}`
                  : "From your first sync"}
            </div>
            <h2
              id="insights-heading"
              class="text-3xl font-black uppercase leading-none tracking-tighter md:text-5xl"
            >
              Listening Insights
            </h2>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <Show when={!props.preview}>
            <span class="text-[0.65rem] font-black uppercase tracking-widest text-[#5c5c5c]">
              Updated {formatDate(props.data.generatedAt)}
            </span>
            <button
              type="button"
              onClick={props.onReload}
              class="whitespace-nowrap border-[3px] border-[#0a0a0a] px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
            >
              Reload
            </button>
          </Show>
          <Show when={props.preview}>
            <span class="border-[3px] border-[#0a0a0a] bg-[#1DB954] px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest">
              Preview
            </span>
          </Show>
        </div>
      </div>

      <InsightsContent data={props.data} />
    </section>
  );
}
