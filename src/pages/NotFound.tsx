import { Title } from "@solidjs/meta";

export default function NotFoundPage() {
  return (
    <main class="app-main flex-1 p-8 md:p-16">
      <Title>Not Found | Spotistats</Title>
      <div class="text-xs uppercase tracking-[0.2em] mb-4 text-[#5c5c5c]">
        Error 404
      </div>
      <h1 class="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-6">
        NOT FOUND
      </h1>
      <p class="text-sm mb-10 max-w-xs leading-[1.7] text-[#555]">
        The page you're looking for doesn't exist.
      </p>
      <a
        href="/"
        class="inline-block font-black text-sm uppercase px-6 py-3 tracking-wide transition border-4 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#f0ede8]"
      >
        ← Back to Profile
      </a>
    </main>
  );
}
