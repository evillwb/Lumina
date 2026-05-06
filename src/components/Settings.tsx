import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ScheduleBlock, UserProfile } from '../types';
import { getCalendarAccessToken } from '../lib/firebase';
import { Download, CalendarDays, Moon, Sun, Languages, Cloud, Globe, BrainCircuit } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { useTranslation } from '../locales/i18n';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = usePreferences();
  const { t } = useTranslation();

  const [isSyncing, setIsSyncing] = React.useState(false);
  const [timezone, setTimezone] = React.useState('UTC');
  const [spacedRepetition, setSpacedRepetition] = React.useState({
    lowMasteryDays: 1,
    mediumMasteryDays: 3,
    highMasteryDays: 7
  });

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
         try {
            const d = await getDoc(doc(db, 'users', user.uid));
            if (d.exists()) {
               const data = d.data() as UserProfile;
               const tz = data.timezone;
               if (tz) setTimezone(tz);
               else setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
               
               if (data.spacedRepetition) {
                 setSpacedRepetition({
                   lowMasteryDays: data.spacedRepetition.lowMasteryDays ?? 1,
                   mediumMasteryDays: data.spacedRepetition.mediumMasteryDays ?? 3,
                   highMasteryDays: data.spacedRepetition.highMasteryDays ?? 7
                 });
               }
            }
         } catch(e) {}
      };
      fetchProfile();
    }
  }, [user]);

  const handleTimezoneChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
     const tz = e.target.value;
     setTimezone(tz);
     if (user) {
        try {
           await updateDoc(doc(db, 'users', user.uid), {
              timezone: tz,
              updatedAt: serverTimestamp()
           });
        } catch (error) {}
     }
  };

  const handleSpacedRepetitionChange = async (key: keyof typeof spacedRepetition, value: number) => {
    const newVal = Math.max(1, value); // Ensure minimum is 1
    const newSettings = { ...spacedRepetition, [key]: newVal };
    setSpacedRepetition(newSettings);
    if (user) {
       try {
          await updateDoc(doc(db, 'users', user.uid), {
             spacedRepetition: newSettings,
             updatedAt: serverTimestamp()
          });
       } catch (error) {}
    }
  };

  const syncToGoogleCalendar = async () => {
    if (!user) return alert("Must be logged in to sync.");
    
    setIsSyncing(true);
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'scheduleBlocks'));
      const blocks = snap.docs.map(d => d.data() as ScheduleBlock);
      
      if (blocks.length === 0) {
        setIsSyncing(false);
        return alert("No schedule to export.");
      }

      const token = await getCalendarAccessToken();
      if (!token) {
        setIsSyncing(false);
        return alert("Failed to get Google Calendar permissions.");
      }

      for (const b of blocks) {
        const dateParts = b.day.split('-');
        const currentYear = parseInt(dateParts[0]);
        const currentMonth = parseInt(dateParts[1]) - 1;
        const currentDay = parseInt(dateParts[2]);

        const startParts = b.startTime.split(':');
        const startD = new Date(currentYear, currentMonth, currentDay, parseInt(startParts[0]), parseInt(startParts[1]), 0);
        
        const endParts = b.endTime.split(':');
        const endD = new Date(currentYear, currentMonth, currentDay, parseInt(endParts[0]), parseInt(endParts[1]), 0);

        await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: `Study: ${b.title}`,
            description: `Adaptive revision block for ${b.title}`,
            start: {
              dateTime: startD.toISOString(),
            },
            end: {
              dateTime: endD.toISOString(),
            }
          })
        });
      }
      alert("Successfully synced to Google Calendar!");
    } catch (e) {
      console.error(e);
      alert("Error syncing to Google Calendar. Check console for details.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (!user) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Authentication Required</h2>
        <p className="text-neutral-500 dark:text-neutral-400">Please sign in with Google to access your settings.</p>
      </div>
    );
  }

  const exportICal = async () => {
    if (!user) return alert("Must be logged in to export.");
    const snap = await getDocs(collection(db, 'users', user.uid, 'scheduleBlocks'));
    const blocks = snap.docs.map(d => d.data() as ScheduleBlock);
    
    if (blocks.length === 0) return alert("No schedule to export.");

    let icalContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Lumina Planner//EN\n";

    blocks.forEach(b => {
      // b.day is now YYYY-MM-DD
      const dateParts = b.day.split('-');
      const d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      
      const startParts = b.startTime.split(':');
      d.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0);
      const startStr = d.toISOString().replace(/[-:]/g, '').split('.')[0] + "Z";
      
      const endParts = b.endTime.split(':');
      d.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0);
      const endStr = d.toISOString().replace(/[-:]/g, '').split('.')[0] + "Z";

      icalContent += "BEGIN:VEVENT\n";
      icalContent += `UID:${b.id}@lumina\n`;
      icalContent += `SUMMARY:${b.title}\n`;
      icalContent += `DTSTART:${startStr}\n`;
      icalContent += `DTEND:${endStr}\n`;
      icalContent += `DESCRIPTION:Adaptive study session for ${b.title}\n`;
      icalContent += "END:VEVENT\n";
    });

    icalContent += "END:VCALENDAR";

    const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = "Adaptive_Revision_Schedule.ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">Settings</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">Manage app preferences and integrations.</p>
      </header>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6 max-w-xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
            <CalendarDays className="w-6 h-6 text-blue-600 dark:text-blue-500" />
          </div>
          <div>
            <h3 className="text-neutral-900 dark:text-white font-medium">Export to My Calendar</h3>
            <p className="text-xs text-neutral-500">Sync with Google Calendar, Apple Calendar, or Outlook.</p>
          </div>
        </div>
        
        <div className="mb-6 p-4 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800 text-sm text-neutral-600 dark:text-neutral-400 space-y-2">
          <p className="font-bold text-neutral-900 dark:text-white mb-2 text-xs uppercase tracking-wider">How to import:</p>
          <ol className="list-decimal pl-4 space-y-2">
            <li>Click the button below to download the <span className="font-mono text-xs text-neutral-900 dark:text-neutral-300">.ics</span> file.</li>
            <li><strong>Google Calendar:</strong> Open Settings &gt; Import &amp; Export, select the downloaded file, and import it into your calendar.</li>
            <li><strong>Apple Calendar / Outlook:</strong> Simply open or double-click the downloaded file to add events automatically.</li>
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={syncToGoogleCalendar}
            disabled={isSyncing}
            className="flex-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-neutral-900 dark:text-white p-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {isSyncing ? (
               <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            ) : (
               <Cloud className="w-4 h-4" />
            )}
            Sync to Google Calendar
          </button>
          
          <button 
            onClick={exportICal}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors shadow-lg shadow-blue-900/20 active:scale-95"
          >
            <Download className="w-4 h-4" />
            Download .ics File
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6 max-w-xl mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
              {theme === 'dark' ? <Moon className="w-6 h-6 text-indigo-500" /> : <Sun className="w-6 h-6 text-indigo-600" />}
            </div>
            <div>
              <h3 className="text-neutral-900 dark:text-white font-medium">Appearance theme</h3>
              <p className="text-xs text-neutral-500">Toggle between Light and Dark mode.</p>
            </div>
          </div>
          <button 
            onClick={toggleTheme}
            className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-lg text-sm transition-colors border border-neutral-200 dark:border-neutral-700"
          >
            Switch to {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
        
        <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800 my-6" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl">
              <Languages className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
            </div>
            <div>
              <h3 className="text-neutral-900 dark:text-white font-medium">App & Quiz Language</h3>
              <p className="text-xs text-neutral-500">Select language for interface and AI-generated quizzes.</p>
            </div>
          </div>
          <select 
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500"
          >
            <option value="English">English</option>
            <option value="Malay">Bahasa Melayu</option>
            <option value="Simplified Chinese">简体中文 (Simplified Chinese)</option>
            <option value="Traditional Chinese">繁體中文 (Traditional Chinese)</option>
            <option value="Spanish">Español (Spanish)</option>
            <option value="French">Français (French)</option>
            <option value="German">Deutsch (German)</option>
            <option value="Japanese">日本語 (Japanese)</option>
            <option value="Korean">한국어 (Korean)</option>
            <option value="Italian">Italiano (Italian)</option>
            <option value="Portuguese">Português (Portuguese)</option>
            <option value="Russian">Русский (Russian)</option>
            <option value="Arabic">العربية (Arabic)</option>
          </select>
        </div>

        <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800 my-6" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
              <Globe className="w-6 h-6 text-blue-600 dark:text-blue-500" />
            </div>
            <div>
              <h3 className="text-neutral-900 dark:text-white font-medium">Time Zone</h3>
              <p className="text-xs text-neutral-500">Your local time zone for scheduling.</p>
            </div>
          </div>
          <select 
            value={timezone}
            onChange={handleTimezoneChange}
            className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500 w-full sm:w-auto"
          >
             {Intl.supportedValuesOf('timeZone').map(tz => (
                <option key={tz} value={tz}>{tz}</option>
             ))}
          </select>
        </div>

        <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800 my-6" />

        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-xl">
              <BrainCircuit className="w-6 h-6 text-purple-600 dark:text-purple-500" />
            </div>
            <div>
              <h3 className="text-neutral-900 dark:text-white font-medium">Spaced Repetition</h3>
              <p className="text-xs text-neutral-500">Number of days to wait before reviewing a topic based on its mastery level.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-neutral-50 dark:bg-neutral-950 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 block">Low Mastery</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  min="1"
                  value={spacedRepetition.lowMasteryDays}
                  onChange={(e) => handleSpacedRepetitionChange('lowMasteryDays', parseInt(e.target.value) || 1)}
                  className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-purple-500"
                />
                <span className="text-sm text-neutral-500">Days</span>
              </div>
            </div>
            <div className="bg-neutral-50 dark:bg-neutral-950 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 block">Medium Mastery</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  min="1"
                  value={spacedRepetition.mediumMasteryDays}
                  onChange={(e) => handleSpacedRepetitionChange('mediumMasteryDays', parseInt(e.target.value) || 1)}
                  className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-purple-500"
                />
                <span className="text-sm text-neutral-500">Days</span>
              </div>
            </div>
            <div className="bg-neutral-50 dark:bg-neutral-950 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 block">High Mastery</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  min="1"
                  value={spacedRepetition.highMasteryDays}
                  onChange={(e) => handleSpacedRepetitionChange('highMasteryDays', parseInt(e.target.value) || 1)}
                  className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-purple-500"
                />
                <span className="text-sm text-neutral-500">Days</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
