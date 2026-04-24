import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createInfiniteQuery } from "@tanstack/solid-query";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { ItemCard } from "~/components/ItemCard";
import { accessToken, linkToUri } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

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

function hasSaveData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export default function Favourites() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [type, setType] = createSignal<ItemType>("Tracks");
  const [timeRange, setTimeRange] = createSignal<TimeRange>("short_term");
  const [atBottom, setAtBottom] = createSignal(false);
  const [saveData, setSaveData] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/login", { replace: true });
    localStorage.removeItem("top_items_cache");
    setSaveData(hasSaveData());

    observer = new IntersectionObserver(entries => {
      setAtBottom(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: "500px" });

    if (sentinel) observer.observe(sentinel);
  });

  onCleanup(() => observer?.disconnect());

  const currentKind = () => type() === "Tracks" ? "tracks" as const : "artists" as const;

  function firstPageUrl(kind: "tracks" | "artists", range: TimeRange) {
    return `https://api.spotify.com/v1/me/top/${kind}?limit=50&time_range=${range}`;
  }

  const favourites = createInfiniteQuery(() => ({
    queryKey: ["spotify", "top", currentKind(), timeRange(), accessToken()],
    enabled: !isServer && !!accessToken() && !(currentKind() === "artists" && saveData()),
    initialPageParam: firstPageUrl(currentKind(), timeRange()),
    queryFn: ({ pageParam }) => spotifyFetch<SpotifyPage<SpotifyItem>>(pageParam),
    getNextPageParam: lastPage => lastPage.next || undefined,
  }));

  createEffect(() => {
    if (atBottom() && favourites.hasNextPage && !favourites.isFetchingNextPage) void favourites.fetchNextPage();
  });

  const items = () => favourites.data?.pages.flatMap(page => page.items) ?? [];
  const showBottomPending = () => favourites.isLoading || (atBottom() && favourites.isFetchingNextPage);

  return (
    <main class="mx-auto max-w-5xl px-3 pb-12 sm:px-6">
      <Title>Spotistats | Favourites</Title>
      <header class="mb-4 border-b border-[#1DB954] pb-3 sm:flex sm:items-end sm:gap-6">
        <h1 class="text-3xl font-black">Top <span class="text-[#1DB954]">{type()}</span></h1>
        <div class="mt-3 flex flex-wrap gap-4 text-zinc-300 sm:mt-0">
          <For each={["Tracks", "Artists"] as ItemType[]}>
            {option => <button class={option === type() ? "text-[#1DB954]" : "hover:text-white"} onClick={() => setType(option)}>{option}</button>}
          </For>
          <span class="hidden text-zinc-600 sm:inline">|</span>
          <For each={[["long_term", "All Time"], ["medium_term", "Past 6 Months"], ["short_term", "Past Month"]] as [TimeRange, string][]}>
            {([range, label]) => <button class={range === timeRange() ? "text-[#1DB954]" : "hover:text-white"} onClick={() => setTimeRange(range)}>{label}</button>}
          </For>
        </div>
      </header>
      <div class="space-y-1">
        <For each={items()}>{(item, index) => <ItemCard name={`${index() + 1}. ${item.name}`} description={item.type === "track" ? item.artists?.map(artist => artist.name).join(", ") : ""} images={item.type === "track" ? item.album?.images : item.images} url={linkToUri() ? item.uri : item.external_urls.spotify} />}</For>
      </div>
      <div ref={sentinel} class="h-8" />
      <Show when={showBottomPending()}>
        <div class="mx-auto my-8 flex w-fit items-center gap-3 rounded-full border border-[#1DB954]/30 bg-white/[0.04] px-5 py-3 text-sm text-zinc-300">
          <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-[#1DB954]" />
          Loading more favourites...
        </div>
      </Show>
    </main>
  );
}
