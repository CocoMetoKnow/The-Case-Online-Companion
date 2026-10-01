import { useEffect } from "react";
import { useGame } from "@/lib/game/store";
import { Landing } from "./Landing";
import { SetupScreen } from "./SetupScreen";
import { LobbyScreen } from "./LobbyScreen";
import { Briefcase } from "./Briefcase";
import { OnlineTable } from "./OnlineTable";
import { JournalLayer } from "./JournalLayer";
import { useUI } from "@/lib/ui/ui";

export function AppShell() {
  const view = useGame((s) => s.view);
  const hydrate = useGame((s) => s.hydrate);
  const booted = useGame((s) => s.booted);
  const state = useGame((s) => s.state);
  const setup = useGame((s) => s.setup);
  const joinCode = useGame((s) => s.joinCode);
  const heist = view === "setup" || view === "landing" ? Boolean(setup.settings.heist) : Boolean(state?.settings.heist);

  const initSkin = useUI((s) => s.initSkin);

  useEffect(() => {
    initSkin();
    hydrate();
  }, [hydrate, initSkin]);

  useEffect(() => {
    document.title = "The Case";
  }, [heist]);

  if (!booted) return <main className="leather min-h-dvh" />;

  const online = state
    ? state.settings.playMode === "online"
    : setup.settings.playMode === "online" || Boolean(joinCode);

  return (
    <>
      {screen(view, online, Boolean(state || joinCode))}
      {/* UI / RENDER LAYER: the single journal, mounted above every screen */}
      <JournalLayer />
    </>
  );
}

function screen(view: string, online: boolean, hasCase: boolean) {
  if (view === "setup") return <SetupScreen />;
  if (view === "lobby" || view === "play") {
    if (online && hasCase) return <OnlineTable />;
    if (view === "lobby") return <LobbyScreen />;
    if (view === "play") return <Briefcase />;
  }
  return <Landing />;
}
