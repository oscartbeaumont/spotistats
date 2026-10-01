import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  isPending,
  latest,
  Loading,
  onSettled,
  Show,
} from "solid-js";

import {
  getSavedAlbumsPage,
  getTopTracksPage,
  runSpotify,
  type SpotifyItem,
} from "~/client/spotify";
import { authStore } from "~/client/storage";
import { createShortcut, isEditableShortcutTarget } from "~/lib/shortcut";

type Range = "long" | "medium" | "short";

const RANGES: readonly Range[] = ["short", "medium", "long"];

const hasSaveData = () => {
  if (!("connection" in navigator)) return false;
  const connection = navigator.connection;
  return (
    typeof connection === "object" &&
    connection !== null &&
    "saveData" in connection &&
    connection.saveData === true
  );
};

function FavouriteRow(props: {
  item: SpotifyItem;
  index: number;
  selected: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const image = () =>
    props.item.type === "track"
      ? props.item.album?.images?.[0]?.url
      : props.item.images?.[0]?.url;
  const subtitle = () =>
    props.item.type === "track" || props.item.type === "album"
      ? props.item.artists?.map((artist) => artist.name).join(", ")
      : "";

  return (
    <button
      id={`favourite-${props.index}`}
      type="button"
      onFocus={props.onFocus}
      onClick={props.onOpen}
      class={`w-full flex items-center gap-4 py-3 text-left transition outline-none border-b-[3px] border-[#0a0a0a] ${
        props.selected ? "bg-[#0a0a0a] pl-2 text-[#f0ede8]" : ""
      }`}
    >
      <span class="font-black text-lg w-8 shrink-0 text-[#ccc]">
        {props.index + 1}
      </span>
      <img
        src={image() ?? "/assets/placeholder.svg"}
        alt={props.item.name}
        class="h-10 w-10 object-cover shrink-0 border-2 border-[#0a0a0a]"
      />
      <div class="min-w-0">
        <p class="text-sm font-black uppercase tracking-tight truncate">
          {props.item.name}
        </p>
        <p class="text-xs truncate mt-0.5 text-[#888]">
          {subtitle()}
        </p>
      </div>
    </button>
  );
}

export function FavouritesPage(props: { kind: "tracks" | "albums" }) {
  const navigate = useNavigate();
  const [range, setRange] = createSignal<Range>("short");
  const [rawSelected, setRawSelected] = createSignal(0);
  const [atBottom, setAtBottom] = createSignal(false);
  const [saveData, setSaveData] = createSignal(false);
  const [extra, setExtra] = createSignal<SpotifyItem[]>([]);
  const [hasMore, setHasMore] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  const fetchPage = (offset: number) =>
    props.kind === "tracks"
      ? runSpotify(getTopTracksPage(range(), offset))
      : runSpotify(getSavedAlbumsPage(offset));

  // The first page suspends, so `<Loading>` covers the initial load. Later
  // pages append to `extra`, so a load never refetches the earlier pages.
  const firstPage = createMemo(async () => {
    if (props.kind === "albums" && saveData()) {
      return { items: [] as SpotifyItem[], next: null };
    }
    return fetchPage(0);
  });

  const items = createMemo(() => [...firstPage().items, ...extra()]);

  /**
   * Non-suspending read for handlers, effects, and the scroll trigger.
   * `latest` throws for a source that has never resolved, so guard on
   * `isPending` first; after the first load it is always safe.
   */
  const loadedItems = (): SpotifyItem[] =>
    isPending(items) ? [] : (latest(items) ?? []);

  // Derived selection: the raw index is clamped to the loaded rows, so no
  // effect has to write the signal back.
  const selectedIndex = createMemo(() =>
    Math.max(0, Math.min(rawSelected(), loadedItems().length - 1)),
  );

  const resetPaging = () => {
    setExtra([]);
    setHasMore(true);
    setRawSelected(0);
  };

  const loadMore = async (offset: number) => {
    if (loadingMore() || !hasMore()) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(offset);
      setExtra((previous) => [...previous, ...page.items]);
      setHasMore(page.next !== null);
    } finally {
      setLoadingMore(false);
    }
  };

  onSettled(() => {
    setSaveData(hasSaveData());
    observer = new IntersectionObserver(
      (entries) => setAtBottom(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "500px" },
    );
    // The sentinel may mount after this runs (the first page suspends), so the
    // ref callback observes it as a fallback.
    if (sentinel) observer.observe(sentinel);
    return () => observer?.disconnect();
  });

  // Run when the first page settles, so `latest` is safe to read.
  createEffect(
    () => (isPending(firstPage) ? undefined : latest(firstPage)),
    (page) => {
      if (!page) return;
      setHasMore(page.next !== null);
      setExtra([]);
    },
  );

  // Load the next page when the sentinel is in view and the first page is
  // resolved. The offset is computed in the tracking scope so no `latest`
  // read happens in the effect callback.
  createEffect(
    () => {
      const pending = isPending(items);
      return {
        pending,
        bottom: atBottom(),
        more: hasMore(),
        loading: loadingMore(),
        offset: pending ? 0 : (latest(items)?.length ?? 0),
      };
    },
    ({ pending, bottom, more, loading, offset }) => {
      if (!pending && bottom && more && !loading) void loadMore(offset);
    },
  );

  const itemUrl = (item: SpotifyItem) => {
    const store = authStore();
    return store.status === "authenticated" && store.linkToUri
      ? item.uri
      : item.external_urls.spotify;
  };

  const openItem = (item: SpotifyItem | undefined) => {
    if (!item) return;
    const url = itemUrl(item);
    if (url.startsWith("spotify:")) window.location.href = url;
    else window.open(url, "_blank", "noopener");
  };

  const moveSelection = (delta: number) => {
    const next = Math.max(
      0,
      Math.min(selectedIndex() + delta, loadedItems().length - 1),
    );
    setRawSelected(next);
    document
      .getElementById(`favourite-${next}`)
      ?.scrollIntoView({ block: "nearest" });
  };

  createShortcut(["j"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveSelection(1);
  });
  createShortcut(["k"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveSelection(-1);
  });
  createShortcut(["ArrowDown"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveSelection(1);
  });
  createShortcut(["ArrowUp"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    moveSelection(-1);
  });
  createShortcut(["Enter"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    openItem(loadedItems()[selectedIndex()]);
  });
  createShortcut(["t"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    navigate(props.kind === "tracks" ? "/favourites/albums" : "/favourites/tracks");
    resetPaging();
  });
  RANGES.forEach((value, index) => {
    createShortcut([String(index + 1)], (event) => {
      if (isEditableShortcutTarget(event)) return;
      setRange(value);
      resetPaging();
    });
  });

  const title = () => (props.kind === "tracks" ? "Top Tracks" : "Saved Albums");

  return (
    <main class="app-main p-8 md:p-12">
      <Title>Spotistats | Favourites</Title>
      <div class="flex flex-wrap items-center gap-0 mb-3">
        <h1 class="text-2xl font-black uppercase tracking-tight mr-6">
          {title()}
        </h1>
        <a
          href="/favourites/tracks"
          class={`font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] ${
            props.kind === "tracks" ? "bg-[#0a0a0a] text-[#f0ede8]" : "text-[#0a0a0a]"
          }`}
        >
          Tracks
        </a>
        <a
          href="/favourites/albums"
          class={`font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] ${
            props.kind === "albums" ? "bg-[#0a0a0a] text-[#f0ede8]" : "text-[#0a0a0a]"
          }`}
        >
          Albums
        </a>
        <span class="mx-4 font-black text-[#ccc]">/</span>
        <For
          each={
            [
              ["short", "Month"],
              ["medium", "6 Months"],
              ["long", "All Time"],
            ] as [Range, string][]
          }
        >
          {([optionRange, label], index) => (
            <button
              onClick={() => {
                setRange(optionRange);
                resetPaging();
              }}
              class={`text-xs uppercase tracking-wide px-3 py-2 font-bold transition border-[3px] ${
                range() === optionRange
                  ? "border-[#1DB954] bg-[#1DB954] text-black"
                  : "border-transparent text-[#999]"
              }`}
            >
              {label} <span class="ml-1 text-[0.6rem] opacity-50">{index() + 1}</span>
            </button>
          )}
        </For>
      </div>
      <div class="mb-6 flex flex-wrap gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-[#777]">
        <span>J/↓ Next</span>
        <span>K/↑ Previous</span>
        <span>Enter Open</span>
        <span>T Toggle Type</span>
        <span>1/2/3 Range</span>
      </div>
      <Loading fallback={<p class="text-sm uppercase tracking-widest text-[#999]">LOADING_</p>}>
        <Show
          when={items().length > 0}
          fallback={
            <p class="py-8 text-sm font-bold uppercase tracking-widest text-[#999]">
              NO FAVOURITES FOUND_
            </p>
          }
        >
          <For each={items()}>
            {(item, index) => (
              <FavouriteRow
                item={item}
                index={index()}
                selected={selectedIndex() === index()}
                onFocus={() => setRawSelected(index())}
                onOpen={() => openItem(item)}
              />
            )}
          </For>
          <Show when={loadingMore()}>
            <p class="py-6 text-xs uppercase tracking-[0.2em] text-[#aaa]">
              LOADING MORE_
            </p>
          </Show>
        </Show>
      </Loading>
      <div
        ref={(el) => {
          sentinel = el;
          observer?.observe(el);
        }}
        class="h-8"
      />
    </main>
  );
}
