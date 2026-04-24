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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt3/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt3/login"); };

  return (
    <div class="min-h-screen" style="background: #f5f4f0; color: #1a1a1a">
      <Title>Spotistats | Favourites</Title>
      <header class="px-8 py-5 flex items-center justify-between" style="border-bottom: 1px solid #e5e3de">
        <span class="font-black tracking-tight">Spotistats</span>
        <nav class="flex gap-8 text-sm">
          <A href="/attempt3" class="hover:opacity-70 transition" style="color: #777">Profile</A>
          <A href="/attempt3/favourites" class="font-medium" style="color: #1a1a1a">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs transition hover:opacity-70" style="color: #aaa">Sign out</button>
      </header>
      <main class="max-w-xl mx-auto px-8 py-10">
        <div class="flex flex-wrap items-baseline gap-x-8 gap-y-3 mb-8" style="border-bottom: 1px solid #e5e3de; padding-bottom: 1.5rem">
          <h1 class="text-2xl font-black tracking-tight">Top {type()}</h1>
          <div class="flex gap-4 text-sm ml-auto">
            {(["Tracks", "Artists"] as ItemType[]).map(opt => (
              <button onClick={() => setType(opt)} class="transition" style={type() === opt ? "color: #1a1a1a; font-weight: 600; text-decoration: underline; text-underline-offset: 4px" : "color: #999"}>{opt}</button>
            ))}
          </div>
          <div class="flex gap-4 text-sm w-full">
            {([["short_term", "Past Month"], ["medium_term", "Past 6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
              <button onClick={() => setTimeRange(range)} class="transition" style={timeRange() === range ? "color: #1DB954; font-weight: 500" : "color: #bbb"}>{label}</button>
            ))}
          </div>
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
                  class="w-full flex items-center gap-4 py-3 text-left transition hover:opacity-70"
                  style="border-bottom: 1px solid #e5e3de"
                >
                  <span class="text-sm w-6 shrink-0 tabular-nums" style="color: #ccc">{index() + 1}</span>
                  <img src={img() ?? "/assets/placeholder.svg"} alt={item.name} class="h-10 w-10 rounded object-cover shrink-0" />
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{item.name}</p>
                    <p class="text-xs truncate mt-0.5" style="color: #999">{sub()}</p>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
        <div ref={sentinel} class="h-8" />
        <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
          <p class="text-center text-sm py-8" style="color: #ccc">Loading more...</p>
        </Show>
      </main>
    </div>
  );
}
