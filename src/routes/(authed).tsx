import { useNavigate } from "@solidjs/router";
import { createEffect, Suspense } from "solid-js";
import { isServer } from "solid-js/web";
import { Nav } from "~/components/Nav";
import { accessToken } from "~/lib/storage";
import { hasSpotifyCallbackCode } from "~/lib/spotify";

export default function AuthedLayout(props: { children?: import("solid-js").JSX.Element }) {
  const navigate = useNavigate();

  createEffect(() => {
    if (isServer || accessToken() || hasSpotifyCallbackCode()) return;
    navigate("/login", { replace: true });
  });

  return (
    <>
      <Nav />
      <Suspense fallback={<main class="app-main p-8 md:p-16 text-sm uppercase tracking-widest text-[#999]">LOADING_</main>}>
        {props.children}
      </Suspense>
    </>
  );
}
