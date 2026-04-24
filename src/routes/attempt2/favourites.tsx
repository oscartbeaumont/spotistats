import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createInfiniteQuery } from "@tanstack/solid-query";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { accessToken, clearStoredState, linkToUri } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

type TimeRange = "long_term" | "medium_term" | "short_term";
type ItemType = "Tracks" | "Artists";
type SpotifyPage<T> = { items: T[]; next: string | null };
type SpotifyItem = { name: string; type: "track" | "artist"; uri: string; external_urls: { spotify: string }; images?: { url: string }[]; artists?: { name: string }[]; album?: { images: { url: string }[] }; };

export default function Favourites() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [type, setType] = createSignal<ItemType>("Tracks");
  const [timeRange, setTimeRange] = createSignal<TimeRange>("short_term");
  const [atBottom, setAtBottom] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt2/login", { replace: true });
    observer = new IntersectionObserver(entries => setAtBottom(entries.some(e => e.isIntersecting)), { rootMargin: "500px" });
    if (sentinel) observer.observe(sentinel);
  });
  onCleanup(() => observer?.disconnect());

  const currentKind = () => type() === "Tracks" ? "tracks" as const : "artists" as const;
  const favourites = createInfiniteQuery(() => ({
    queryKey: ["spotify", "top", currentKind(), timeRange(), accessToken()],
    enabled: !isServer && !!accessToken(),
    initialPageParam: `https://api.spotify.com/v1/me/top/${currentKind()}?limit=50&time_range=${timeRange()}`,
    queryFn: ({ pageParam }) => spotifyFetch<SpotifyPage<SpotifyItem>>(pageParam),
    getNextPageParam: lastPage => lastPage.next || undefined,
  }));

  createEffect(() => { if (atBottom() && favourites.hasNextPage && !favourites.isFetchingNextPage) void favourites.fetchNextPage(); });

  const items = () => favourites.data?.pages.flatMap(p => p.items) ?? [];
  const logout = () => { clearStoredState(); navigate("/attempt2/login"); };

  const rangeLabel = { short_term: "past_month", medium_term: "past_6mo", long_term: "all_time" } as const;

  return (
    <div class="min-h-screen font-mono" style="background: #000; color: #00ff41">
      <Title>Spotistats | Favourites</Title>
      <header class="px-4 py-3 flex items-center justify-between text-xs" style="border-bottom: 1px dashed #00ff4133">
        <span class="font-bold text-sm">[spotistats@terminal ~]$</span>
        <nav class="flex gap-6">
          <A href="/attempt2" class="hover:underline" style="color: #00ff4166">./profile</A>
          <A href="/attempt2/favourites" class="hover:underline" style="color: #00ff41">./favourites</A>
        </nav>
        <button onClick={logout} class="hover:underline" style="color: #ff444499">--logout</button>
      </header>
      <main class="max-w-2xl mx-auto px-4 py-8">
        <div class="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-6" style="color: #00ff4166">
          <span>$ top --type=<span style="color: #00ff41">
            {(["Tracks", "Artists"] as ItemType[]).map(opt => (
              <button onClick={() => setType(opt)} class={`mx-1 hover:underline ${type() === opt ? "" : "opacity-50"}`}>{opt.toLowerCase()}</button>
            ))}
          </span></span>
          <span>--range=<span style="color: #00ff41">
            {([["short_term", "month"], ["medium_term", "6mo"], ["long_term", "all"]] as [TimeRange, string][]).map(([range, label]) => (
              <button onClick={() => setTimeRange(range)} class={`mx-1 hover:underline ${timeRange() === range ? "" : "opacity-50"}`}>{label}</button>
            ))}
          </span></span>
        </div>
        <p class="text-xs mb-4" style="color: #00ff4155">$ cat top_{currentKind()}_{rangeLabel[timeRange()]}.txt</p>
        <div>
          <For each={items()}>
            {(item, index) => {
              const sub = () => item.type === "track" ? item.artists?.map(a => a.name).join(", ") : "artist";
              const url = () => linkToUri() ? item.uri : item.external_urls.spotify;
              return (
                <button
                  type="button"
                  onClick={() => { if (url().startsWith("spotify:")) window.location.href = url(); else window.open(url(), "_blank", "noopener"); }}
                  class="w-full text-left py-1 text-sm flex gap-3 hover:bg-[#00ff4108] transition"
                  style="border-bottom: 1px solid #00ff4108"
                >
                  <span class="shrink-0 tabular-nums" style="color: #00ff4155; width: 2.5rem">{String(index() + 1).padStart(2, "0")}.</span>
                  <span class="truncate">{item.name}</span>
                  <span class="shrink-0 ml-auto truncate max-w-[12rem]" style="color: #00ff4155">{sub()}</span>
                </button>
              );
            }}
          </For>
        </div>
        <div ref={sentinel} class="h-8" />
        <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
          <p class="text-xs mt-4" style="color: #00ff4155">fetching next page<span class="animate-pulse">_</span></p>
        </Show>
      </main>
    </div>
  );
}
