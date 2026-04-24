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
    <main class="mx-auto max-w-5xl px-5 py-8">
      <Title>Spotistats | Error</Title>
      <h1 class="text-4xl font-black">Error <span class="text-[#1DB954]">{error().title}</span></h1>
      <h2 class="mt-4 text-2xl text-zinc-200">{error().description}</h2>
      <p class="mt-5 text-lg text-zinc-300">
        Try <a class="text-[#1DB954] hover:underline" href="/login">logging in again</a> and if that does not fix your issue you can <a class="text-[#1DB954] hover:underline" target="_blank" rel="noopener" href="https://github.com/oscartbeaumont/spotistats/issues/new">report it</a>. Please include the text below to help debug your issue.
      </p>
      <pre class="mt-6 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-200"><samp>{error().code}</samp></pre>
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
