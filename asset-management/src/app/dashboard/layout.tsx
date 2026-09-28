import { DashboardShell } from "@/components/dashboard/shell";

export default function DashboardLayout(props: LayoutProps<"/dashboard">) {
  return <DashboardShell>{props.children}</DashboardShell>;
}
