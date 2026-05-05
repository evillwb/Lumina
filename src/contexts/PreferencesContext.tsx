import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'English' | 'Malay' | 'Spanish' | 'Chinese' | 'French' | 'Japanese' | 'Korean' | 'German' | 'Arabic' | 'Hindi' | 'Russian' | 'Portuguese';

interface PreferencesContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('English');

  useEffect(() => {
    const saved = localStorage.getItem('language') as Language;
    if (saved) setLanguage(saved);
  }, []);

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <PreferencesContext.Provider value={{ language, setLanguage: changeLanguage }}>
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
