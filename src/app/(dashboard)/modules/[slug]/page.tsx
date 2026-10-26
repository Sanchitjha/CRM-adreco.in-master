import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { MODULES, MODULE_SLUGS } from "@/lib/modules";
import { ModulePreview } from "@/components/coming-soon";

export function generateStaticParams() {
  return MODULE_SLUGS.map((slug) => ({ slug }));
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/");

  const { slug } = await params;
  const mod = MODULES[slug];
  if (!mod) notFound();

  return <ModulePreview module={mod} />;
}
