import { handleRequest } from "virtual:solid-ssr-handler";

import { ServicesLive } from "./handler";
import { createWorker } from "./worker";

/**
 * The Cloudflare Worker entry.
 *
 * Start mode owns the page render through `virtual:solid-ssr-handler`, which
 * also runs `start.middleware` (the JSON API and the stats OAuth routes). The
 * worker adds the queue consumer and the cron trigger. The handlers themselves
 * live in `worker.ts` so they can be tested without these platform modules.
 */
export default createWorker({
  services: ServicesLive,
  handleRequest,
});
