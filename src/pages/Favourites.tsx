import { useNavigate } from "@solidjs/router";
import { Schema } from "effect";
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
  untrack,
} from "solid-js";

import {
  getSavedAlbumsPage,
  getTopTracksPage,
  runSpotify,
  SpotifyApiError,
  type SpotifyItem,
} from "~/client/spotify";
import { capture, captureError } from "~/client/analytics";
import { authStore } from "~/client/storage";
import { PageHeader } from "~/components/PageHeader";
import { errorMessage } from "~/lib/errors";
import { firstImageUrl } from "~/lib/images";
import { createShortcut } from "~/lib/shortcut";
import { externalHref, spotifyUri } from "~/lib/url";

type Range = "long" | "medium" | "short";

const RANGES: readonly Range[] = ["short", "medium", "long"];

/** One page of a Spotify list, as far as paging cares. */
interface Page {
  items: readonly SpotifyItem[];
  next: string | null;
  nextOffset: number;
}

const emptyPage = (): Page => ({ items: [], next: null, nextOffset: 0 });

/**
 * The pages appended after the first, plus the first page they extend.
 *
 * Keying the tail on the first-page object means a new first page (a range
 * change) drops the stale tail in the same flush, so the list never renders the
 * new head with the old tail.
 */
interface Tail {
  source: Page | null;
  items: SpotifyItem[];
  next: string | null;
  nextOffset: number;
}

const hasSaveData = () =>
  "connection" in navigator &&
  Schema.is(Schema.Struct({ saveData: Schema.Literal(true) }))(
    navigator.connection,
  );

function FavouriteRow(props: {
  item: SpotifyItem;
  index: number;
  selected: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const image = () =>
    props.item.type === "track"
      ? firstImageUrl(props.item.album?.images)
      : firstImageUrl(props.item.images);

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
      <span class="font-black text-lg w-8 shrink-0 text-[#5c5c5c]">
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
        <p class="text-xs truncate mt-0.5 text-[#5c5c5c]">
          {subtitle()}
        </p>
      </div>
    </button>
  );
}

/** Why the list's first page is missing, with the one action that helps. */
function LoadFailure(props: {
  message: string;
  rateLimited: boolean;
  onRetry: () => void;
}) {
  return (
    <div class="mt-6 border-4 border-red-800 p-4">
      <p class="text-sm font-black uppercase tracking-[0.2em] text-red-700">
        {props.rateLimited ? "RATE LIMITED_" : "COULD NOT LOAD_"}
      </p>
      <p class="mt-2 text-sm text-red-700">{props.message}</p>
      <button
        type="button"
        onClick={props.onRetry}
        class="mt-3 border-[3px] border-[#0a0a0a] px-3 py-1.5 text-[0.65rem] font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
      >
        Retry
      </button>
    </div>
  );
}

