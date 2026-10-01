import { render } from "@solidjs/web";
import posthog from "posthog-js";

import App from "./App";
import { consumeSpotifyCallback } from "./client/auth";
import "./app.css";

if (!import.meta.env.DEV) {
  posthog.init("phc_qSpwCaUTRLVqXQYGL8zE5RMfm98NUQFiFJdMYymxLSWh", {
    api_host: "/ph_ed90f8",
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    person_profiles: "identified_only",
    capture_exceptions: true,
  });
}

// The login callback carries a `code` in the URL. Exchange it before the app
// renders so the first render already sees an authenticated session.
consumeSpotifyCallback()
  .catch(() => false)
  .finally(() => {
    render(() => <App />, document.getElementById("app")!);
  });
