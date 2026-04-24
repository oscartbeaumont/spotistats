import { createShortcut } from "@solid-primitives/keyboard";
import { useLocation, useNavigate } from "@solidjs/router";
import { createEffect, ErrorBoundary, onMount, Suspense } from "solid-js";
import { isServer } from "solid-js/web";
import { AppError } from "~/app";
import { isEditableShortcutTarget } from "~/lib/keyboard";
import { authStore, clearStoredState } from "~/lib/storage";
import { hasSpotifyCallbackCode } from "~/lib/spotify";

export default function AuthedLayout(props: { children?: import("solid-js").JSX.Element }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/"
      : href === "/favourites/tracks"
        ? location.pathname.startsWith("/favourites/")
        : location.pathname === href;
  const linkClass = (href: string) => `font-black text-xs sm:text-sm uppercase px-3 sm:px-4 py-2 tracking-wide transition ${isActive(href) ? "bg-[#0a0a0a] text-[#f0ede8]" : "border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"}`;
  const logout = () => {
    clearStoredState();
    navigate("/login");
  };

  createEffect(() => {
    if (isServer || authStore().status === "authenticated" || hasSpotifyCallbackCode()) return;
    navigate("/login", { replace: true });
  });

  onMount(() => {
    const openProfile = (event: KeyboardEvent | null) => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      navigate("/");
    };

    createShortcut(["Alt", "1"], openProfile, { preventDefault: false, requireReset: true });
    createShortcut(["Control", "1"], openProfile, { preventDefault: false, requireReset: true });
    createShortcut(["Meta", "1"], openProfile, { preventDefault: false, requireReset: true });

    const openFavourites = (event: KeyboardEvent | null) => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      navigate("/favourites/tracks");
    };

    createShortcut(["Alt", "2"], openFavourites, { preventDefault: false, requireReset: true });
    createShortcut(["Control", "2"], openFavourites, { preventDefault: false, requireReset: true });
    createShortcut(["Meta", "2"], openFavourites, { preventDefault: false, requireReset: true });

    const openExport = (event: KeyboardEvent | null) => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      navigate("/export");
    };

    createShortcut(["Alt", "3"], openExport, { preventDefault: false, requireReset: true });
    createShortcut(["Control", "3"], openExport, { preventDefault: false, requireReset: true });
    createShortcut(["Meta", "3"], openExport, { preventDefault: false, requireReset: true });

    const openAccount = (event: KeyboardEvent | null) => {
      if (isEditableShortcutTarget(event)) return;
      event?.preventDefault();
      navigate("/account");
    };

    createShortcut(["Alt", "4"], openAccount, { preventDefault: false, requireReset: true });
    createShortcut(["Control", "4"], openAccount, { preventDefault: false, requireReset: true });
    createShortcut(["Meta", "4"], openAccount, { preventDefault: false, requireReset: true });
  });

  return (
    <>
      <header
        class="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b-4 border-[#0a0a0a] bg-[#f0ede8] p-4 sm:p-5"
      >
        <span class="font-black text-xl tracking-tighter uppercase select-none">
          SPOTISTATS
        </span>
        <nav class="flex flex-wrap gap-0">
          <a href="/" class={linkClass("/")}>Profile <span class="ml-2 text-[0.6rem] opacity-50">Alt+1</span></a>
          <a href="/favourites/tracks" class={linkClass("/favourites/tracks")}>Favourites <span class="ml-2 text-[0.6rem] opacity-50">Alt+2</span></a>
          <a href="/export" class={linkClass("/export")}>Export Data <span class="ml-2 text-[0.6rem] opacity-50">Alt+3</span></a>
          <a href="/account" class={linkClass("/account")}>Account <span class="ml-2 text-[0.6rem] opacity-50">Alt+4</span></a>
        </nav>
        <button
          onClick={logout}
          class="text-xs uppercase tracking-widest font-bold text-[#999] transition hover:underline"
        >
          Logout
        </button>
      </header>
      <ErrorBoundary fallback={(error) => <AppError error={error} />}>
        <Suspense fallback={<main class="app-main p-8 md:p-16 text-sm uppercase tracking-widest text-[#999]">LOADING_</main>}>
          {props.children}
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
