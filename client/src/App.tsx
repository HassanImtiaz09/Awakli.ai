import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { STORAGE_KEY_RETURN_PATH } from "./const";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Discover from "./pages/Discover";
import Explore from "./pages/Explore";
import StudioDashboard from "./pages/StudioDashboard";
import MangaUpload from "./pages/MangaUpload";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectWizard from "./pages/ProjectWizard";
import ScriptEditor from "./pages/ScriptEditor";
import CharacterCreator from "./pages/CharacterCreator";
import PanelReview from "./pages/PanelReview";
import StoryboardPreview from "./pages/StoryboardPreview";
import WatchProject from "./pages/WatchProject";
import EpisodePlayer from "./pages/EpisodePlayer";
import Leaderboard from "./pages/Leaderboard";
import UserProfile from "./pages/UserProfile";
import PipelineDashboard from "./pages/PipelineDashboard";
import QAReview from "./pages/QAReview";
import GateReview from "./pages/GateReview";
import BatchGateReview from "./pages/BatchGateReview";
import AdminGateAnalytics from "./pages/AdminGateAnalytics";
import QualityInsights from "./pages/QualityInsights";
import VoiceCloning from "./pages/VoiceCloning";
import Pricing from "./pages/Pricing";
import UsageDashboard from "./pages/UsageDashboard";
import CreatorEarnings from "./pages/CreatorEarnings";
import AdminDashboard from "./pages/AdminDashboard";
import ProviderAdmin from "./pages/ProviderAdmin";
import Onboarding from "./pages/Onboarding";
import Create from "./pages/Create";
import PreProduction from "./pages/PreProduction";
import MusicStudio from "./pages/MusicStudio";
import VocalRecordingStudio from "./pages/VocalRecordingStudio";
import CreateGenerate from "./pages/CreateGenerate";
import CreateReader from "./pages/CreateReader";
import DemoRecording from "./pages/DemoRecording";
import Trending from "./pages/Trending";
import BYOUpload from "./pages/BYOUpload";
import CreatorAnalytics from "./pages/CreatorAnalytics";
import CharacterLibrary from "./pages/CharacterLibrary";
import CharacterDetail from "./pages/CharacterDetail";
import BatchTraining from "./pages/BatchTraining";
import { StudioLayout } from "./components/awakli/Layouts";

function Router() {
  const [location, navigate] = useLocation();

  // After OAuth callback redirects to /, check if there's a stored return path
  useEffect(() => {
    const returnPath = sessionStorage.getItem(STORAGE_KEY_RETURN_PATH);
    if (returnPath && location === "/") {
      sessionStorage.removeItem(STORAGE_KEY_RETURN_PATH);
      navigate(returnPath, { replace: true });
    }
  }, [location, navigate]);

  return (
    <AnimatePresence mode="wait">
      <Switch key={location}>
        {/* Marketing / public */}
        <Route path="/" component={Home} />
        <Route path="/signin" component={SignIn} />
        <Route path="/signup" component={SignUp} />
        <Route path="/discover" component={Discover} />
        <Route path="/explore" component={Explore} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/trending" component={Trending} />
        <Route path="/onboarding" component={Onboarding} />

        {/* Public creation flow */}
        <Route path="/create" component={Create} />
        <Route path="/create/:projectId" component={CreateGenerate} />
        <Route path="/create/:projectId/read" component={CreateReader} />

        {/* Watch / community */}
        <Route path="/watch/:slug" component={WatchProject} />
        <Route path="/watch/:slug/:episodeNumber" component={EpisodePlayer} />

        {/* User profiles */}
        <Route path="/profile/:userId" component={UserProfile} />

        {/* Character Library */}
        <Route path="/characters" component={CharacterLibrary} />
        <Route path="/characters/:id" component={CharacterDetail} />
        <Route path="/batch-training" component={BatchTraining} />

        {/* Account / billing */}
        <Route path="/usage" component={UsageDashboard} />
        <Route path="/earnings" component={CreatorEarnings} />
        <Route path="/analytics" component={CreatorAnalytics} />

        {/* Admin */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/providers" component={ProviderAdmin} />
        <Route path="/admin/gates" component={AdminGateAnalytics} />
        <Route path="/studio/quality-insights" component={QualityInsights} />
        <Route path="/demo-recording" component={DemoRecording} />

        {/* Studio */}
        <Route path="/studio" component={StudioDashboard} />
        <Route path="/studio/new" component={ProjectWizard} />
        <Route path="/studio/upload" component={MangaUpload} />
        <Route path="/studio/byo-upload" component={BYOUpload} />
        <Route path="/studio/projects/:id" component={ProjectDetail} />

        {/* Studio — per-project tools (wrapped in StudioLayout) */}
        <Route path="/studio/project/:projectId/script">
          {(params) => (
            <StudioLayout>
              <ScriptEditor />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId/characters">
          {(params) => (
            <StudioLayout>
              <CharacterCreator />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/byo-upload/:projectId" component={BYOUpload} />
        <Route path="/studio/project/:projectId/upload">
          {(params) => (
            <StudioLayout>
              <MangaUpload />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId/panels">
          {(params) => (
            <StudioLayout>
              <PanelReview />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId/storyboard">
          {(params) => (
            <StudioLayout>
              <StoryboardPreview />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId/pipeline">
          {(params) => (
            <StudioLayout>
              <PipelineDashboard />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId/pipeline/:runId/review">
          {(params) => (
            <StudioLayout>
              <QAReview />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId/pipeline/:runId/gate/:gateId">
          {(params) => (
            <StudioLayout>
              <GateReview />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId/pipeline/:runId/batch-review">
          {(params) => (
            <StudioLayout>
              <BatchGateReview />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId/characters/:characterId/voice">
          {(params) => (
            <StudioLayout>
              <VoiceCloning />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/project/:projectId">
          {(params) => (
            <StudioLayout>
              <ProjectDetail />
            </StudioLayout>
          )}
        </Route>
        <Route path="/studio/:projectId/pre-production" component={PreProduction} />
        <Route path="/studio/:projectId/music" component={MusicStudio} />
        <Route path="/studio/:projectId/vocal-recording" component={VocalRecordingStudio} />

        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "#151528",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#F0F0F5",
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
