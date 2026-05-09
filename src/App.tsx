/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, Suspense, lazy } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { db } from "./lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  PreferencesProvider,
  usePreferences,
} from "./contexts/PreferencesContext";

const SyllabusManager = lazy(() => import("./components/SyllabusManager").then(module => ({ default: module.SyllabusManager })));
const CalendarView = lazy(() => import("./components/CalendarView").then(module => ({ default: module.CalendarView })));
const Settings = lazy(() => import("./components/Settings").then(module => ({ default: module.Settings })));
const Quizzes = lazy(() => import("./components/Quizzes").then(module => ({ default: module.Quizzes })));
const StoreQuests = lazy(() => import("./components/StoreQuests").then(module => ({ default: module.StoreQuests })));
const PomodoroTimer = lazy(() => import("./components/PomodoroTimer").then(module => ({ default: module.PomodoroTimer })));
const SmartNotes = lazy(() => import("./components/SmartNotes").then(module => ({ default: module.SmartNotes })));
const SubjectNotes = lazy(() => import("./components/SubjectNotes").then(module => ({ default: module.SubjectNotes })));
const MasteryMap = lazy(() => import("./components/MasteryMap").then(module => ({ default: module.MasteryMap })));

const UserDataLoader = () => {
  const { user } = useAuth();
  const { setLanguage } = usePreferences();

  useEffect(() => {
    if (!user) return;
    const fetchUserData = async () => {
      try {
        const d = await getDoc(doc(db, "users", user.uid));
        if (d.exists()) {
          const data = d.data();
          if (data.activePremiumTheme) {
            document.documentElement.setAttribute(
              "data-premium-theme",
              data.activePremiumTheme,
            );
          }
          if (data.language) {
            setLanguage(data.language as any);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchUserData();
  }, [user, setLanguage]);
  return null;
};

export default function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");

  return (
    <ThemeProvider>
      <PreferencesProvider>
        <AuthProvider>
          <UserDataLoader />
          <div className="flex w-full h-screen font-sans overflow-x-hidden transition-colors duration-300">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

            {activeTab === "Dashboard" && (
              <Dashboard
                onNavigateToCalendar={() => setActiveTab("Calendar")}
              />
            )}
            <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-neutral-50 dark:bg-[#09090b]"><div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>}>
              {activeTab === "My Syllabus" && <SyllabusManager />}
              {activeTab === "Subject Notes" && <SubjectNotes />}
              {activeTab === "Calendar" && <CalendarView />}
              {activeTab === "Quizzes" && <Quizzes />}
              {activeTab === "Focus Time" && (
                <div className="flex-1 p-8 flex flex-col items-center justify-center bg-neutral-50 dark:bg-[#09090b] overflow-y-auto">
                  <PomodoroTimer />
                </div>
              )}
              {activeTab === "Smart Notes" && <SmartNotes />}
              {activeTab === "Mastery Map" && <MasteryMap />}
              {activeTab === "Store & Quests" && <StoreQuests />}
              {activeTab === "Settings" && <Settings />}
            </Suspense>
          </div>
        </AuthProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
