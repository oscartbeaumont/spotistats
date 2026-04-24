// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import {
  disableInactiveTrackingUsers,
  enqueueDueTrackingUsers,
  SpotifySyncMessage,
  syncSpotifyUser,
} from "./lib/server/spotify-tracking";

const handler = createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#1DB954" />
          <meta
            name="google-site-verification"
            content="MTlWOXe7tGo0JJtX_8kPy0dSA6OOP8UasZF2X-L1Y-M"
          />
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/assets/logo-256.png" />
          <link rel="manifest" href="/manifest.webmanifest" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));

const cloudflare = {
  async scheduled() {
    await disableInactiveTrackingUsers();
    await enqueueDueTrackingUsers(100);
  },
  async queue(batch) {
    await Promise.all(
      batch.messages.map((message) =>
        syncSpotifyUser(message.body.spotifyUserId),
      ),
    );
  },
} satisfies ExportedHandler<Env, SpotifySyncMessage>;

export default {
  ...handler,
  ...cloudflare,
};
