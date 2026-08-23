import { Dashboard } from "./dashboard";
import { store } from "@/lib/store";
export const dynamic = "force-dynamic";
export default function Page() { return <Dashboard initialJobs={store.list()} initialLogs={store.logs()} configured={Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET)} />; }
