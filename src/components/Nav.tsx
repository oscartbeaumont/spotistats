import { A, useLocation, useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { accessToken, clearStoredState } from "~/lib/storage";

const links = [
  ["/", "Profile"],
  ["/favourites", "Favourites"],
  ["/export", "Export Data"],
] as const;

export function Nav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mounted, setMounted] = createSignal(false);
  const hidden = () => ["/login"].includes(location.pathname);

  onMount(() => setMounted(true));

  const isActive = (href: string) =>
    href === "/" ? location.pathname === "/" : location.pathname === href;

  const logout = () => {
    clearStoredState();
    navigate("/login");
  };

  return (
    <Show when={mounted() && accessToken() && !hidden()}>
      <header
        class="flex items-center justify-between p-4 sm:p-5"
        style="border-bottom: 4px solid #0a0a0a"
      >
        <span class="font-black text-xl tracking-tighter uppercase select-none">
          SPOTISTATS
        </span>
        <nav class="flex flex-wrap gap-0">
          {links.map(([href, label]) => (
            <A
              href={href}
              class={`font-black text-xs sm:text-sm uppercase px-3 sm:px-4 py-2 tracking-wide transition ${isActive(href) ? "" : "hover:bg-[#0a0a0a] hover:text-[#f0ede8]"}`}
              style={
                isActive(href)
                  ? "background: #0a0a0a; color: #f0ede8"
                  : "border: 4px solid #0a0a0a"
              }
            >
              {label}
            </A>
          ))}
        </nav>
        <button
          onClick={logout}
          class="text-xs uppercase tracking-widest font-bold transition hover:underline"
          style="color: #999"
        >
          Logout
        </button>
      </header>
    </Show>
  );
}
