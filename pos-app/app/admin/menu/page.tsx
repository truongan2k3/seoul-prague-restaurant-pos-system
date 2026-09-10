import { MenuManager } from "@/components/admin/website/content-managers";
import { MenuPdfManager } from "@/components/admin/website/menu-pdf-manager";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminMenuPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-2 text-sm text-gray-500">
          Manage featured dishes for the Signature section and digital menu PDFs. Control homepage
          Menu section visibility from{" "}
          <a href="/admin/sections" className="text-[#8B6914] underline">
            Sections
          </a>
          .
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Featured dishes</h2>
        <p className="text-sm text-gray-500">
          Featured items appear in Signature when that section has no custom components.
        </p>
        <MenuManager content={content} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Menu PDFs</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload and reorder digital menu books. Guests open them on{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">/menu</code>.
        </p>
        <MenuPdfManager initial={content.menuPdfs} />
      </section>
    </div>
  );
}
