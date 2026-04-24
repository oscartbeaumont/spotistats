import { Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router, useNavigate } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { children, createEffect, createSignal, ErrorBoundary, onMount } from "solid-js";
import { isServer } from "solid-js/web";
import { consumeSpotifyCallback, SpotifyUnauthenticatedError } from "~/lib/spotify";
import "./app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof SpotifyUnauthenticatedError) && failureCount < 3,
      throwOnError: true,
    },
  },
});

if (!isServer) (window as any).__TANSTACK_QUERY_CLIENT__ = queryClient;

export default function App() {
  return (
    <Router
      root={(props) => {
        const navigate = useNavigate();
        const resolvedChildren = children(() => props.children);

        onMount(() => {
          void consumeSpotifyCallback().then((consumed) => {
            if (consumed)
              navigate(window.location.pathname || "/", { replace: true });
          });
        });

        return (
          <QueryClientProvider client={queryClient}>
            <MetaProvider>
              <Title>Spotistats</Title>
              <Meta
                name="description"
                content="Spotistats is a tool designed to analyse and backup your music on Spotify!"
              />

              <noscript>
                <main class="min-h-screen bg-[#f0ede8] p-8 md:p-16 text-[#0a0a0a]">
                  <section class="max-w-xl border-4 border-[#0a0a0a] bg-[#f8f5ef] p-6 shadow-[8px_8px_0_#0a0a0a]">
                    <div class="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#999]">
                      JavaScript Required
                    </div>
                    <h1 class="mb-4 text-4xl font-black uppercase tracking-tighter">
                      Spotistats needs JavaScript
                    </h1>
                    <p class="text-sm leading-7 text-[#555]">
                      This app connects to Spotify in your browser and uses JavaScript to load your music data. Enable JavaScript, then refresh the page.
                    </p>
                  </section>
                </main>
              </noscript>

              <ErrorBoundary fallback={(error) => <AppError error={error} />}>
                {resolvedChildren()}
              </ErrorBoundary>
            </MetaProvider>
          </QueryClientProvider>
        );
      }}
    >
      <FileRoutes />
    </Router>
  );
}

export function AppError(props: { error?: Error } = {}) {
  const navigate = useNavigate();
  const [copied, setCopied] = createSignal(false);
  const errorText = () =>
    `${props.error?.message ?? "Unknown Error"}\n\n${props.error?.stack ?? ""}`;

  createEffect(() => {
    if (props.error instanceof SpotifyUnauthenticatedError) {
      navigate("/login", { replace: true });
    }
  });

  return (
    <main class="p-8 md:p-16 max-w-3xl">
      <Title>Spotistats | Error</Title>
      <div class="text-xs uppercase tracking-[0.2em] mb-3 text-[#999]">
        System Error
      </div>
      <p class="text-sm mb-6 text-[#555]">
        Try{" "}
        <a class="font-bold hover:underline" href="/login">
          logging in again
        </a>{" "}
        or{" "}
        <a
          class="font-bold hover:underline"
          target="_blank"
          rel="noopener"
          href="https://github.com/oscartbeaumont/spotistats/issues/new"
        >
          report this issue
        </a>
        . Include the details below.
      </p>
      <pre
        class="overflow-auto p-4 text-xs border-4 border-[#0a0a0a] bg-[#0a0a0a] text-[#f0ede8]"
      >
        <samp>{errorText()}</samp>
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(errorText());
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        class="mt-4 border-4 border-[#0a0a0a] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
      >
        {copied() ? "Copied" : "Copy Error"}
      </button>
    </main>
  );
}
