// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#1DB954" />
          <meta name="description" content="Spotistats is a tool designed to analyse and backup your music on Spotify!" />
          <meta name="google-site-verification" content="MTlWOXe7tGo0JJtX_8kPy0dSA6OOP8UasZF2X-L1Y-M" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/assets/logo-256.png" />
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
