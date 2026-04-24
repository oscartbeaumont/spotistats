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
    if (!accessToken() && !hasSpotifyCallbackCode()) navigate("/attempt7/login", { replace: true });
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
  const logout = () => { clearStoredState(); navigate("/attempt7/login"); };

  return (
    <div class="min-h-screen flex flex-col font-mono" style="background: #f0ede8; color: #0a0a0a">
      <Title>Spotistats | Favourites</Title>
      <header class="p-5 flex items-center justify-between" style="border-bottom: 4px solid #0a0a0a">
        <span class="font-black text-xl tracking-tighter uppercase">SPOTISTATS</span>
        <nav class="flex gap-0">
          <A href="/attempt7" class="font-black text-sm uppercase px-4 py-2 tracking-wide transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]" style="border: 4px solid #0a0a0a">Profile</A>
          <A href="/attempt7/favourites" class="font-black text-sm uppercase px-4 py-2 tracking-wide" style="background: #0a0a0a; color: #f0ede8">Favourites</A>
        </nav>
        <button onClick={logout} class="text-xs uppercase tracking-widest font-bold transition hover:underline" style="color: #999">Logout</button>
      </header>
      <main class="flex-1 p-8 md:p-12">
        <div class="flex flex-wrap items-center gap-0 mb-8">
          <h1 class="text-2xl font-black uppercase tracking-tight mr-6">Top {type()}</h1>
          {(["Tracks", "Artists"] as ItemType[]).map(opt => (
            <button onClick={() => setType(opt)} class="font-black text-xs uppercase px-4 py-2 tracking-wide" style={type() === opt ? "background: #0a0a0a; color: #f0ede8; border: 3px solid #0a0a0a" : "border: 3px solid #0a0a0a; color: #0a0a0a"}>{opt}</button>
          ))}
          <span class="mx-4 font-black" style="color: #ccc">/</span>
          {([["short_term", "Month"], ["medium_term", "6 Months"], ["long_term", "All Time"]] as [TimeRange, string][]).map(([range, label]) => (
            <button onClick={() => setTimeRange(range)} class="text-xs uppercase tracking-wide px-3 py-2 font-bold transition" style={timeRange() === range ? "background: #1DB954; color: black; border: 3px solid #1DB954" : "border: 3px solid transparent; color: #999"}>{label}</button>
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
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#0a0a0a"; (e.currentTarget as HTMLElement).style.color = "#f0ede8"; (e.currentTarget as HTMLElement).style.paddingLeft = "0.5rem"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = ""; (e.currentTarget as HTMLElement).style.paddingLeft = ""; }}
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
        <Show when={favourites.isLoading || (atBottom() && favourites.isFetchingNextPage)}>
          <p class="text-xs uppercase tracking-[0.2em] py-6" style="color: #aaa">LOADING_</p>
        </Show>
      </main>
    </div>
  );
}
