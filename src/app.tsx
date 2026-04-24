import { Link, MetaProvider, Title } from "@solidjs/meta";
import { Router, useNavigate } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { onMount, Suspense } from "solid-js";
import { Nav } from "~/components/Nav";
import { consumeSpotifyCallback } from "~/lib/spotify";
import "./app.css";

function Root(props: { children?: import("solid-js").JSX.Element }) {
  const navigate = useNavigate();

  onMount(() => {
    void consumeSpotifyCallback().then(consumed => {
      if (consumed) navigate(window.location.pathname || "/", { replace: true });
    });
  });

  return (
    <MetaProvider>
      <Title>Spotistats</Title>
      <Link rel="manifest" href="/manifest.webmanifest" />
      <Nav />
      <Suspense>{props.children}</Suspense>
    </MetaProvider>
  );
}

export default function App() {
  return (
    <Router root={Root}>
      <FileRoutes />
    </Router>
  );
}
