import { Navigate } from "@solidjs/router";

export default function FavouritesRedirect() {
  return <Navigate href="/favourites/tracks" />;
}
