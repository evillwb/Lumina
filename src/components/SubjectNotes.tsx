import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Plus, Clock, FileText, Check, Download } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../locales/i18n';

interface Subject {
  id: string;
  name: string;
  createdAt: any;
}

interface Note {
  id: string;
  subjectId: string;
  content: string;
  lastEditedAt: any;
}

export const SubjectNotes: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  
  useEffect(() => {
    const savedSubjects = localStorage.getItem('sn_subjects');
    if (savedSubjects) {
      const parsed = JSON.parse(savedSubjects);
      setSubjects(parsed);
      if (parsed.length > 0) {
        setActiveSubject(parsed[0]);
        loadNote(parsed[0].id);
      }
    }
  }, []);

  const saveSubjects = (newSubjects: Subject[]) => {
    setSubjects(newSubjects);
    localStorage.setItem('sn_subjects', JSON.stringify(newSubjects));
  }

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const newSubject: Subject = {
      id: uuidv4(),
      name: newSubjectName.trim(),
      createdAt: new Date().toISOString()
    };
    saveSubjects([...subjects, newSubject]);
    setNewSubjectName('');
    setIsAddingSubject(false);
    
    // Auto-select
    if (!activeSubject) {
      setActiveSubject(newSubject);
      loadNote(newSubject.id);
    }
  };

  const loadNote = (subjectId: string) => {
    const savedNote = localStorage.getItem(`sn_note_${subjectId}`);
    if (savedNote) {
      const parsed = JSON.parse(savedNote);
      setNoteContent(parsed.content || '');
      setLastSaved(parsed.lastEditedAt ? new Date(parsed.lastEditedAt) : null);
    } else {
      setNoteContent('');
      setLastSaved(null);
    }
  }

  const handleSubjectClick = (subject: Subject) => {
    setActiveSubject(subject);
    loadNote(subject.id);
  }

  // Auto-save effect
  useEffect(() => {
    if (!activeSubject) return;
    
    const timeoutId = setTimeout(() => {
      setIsSaving(true);
      const noteToSave = {
        content: noteContent,
        lastEditedAt: new Date().toISOString()
      };
      localStorage.setItem(`sn_note_${activeSubject.id}`, JSON.stringify(noteToSave));
      setLastSaved(new Date());
      
      setTimeout(() => setIsSaving(false), 500); // Visual feedback
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [noteContent, activeSubject]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-neutral-50 dark:bg-[#09090b]">
      {/* Left Sidebar */}
      <div className="w-full md:w-64 shrink-0 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col h-full z-10 md:h-auto border-b md:border-b-0 max-h-[30vh] md:max-h-full print:hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 py-1 uppercase tracking-wider">Notebooks</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => handleSubjectClick(s)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeSubject?.id === s.id ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-medium' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/50 text-neutral-600 dark:text-neutral-300'}`}
            >
              <FileText className="shrink-0 w-4 h-4 opacity-70" />
              <span className="truncate">{s.name}</span>
            </button>
          ))}
          
          {isAddingSubject ? (
            <form onSubmit={handleAddSubject} className="mt-2 px-1 relative">
              <input
                type="text"
                value={newSubjectName}
                onChange={e => setNewSubjectName(e.target.value)}
                autoFocus
                placeholder="Subject name..."
                className="w-full bg-neutral-100 dark:bg-neutral-800 border-none rounded-lg px-3 py-2.5 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-indigo-500 pr-8"
                onBlur={() => {
                  if (!newSubjectName.trim()) setIsAddingSubject(false);
                }}
              />
            </form>
          ) : (
            <button
              onClick={() => setIsAddingSubject(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 mt-2 rounded-lg text-left text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Plus className="shrink-0 w-4 h-4" />
              <span>Add Subject</span>
            </button>
          )}
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col h-full bg-[#fcfcfc] dark:bg-[#0a0a0c] overflow-hidden relative">
        {activeSubject ? (
          <>
            <div className="shrink-0 pt-10 px-8 md:px-16 max-w-4xl w-full mx-auto flex items-center justify-between print:pt-4">
              <div className="flex flex-col">
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">{activeSubject.name}</h1>
                <div className="hidden print:block text-sm text-neutral-500 mt-1">
                  {new Date().toLocaleDateString()}
                </div>
              </div>
              
              <div className="flex shrink-0 items-center gap-3 print:hidden">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-full text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> 
                  Export to PDF
                </button>
                <div className="flex items-center text-xs text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800/50 px-3 py-1.5 rounded-full">
                  {isSaving ? (
                    <span className="flex items-center gap-1.5"><span className="shrink-0 w-1.5 h-1.5 bg-neutral-400 rounded-full animate-pulse"></span> Saving...</span>
                  ) : lastSaved ? (
                    <span className="flex items-center gap-1.5"><Check className="shrink-0 w-3.5 h-3.5" /> Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  ) : (
                    <span>Ready</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-8 md:px-16 py-8 max-w-4xl w-full mx-auto print:overflow-visible my-print-container">
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Start typing your notes here..."
                className="w-full h-full min-h-[50vh] bg-transparent resize-none border-none outline-none focus:ring-0 text-neutral-800 dark:text-neutral-200 text-lg leading-relaxed placeholder:text-neutral-400 dark:placeholder:text-neutral-600 print:hidden"
              />
              <div className="hidden print:block whitespace-pre-wrap text-black text-lg leading-relaxed font-serif">
                {noteContent}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-400 flex-col gap-4 animate-in fade-in duration-700">
             <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-2 shadow-sm rotate-3">
               <FileText className="w-10 h-10 text-indigo-500 dark:text-indigo-400" />
             </div>
             <h3 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">Your academic journey starts here</h3>
             <p className="text-center px-4 max-w-sm text-neutral-500 leading-relaxed">Create a notebook to organize your thoughts, or select an existing one from the sidebar.</p>
             <button
                onClick={() => setIsAddingSubject(true)}
                className="mt-4 flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-md transition-all active:scale-95"
              >
                <Plus className="w-5 h-5" /> Start Writing
              </button>
          </div>
        )}
      </div>
    </div>
  );
};
