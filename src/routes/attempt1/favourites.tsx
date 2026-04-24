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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt1/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt1/login"); };

  return (
    <div class="min-h-screen" style="background: radial-gradient(ellipse at 50% -10%, rgba(29,185,84,0.12) 0%, #07090f 55%)">
      <Title>Spotistats | Favourites</Title>
      <header class="sticky top-0 z-10 px-6 py-4 flex items-center justify-between" style="background: rgba(7,9,15,0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.06)">
        <span class="font-black text-[#1DB954] text-lg tracking-tight">spotistats</span>
        <nav class="flex gap-6 text-sm">
          <A href="/attempt1" class="text-zinc-400 hover:text-white transition">Profile</A>
          <A href="/attempt1/favourites" class="text-white font-medium">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs text-zinc-600 hover:text-zinc-300 transition">Logout</button>
      </header>
      <main class="max-w-2xl mx-auto px-4 py-8">
        <div class="flex flex-wrap items-center gap-3 mb-8">
          <h1 class="text-2xl font-bold text-white mr-2">Top</h1>
          {(["Tracks", "Artists"] as ItemType[]).map(opt => (
            <button onClick={() => setType(opt)} class={`rounded-full px-4 py-1.5 text-sm font-medium transition ${type() === opt ? "bg-[#1DB954] text-black" : "text-zinc-400 hover:text-white"}`} style={type() !== opt ? "border: 1px solid rgba(255,255,255,0.1)" : ""}>{opt}</button>
          ))}
          <span class="text-zinc-800 mx-1">|</span>
          {([["short_term", "Month"], ["medium_term", "6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
            <button onClick={() => setTimeRange(range)} class={`text-sm transition ${timeRange() === range ? "text-[#1DB954] font-medium" : "text-zinc-600 hover:text-zinc-300"}`}>{label}</button>
          ))}
        </div>
        <div class="space-y-1">
          <For each={items()}>
            {(item, index) => {
              const img = () => item.type === "track" ? item.album?.images?.[0]?.url : item.images?.[0]?.url;
              const sub = () => item.type === "track" ? item.artists?.map(a => a.name).join(", ") : "";
              const url = () => linkToUri() ? item.uri : item.external_urls.spotify;
              return (
                <button
                  type="button"
                  onClick={() => { if (url().startsWith("spotify:")) window.location.href = url(); else window.open(url(), "_blank", "noopener"); }}
                  class="w-full flex items-center gap-4 rounded-2xl p-3 text-left transition hover:bg-white/[0.04]"
                  style="border: 1px solid transparent"
                >
                  <span class="text-zinc-700 text-xs w-6 text-right shrink-0 tabular-nums">{index() + 1}</span>
                  <img src={img() ?? "/assets/placeholder.svg"} alt={item.name} class="h-11 w-11 rounded-xl object-cover shrink-0" />
                  <div class="min-w-0">
                    <p class="text-white text-sm font-medium truncate">{item.name}</p>
                    <p class="text-zinc-600 text-xs truncate mt-0.5">{sub()}</p>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
        <div ref={sentinel} class="h-8" />
        <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
          <div class="flex items-center justify-center gap-2 py-8">
            <span class="h-1.5 w-1.5 rounded-full bg-[#1DB954] animate-pulse" />
            <span class="text-zinc-600 text-sm">Loading more...</span>
          </div>
        </Show>
      </main>
    </div>
  );
}
