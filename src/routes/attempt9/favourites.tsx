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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt9/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt9/login"); };

  return (
    <div class="min-h-screen relative overflow-hidden" style="background: #120a1f; color: white; background-image: linear-gradient(rgba(155,0,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(155,0,255,0.05) 1px, transparent 1px); background-size: 40px 40px">
      <Title>Spotistats | Favourites</Title>
      <div class="fixed inset-0 pointer-events-none">
        <div class="absolute" style="top: 0; left: 0; width: 50%; height: 50%; background: radial-gradient(circle, rgba(255,45,120,0.06) 0%, transparent 70%); filter: blur(60px)" />
        <div class="absolute" style="bottom: 0; right: 0; width: 50%; height: 50%; background: radial-gradient(circle, rgba(155,0,255,0.06) 0%, transparent 70%); filter: blur(60px)" />
      </div>
      <header class="relative z-10 px-6 py-4 flex items-center justify-between" style="background: rgba(18,10,31,0.8); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,45,120,0.15)">
        <span class="font-black text-base" style="background: linear-gradient(135deg, #ff2d78, #9b00e8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text">SPOTISTATS</span>
        <nav class="flex gap-6 text-sm">
          <A href="/attempt9" class="hover:text-white transition" style="color: rgba(255,255,255,0.4)">Profile</A>
          <A href="/attempt9/favourites" class="font-bold" style="color: #ff2d78; text-shadow: 0 0 10px rgba(255,45,120,0.4)">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs transition hover:opacity-70" style="color: rgba(155,0,255,0.5)">Logout</button>
      </header>
      <main class="relative z-10 max-w-2xl mx-auto px-4 py-8">
        <div class="flex flex-wrap items-center gap-3 mb-8">
          <h1 class="font-black text-xl tracking-wide mr-3" style="color: #ff2d78">♪ TOP {type().toUpperCase()}</h1>
          {(["Tracks", "Artists"] as ItemType[]).map(opt => (
            <button
              onClick={() => setType(opt)}
              class="px-4 py-1.5 text-xs font-bold tracking-wider uppercase transition"
              style={type() === opt
                ? "background: linear-gradient(135deg, rgba(255,45,120,0.3), rgba(155,0,255,0.3)); border: 1px solid rgba(255,45,120,0.5); color: #ff2d78; border-radius: 0.5rem; box-shadow: 0 0 10px rgba(255,45,120,0.2)"
                : "border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.3); border-radius: 0.5rem"}
            >{opt}</button>
          ))}
          <div class="flex gap-3">
            {([["short_term", "Month"], ["medium_term", "6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
              <button onClick={() => setTimeRange(range)} class="text-xs transition tracking-wide" style={timeRange() === range ? "color: #9b00e8; text-shadow: 0 0 8px rgba(155,0,232,0.5)" : "color: rgba(255,255,255,0.2)"}>{label}</button>
            ))}
          </div>
        </div>
        <div class="space-y-px">
          <For each={items()}>
            {(item, index) => {
              const img = () => item.type === "track" ? item.album?.images?.[0]?.url : item.images?.[0]?.url;
              const sub = () => item.type === "track" ? item.artists?.map(a => a.name).join(", ") : "";
              const url = () => linkToUri() ? item.uri : item.external_urls.spotify;
              return (
                <button
                  type="button"
                  onClick={() => { if (url().startsWith("spotify:")) window.location.href = url(); else window.open(url(), "_blank", "noopener"); }}
                  class="w-full flex items-center gap-4 p-3 rounded-lg text-left transition"
                  style="border: 1px solid transparent"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,45,120,0.2)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,45,120,0.05)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span class="text-xs w-6 shrink-0 tabular-nums text-right font-bold" style="color: rgba(155,0,255,0.4)">{String(index() + 1).padStart(2, "0")}</span>
                  <img src={img() ?? "/assets/placeholder.svg"} alt={item.name} class="h-10 w-10 rounded object-cover shrink-0" style="border: 1px solid rgba(255,45,120,0.2)" />
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{item.name}</p>
                    <p class="text-xs truncate mt-0.5" style="color: rgba(155,0,255,0.6)">{sub()}</p>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
        <div ref={sentinel} class="h-8" />
        <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
          <p class="text-xs text-center py-6 animate-pulse tracking-widest" style="color: rgba(255,45,120,0.4)">♪ LOADING ♪</p>
        </Show>
      </main>
    </div>
  );
}
