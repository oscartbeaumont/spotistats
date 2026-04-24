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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt5/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt5/login"); };

  return (
    <div class="min-h-screen" style="background: #0a0a0a; color: white">
      <Title>Spotistats | Favourites</Title>
      <header class="flex items-center justify-between px-8 py-5" style="border-bottom: 1px solid rgba(255,255,255,0.06)">
        <span class="font-black tracking-tighter text-lg" style="letter-spacing: -0.05em">SPOTISTATS</span>
        <nav class="flex gap-8 text-sm">
          <A href="/attempt5" class="transition" style="color: rgba(255,255,255,0.35)">Profile</A>
          <A href="/attempt5/favourites" class="font-bold" style="color: white">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs transition hover:opacity-50" style="color: rgba(255,255,255,0.3)">Sign out</button>
      </header>
      <main class="max-w-3xl mx-auto px-8 py-12">
        <div class="flex flex-col md:flex-row md:items-baseline gap-4 mb-10" style="border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2rem">
          <h1 class="font-black text-3xl md:text-4xl tracking-tighter" style="letter-spacing: -0.04em">Top {type()}</h1>
          <div class="flex gap-6 md:ml-auto text-sm flex-wrap">
            {(["Tracks", "Artists"] as ItemType[]).map(opt => (
              <button onClick={() => setType(opt)} class="transition font-medium" style={type() === opt ? "color: white; text-decoration: underline; text-underline-offset: 4px" : "color: rgba(255,255,255,0.25)"}>{opt}</button>
            ))}
            <span style="color: rgba(255,255,255,0.1)">|</span>
            {([["short_term", "Month"], ["medium_term", "6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
              <button onClick={() => setTimeRange(range)} class="transition" style={timeRange() === range ? "color: #1DB954; font-weight: 500" : "color: rgba(255,255,255,0.2)"}>{label}</button>
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
                  class="w-full flex items-center gap-6 py-4 text-left transition"
                  style="border-bottom: 1px solid rgba(255,255,255,0.04)"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderBottomColor = "rgba(29,185,84,0.3)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderBottomColor = "rgba(255,255,255,0.04)"; }}
                >
                  <span class="font-black text-2xl md:text-3xl shrink-0 tracking-tighter" style="color: rgba(255,255,255,0.08); min-width: 3rem">{index() + 1}</span>
                  <img src={img() ?? "/assets/placeholder.svg"} alt={item.name} class="h-12 w-12 object-cover shrink-0" />
                  <div class="min-w-0">
                    <p class="font-bold text-sm tracking-tight truncate">{item.name}</p>
                    <p class="text-xs truncate mt-0.5" style="color: rgba(255,255,255,0.35)">{sub()}</p>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
        <div ref={sentinel} class="h-8" />
        <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
          <p class="text-center text-xs py-8 animate-pulse" style="color: rgba(255,255,255,0.2); letter-spacing: 0.2em">LOADING</p>
        </Show>
      </main>
    </div>
  );
}
