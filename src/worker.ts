import solidHandler from "@solidjs/start/server/entry";
import {
  enqueueDueTrackingUsers,
  syncSpotifyUser,
  type SpotifySyncMessage,
} from "~/lib/server/spotify-tracking";

type TrackingEnv = Env & {
  DB: D1Database;
  SPOTIFY_SYNC_QUEUE: Queue<SpotifySyncMessage>;
};

export default {
  fetch(request, env, ctx) {
    return solidHandler.fetch!(request, env, ctx);
  },
  async scheduled(_controller, env) {
    await enqueueDueTrackingUsers(100);
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      await syncSpotifyUser(message.body.spotifyUserId);
    }
  },
} satisfies ExportedHandler<TrackingEnv, SpotifySyncMessage>;
