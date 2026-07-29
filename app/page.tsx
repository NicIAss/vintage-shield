import { listPublicBans } from "@/lib/ban-service";
import { BanDashboard } from "./ban-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { bans, demo } = await listPublicBans();
  return <BanDashboard initialBans={bans} demo={demo} />;
}
