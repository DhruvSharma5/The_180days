import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AnalyticsTracker } from "@/lib/analytics";
import AppLayout from "@/components/AppLayout";
import { AdminOnly, GuestOnly, Protected, RequireJourney } from "@/components/guards";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import VerifyLogin from "@/pages/VerifyLogin";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import DailyTracker from "@/pages/DailyTracker";
import CalendarView from "@/pages/CalendarView";
import DsaRoadmap from "@/pages/DsaRoadmap";
import MernRoadmap from "@/pages/MernRoadmap";
import RevisionTracker from "@/pages/RevisionTracker";
import MockTracker from "@/pages/MockTracker";
import Checkpoints from "@/pages/Checkpoints";
import Projects from "@/pages/Projects";
import InterviewPrep from "@/pages/InterviewPrep";
import ProfileSettings from "@/pages/ProfileSettings";
import AdminAnalytics from "@/pages/AdminAnalytics";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsConditions from "@/pages/TermsConditions";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <AnalyticsTracker />
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsConditions />} />
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-login" element={<VerifyLogin />} />
        </Route>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* Authenticated app shell */}
        <Route element={<Protected />}>
          <Route element={<AppLayout />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<RequireJourney />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/daily-tracker" element={<DailyTracker />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="/roadmap/dsa" element={<DsaRoadmap />} />
              <Route path="/roadmap/mern" element={<MernRoadmap />} />
              <Route path="/revision" element={<RevisionTracker />} />
              <Route path="/mocks" element={<MockTracker />} />
              <Route path="/checkpoints" element={<Checkpoints />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/interview-prep" element={<InterviewPrep />} />
            </Route>
            <Route path="/profile" element={<ProfileSettings />} />
            <Route path="/admin" element={<AdminOnly><AdminAnalytics /></AdminOnly>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="bottom-right" />
    </>
  );
}
