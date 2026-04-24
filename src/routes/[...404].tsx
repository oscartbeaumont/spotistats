import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";

export default function NotFound() {
  return (
    <div class="min-h-screen flex flex-col">
      <Title>Not Found</Title>
      <HttpStatusCode code={404} />
      <header class="p-5 flex items-center justify-between border-b-4 border-[#0a0a0a]">
        <span class="font-black text-xl tracking-tighter uppercase">SPOTISTATS</span>
      </header>
      <main class="flex-1 flex items-center p-8 md:p-16">
        <div>
          <div class="text-xs uppercase tracking-[0.2em] mb-4 text-[#999]">Error 404</div>
          <h1 class="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-6">NOT FOUND</h1>
          <p class="text-sm mb-10 max-w-xs leading-[1.7] text-[#555]">
            The page you're looking for doesn't exist.
          </p>
          <A
            href="/"
            class="inline-block font-black text-sm uppercase px-6 py-3 tracking-wide transition border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
          >
            ← Back to Profile
          </A>
        </div>
      </main>
    </div>
  );
}
