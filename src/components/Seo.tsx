import { Link, Meta, Title } from "@solidjs/meta";

import {
  jsonLdFor,
  siteDescription,
  siteImage,
  siteImageAlt,
  siteName,
  siteUrl,
} from "~/lib/seo";

/**
 * Site-wide SEO tags. Every route gets a title, description, canonical URL,
 * Open Graph and Twitter card. Only the public sign-in pages are indexable;
 * authenticated routes are canonicalised to the home page and marked noindex.
 */
export function Seo(props: {
  title: string;
  path: string;
  publicPage: boolean;
  description?: string;
}) {
  const description = () => props.description ?? siteDescription;
  const canonical = () => `${siteUrl}${props.path}`;
  const robots = () =>
    props.publicPage
      ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      : "noindex, nofollow";

  return (
    <>
      <Title>{props.title}</Title>
      <Meta name="description" content={description()} />
      <Meta name="author" content="Oscar Beaumont" />
      <Meta name="robots" content={robots()} />
      <Link rel="canonical" href={canonical()} />

      <Meta property="og:type" content="website" />
      <Meta property="og:site_name" content={siteName} />
      <Meta property="og:title" content={props.title} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={canonical()} />
      <Meta property="og:image" content={siteImage} />
      <Meta property="og:image:type" content="image/png" />
      <Meta property="og:image:width" content="1200" />
      <Meta property="og:image:height" content="630" />
      <Meta property="og:image:alt" content={siteImageAlt} />
      <Meta property="og:locale" content="en_US" />

      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={props.title} />
      <Meta name="twitter:description" content={description()} />
      <Meta name="twitter:image" content={siteImage} />
      <Meta name="twitter:image:alt" content={siteImageAlt} />

      <script
        type="application/ld+json"
        innerHTML={JSON.stringify(jsonLdFor(props.publicPage))}
      />
    </>
  );
}
