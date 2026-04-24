import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createEffect, createResource, createSignal, For, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { ItemCard } from "~/components/ItemCard";
import { accessToken, linkToUri, setTopItemsCache, topItemsCache } from "~/lib/storage";
import { useSpotifyFetch } from "~/lib/spotify";

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

async function hasSaveData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export default function Favourites() {
  const navigate = useNavigate();
  const spotifyFetch = useSpotifyFetch();
  const [type, setType] = createSignal<ItemType>("Tracks");
  const [timeRange, setTimeRange] = createSignal<TimeRange>("short_term");

  onMount(() => {
    if (!accessToken()) navigate("/login", { replace: true });
  });

  async function loadAndCache(kind: "tracks" | "artists", range: TimeRange, dataSaver = false) {
    const key = `top_${kind}_${range}`;
    const cached = topItemsCache()[key] as SpotifyItem[] | undefined;
    if (cached) return cached;
    if (dataSaver) return [];

    let url: string | null = `https://api.spotify.com/v1/me/top/${kind}?limit=30&time_range=${range}`;
    let value: SpotifyItem[] = [];
    while (url) {
      const data: SpotifyPage<SpotifyItem> = await spotifyFetch(url);
      value = value.concat(data.items);
      url = data.next;
    }
    setTopItemsCache({ ...topItemsCache(), [key]: value });
    return value;
  }

  const [tracks] = createResource(() => (!isServer && accessToken() ? timeRange() : null), range => loadAndCache("tracks", range));
  const [artists, { refetch: refetchArtists }] = createResource(
    () => (!isServer && accessToken() ? timeRange() : null),
    async range => loadAndCache("artists", range, await hasSaveData()),
  );

  createEffect(() => {
    if (type() === "Artists" && artists()?.length === 0) refetchArtists();
  });

  const items = () => (type() === "Tracks" ? tracks() : artists()) ?? [];

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
      <Show when={!tracks.loading && !artists.loading} fallback={<p class="px-2 text-zinc-400">Loading favourites...</p>}>
        <div class="space-y-1">
          <For each={items()}>{(item, index) => <ItemCard name={`${index() + 1}. ${item.name}`} description={item.type === "track" ? item.artists?.map(artist => artist.name).join(", ") : ""} images={item.type === "track" ? item.album?.images : item.images} url={linkToUri() ? item.uri : item.external_urls.spotify} />}</For>
        </div>
      </Show>
    </main>
  );
}