/** The type tabs, range tabs and keyboard hints above the list. */
function FavouritesHeader(props: {
  kind: "tracks" | "albums";
  range: Range;
  onSelectRange: (value: Range) => void;
}) {
  return (
    <PageHeader
      title={props.kind === "tracks" ? "Top Tracks" : "Saved Albums"}
      actions={
        <>
          <a
            href="/favourites/tracks"
            onClick={() => {
              if (props.kind !== "tracks")
                capture("favourites_kind_changed", { kind: "tracks" });
            }}
            class={`font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] ${
              props.kind === "tracks"
                ? "bg-[#0a0a0a] text-[#f0ede8]"
                : "text-[#0a0a0a]"
            }`}
          >
            Tracks
          </a>
          <a
            href="/favourites/albums"
            onClick={() => {
              if (props.kind !== "albums")
                capture("favourites_kind_changed", { kind: "albums" });
            }}
            class={`font-black text-xs uppercase px-4 py-2 tracking-wide transition border-[3px] border-[#0a0a0a] ${
              props.kind === "albums"
                ? "bg-[#0a0a0a] text-[#f0ede8]"
                : "text-[#0a0a0a]"
            }`}
          >
            Albums
          </a>
          <Show when={props.kind === "tracks"}>
            <span class="mx-2 font-black text-[#5c5c5c]">/</span>
            <For
              each={
                [
                  ["short", "Month"],
                  ["medium", "6 Months"],
                  ["long", "All Time"],
                ] satisfies [Range, string][]
              }
            >
              {([optionRange, label], index) => (
                <button
                  onClick={() => props.onSelectRange(optionRange)}
                  class={`text-xs uppercase tracking-wide px-3 py-2 font-bold transition border-[3px] ${
                    props.range === optionRange
                      ? "border-[#1DB954] bg-[#1DB954] text-black"
                      : "border-transparent text-[#5c5c5c]"
                  }`}
                >
                  {label}{" "}
                  <span class="ml-1 text-[0.6rem] opacity-50">
                    {index() + 1}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </>
      }
      hints={
        <>
          <span>J/↓ Next</span>
          <span>K/↑ Previous</span>
          <span>Enter Open</span>
          <span>T Toggle Type</span>
          <Show when={props.kind === "tracks"}>
            <span>1/2/3 Range</span>
          </Show>
        </>
      }
    />
  );
}

/** The loaded rows, their empty/failure states, and the paging footer. */
function FavouritesList(props: {
  items: readonly SpotifyItem[];
  loadError: { message: string; rateLimited: boolean } | null;
  loadingMore: boolean;
  pagingError: string | null;
  selectedIndex: number;
  onRetryFirstPage: () => void;
  onSelect: (index: number) => void;
  onOpen: (item: SpotifyItem) => void;
  onRetryMore: () => void;
}) {
  return (
    <>
      <Loading fallback={<p class="text-sm uppercase tracking-widest text-[#5c5c5c]">LOADING_</p>}>
        <Show
          when={props.items.length > 0}
          fallback={
            <Show
              when={props.loadError}
              fallback={
                <p class="py-8 text-sm font-bold uppercase tracking-widest text-[#5c5c5c]">
                  NO FAVOURITES FOUND_
                </p>
              }
            >
              {(failure) => (
                <LoadFailure
                  message={failure().message}
                  rateLimited={failure().rateLimited}
                  onRetry={props.onRetryFirstPage}
                />
              )}
            </Show>
          }
        >
          <For each={props.items}>
            {(item, index) => (
              <FavouriteRow
                item={item}
                index={index()}
                selected={props.selectedIndex === index()}
                onFocus={() => props.onSelect(index())}
                onOpen={() => props.onOpen(item)}
              />
            )}
          </For>
          <Show when={props.loadingMore}>
            <p class="py-6 text-xs uppercase tracking-[0.2em] text-[#5c5c5c]">
              LOADING MORE_
            </p>
          </Show>
        </Show>
      </Loading>
      <Show when={props.pagingError}>
        {(message) => (
          <div class="mt-6 border-4 border-red-800 p-4">
            <p class="text-sm text-red-700">Loading more failed: {message()}</p>
            <button
              type="button"
              onClick={props.onRetryMore}
              class="mt-3 border-[3px] border-[#0a0a0a] px-3 py-1.5 text-[0.65rem] font-black uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
            >
              Retry
            </button>
          </div>
        )}
      </Show>
    </>
  );
}

/** Non-suspending reads of a page source, safe before it first resolves. */
function createPageReads(
  firstPage: () => Page,
  items: () => readonly SpotifyItem[],
  tail: () => Tail,
) {
  /** Non-suspending first-page read, for handlers and effects. */
  const firstPageNow = (): Page | null => {
    try {
      return isPending(firstPage) ? null : (latest(firstPage) ?? null);
    } catch {
      return null;
    }
  };

  const hasMore = () => {
    const page = firstPageNow();

    if (!page) return true;
    const current = tail();

    return current.source === page ? current.next !== null : page.next !== null;
  };

  /**
   * Where the next page starts, in Spotify's numbering.
   *
   * Rows the API returns but the list cannot render, such as a saved album
   * that no longer exists, are not counted, so this comes from the last page
   * rather than from the number of loaded rows.
   */
  const nextPageOffset = () => {
    const page = firstPageNow();

    if (!page) return 0;
    const current = tail();

    return current.source === page ? current.nextOffset : page.nextOffset;
  };

  /**
   * Non-suspending read for handlers, effects, and the scroll trigger.
   * `latest` throws for a source that has never resolved, and `isPending`
   * itself re-throws in a tracking context for such a source, so both are
   * guarded: "not ready yet" reads as an empty list.
   */
  const loadedItems = (): readonly SpotifyItem[] => {
    try {
      return isPending(items) ? [] : (latest(items) ?? []);
    } catch {
      return [];
    }
  };

  return { firstPageNow, hasMore, nextPageOffset, loadedItems };
}

/** The URL to open for a row, honouring the user's Spotify-URI preference. */
function favouriteItemUrl(item: SpotifyItem) {
  const store = authStore();

  return store.status === "authenticated" && store.linkToUri
    ? (spotifyUri(item.uri) ?? externalHref(item.external_urls.spotify))
    : externalHref(item.external_urls.spotify);
}

/** Opens a row in the app's preferred target, when it has one. */
function openFavourite(item: SpotifyItem | undefined) {
  if (!item) return;
  const url = favouriteItemUrl(item);

  if (!url) return;
  capture("spotify_item_opened", {
    kind: item.type === "album" ? "album" : "track",
    surface: "favourites",
  });

  if (url.startsWith("spotify:")) window.location.href = url;
  else window.open(url, "_blank", "noopener");
}

/** Registers the list's keyboard shortcuts. */
function registerFavouritesShortcuts(options: {
  kind: "tracks" | "albums";
  onMove: (delta: number) => void;
  onOpen: () => void;
  onToggleKind: () => void;
  onSelectRange: (value: Range) => void;
}) {
  createShortcut(["j"], () => options.onMove(1));
  createShortcut(["k"], () => options.onMove(-1));
  createShortcut(["ArrowDown"], () => options.onMove(1));
  createShortcut(["ArrowUp"], () => options.onMove(-1));
  createShortcut(["Enter"], options.onOpen);
  createShortcut(["t"], options.onToggleKind);

  if (options.kind === "tracks") {
    RANGES.forEach((value, index) => {
      createShortcut([String(index + 1)], () => options.onSelectRange(value));
    });
  }
}

/** The scroll sentinel, save-data flag and next-page trigger. */
function useFavouritesPaging(options: {
  items: () => readonly SpotifyItem[];
  atBottom: () => boolean;
  nextPageOffset: () => number;
  loadMore: (offset: number) => void;
  setAtBottom: (value: boolean) => void;
  setSaveData: (value: boolean) => void;
}) {
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onSettled(() => {
    options.setSaveData(hasSaveData());
    observer = new IntersectionObserver(
      (entries) => options.setAtBottom(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "500px" },
    );

    // The sentinel may mount after this runs (the first page suspends), so the
    // ref callback observes it as a fallback.
    if (sentinel) observer.observe(sentinel);

    return () => observer?.disconnect();
  });

  // Load the next page when the sentinel is in view and the first page is
  // resolved. The offset is computed in the tracking scope so no `latest`
  // read happens in the effect callback.
  createEffect(
    () => {
      const pending = isPending(options.items);

      // Track only the trigger and the offset. `loadMore` writes `loadingMore`
      // and the tail, so reading either here would make this effect re-run from
      // its own write; its guards live inside `loadMore` instead. The offset
      // does follow the tail: every page that lands must advance it.
      return {
        pending,
        bottom: options.atBottom(),
        offset: pending ? 0 : options.nextPageOffset(),
      };
    },
    ({ pending, bottom, offset }) => {
      // `loadMore` reads `range()` and the first page imperatively. Those are
      // one-shot reads, so untrack them: reading them in the apply phase would
      // (correctly) be reported as untracked.
      if (!pending && bottom) untrack(() => options.loadMore(offset));
    },
  );

  return (element: HTMLDivElement) => {
    sentinel = element;
    observer?.observe(element);
  };
}

/** The signal state the favourites list pages through. */
function createFavouritesState() {
  const [range, setRange] = createSignal<Range>("short");
  const [rawSelected, setRawSelected] = createSignal(0);
  const [atBottom, setAtBottom] = createSignal(false);
  const [saveData, setSaveData] = createSignal(false);

  const [tail, setTail] = createSignal<Tail>({
    source: null,
    items: [],
    next: null,
    nextOffset: 0,
  });

  const [loadingMore, setLoadingMore] = createSignal(false);
  const [pagingError, setPagingError] = createSignal<string | null>(null);

  const [loadError, setLoadError] = createSignal<{
    message: string;
    rateLimited: boolean;
  } | null>(null);

  // Bumped by the retry button to re-run the first page.
  const [attempt, setAttempt] = createSignal(0);

  return {
    range,
    setRange,
    rawSelected,
    setRawSelected,
    atBottom,
    setAtBottom,
    saveData,
    setSaveData,
    tail,
    setTail,
    loadingMore,
    setLoadingMore,
    pagingError,
    setPagingError,
    loadError,
    setLoadError,
    attempt,
    setAttempt,
  };
}

export function FavouritesPage(props: { kind: "tracks" | "albums" }) {
  const navigate = useNavigate();
  const { range, setRange, rawSelected, setRawSelected, atBottom, setAtBottom, saveData, setSaveData, tail, setTail, loadingMore, setLoadingMore, pagingError, setPagingError, loadError, setLoadError, attempt, setAttempt } = createFavouritesState();

  const fetchPage = (offset: number) =>
    props.kind === "tracks"
      ? runSpotify(getTopTracksPage(range(), offset))
      : runSpotify(getSavedAlbumsPage(offset));

  // The first page suspends, so `<Loading>` covers the initial load. Later
  // pages append to the tail, so a load never refetches the earlier pages.
  const firstPage = createMemo(async () => {
    // A retry bumps `attempt`, which re-runs this memo's fetch.
    attempt();

    if (props.kind === "albums" && saveData()) {
      return emptyPage();
    }

    try {
      const page = await fetchPage(0);
      setLoadError(null);

      return page;
    } catch (error) {
      // A failed first page belongs to this list, not to the whole app: a rate
      // limit in particular is worth waiting out. Catch it here so the list
      // offers a retry instead of the system-error boundary taking the route.
      const rateLimited =
        error instanceof SpotifyApiError && error.status === 429;

      if (rateLimited) {
        capture("spotify_rate_limited", { surface: "favourites" });
      } else {
        captureError(error);
      }

      setLoadError({
        message: rateLimited
          ? "Spotify is rate limiting this account. Wait a moment, then try again."
          : errorMessage(error),
        rateLimited,
      });

      return emptyPage();
    }
  });

  const items = createMemo(() => {
    const page = firstPage();
    const current = tail();
    const tailItems = current.source === page ? current.items : [];

    return [...page.items, ...tailItems];
  });

  const { firstPageNow, hasMore, nextPageOffset, loadedItems } = createPageReads(
    firstPage,
    items,
    tail,
  );

  // Derived selection: the raw index is clamped to the loaded rows, so no
  // effect has to write the signal back.
  const selectedIndex = createMemo(() =>
    Math.max(0, Math.min(rawSelected(), loadedItems().length - 1)),
  );

  const resetPaging = () => {
    setTail({ source: null, items: [], next: null, nextOffset: 0 });
    setRawSelected(0);
    setPagingError(null);
  };

  /** Re-runs the first page after a failure. */
  const retryFirstPage = () => {
    setLoadError(null);
    resetPaging();
    setAttempt((value) => value + 1);
  };

  const selectRange = (value: Range) => {
    if (range() === value) return;
    setRange(value);
    resetPaging();
    capture("favourites_range_changed", { range: value });
  };

  const loadMore = async (offset: number) => {
    if (loadingMore() || !hasMore()) return;
    const source = firstPageNow();

    if (!source) return;
    setLoadingMore(true);

    try {
      const page = await fetchPage(offset);

      // A range or kind change while this was in flight owns the list now.
      if (firstPageNow() !== source) return;
      setTail((previous) => {
        const base = previous.source === source ? previous.items : [];

        return {
          source,
          items: [...base, ...page.items],
          next: page.next,
          nextOffset: page.nextOffset,
        };
      });
      setPagingError(null);
    } catch (error) {
      // The paging effect calls this without awaiting it, so a rejection here
      // would escape as an unhandled rejection rather than reaching the error
      // boundary. Keep the rows already loaded and offer a retry instead.
      console.error("Loading the next favourites page failed", error);
      setPagingError(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const registerSentinel = useFavouritesPaging({
    items,
    atBottom,
    nextPageOffset,
    loadMore,
    setAtBottom,
    setSaveData,
  });

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

  registerFavouritesShortcuts({
    kind: props.kind,
    onMove: moveSelection,
    onOpen: () => openFavourite(loadedItems()[selectedIndex()]),
    onToggleKind: () => {
      capture("favourites_kind_changed", {
        kind: props.kind === "tracks" ? "albums" : "tracks",
      });
      navigate(props.kind === "tracks" ? "/favourites/albums" : "/favourites/tracks");
      resetPaging();
    },
    onSelectRange: selectRange,
  });

  return (
    <main class="app-main p-8 md:p-12">
      <FavouritesHeader
        kind={props.kind}
        range={range()}
        onSelectRange={selectRange}
      />
      <FavouritesList
        items={items()}
        loadError={loadError()}
        loadingMore={loadingMore()}
        pagingError={pagingError()}
        selectedIndex={selectedIndex()}
        onRetryFirstPage={retryFirstPage}
        onSelect={setRawSelected}
        onOpen={openFavourite}
        onRetryMore={() => void loadMore(nextPageOffset())}
      />
      <div ref={registerSentinel} class="h-8" />
    </main>
  );
}
