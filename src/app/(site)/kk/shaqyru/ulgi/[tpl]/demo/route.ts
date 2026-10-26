import { DEMO_SLUGS, demoResponse } from "@/site/demo";

// T4 demo invitation (fictional data, preview renderer), generated at build time.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return DEMO_SLUGS.kk.map((tpl) => ({ tpl }));
}

export async function GET(_req: Request, { params }: RouteContext<"/kk/shaqyru/ulgi/[tpl]/demo">) {
  const { tpl } = await params;
  return demoResponse("kk", tpl);
}
