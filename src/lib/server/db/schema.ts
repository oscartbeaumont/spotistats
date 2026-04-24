import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const spotifyTrackingUsers = sqliteTable(
  "spotify_tracking_users",
  {
    spotifyUserId: text("spotify_user_id").primaryKey(),
    displayName: text("display_name"),
    email: text("email"),
    enabled: integer("enabled").notNull().default(1),
    consentedAt: integer("consented_at").notNull(),
    lastReadAt: integer("last_read_at").notNull().default(0),
    disabledAt: integer("disabled_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_spotify_tracking_users_due").on(table.enabled, table.spotifyUserId)],
);

export const spotifyTokens = sqliteTable("spotify_tokens", {
  spotifyUserId: text("spotify_user_id")
    .primaryKey()
    .references(() => spotifyTrackingUsers.spotifyUserId, { onDelete: "cascade" }),
  refreshToken: text("refresh_token").notNull(),
  scope: text("scope").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const spotifySyncState = sqliteTable(
  "spotify_sync_state",
  {
    spotifyUserId: text("spotify_user_id")
      .primaryKey()
      .references(() => spotifyTrackingUsers.spotifyUserId, { onDelete: "cascade" }),
    lastPlayedAtMs: integer("last_played_at_ms"),
    lastSuccessAt: integer("last_success_at"),
    lastError: text("last_error"),
    nextSyncAfter: integer("next_sync_after").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_spotify_sync_state_due").on(table.nextSyncAfter)],
);

export const spotifyTracks = sqliteTable("spotify_tracks", {
  spotifyTrackId: text("spotify_track_id").primaryKey(),
  name: text("name").notNull(),
  albumName: text("album_name"),
  artistNames: text("artist_names"),
  durationMs: integer("duration_ms"),
  uri: text("uri"),
  externalUrl: text("external_url"),
  imageUrl: text("image_url"),
  rawJson: text("raw_json"),
  updatedAt: integer("updated_at").notNull(),
});

export const spotifyListens = sqliteTable(
  "spotify_listens",
  {
    id: text("id").primaryKey(),
    spotifyUserId: text("spotify_user_id")
      .notNull()
      .references(() => spotifyTrackingUsers.spotifyUserId, { onDelete: "cascade" }),
    spotifyTrackId: text("spotify_track_id")
      .notNull()
      .references(() => spotifyTracks.spotifyTrackId),
    playedAt: text("played_at").notNull(),
    playedAtMs: integer("played_at_ms").notNull(),
    contextType: text("context_type"),
    contextUri: text("context_uri"),
    rawJson: text("raw_json"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("spotify_listens_spotify_user_id_spotify_track_id_played_at_ms_unique").on(
      table.spotifyUserId,
      table.spotifyTrackId,
      table.playedAtMs,
    ),
    index("idx_spotify_listens_recent").on(table.spotifyUserId, table.playedAtMs),
  ],
);
