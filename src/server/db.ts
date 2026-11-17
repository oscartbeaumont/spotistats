import { D1Client } from "@effect/sql-d1";

/** Cloudflare D1 provided as the Effect `SqlClient` service. */
export const DatabaseLive = (db: D1Database) => D1Client.layer({ db });
