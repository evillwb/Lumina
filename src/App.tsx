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
import { MasteryMap } from './components/MasteryMap';
import { ThemeProvider } from './contexts/ThemeContext';
import { PreferencesProvider, usePreferences } from './contexts/PreferencesContext';
import { Joyride, STATUS, type CallBackProps } from 'react-joyride';

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
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('hasSeenTour');
    if (!hasSeenTour) {
      setRunTour(true);
    }
  }, []);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    // Attempt to navigate according to the tour if necessary, but Joyride works well handling elements that exist so we just guide them.
    if (data.index === 0 && data.type === 'step:after') setActiveTab('Calendar');
    if (data.index === 1 && data.type === 'step:after') setActiveTab('Smart Notes');
    if (data.index === 2 && data.type === 'step:after') setActiveTab('Mastery Map');

    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      localStorage.setItem('hasSeenTour', 'true');
    }
  };

  const steps = [
    {
      target: '.tour-calendar',
      content: 'Welcome! This is the Smart Calendar. It automatically schedules topics and reschedules the ones you fail so you never fall behind.',
      disableBeacon: true,
    },
    {
      target: '.tour-smart-notes',
      content: 'Here, the AI automatically distills your study materials into Smart Notes and allows you to test yourself instantly.',
    },
    {
      target: '.tour-mastery-map',
      content: 'This is the Mastery Map. Watch your topics turn gold as you demonstrate mastery through quizzes. Good luck!',
    }
  ];

  return (
    <ThemeProvider>
      <PreferencesProvider>
        <AuthProvider>
          <Joyride
             steps={steps}
             run={runTour}
             continuous={true}
             showProgress={true}
             showSkipButton={true}
             callback={handleJoyrideCallback}
             styles={{
                options: {
                   primaryColor: '#4f46e5',
                   zIndex: 10000,
                }
             }}
          />
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
            {activeTab === 'Mastery Map' && <MasteryMap />}
            {activeTab === 'Store & Quests' && <StoreQuests />}
            {activeTab === 'Settings' && <Settings />}
          </div>
        </AuthProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
