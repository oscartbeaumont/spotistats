import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createInfiniteQuery } from "@tanstack/solid-query";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { accessToken, clearStoredState, linkToUri, profileCache } from "~/lib/storage";
import { hasSpotifyCallbackCode, useSpotifyFetch } from "~/lib/spotify";

type TimeRange = "long_term" | "medium_term" | "short_term";
type ItemType = "Tracks" | "Artists";
type SpotifyPage<T> = { items: T[]; next: string | null };
type SpotifyItem = { name: string; type: "track" | "artist"; uri: string; external_urls: { spotify: string }; images?: { url: string }[]; artists?: { name: string }[]; album?: { images: { url: string }[] }; };

const navLinks = [
  { href: "/attempt6", label: "Profile", icon: "○" },
  { href: "/attempt6/favourites", label: "Favourites", icon: "♥" },
];

export default function Favourites() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [type, setType] = createSignal<ItemType>("Tracks");
  const [timeRange, setTimeRange] = createSignal<TimeRange>("short_term");
  const [atBottom, setAtBottom] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt6/login", { replace: true });
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
  const user = () => profileCache();
  const logout = () => { clearStoredState(); navigate("/attempt6/login"); };

  return (
    <div class="min-h-screen flex" style="background: #111118; color: white">
      <Title>Spotistats | Favourites</Title>
      <aside class="w-56 shrink-0 flex flex-col py-6 px-3" style="background: #0d0d13; border-right: 1px solid rgba(255,255,255,0.05)">
        <div class="flex items-center gap-2 px-3 mb-8">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background: #1DB954">
            <span class="text-black font-black text-xs">S</span>
          </div>
          <span class="font-bold text-sm">Spotistats</span>
        </div>
        <nav class="flex-1 space-y-0.5">
          {navLinks.map(({ href, label, icon }) => (
            <A
              href={href}
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition"
              style={href === "/attempt6/favourites" ? "background: rgba(255,255,255,0.07); color: white; font-weight: 500" : "color: rgba(255,255,255,0.5)"}
            >
              <span style="font-size: 0.75rem">{icon}</span>
              {label}
            </A>
          ))}
        </nav>
        <Show when={user()}>
          {u => (
            <div class="px-3 pt-4" style="border-top: 1px solid rgba(255,255,255,0.05)">
              <div class="flex items-center gap-2 mb-3">
                <img src={u().icon ?? "/assets/placeholder.svg"} alt="" class="h-7 w-7 rounded-full object-cover" />
                <span class="text-xs font-medium truncate">{u().displayName}</span>
              </div>
              <button onClick={logout} class="w-full text-left text-xs transition hover:opacity-70" style="color: rgba(255,255,255,0.3)">Sign out</button>
            </div>
          )}
        </Show>
      </aside>
      <main class="flex-1 flex flex-col min-h-screen overflow-y-auto">
        <div class="px-8 py-5 flex items-center gap-6 flex-wrap" style="border-bottom: 1px solid rgba(255,255,255,0.05)">
          <h1 class="font-bold text-base">Top {type()}</h1>
          <div class="flex gap-1">
            {(["Tracks", "Artists"] as ItemType[]).map(opt => (
              <button onClick={() => setType(opt)} class="px-3 py-1.5 rounded-lg text-xs font-medium transition" style={type() === opt ? "background: rgba(255,255,255,0.1); color: white" : "color: rgba(255,255,255,0.35)"}>{opt}</button>
            ))}
          </div>
          <div class="flex gap-1">
            {([["short_term", "Month"], ["medium_term", "6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
              <button onClick={() => setTimeRange(range)} class="px-3 py-1.5 rounded-lg text-xs transition" style={timeRange() === range ? "background: rgba(29,185,84,0.15); color: #1DB954" : "color: rgba(255,255,255,0.3)"}>{label}</button>
            ))}
          </div>
        </div>
        <div class="flex-1 px-8 py-4">
          <For each={items()}>
            {(item, index) => {
              const img = () => item.type === "track" ? item.album?.images?.[0]?.url : item.images?.[0]?.url;
              const sub = () => item.type === "track" ? item.artists?.map(a => a.name).join(", ") : "";
              const url = () => linkToUri() ? item.uri : item.external_urls.spotify;
              return (
                <button
                  type="button"
                  onClick={() => { if (url().startsWith("spotify:")) window.location.href = url(); else window.open(url(), "_blank", "noopener"); }}
                  class="w-full flex items-center gap-4 py-2.5 px-3 rounded-lg text-left transition hover:bg-white/[0.04]"
                >
                  <span class="text-xs w-5 shrink-0 tabular-nums text-right" style="color: rgba(255,255,255,0.2)">{index() + 1}</span>
                  <img src={img() ?? "/assets/placeholder.svg"} alt={item.name} class="h-9 w-9 rounded object-cover shrink-0" />
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{item.name}</p>
                    <p class="text-xs truncate" style="color: rgba(255,255,255,0.35)">{sub()}</p>
                  </div>
                </button>
              );
            }}
          </For>
          <div ref={sentinel} class="h-8" />
          <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
            <p class="text-xs py-4 text-center animate-pulse" style="color: rgba(255,255,255,0.2)">Loading more...</p>
          </Show>
        </div>
      </main>
    </div>
  );
}
