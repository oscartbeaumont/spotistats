import { useLocation, useNavigate } from "@solidjs/router";
import { createEffect, Errored, Loading, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import { AppError } from "~/components/AppError";
import { hasSpotifyCallbackCode, logout } from "~/client/auth";
import { authReady, authStore } from "~/client/storage";
import LoginPage from "~/pages/Login";
import { createShortcut, isEditableShortcutTarget } from "~/lib/shortcut";

function LoadingScreen() {
  return (
    <main class="app-main p-8 md:p-16 text-sm uppercase tracking-widest text-[#5c5c5c]">
      LOADING_
    </main>
  );
}

export function RootLayout(props: {
  children?: JSX.Element;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  createEffect(
    () => ({
      path: location.pathname,
      status: authStore().status,
      ready: authReady(),
    }),
    ({ path, status, ready }) => {
      // Wait for the client to load the session before redirecting.
      if (!ready) return;
      // A Spotify login callback owns the URL until it is consumed.
      if (typeof window !== "undefined" && hasSpotifyCallbackCode()) return;
      if (status !== "authenticated" && path !== "/login") {
        navigate("/login", { replace: true });
      }
    },
  );

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/"
      : href === "/favourites/tracks"
        ? location.pathname.startsWith("/favourites/")
        : location.pathname === href;

  const linkClass = (href: string) =>
    `font-black text-xs sm:text-sm uppercase px-3 sm:px-4 py-2 tracking-wide transition ${
      isActive(href)
        ? "bg-[#0a0a0a] text-[#f0ede8]"
        : "border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
    }`;

  const go = (path: string) => (event: KeyboardEvent) => {
    if (isEditableShortcutTarget(event)) return;
    navigate(path);
  };

  createShortcut(["Alt", "1"], go("/"));
  createShortcut(["Control", "1"], go("/"));
  createShortcut(["Meta", "1"], go("/"));
  createShortcut(["Alt", "2"], go("/favourites/tracks"));
  createShortcut(["Control", "2"], go("/favourites/tracks"));
  createShortcut(["Meta", "2"], go("/favourites/tracks"));
  createShortcut(["Alt", "3"], go("/export"));
  createShortcut(["Control", "3"], go("/export"));
  createShortcut(["Meta", "3"], go("/export"));
  createShortcut(["Alt", "4"], go("/account"));
  createShortcut(["Control", "4"], go("/account"));
  createShortcut(["Meta", "4"], go("/account"));

  return (
    <Show
      when={authStore().status === "authenticated"}
      fallback={<LoginPage />}
    >
      <div>
        <header class="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b-4 border-[#0a0a0a] bg-[#f0ede8] p-4 sm:p-5">
          <span class="font-black text-xl tracking-tighter uppercase select-none">
            SPOTISTATS
          </span>
          <nav class="flex flex-wrap gap-0">
            <a href="/" class={linkClass("/")}>
              Profile <span class="ml-2 text-[0.6rem] opacity-50">Alt+1</span>
            </a>
            <a href="/favourites/tracks" class={linkClass("/favourites/tracks")}>
              Favourites <span class="ml-2 text-[0.6rem] opacity-50">Alt+2</span>
            </a>
            <a href="/export" class={linkClass("/export")}>
              Export Data <span class="ml-2 text-[0.6rem] opacity-50">Alt+3</span>
            </a>
            <a href="/account" class={linkClass("/account")}>
              Account <span class="ml-2 text-[0.6rem] opacity-50">Alt+4</span>
            </a>
          </nav>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            class="text-xs uppercase tracking-widest font-bold text-[#5c5c5c] transition hover:underline"
          >
            Logout
          </button>
        </header>
        <Errored fallback={(error, reset) => <AppError error={error()} reset={reset} />}>
          <Loading fallback={<LoadingScreen />}>{props.children}</Loading>
        </Errored>
      </div>
    </Show>
  );
}
