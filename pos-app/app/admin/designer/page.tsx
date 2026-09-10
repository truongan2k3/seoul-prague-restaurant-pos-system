import { redirect } from "next/navigation";

/** Visual Designer removed — redirect to Section Builder. */
export default function AdminDesignerRedirectPage() {
  redirect("/admin/sections");
}
