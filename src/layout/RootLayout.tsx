import { useLocation, useNavigate } from "@solidjs/router";
import { createEffect, Errored, Loading, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import { AppError } from "~/components/AppError";
import { ExportProgress } from "~/components/ExportProgress";
import { ProfileSkeleton } from "~/components/ProfileSkeleton";
import { Seo } from "~/components/Seo";
import { hasSpotifyCallbackCode, logout } from "~/client/auth";
import { discoveryEnabled } from "~/client/features";
import { authReady, authStore } from "~/client/storage";
import { handoverUrl, isContentPath, isPublicPath, titleForPath } from "~/lib/seo";
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
  const publicPage = () => isPublicPath(location.pathname);
  const contentPage = () => isContentPath(location.pathname);
  const canonicalPath = () =>
    location.pathname === "/login" ? "/" : location.pathname;
  const loadingFallback = () =>
    location.pathname === "/" ? <ProfileSkeleton /> : <LoadingScreen />;

  createEffect(
    () => ({
      path: location.pathname,
      status: authStore().status,
      ready: authReady(),
    }),
    ({ path, status, ready }) => {
      // Wait for the client to load the session before redirecting.
      if (!ready) return;
      // Everything below reads the browser's URL and session, so it only runs
      // once the client owns the page.
      if (typeof window === "undefined") return;
      // A Spotify login callback owns the URL until it is consumed.
      if (hasSpotifyCallbackCode()) return;
      // Public routes (the sign-in screen and the policy pages) render signed
      // out, so never bounce them to `/login`. This also stops opening `/`
      // from flashing the sign-in screen and then redirecting to `/login`.
      if (status === "authenticated" || isPublicPath(path)) return;
      // A private route on the legacy alias belongs on the canonical origin.
      // The session is stored per-origin, so staying would show a sign-in
      // screen on the one host that can never hold the session the visitor
      // already has on the other.
      const handover = handoverUrl(path, window.location.search, window.location.origin);
      if (handover) {
        window.location.replace(handover);
        return;
      }
      navigate("/login", { replace: true });
    },
  );

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/"
      : href === "/favourites/tracks"
        ? location.pathname.startsWith("/favourites/")
        : location.pathname === href;

  const linkClass = (href: string) =>
    `shrink-0 whitespace-nowrap font-black text-[0.65rem] sm:text-sm uppercase px-1 sm:px-4 py-2 tracking-wide transition ${
      isActive(href)
        ? "bg-[#0a0a0a] text-[#f0ede8]"
        : "border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
    }`;

  const go = (path: string) => (event: KeyboardEvent) => {
    if (isEditableShortcutTarget(event)) return;
    navigate(path);
  };

  // Discovery is flagged, so the shortcut stays registered but does nothing
  // while the feature is off. Gating here rather than at registration keeps the
  // listener in step with the flag without re-binding it.
  const goDiscovery = (event: KeyboardEvent) => {
    if (!discoveryEnabled()) return;
    go("/discover")(event);
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
  createShortcut(["Alt", "5"], goDiscovery);
  createShortcut(["Control", "5"], goDiscovery);
  createShortcut(["Meta", "5"], goDiscovery);

  return (
    <>
      <Seo
        title={titleForPath(location.pathname)}
        path={canonicalPath()}
        publicPage={publicPage()}
        faq={!contentPage()}
      />
      <Show
      when={authStore().status === "authenticated"}
      fallback={
        <Show when={contentPage()} fallback={<LoginPage />}>
          {props.children}
        </Show>
      }
    >
      <div>
        <header class="relative z-50 flex flex-wrap items-center justify-between gap-2 border-b-4 border-[#0a0a0a] bg-[#f0ede8] p-4 sm:fixed sm:left-0 sm:right-0 sm:top-0 sm:flex-nowrap sm:gap-4 sm:p-5">
          <span class="shrink-0 font-black text-xl tracking-tighter uppercase select-none">
            SPOTISTATS
          </span>
          <nav class="order-3 flex w-full basis-full items-center gap-0 overflow-x-auto sm:order-none sm:w-auto sm:basis-auto sm:grow sm:justify-center">
            <a href="/" class={linkClass("/")}>
              Profile <span class="ml-2 hidden text-[0.6rem] opacity-50 md:inline">Alt+1</span>
            </a>
            <a href="/favourites/tracks" class={linkClass("/favourites/tracks")}>
              Favourites <span class="ml-2 hidden text-[0.6rem] opacity-50 md:inline">Alt+2</span>
            </a>
            <a href="/export" class={linkClass("/export")}>
              Export Data <span class="ml-2 hidden text-[0.6rem] opacity-50 md:inline">Alt+3</span>
            </a>
            <a href="/account" class={linkClass("/account")}>
              Account <span class="ml-2 hidden text-[0.6rem] opacity-50 md:inline">Alt+4</span>
            </a>
            <Show when={discoveryEnabled()}>
              <a href="/discover" class={linkClass("/discover")}>
                Discover <span class="ml-2 hidden text-[0.6rem] opacity-50 md:inline">Alt+5</span>
              </a>
            </Show>
          </nav>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            class="shrink-0 text-xs uppercase tracking-widest font-bold text-[#5c5c5c] transition hover:underline"
          >
            Logout
          </button>
        </header>
        <Errored fallback={(error, reset) => <AppError error={error()} reset={reset} />}>
          <Loading fallback={loadingFallback()}>{props.children}</Loading>
        </Errored>
        <ExportProgress />
      </div>
    </Show>
    </>
  );
}
