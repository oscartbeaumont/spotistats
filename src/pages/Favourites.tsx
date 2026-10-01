import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
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
  const [pageCount, setPageCount] = createSignal(1);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [atBottom, setAtBottom] = createSignal(false);
  const [saveData, setSaveData] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;

  const result = createMemo(async () => {
    if (props.kind === "albums" && saveData()) return { items: [], hasMore: false };
    const items: SpotifyItem[] = [];
    let hasMore = false;
    for (let index = 0; index < pageCount(); index += 1) {
      const page =
        props.kind === "tracks"
          ? await runSpotify(getTopTracksPage(range(), index * 50))
          : await runSpotify(getSavedAlbumsPage(index * 50));
      items.push(...page.items);
      hasMore = page.next !== null;
    }
    return { items, hasMore };
  });

  onSettled(() => {
    setSaveData(hasSaveData());
    const observer = new IntersectionObserver(
      (entries) => setAtBottom(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "500px" },
    );
    if (sentinel) observer.observe(sentinel);
    return () => observer.disconnect();
  });

  createEffect(
    () => ({ bottom: atBottom(), data: latest(result) }),
    ({ bottom, data }) => {
      if (bottom && data?.hasMore) setPageCount((count) => count + 1);
    },
  );

  createEffect(
    () => ({
      length: latest(result)?.items.length ?? 0,
      selected: selectedIndex(),
    }),
    ({ length, selected }) => {
      if (selected >= length) setSelectedIndex(Math.max(length - 1, 0));
    },
  );

  const items = () => result().items;

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
      Math.min(selectedIndex() + delta, (latest(result)?.items.length ?? 1) - 1),
    );
    setSelectedIndex(next);
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
    openItem(latest(result)?.items[selectedIndex()]);
  });
  createShortcut(["t"], (event) => {
    if (isEditableShortcutTarget(event)) return;
    navigate(props.kind === "tracks" ? "/favourites/albums" : "/favourites/tracks");
    setSelectedIndex(0);
  });
  RANGES.forEach((value, index) => {
    createShortcut([String(index + 1)], (event) => {
      if (isEditableShortcutTarget(event)) return;
      setRange(value);
      setPageCount(1);
      setSelectedIndex(0);
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
                setPageCount(1);
                setSelectedIndex(0);
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
                onFocus={() => setSelectedIndex(index())}
                onOpen={() => openItem(item)}
              />
            )}
          </For>
        </Show>
      </Loading>
      <div ref={sentinel} class="h-8" />
    </main>
  );
}
