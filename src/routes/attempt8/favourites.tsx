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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt8/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt8/login"); };

  return (
    <div class="min-h-screen relative overflow-hidden" style="background: #020810; color: white">
      <Title>Spotistats | Favourites</Title>
      <div class="fixed inset-0 pointer-events-none">
        <div class="absolute" style="top: -10%; left: -5%; width: 50%; height: 50%; background: radial-gradient(circle, rgba(29,185,84,0.1) 0%, transparent 70%); filter: blur(60px)" />
        <div class="absolute" style="bottom: -10%; right: -5%; width: 50%; height: 50%; background: radial-gradient(circle, rgba(100,220,200,0.07) 0%, transparent 70%); filter: blur(60px)" />
      </div>
      <header class="relative z-10 px-6 py-4 flex items-center justify-between" style="background: rgba(2,8,16,0.7); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.05)">
        <div class="flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-lg flex items-center justify-center" style="background: linear-gradient(135deg, #1DB954, #0f7a35)">
            <span class="text-black font-black text-xs">S</span>
          </div>
          <span class="font-bold text-sm">Spotistats</span>
        </div>
        <nav class="flex gap-6 text-sm">
          <A href="/attempt8" class="hover:text-white transition" style="color: rgba(255,255,255,0.4)">Profile</A>
          <A href="/attempt8/favourites" class="font-medium" style="color: #1DB954">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs transition hover:opacity-70" style="color: rgba(255,255,255,0.3)">Logout</button>
      </header>
      <main class="relative z-10 max-w-2xl mx-auto px-4 py-8">
        <div class="flex flex-wrap items-center gap-2 mb-8">
          <h1 class="text-xl font-bold mr-3">Top {type()}</h1>
          <div class="flex gap-1 p-1 rounded-xl" style="background: rgba(255,255,255,0.04)">
            {(["Tracks", "Artists"] as ItemType[]).map(opt => (
              <button onClick={() => setType(opt)} class="px-4 py-1.5 rounded-lg text-sm font-medium transition" style={type() === opt ? "background: rgba(255,255,255,0.1); color: white" : "color: rgba(255,255,255,0.35)"}>{opt}</button>
            ))}
          </div>
          <div class="flex gap-1 p-1 rounded-xl" style="background: rgba(255,255,255,0.04)">
            {([["short_term", "Month"], ["medium_term", "6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
              <button onClick={() => setTimeRange(range)} class="px-3 py-1.5 rounded-lg text-xs transition" style={timeRange() === range ? "background: rgba(29,185,84,0.15); color: #1DB954" : "color: rgba(255,255,255,0.3)"}>{label}</button>
            ))}
          </div>
        </div>
        <div class="space-y-0.5">
          <For each={items()}>
            {(item, index) => {
              const img = () => item.type === "track" ? item.album?.images?.[0]?.url : item.images?.[0]?.url;
              const sub = () => item.type === "track" ? item.artists?.map(a => a.name).join(", ") : "";
              const url = () => linkToUri() ? item.uri : item.external_urls.spotify;
              return (
                <button
                  type="button"
                  onClick={() => { if (url().startsWith("spotify:")) window.location.href = url(); else window.open(url(), "_blank", "noopener"); }}
                  class="w-full flex items-center gap-4 p-3 rounded-xl text-left transition hover:bg-white/[0.04]"
                >
                  <span class="text-xs w-6 shrink-0 tabular-nums text-right" style="color: rgba(255,255,255,0.2)">{index() + 1}</span>
                  <img src={img() ?? "/assets/placeholder.svg"} alt={item.name} class="h-11 w-11 rounded-xl object-cover shrink-0" style="box-shadow: 0 4px 12px rgba(0,0,0,0.4)" />
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{item.name}</p>
                    <p class="text-xs truncate mt-0.5" style="color: rgba(255,255,255,0.35)">{sub()}</p>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
        <div ref={sentinel} class="h-8" />
        <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
          <div class="flex items-center justify-center gap-2 py-6">
            <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: #1DB954; box-shadow: 0 0 8px rgba(29,185,84,0.6)" />
            <span class="text-xs" style="color: rgba(255,255,255,0.3)">Loading more...</span>
          </div>
        </Show>
      </main>
    </div>
  );
}
