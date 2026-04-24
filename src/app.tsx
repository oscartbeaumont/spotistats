import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router, useLocation, useNavigate } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createEffect, ErrorBoundary, onMount, Show, Suspense } from "solid-js";
import { isServer } from "solid-js/web";
import { Nav } from "~/components/Nav";
import { accessToken, spotifyError } from "~/lib/storage";
import { consumeSpotifyCallback, hasSpotifyCallbackCode } from "~/lib/spotify";
import "./app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => String(error) !== "Error: Spotistats: 401 Unauthorized" && failureCount < 3,
    },
  },
});

if (!isServer) (window as any).__TANSTACK_QUERY_CLIENT__ = queryClient;

function AppError() {
  const error = () => spotifyError() ?? { title: "Unknown Error", description: "Something went wrong.", code: "No error details were captured." };

  return (
    <main class="p-8 md:p-16 max-w-3xl">
      <Title>Spotistats | Error</Title>
      <div class="text-xs uppercase tracking-[0.2em] mb-3" style="color: #999">System Error</div>
      <h1 class="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-4">{error().title}</h1>
      <p class="text-sm mb-6 max-w-md" style="color: #555; line-height: 1.7">{error().description}</p>
      <p class="text-sm mb-6" style="color: #555">
        Try <a class="font-bold hover:underline" href="/login">logging in again</a> or <a class="font-bold hover:underline" target="_blank" rel="noopener" href="https://github.com/oscartbeaumont/spotistats/issues/new">report this issue</a>. Include the details below.
      </p>
      <pre class="overflow-auto p-4 text-xs" style="border: 4px solid #0a0a0a; background: #0a0a0a; color: #f0ede8"><samp>{error().code}</samp></pre>
    </main>
  );
}

function Root(props: { children?: import("solid-js").JSX.Element }) {
  const location = useLocation();
  const navigate = useNavigate();

  onMount(() => {
    void consumeSpotifyCallback().then((consumed) => {
      if (consumed)
        navigate(window.location.pathname || "/", { replace: true });
    });
  });

  createEffect(() => {
    if (isServer || accessToken() || hasSpotifyCallbackCode()) return;
    if (["/login", "/reset", "/error"].includes(location.pathname)) return;
    navigate("/login", { replace: true });
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MetaProvider>
        <Title>Spotistats</Title>
        <Meta
          name="description"
          content="Spotistats is a tool designed to analyse and backup your music on Spotify!"
        />

        <Nav />
        <ErrorBoundary fallback={<AppError />}>
          <Show when={location.pathname !== "/error"} fallback={<AppError />}>
            <Suspense>{props.children}</Suspense>
          </Show>
        </ErrorBoundary>
      </MetaProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <Router root={Root}>
      <FileRoutes />
    </Router>
  );
}
