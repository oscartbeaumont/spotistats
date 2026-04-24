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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt10/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt10/login"); };

  return (
    <div class="min-h-screen flex flex-col" style="background: #000; color: white">
      <Title>Spotistats | Favourites</Title>
      <header class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px solid #1c1c1e">
        <span class="font-semibold text-base tracking-tight">Spotistats</span>
        <nav class="flex gap-6">
          <A href="/attempt10" class="text-sm transition hover:text-white" style="color: rgba(255,255,255,0.4)">Profile</A>
          <A href="/attempt10/favourites" class="text-sm font-medium" style="color: white">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs font-medium transition hover:opacity-60" style="color: rgba(255,255,255,0.3)">Sign out</button>
      </header>
      <div class="px-6 py-4 flex flex-wrap items-center gap-2" style="border-bottom: 1px solid #1c1c1e">
        <div class="flex gap-1 p-1 rounded-xl" style="background: #1c1c1e">
          {(["Tracks", "Artists"] as ItemType[]).map(opt => (
            <button onClick={() => setType(opt)} class="px-4 py-1.5 rounded-lg text-sm font-medium transition" style={type() === opt ? "background: #2c2c2e; color: white" : "color: rgba(255,255,255,0.4)"}>{opt}</button>
          ))}
        </div>
        <div class="flex gap-1 p-1 rounded-xl" style="background: #1c1c1e">
          {([["short_term", "Month"], ["medium_term", "6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
            <button onClick={() => setTimeRange(range)} class="px-3 py-1.5 rounded-lg text-xs font-medium transition" style={timeRange() === range ? "background: #1DB954; color: black" : "color: rgba(255,255,255,0.35)"}>{label}</button>
          ))}
        </div>
      </div>
      <main class="flex-1 max-w-2xl w-full mx-auto px-4 py-2">
        <For each={items()}>
          {(item, index) => {
            const img = () => item.type === "track" ? item.album?.images?.[0]?.url : item.images?.[0]?.url;
            const sub = () => item.type === "track" ? item.artists?.map(a => a.name).join(", ") : "";
            const url = () => linkToUri() ? item.uri : item.external_urls.spotify;
            return (
              <button
                type="button"
                onClick={() => { if (url().startsWith("spotify:")) window.location.href = url(); else window.open(url(), "_blank", "noopener"); }}
                class="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-left transition hover:bg-white/[0.04]"
              >
                <span class="text-sm w-7 shrink-0 tabular-nums text-right" style="color: rgba(255,255,255,0.2)">{index() + 1}</span>
                <img src={img() ?? "/assets/placeholder.svg"} alt={item.name} class="h-12 w-12 rounded-xl object-cover shrink-0" />
                <div class="min-w-0">
                  <p class="text-sm font-medium tracking-tight truncate">{item.name}</p>
                  <p class="text-xs truncate mt-0.5" style="color: rgba(255,255,255,0.35)">{sub()}</p>
                </div>
              </button>
            );
          }}
        </For>
        <div ref={sentinel} class="h-8" />
        <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
          <p class="text-center text-xs py-8" style="color: rgba(255,255,255,0.2)">Loading more...</p>
        </Show>
      </main>
    </div>
  );
}
