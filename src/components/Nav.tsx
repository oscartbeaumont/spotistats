import { createShortcut } from "@solid-primitives/keyboard";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { isEditableShortcutTarget } from "~/lib/keyboard";
import { clearStoredState } from "~/lib/storage";

const links = [
  ["/", "1"],
  ["/favourites", "2"],
  ["/export", "3"],
] as const;

export function Nav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (href: string) =>
    href === "/" ? location.pathname === "/" : location.pathname === href;
  const linkClass = (href: string) => `font-black text-xs sm:text-sm uppercase px-3 sm:px-4 py-2 tracking-wide transition ${isActive(href) ? "" : "hover:bg-[#0a0a0a] hover:text-[#f0ede8]"}`;
  const linkStyle = (href: string) => isActive(href) ? "background: #0a0a0a; color: #f0ede8" : "border: 4px solid #0a0a0a";

  const logout = () => {
    clearStoredState();
    navigate("/login");
  };

  onMount(() => {
    links.forEach(([href, number]) => {
      const openRoute = (event: KeyboardEvent | null) => {
        if (isEditableShortcutTarget(event)) return;
        event?.preventDefault();
        navigate(href);
      };

      createShortcut(["Alt", number], openRoute, { preventDefault: false, requireReset: true });
      createShortcut(["Control", number], openRoute, { preventDefault: false, requireReset: true });
      createShortcut(["Meta", number], openRoute, { preventDefault: false, requireReset: true });
    });
  });

  return (
    <header
      class="fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-[#f0ede8] p-4 sm:p-5"
      style="border-bottom: 4px solid #0a0a0a"
    >
      <span class="font-black text-xl tracking-tighter uppercase select-none">
        SPOTISTATS
      </span>
      <nav class="flex flex-wrap gap-0">
        <A href="/" class={linkClass("/")} style={linkStyle("/")}>Profile <span class="ml-2 text-[0.6rem] opacity-50">Ctrl/Alt+1</span></A>
        <A href="/favourites" class={linkClass("/favourites")} style={linkStyle("/favourites")}>Favourites <span class="ml-2 text-[0.6rem] opacity-50">Ctrl/Alt+2</span></A>
        <A href="/export" class={linkClass("/export")} style={linkStyle("/export")}>Export Data <span class="ml-2 text-[0.6rem] opacity-50">Ctrl/Alt+3</span></A>
      </nav>
      <button
        onClick={logout}
        class="text-xs uppercase tracking-widest font-bold transition hover:underline"
        style="color: #999"
      >
        Logout
      </button>
    </header>
  );
}
