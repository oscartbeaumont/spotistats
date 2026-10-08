import { D1Client } from "@effect/sql-d1";
import { env } from "cloudflare:workers";

/** Cloudflare D1 provided as the Effect `SqlClient` service. */
export const DatabaseLive = D1Client.layer({ db: env.DB });
