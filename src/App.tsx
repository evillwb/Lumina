/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { db } from './lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { SyllabusManager } from './components/SyllabusManager';
import { CalendarView } from './components/CalendarView';
import { Settings } from './components/Settings';
import { Quizzes } from './components/Quizzes';
import { StoreQuests } from './components/StoreQuests';
import { PomodoroTimer } from './components/PomodoroTimer';
import { SmartNotes } from './components/SmartNotes';
import { SubjectNotes } from './components/SubjectNotes';
import { ThemeProvider } from './contexts/ThemeContext';
import { PreferencesProvider, usePreferences } from './contexts/PreferencesContext';

const UserDataLoader = () => {
  const { user } = useAuth();
  const { setLanguage } = usePreferences();
  
  useEffect(() => {
    if (!user) return;
    const fetchUserData = async () => {
      try {
        const d = await getDoc(doc(db, 'users', user.uid));
        if (d.exists()) {
          const data = d.data();
          if (data.activePremiumTheme) {
            document.documentElement.setAttribute('data-premium-theme', data.activePremiumTheme);
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
}

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');

  return (
    <ThemeProvider>
      <PreferencesProvider>
        <AuthProvider>
          <UserDataLoader />
          <div className="flex w-full h-screen font-sans overflow-x-hidden transition-colors duration-300">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
            
            {activeTab === 'Dashboard' && <Dashboard onNavigateToCalendar={() => setActiveTab('Calendar')} />}
            {activeTab === 'My Syllabus' && <SyllabusManager />}
            {activeTab === 'Subject Notes' && <SubjectNotes />}
            {activeTab === 'Calendar' && <CalendarView />}
            {activeTab === 'Quizzes' && <Quizzes />}
            {activeTab === 'Focus Time' && (
              <div className="flex-1 p-8 flex flex-col items-center justify-center bg-neutral-50 dark:bg-[#09090b] overflow-y-auto">
                <PomodoroTimer />
              </div>
            )}
            {activeTab === 'Smart Notes' && <SmartNotes />}
            {activeTab === 'Store & Quests' && <StoreQuests />}
            {activeTab === 'Settings' && <Settings />}
          </div>
        </AuthProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
