import { MenuManager } from "@/components/admin/website/content-managers";
import { MenuPdfManager } from "@/components/admin/website/menu-pdf-manager";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminMenuPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-2 text-sm text-gray-500">
          Prefer editing inside{" "}
          <a href="/admin/designer" className="text-[#8B6914] underline">
            Visual designer
          </a>{" "}
          (Menu preview section). You can still manage PDF books and items here.
        </p>
      </header>
      <MenuPdfManager initial={content.menuPdfs} />
      <MenuManager content={content} />
    </div>
  );
}
