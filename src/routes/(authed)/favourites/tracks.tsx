import { createShortcut } from "@solid-primitives/keyboard";
import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createInfiniteQuery, useQueryClient } from "@tanstack/solid-query";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  startTransition,
} from "solid-js";
import { isEditableShortcutTarget } from "~/lib/keyboard";
import * as v from "valibot";
import { useValidatedSearchParams } from "~/lib/search-params";
import { authStore } from "~/lib/storage";
import {
  favouritesQueryOptions,
  type SpotifyItem,
  type SpotifyPage,
} from "~/lib/spotify";

type Range = "long" | "medium" | "short";
type FavouritesKind = "tracks" | "albums";

const filtersSchema = v.object({
  range: v.optional(v.picklist(["long", "medium", "short"] as const)),
});

function hasSaveData() {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return connection?.saveData === true;
}

function FavouriteRow(props: {
  item: SpotifyItem;
  index: number;
  selected: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const initialImage = () =>
    props.item.type === "track"
      ? props.item.album?.images?.[0]?.url
      : props.item.images?.[0]?.url;
  const [imageUrl, setImageUrl] = createSignal(initialImage());
  const sub = () =>
    props.item.type === "track" || props.item.type === "album"
      ? props.item.artists?.map((a) => a.name).join(", ")
      : "";

  createEffect(() => {
    const next = initialImage();
    if (next) setImageUrl(next);
  });

  return (
    <button
      id={`favourite-${props.index}`}
      type="button"
      onFocus={props.onFocus}
      onClick={props.onOpen}
      class={`w-full flex items-center gap-4 py-3 text-left transition outline-none border-b-[3px] border-[#0a0a0a] ${props.selected ? "bg-[#0a0a0a] pl-2 text-[#f0ede8]" : ""}`}
    >
      <span class="font-black text-lg w-8 shrink-0 text-[#ccc]">
        {props.index + 1}
      </span>
      <img
        src={imageUrl() ?? "/assets/placeholder.svg"}
        alt={props.item.name}
        class="h-10 w-10 object-cover shrink-0 border-2 border-[#0a0a0a]"
      />
      <div class="min-w-0">
        <p class="text-sm font-black uppercase tracking-tight truncate">
          {props.item.name}
        </p>
        <p class="text-xs truncate mt-0.5 text-[#888]">
          {sub()}
        </p>
      </div>
    </button>
  );
}

export default function Page() {
  return <FavouritesPage kind="tracks" />;
}

export function FavouritesPage(props: { kind: FavouritesKind }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] =
    useValidatedSearchParams(filtersSchema);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [atBottom, setAtBottom] = createSignal(false);
  const [saveData, setSaveData] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    localStorage.removeItem("top_items_cache");
    setSaveData(hasSaveData());
    observer = new IntersectionObserver(
      (entries) => {
        setAtBottom(entries.some((e) => e.isIntersecting));
      },
      { rootMargin: "500px" },
    );
    if (sentinel) observer.observe(sentinel);
  });
  onCleanup(() => observer?.disconnect());

  const range = () => searchParams().range ?? "short";
  const title = () => (props.kind === "tracks" ? "Top Tracks" : "Saved Albums");

  function setRange(range: Range) {
    startTransition(() => {
      setSearchParams({ range: range === "short" ? undefined : range });
    });
  }

  const favourites = createInfiniteQuery(() => ({
      ...favouritesQueryOptions(
        props.kind,
        range(),
        !(props.kind === "albums" && saveData()),
      ),
      placeholderData: (previous) =>
        previous ??
        queryClient.getQueryData([
          "spotify",
          "favourites",
          props.kind === "tracks" ? "albums" : "tracks",
          range(),
        ]),
    })
  );

  createEffect(() => {
    if (atBottom() && favourites.hasNextPage && !favourites.isFetchingNextPage)
      void favourites.fetchNextPage();
  });

  const items = createMemo(
    () =>
      (
        favourites.data?.pages as SpotifyPage<SpotifyItem>[] | undefined
      )?.flatMap((p) => p.items) ?? [],
  );
  const showBottomPending = () =>
    favourites.isLoading || (atBottom() && favourites.isFetchingNextPage);
  const showSwitchingPending = () =>
    favourites.isFetching && !favourites.isFetchingNextPage;
  const selectedItem = () => items()[selectedIndex()];

  function itemUrl(item: SpotifyItem) {
    const store = authStore();
    return store.status === "authenticated" && store.linkToUri
      ? item.uri
      : item.external_urls.spotify;
  }

  function openItem(item: SpotifyItem | undefined) {
    if (!item) return;
    const url = itemUrl(item);
    if (url.startsWith("spotify:")) window.location.href = url;
    else window.open(url, "_blank", "noopener");
  }

  function moveSelection(delta: number) {
    const nextIndex = Math.max(
      0,
      Math.min(selectedIndex() + delta, items().length - 1),
    );
    setSelectedIndex(nextIndex);
    document
      .getElementById(`favourite-${nextIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  createEffect(() => {
    if (selectedIndex() >= items().length)
      setSelectedIndex(Math.max(items().length - 1, 0));
  });

  onMount(() => {
    createShortcut(
      ["j"],
      (event) => {
        if (isEditableShortcutTarget(event)) return;
        event?.preventDefault();
        moveSelection(1);
      },
      { preventDefault: false, requireReset: true },
    );

    createShortcut(
      ["k"],
      (event) => {
        if (isEditableShortcutTarget(event)) return;
        event?.preventDefault();
        moveSelection(-1);
      },
      { preventDefault: false, requireReset: true },
    );

    createShortcut(
      ["ArrowDown"],
      (event) => {
        if (isEditableShortcutTarget(event)) return;
        event?.preventDefault();
        moveSelection(1);
      },
      { preventDefault: false, requireReset: true },
    );

    createShortcut(
      ["ArrowUp"],
      (event) => {
        if (isEditableShortcutTarget(event)) return;
        event?.preventDefault();
        moveSelection(-1);
      },
      { preventDefault: false, requireReset: true },
    );

    createShortcut(
      ["Enter"],
      (event) => {
        if (isEditableShortcutTarget(event)) return;
        event?.preventDefault();
        openItem(selectedItem());
      },
      { preventDefault: false, requireReset: true },
    );

    const toggleType = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "t") return;
      if (isEditableShortcutTarget(event)) return;
      event.preventDefault();
      startTransition(() => {
        navigate(
          props.kind === "tracks" ? "/favourites/albums" : "/favourites/tracks",
        );
        setSelectedIndex(0);
      });
    };
    window.addEventListener("keydown", toggleType);
    onCleanup(() => window.removeEventListener("keydown", toggleType));

    (["short", "medium", "long"] as Range[]).forEach((range, index) => {
      createShortcut(
        [String(index + 1)],
        (event) => {
          if (isEditableShortcutTarget(event)) return;
          event?.preventDefault();
          setRange(range);
          setSelectedIndex(0);
        },
        { preventDefault: false, requireReset: true },
      );
    });
  });

  return (
    <main class="app-main p-8 md:p-12">
      <Title>Spotistats | Favourites</Title>
      <div class="flex flex-wrap items-center gap-0 mb-3">
        <h1 class="text-2xl font-black uppercase tracking-tight mr-6">
          {title()}
        </h1>
        <a
          href="/favourites/tracks"
          onClick={(event) => {
            event.preventDefault();
            startTransition(() => {
              navigate("/favourites/tracks");
            });
          }}
          class={`font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] ${props.kind === "tracks" ? "bg-[#0a0a0a] text-[#f0ede8]" : "text-[#0a0a0a]"}`}
        >
          Tracks
        </a>
        <a
          href="/favourites/albums"
          onClick={(event) => {
            event.preventDefault();
            startTransition(() => {
              navigate("/favourites/albums");
            });
          }}
          class={`font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] ${props.kind === "albums" ? "bg-[#0a0a0a] text-[#f0ede8]" : "text-[#0a0a0a]"}`}
        >
          Albums
        </a>
        <span class="mx-4 font-black text-[#ccc]">
          /
        </span>
        <For
          each={[
            ["short", "Month"],
            ["medium", "6 Months"],
            ["long", "All Time"],
          ] as [Range, string][]}
        >
          {([optionRange, label], index) => (
            <button
              onClick={() => setRange(optionRange)}
              class={`text-xs uppercase tracking-wide px-3 py-2 font-bold transition border-[3px] ${range() === optionRange ? "border-[#1DB954] bg-[#1DB954] text-black" : "border-transparent text-[#999]"}`}
            >
              {label}{" "}
              <span class="ml-1 text-[0.6rem] opacity-50">{index() + 1}</span>
            </button>
          )}
        </For>
      </div>
      <div
        class="mb-6 flex flex-wrap gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-[#777]"
      >
        <span>J/↓ Next</span>
        <span>K/↑ Previous</span>
        <span>Enter Open</span>
        <span>T Toggle Type</span>
        <span>1/2/3 Range</span>
      </div>
      <div
        class={`transition-opacity ${showSwitchingPending() ? "opacity-45" : "opacity-100"}`}
      >
        <For
          each={items()}
          fallback={
            <Show when={!favourites.isLoading && !favourites.isFetching}>
              <p class="py-8 text-sm font-bold uppercase tracking-widest text-[#999]">
                NO FAVOURITES FOUND_
              </p>
            </Show>
          }
        >
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
      </div>
      <div ref={sentinel} class="h-8" />
      <Show when={showBottomPending()}>
        <p class="text-xs uppercase tracking-[0.2em] py-6 text-[#aaa]">
          LOADING_
        </p>
      </Show>
    </main>
  );
}
