import { Link, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { onMount, Suspense } from "solid-js";
import { Nav } from "~/components/Nav";
import { consumeSpotifyCallbackHash } from "~/lib/spotify";
import "./app.css";

function Root(props: { children?: import("solid-js").JSX.Element }) {
  onMount(() => {
    consumeSpotifyCallbackHash();
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
