import type { Metadata } from "next";
import { SiteRoute, siteMetadata, staticParams } from "@/site/route";

// Public site, kk: every page is generated at build time from content/site/kk (no runtime file reads).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return staticParams("kk");
}

export async function generateMetadata({ params }: PageProps<"/kk/[[...slug]]">): Promise<Metadata> {
  const { slug } = await params;
  return siteMetadata("kk", slug);
}

export default async function Page({ params }: PageProps<"/kk/[[...slug]]">) {
  const { slug } = await params;
  return <SiteRoute locale="kk" slug={slug} />;
}
