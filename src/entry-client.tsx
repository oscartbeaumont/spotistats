// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import { isServer } from "solid-js/web";
import posthog from "posthog-js";

if (!isServer && !import.meta.env.DEV)
  posthog.init("phc_qSpwCaUTRLVqXQYGL8zE5RMfm98NUQFiFJdMYymxLSWh", {
    api_host: "/ph_ed90f8",
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    person_profiles: "identified_only",
    capture_exceptions: true,
  });

mount(() => <StartClient />, document.getElementById("app")!);
