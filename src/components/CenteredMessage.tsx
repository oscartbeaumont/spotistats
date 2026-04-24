import type { JSX } from "solid-js";

export function CenteredMessage(props: { title: string; subtitle?: string; children?: JSX.Element }) {
  return (
    <main class="grid min-h-[70vh] place-items-center px-5 text-center">
      <section class="max-w-2xl">
        <h1 class="text-5xl font-black tracking-tight text-[#1DB954] sm:text-6xl">{props.title}</h1>
        {props.subtitle && <p class="mt-5 text-xl leading-relaxed text-zinc-100 sm:text-2xl">{props.subtitle}</p>}
        {props.children && <div class="mt-8">{props.children}</div>}
      </section>
    </main>
  );
}
