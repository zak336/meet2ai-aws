import { useState } from 'react';
import SectionLayer from './components/SectionLayer';
import AvatarLayer from './components/AvatarLayer';

export type AppPhase = "intro" | "landing" | "about" | "features" | "prejoin" | "classroom";

export default function App() {
  const [appPhase, setAppPhase] = useState<AppPhase>("intro");
  const [landingLayoutMode] = useState<"centered" | "asymmetrical">("centered");

  return (
    <div className="app-root">
      {/* Background Video / Avatar Layer */}
      <AvatarLayer />

      {/* Main Content Layer */}
      <SectionLayer 
        appPhase={appPhase} 
        setAppPhase={setAppPhase}
        landingLayoutMode={landingLayoutMode}
      />
    </div>
  );
}
