import { redirect } from "next/navigation";

export default function ScannerRoot() {
  redirect("/scanner/scan");
}
