import { A, useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import { accessToken } from "~/lib/storage";

const links = [
  ["/", "Profile"],
  ["/favourites", "Your Favourites"],
  ["/taste", "Your Taste"],
  ["/recommendations", "Recommendations"],
  ["/export", "Export Data"],
] as const;

export function Nav() {
  const location = useLocation();
  const hidden = () => ["/login", "/reset"].includes(location.pathname);

  return (
    <Show when={accessToken() && !hidden()}>
      <nav class="mx-auto my-5 flex max-w-5xl flex-wrap justify-center gap-x-6 gap-y-3 px-4 text-sm text-zinc-200 sm:text-base">
        {links.map(([href, label]) => (
          <A href={href} class="border-b border-transparent transition hover:border-[#1DB954] hover:text-white active:text-[#1DB954]">
            {label}
          </A>
        ))}
      </nav>
    </Show>
  );
}
