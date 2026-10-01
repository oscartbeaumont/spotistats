import { Meta, Title } from "@solidjs/meta";

import { RootLayout } from "./layout/RootLayout";
import { Router } from "./router";

export default function App() {
  return (
    <>
      <Title>Spotistats</Title>
      <Meta
        name="description"
        content="Spotistats is a tool designed to analyse and backup your music on Spotify!"
      />
      <Router>
        {(props) => <RootLayout>{props.children}</RootLayout>}
      </Router>
    </>
  );
}
