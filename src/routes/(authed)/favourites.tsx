import { Title } from "@solidjs/meta";
import { createInfiniteQuery } from "@tanstack/solid-query";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import * as v from "valibot";
import { useValidatedSearchParams } from "~/lib/search-params";
import { accessToken, linkToUri } from "~/lib/storage";
import { useSpotifyFetch } from "~/lib/spotify";

type TimeRange = "long_term" | "medium_term" | "short_term";
type ItemType = "Tracks" | "Artists";
type SpotifyPage<T> = { items: T[]; next: string | null };
type SpotifyItem = {
  name: string;
  type: "track" | "artist";
  uri: string;
  external_urls: { spotify: string };
  images?: { url: string }[];
  artists?: { name: string }[];
  album?: { images: { url: string }[] };
};

const filtersSchema = v.object({
  type: v.optional(v.picklist(["Tracks", "Artists"] as const)),
  timeRange: v.optional(v.picklist(["long_term", "medium_term", "short_term"] as const)),
});

function hasSaveData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export default function Favourites() {
  const spotifyFetch = useSpotifyFetch();
  const [searchParams, setSearchParams] = useValidatedSearchParams(filtersSchema);
  const [atBottom, setAtBottom] = createSignal(false);
  const [saveData, setSaveData] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    localStorage.removeItem("top_items_cache");
    setSaveData(hasSaveData());
    observer = new IntersectionObserver(entries => {
      setAtBottom(entries.some(e => e.isIntersecting));
    }, { rootMargin: "500px" });
    if (sentinel) observer.observe(sentinel);
  });
  onCleanup(() => observer?.disconnect());

  const type = () => searchParams().type ?? "Tracks";
  const timeRange = () => searchParams().timeRange ?? "short_term";
  const currentKind = () => type() === "Tracks" ? "tracks" as const : "artists" as const;

  function setType(type: ItemType) {
    setSearchParams({ type: type === "Tracks" ? undefined : type });
  }

  function setTimeRange(timeRange: TimeRange) {
    setSearchParams({ timeRange: timeRange === "short_term" ? undefined : timeRange });
  }

  const favourites = createInfiniteQuery(() => ({
    queryKey: ["spotify", "top", currentKind(), timeRange(), accessToken()],
    enabled: !isServer && !!accessToken() && !(currentKind() === "artists" && saveData()),
    initialPageParam: `https://api.spotify.com/v1/me/top/${currentKind()}?limit=50&time_range=${timeRange()}`,
    queryFn: ({ pageParam }) => spotifyFetch<SpotifyPage<SpotifyItem>>(pageParam),
    getNextPageParam: lastPage => lastPage.next || undefined,
  }));

  createEffect(() => {
    if (atBottom() && favourites.hasNextPage && !favourites.isFetchingNextPage) void favourites.fetchNextPage();
  });

  const items = () => favourites.data?.pages.flatMap(p => p.items) ?? [];
  const showBottomPending = () => favourites.isLoading || (atBottom() && favourites.isFetchingNextPage);

  return (
    <main class="app-main p-8 md:p-12">
      <Title>Spotistats | Favourites</Title>
      <div class="flex flex-wrap items-center gap-0 mb-8">
        <h1 class="text-2xl font-black uppercase tracking-tight mr-6">Top {type()}</h1>
        {(["Tracks", "Artists"] as ItemType[]).map(opt => (
          <button
            onClick={() => setType(opt)}
            class="font-black text-xs uppercase px-4 py-2 tracking-wide transition"
            style={type() === opt
              ? "background: #0a0a0a; color: #f0ede8; border: 3px solid #0a0a0a"
              : "border: 3px solid #0a0a0a; color: #0a0a0a"}
          >{opt}</button>
        ))}
        <span class="mx-4 font-black" style="color: #ccc">/</span>
        {([["short_term", "Month"], ["medium_term", "6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
          <button
            onClick={() => setTimeRange(range)}
            class="text-xs uppercase tracking-wide px-3 py-2 font-bold transition"
            style={timeRange() === range
              ? "background: #1DB954; color: black; border: 3px solid #1DB954"
              : "border: 3px solid transparent; color: #999"}
          >{label}</button>
        ))}
      </div>
      <div>
        <For each={items()}>
          {(item, index) => {
            const img = () => item.type === "track" ? item.album?.images?.[0]?.url : item.images?.[0]?.url;
            const sub = () => item.type === "track" ? item.artists?.map(a => a.name).join(", ") : "";
            const url = () => linkToUri() ? item.uri : item.external_urls.spotify;
            return (
              <button
                type="button"
                onClick={() => { if (url().startsWith("spotify:")) window.location.href = url(); else window.open(url(), "_blank", "noopener"); }}
                class="w-full flex items-center gap-4 py-3 text-left transition"
                style="border-bottom: 3px solid #0a0a0a"
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#0a0a0a"; el.style.color = "#f0ede8"; el.style.paddingLeft = "0.5rem"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = ""; el.style.color = ""; el.style.paddingLeft = ""; }}
              >
                <span class="font-black text-lg w-8 shrink-0" style="color: #ccc">{index() + 1}</span>
                <img src={img() ?? "/assets/placeholder.svg"} alt={item.name} class="h-10 w-10 object-cover shrink-0" style="border: 2px solid #0a0a0a" />
                <div class="min-w-0">
                  <p class="text-sm font-black uppercase tracking-tight truncate">{item.name}</p>
                  <p class="text-xs truncate mt-0.5" style="color: #888">{sub()}</p>
                </div>
              </button>
            );
          }}
        </For>
      </div>
      <div ref={sentinel} class="h-8" />
      <Show when={showBottomPending()}>
        <p class="text-xs uppercase tracking-[0.2em] py-6" style="color: #aaa">LOADING_</p>
      </Show>
    </main>
  );
}
