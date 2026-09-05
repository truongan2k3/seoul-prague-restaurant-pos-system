import { MenuPdfManager } from "@/components/admin/website/menu-pdf-manager";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminMenuPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Menu PDFs</h1>
        <p className="mt-2 text-sm text-gray-500">
          Upload and reorder digital menu books. Guests open them on{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">/menu</code>. You can also
          manage PDFs inside the{" "}
          <a href="/admin/designer" className="text-[#8B6914] underline">
            Visual designer
          </a>
          .
        </p>
      </header>
      <MenuPdfManager initial={content.menuPdfs} />
    </div>
  );
}
