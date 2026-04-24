import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router, useNavigate } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { onMount, Suspense } from "solid-js";
import { Nav } from "~/components/Nav";
import { consumeSpotifyCallback } from "~/lib/spotify";
import "./app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function Root(props: { children?: import("solid-js").JSX.Element }) {
  const navigate = useNavigate();

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

        <Nav />
        <Suspense>{props.children}</Suspense>
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
