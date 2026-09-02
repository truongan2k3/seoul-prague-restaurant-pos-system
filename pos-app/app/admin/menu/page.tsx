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
          Upload PDF menus (Czech, English, Chinese) for the flipbook on /landing/menu.
        </p>
      </header>
      <MenuPdfManager initial={content.menuPdfs} />
      <MenuManager content={content} />
    </div>
  );
}
