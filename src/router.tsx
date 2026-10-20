import { createRouter } from "@solidjs/router";
import { lazy } from "solid-js";

import LoginPage from "./pages/Login";

/**
 * Routes are loaded on demand. Only the route for the current URL enters the
 * server render and the first client chunk, so heavy pages (export, analytics)
 * stay out of the initial graph. The login page is eager because the layout
 * renders it for every signed-out request.
 */

const ProfilePage = lazy(() => import("./pages/Profile"));
const FavouritesTracks = lazy(() =>
  import("./pages/Favourites").then((module) => ({
    default: () => <module.FavouritesPage kind="tracks" />,
  })),
);
const FavouritesAlbums = lazy(() =>
  import("./pages/Favourites").then((module) => ({
    default: () => <module.FavouritesPage kind="albums" />,
  })),
);
const ExportPage = lazy(() => import("./pages/Export"));
const AccountPage = lazy(() => import("./pages/Account"));
const NotFoundPage = lazy(() => import("./pages/NotFound"));

export const Router = createRouter({
  routes: [
    { path: "/", component: ProfilePage },
    { path: "/favourites/tracks", component: FavouritesTracks },
    { path: "/favourites/albums", component: FavouritesAlbums },
    { path: "/export", component: ExportPage },
    { path: "/account", component: AccountPage },
    { path: "/login", component: LoginPage },
    { path: "*404", component: NotFoundPage },
  ],
});
