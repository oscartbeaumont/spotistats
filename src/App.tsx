import { Meta, Title } from "@solidjs/meta";
import { onSettled } from "solid-js";

import { bootstrapClient } from "./client/bootstrap";
import { RootLayout } from "./layout/RootLayout";
import { Router } from "./router";
import "./app.css";

/**
 * The app root.
 *
 * Start mode renders this on the server and hydrates it on the client. The
 * session lives in `localStorage`, which the server cannot read, so both sides
 * start empty and `bootstrapClient` loads the session after hydration.
 */
export default function App() {
  onSettled(bootstrapClient);

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
