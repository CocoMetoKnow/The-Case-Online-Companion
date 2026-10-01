import { useEffect } from "react";
import { useGame } from "@/lib/game/store";
import { Landing } from "./Landing";
import { SetupScreen } from "./SetupScreen";
import { LobbyScreen } from "./LobbyScreen";
import { Briefcase } from "./Briefcase";
import { OnlineTable } from "./OnlineTable";
import { JournalLayer } from "./JournalLayer";

export function AppShell() {
  const view = useGame((s) => s.view);
  const hydrate = useGame((s) => s.hydrate);
  const booted = useGame((s) => s.booted);
  const state = useGame((s) => s.state);
  const setup = useGame((s) => s.setup);
  const joinCode = useGame((s) => s.joinCode);
  const heist = view === "setup" || view === "landing" ? Boolean(setup.settings.heist) : Boolean(state?.settings.heist);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    document.title = "The Case";
  }, [heist]);

  if (!booted) return <main className="leather min-h-dvh" />;

  const online = state
    ? state.settings.playMode === "online"
    : setup.settings.playMode === "online" || Boolean(joinCode);

  let screen = <Landing />;
  if (view === "setup") screen = <SetupScreen />;
  else if (view === "lobby" || view === "play") {
    if (online && (state || joinCode)) screen = <OnlineTable />;
    else if (view === "lobby") screen = <LobbyScreen />;
    else screen = <Briefcase />;
  }

  // The journal sits beside whichever screen is showing, never inside one, so it survives every
  // screen change and can never be stacked underneath another screen's overlays.
  return (
    <>
      {screen}
      <JournalLayer />
    </>
  );
}
