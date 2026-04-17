import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Layers, BarChart3, Anchor, Shield, Sparkles,
  ChevronDown, ChevronUp
} from "lucide-react";
import { TierSamplerStrip } from "@/components/TierSamplerStrip";
import { ExpectationAnchorSurvey } from "@/components/ExpectationAnchorSurvey";
import { ESGReportCard } from "@/components/ESGReportCard";
import { GovernanceDashboard } from "@/components/GovernanceDashboard";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Component ─────────────────────────────────────────────────────────

export default function TierSampler() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("sampler");
  const [surveyExpanded, setSurveyExpanded] = useState(false);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20">
              <Layers className="h-6 w-6 text-violet-400" />
            </div>
            Tier Sampler & Expectations
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Explore quality tiers, set expectations, and track satisfaction across your projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30">
            <Sparkles className="h-3 w-3 mr-1" />
            Expectation UX
          </Badge>
        </div>
      </div>

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900/50 border border-zinc-700/30">
          <TabsTrigger value="sampler" className="data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-300">
            <Layers className="h-4 w-4 mr-2" />
            Tier Sampler
          </TabsTrigger>
          <TabsTrigger value="anchor" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-300">
            <Anchor className="h-4 w-4 mr-2" />
            Anchor Survey
          </TabsTrigger>
          <TabsTrigger value="report" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-300">
            <BarChart3 className="h-4 w-4 mr-2" />
            ESG Report
          </TabsTrigger>
          <TabsTrigger value="governance" className="data-[state=active]:bg-rose-600/20 data-[state=active]:text-rose-300">
            <Shield className="h-4 w-4 mr-2" />
            Governance
          </TabsTrigger>
        </TabsList>

        {/* Tier Sampler Tab */}
        <TabsContent value="sampler" className="space-y-6 mt-4">
          <Card className="bg-zinc-900/50 border-zinc-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-5 w-5 text-violet-400" />
                Quality Tier Explorer
              </CardTitle>
              <CardDescription>
                Browse representative samples across 5 quality tiers. Each tier demonstrates what to expect
                at different price points and generation settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TierSamplerStrip />
            </CardContent>
          </Card>

          {/* Inline anchor survey prompt */}
          <Card className="bg-gradient-to-r from-amber-900/10 to-orange-900/10 border-amber-500/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Anchor className="h-5 w-5 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Set Your Quality Expectations</p>
                    <p className="text-xs text-zinc-400">
                      Complete the anchor survey to calibrate your experience and reduce surprise gaps.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSurveyExpanded(!surveyExpanded)}
                  className="text-amber-400 hover:text-amber-300"
                >
                  {surveyExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              {surveyExpanded && (
                <div className="mt-4 pt-4 border-t border-amber-500/10">
                  <ExpectationAnchorSurvey />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anchor Survey Tab */}
        <TabsContent value="anchor" className="space-y-6 mt-4">
          <ExpectationAnchorSurvey />
        </TabsContent>

        {/* ESG Report Tab */}
        <TabsContent value="report" className="space-y-6 mt-4">
          <ESGReportCard />
        </TabsContent>

        {/* Governance Tab */}
        <TabsContent value="governance" className="space-y-6 mt-4">
          <GovernanceDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
