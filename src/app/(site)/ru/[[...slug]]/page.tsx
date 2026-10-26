import type { Metadata } from "next";
import { SiteRoute, siteMetadata, staticParams } from "@/site/route";

// Public site, ru: every page is generated at build time from content/site/ru (no runtime file reads).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return staticParams("ru");
}

export async function generateMetadata({ params }: PageProps<"/ru/[[...slug]]">): Promise<Metadata> {
  const { slug } = await params;
  return siteMetadata("ru", slug);
}

export default async function Page({ params }: PageProps<"/ru/[[...slug]]">) {
  const { slug } = await params;
  return <SiteRoute locale="ru" slug={slug} />;
}
