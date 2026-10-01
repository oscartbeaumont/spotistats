import { createRouter } from "@solidjs/router";

import AccountPage from "./pages/Account";
import ExportPage from "./pages/Export";
import { FavouritesPage } from "./pages/Favourites";
import LoginPage from "./pages/Login";
import NotFoundPage from "./pages/NotFound";
import ProfilePage from "./pages/Profile";

const FavouritesTracks = () => <FavouritesPage kind="tracks" />;
const FavouritesAlbums = () => <FavouritesPage kind="albums" />;

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
