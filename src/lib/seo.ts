export const siteUrl = "https://spotistats.otbeaumont.me";
export const siteName = "Spotistats";
export const siteTitle =
  "Spotistats — Spotify listening stats, history & backup";
export const siteDescription =
  "Spotistats is a free Spotify stats app that keeps your listening history, shows your top artists and streaks, and lets you export your playlists and play data.";
export const siteImage = `${siteUrl}/assets/og.png`;
export const siteImageAlt =
  "Spotistats — your Spotify listening stats, history and backup, decoded.";
export interface SiteFaq {
  readonly question: string;
  readonly answer: string;
}

export const siteFaq: readonly SiteFaq[] = [
  {
    question: "What is Spotistats?",
    answer:
      "Spotistats is a free web app that analyses your Spotify listening history and backs up your music. It shows your top artists and tracks, listening streaks, hourly patterns, and the shape of your year.",
  },
  {
    question: "How is this different from Spotify Wrapped?",
    answer:
      "Wrapped is a yearly recap from Spotify. Spotistats keeps a running history you can explore at any time, shows stats Spotify does not expose, and lets you export the data.",
  },
  {
    question: "How does Spotistats get my listening history?",
    answer:
      "You connect Spotify, then opt in to listening-stats sync. Spotistats stores the recently played tracks Spotify returns and builds your history server-side. You can disconnect or delete it from your account page.",
  },
  {
    question: "Can I export my Spotify data?",
    answer:
      "Yes. Export your playlists as CSV, or download every listen Spotistats stores as JSON or CSV from the account page.",
  },
  {
    question: "Is Spotistats free?",
    answer:
      "Yes. Spotistats is free, has no ads, and does not have a paid tier.",
  },
  {
    question: "Does Spotistats see my Spotify password?",
    answer:
      "No. Sign-in happens through Spotify OAuth. Spotistats never receives your Spotify password.",
  },
];

const titleByPath = (path: string) => {
  if (path === "/" || path === "/login") return siteTitle;
  if (path.startsWith("/favourites/tracks"))
    return "Favourite Spotify tracks — Spotistats";
  if (path.startsWith("/favourites/albums"))
    return "Saved Spotify albums — Spotistats";
  if (path.startsWith("/export"))
    return "Export your Spotify data — Spotistats";
  if (path.startsWith("/account"))
    return "Spotify stats account — Spotistats";
  return "Spotistats — Your Spotify, decoded";
};

export const titleForPath = (path: string) => titleByPath(path);
export const isPublicPath = (path: string) =>
  path === "/" || path === "/login";

/** Structured data for the public site. FAQ is only emitted for public pages. */
export function jsonLdFor(publicPage: boolean) {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: siteName,
      description: siteDescription,
      inLanguage: "en",
      publisher: {
        "@type": "Person",
        name: "Oscar Beaumont",
        url: "https://otbeaumont.me",
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
      name: siteName,
      url: `${siteUrl}/`,
      description: siteDescription,
      applicationCategory: "MusicApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      inLanguage: "en",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      creator: {
        "@type": "Person",
        name: "Oscar Beaumont",
        url: "https://otbeaumont.me",
      },
      sameAs: ["https://github.com/oscartbeaumont/spotistats"],
      screenshot: siteImage,
      featureList: [
        "Spotify listening history",
        "Top artists and tracks",
        "Listening streaks and hourly patterns",
        "Playlist export",
        "Listening-data export",
      ],
    },
  ];

  if (publicPage) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      mainEntity: siteFaq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
