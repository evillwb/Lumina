import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, serverTimestamp, getDoc } from 'firebase/firestore';
import { Topic, PRESET_SUBJECTS, ScheduleBlock, DAYS, STUDY_HOURS, DayOfWeek } from '../types';
import { Plus, Trash2, Edit2, X, Check, Search, CalendarPlus, Zap, Loader2, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import MDEditor from '@uiw/react-md-editor';
import { useTheme } from '../contexts/ThemeContext';
import { GoogleGenAI } from '@google/genai';

export const SyllabusManager: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const titleRef = useRef<HTMLInputElement>(null);

  // Form states
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [topicToDelete, setTopicToDelete] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(PRESET_SUBJECTS[0]);
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [difficulty, setDifficulty] = useState<Topic['difficulty']>('Beginner');
  const [quizDifficulty, setQuizDifficulty] = useState<Topic['quizDifficulty']>('Medium');
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);

  const generateNotes = async () => {
    if (!title.trim()) {
      alert("Please provide a topic title first.");
      return;
    }
    setIsGeneratingNotes(true);
    try {
      if (!process.env.GEMINI_API_KEY) {
        alert("GEMINI_API_KEY is not set.");
        setIsGeneratingNotes(false);
        return;
      }
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Generate a concise set of study notes for the topic "${title}" under the subject "${subject === 'Custom' ? 'a particular subject' : subject}". The content should be tailored to a learning material difficulty level of "${difficulty}" and a quiz proficiency expectation of "${quizDifficulty}". The notes should include key concepts, formulas, or reminders that are essential for studying this topic. Format the response using markdown.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      if (response.text) {
        setNotes(response.text);
      }
    } catch (error) {
      console.error("Error generating notes:", error);
      alert("Failed to generate notes. Please try again.");
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const fetchTopics = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const q = collection(db, 'users', user.uid, 'topics');
      const snap = await getDocs(q);
      setTopics(snap.docs.map(d => ({ id: d.id, ...d.data() } as Topic)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopics();
  }, [user]);

  const saveTopic = async () => {
    if (!user || !title.trim()) return;
    try {
      const isNew = !isEditing;
      const topicId = isEditing || uuidv4();
      const ref = doc(db, 'users', user.uid, 'topics', topicId);
      
      const topicData: any = {
        userId: user.uid,
        title,
        subject,
        notes,
        priority,
        difficulty,
        quizDifficulty,
        masteryLevel: isNew ? 0 : topics.find(t => t.id === isEditing)?.masteryLevel || 0,
        updatedAt: serverTimestamp(),
      };
      
      // Strict keys check enforcement, createdAt cannot be updated
      if (isNew) {
        topicData.createdAt = serverTimestamp();
        // Since we are validating keys perfectly
      } else {
        const existing = await getDoc(ref);
        if (existing.exists()) {
           topicData.createdAt = existing.data().createdAt; // keep immutable
        }
      }

      await setDoc(ref, topicData, { merge: true });
      
      resetForm();
      fetchTopics();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'topics');
    }
  };

  const deleteTopic = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'topics', id));
      setTopics(topics.filter(t => t.id !== id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `topics/${id}`);
    }
  };

  const startEdit = (t: Topic) => {
    setIsEditing(t.id);
    setTitle(t.title);
    setSubject(t.subject);
    setNotes(t.notes || '');
    setPriority(t.priority || 'normal');
    setDifficulty(t.difficulty || 'Beginner');
    setQuizDifficulty(t.quizDifficulty || 'Medium');
  };

  const resetForm = () => {
    setIsEditing(null);
    setTitle('');
    setSubject(PRESET_SUBJECTS[0]);
    setNotes('');
    setPriority('normal');
    setDifficulty('Beginner');
    setQuizDifficulty('Medium');
  };

  const generateSchedule = async () => {
    if (!user || topics.length === 0) return alert("Add topics first!");
    
    try {
      const batchRef = collection(db, 'users', user.uid, 'scheduleBlocks');
      const oldBlocks = await getDocs(batchRef);
      for (const d of oldBlocks.docs) {
        await deleteDoc(doc(db, 'users', user.uid, 'scheduleBlocks', d.id));
      }

      let currentDate = new Date();
      // Start generating from tomorrow to give them time
      currentDate.setDate(currentDate.getDate() + 1);
      
      let currentHour = STUDY_HOURS.start; // 14
      
      const priorityWeights: Record<string, number> = { 'emergency': 4, 'normal': 2, 'low': 1 };
      
      // Create a expanded worklist where higher priority topics appear more frequently
      const worklist: Topic[] = [];
      topics.forEach(topic => {
        const weight = priorityWeights[topic.priority || 'normal'] || 2;
        for (let i = 0; i < weight; i++) {
          worklist.push({ ...topic });
        }
      });

      // Sort worklist so higher priority topics (Emergency) appear first
      worklist.sort((a, b) => {
        const weightA = priorityWeights[a.priority || 'normal'] || 2;
        const weightB = priorityWeights[b.priority || 'normal'] || 2;
        return weightB - weightA;
      });

      for (const topic of worklist) {
        const startStr = `${currentHour.toString().padStart(2, '0')}:00`;
        let nextHour = Math.min(currentHour + 2, 24);
        const endStr = nextHour === 24 ? '23:59' : `${nextHour.toString().padStart(2, '0')}:00`;

        const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD

        const blockId = uuidv4();
        await setDoc(doc(batchRef, blockId), {
          id: blockId,
          userId: user.uid,
          topicId: topic.id,
          title: topic.title,
          day: dateString, 
          startTime: startStr,
          endTime: endStr,
          status: 'upcoming',
          isReview: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        currentHour += 2;
        if (currentHour >= STUDY_HOURS.end) {
          currentHour = STUDY_HOURS.start;
          currentDate.setDate(currentDate.getDate() + 1); // Move to next day
        }
      }
      alert("Calendar generated successfully!");
    } catch (e) {
       handleFirestoreError(e, OperationType.WRITE, 'scheduleBlocks');
    }
  };

  if (loading) return <div className="p-8 text-neutral-400">Loading...</div>;

  const filteredTopics = topics.filter(t => {
    const searchMatch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const priorityMatch = filterPriority === 'all' || (t.priority || 'normal') === filterPriority;

    return searchMatch && priorityMatch;
  });

  if (!user) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col text-center">
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Authentication Required</h2>
          <p className="text-neutral-500 dark:text-neutral-400">Please sign in with Google from the sidebar to manage your syllabus.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">My Syllabus</h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">Manage topics and personal notes for AI quiz generation.</p>
        </div>
        <button 
          onClick={generateSchedule}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-900/20"
        >
          <CalendarPlus className="w-4 h-4" />
          Regenerate Schedule
        </button>
      </header>

      {/* Form */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6 mb-8">
        <h3 className="text-neutral-900 dark:text-white font-medium mb-4">{isEditing ? 'Edit Topic' : 'Add New Topic'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <div className="lg:col-span-1">
            <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">Topic Title</label>
            <input 
              ref={titleRef}
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500" 
              placeholder="e.g. Thermodynamics"
            />
          </div>
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-neutral-500 font-bold uppercase block">Preset Subject</label>
              <button 
                type="button"
                title="Quick Add Topic Title"
                onClick={() => {
                  setTitle(`${subject === 'Custom' ? 'New Topic' : subject} Basics`);
                  titleRef.current?.focus();
                }}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <Zap className="w-4 h-4" />
              </button>
            </div>
            <select 
              value={subject} onChange={(e) => {
                setSubject(e.target.value);
                if (!title.trim() && e.target.value !== 'Custom') {
                   setTitle(`${e.target.value} Basics`);
                }
              }}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {PRESET_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">Material Difficulty</label>
            <select 
              value={difficulty} onChange={(e) => setDifficulty(e.target.value as Topic['difficulty'])}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">Quiz Difficulty</label>
            <select 
              value={quizDifficulty} onChange={(e) => setQuizDifficulty(e.target.value as Topic['quizDifficulty'])}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">Priority</label>
            <select 
              value={priority} onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="low">Low Priority</option>
              <option value="normal">Normal</option>
              <option value="emergency">Emergency (Exam Next Week!)</option>
            </select>
          </div>
        </div>
        
        {subject === 'Custom' && (
           <div className="mb-4">
             <input 
                placeholder="Custom Subject Name" 
                className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm" 
                onChange={(e) => setSubject(e.target.value)}
              />
           </div>
        )}

        <div className="mb-4" data-color-mode={theme === 'dark' ? 'dark' : 'light'}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-neutral-500 font-bold uppercase block">My Notes (Refines AI Questions)</label>
            <button
              type="button"
              onClick={generateNotes}
              disabled={isGeneratingNotes || !title.trim()}
              className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 text-xs font-semibold uppercase disabled:opacity-50"
            >
              {isGeneratingNotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGeneratingNotes ? 'Generating...' : 'Auto-Generate'}
            </button>
          </div>
          <MDEditor 
            value={notes} 
            onChange={(val) => setNotes(val || '')}
            preview="edit"
            height={200}
            className="w-full rounded-lg text-sm"
            textareaProps={{
              placeholder: "Key concepts, formulas, or reminders... e.g. Entropy always increases."
            }}
          />
        </div>

        <div className="flex justify-end gap-3">
          {isEditing && <button onClick={resetForm} className="px-4 py-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors">Cancel</button>}
          <button 
            onClick={saveTopic}
            disabled={!title.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            {isEditing ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isEditing ? 'Save Topic' : 'Add Topic'}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {topicToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 shadow-xl max-w-sm w-full border border-neutral-200 dark:border-neutral-800">
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Delete Topic?</h3>
            <p className="text-neutral-500 dark:text-neutral-400 mb-6 text-sm">Are you sure you want to delete this topic? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setTopicToDelete(null)} 
                className="px-4 py-2 text-neutral-500 hover:text-neutral-800 dark:hover:text-white font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => { deleteTopic(topicToDelete); setTopicToDelete(null); }} 
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400">
             <Search className="w-4 h-4" />
          </div>
          <input 
            type="text"
            placeholder="Search topics by title, subject, or keywords in notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl py-3 pl-10 pr-4 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-3 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl py-3 px-4 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm w-40"
        >
          <option value="all">All Priorities</option>
          <option value="emergency">Emergency</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredTopics.map(t => (
          <div key={t.id} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 justify-between items-center flex rounded-xl shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                 <span className="text-xs font-bold text-blue-600 dark:text-blue-500 uppercase tracking-widest">{t.subject}</span>
                 {t.difficulty && <span className="bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">{t.difficulty}</span>}
                 {t.quizDifficulty && <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Quiz: {t.quizDifficulty}</span>}
                 {t.priority === 'emergency' && <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Emergency</span>}
                 {t.priority === 'low' && <span className="bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Low</span>}
              </div>
              <h3 className="text-neutral-900 dark:text-white font-medium">{t.title}</h3>
              {t.notes && <p className="text-neutral-500 text-xs mt-1 truncate max-w-md">{t.notes}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(t)} className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => setTopicToDelete(t.id)} className="p-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {topics.length === 0 && (
          <div className="py-12 text-center text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
            No topics yet. Start building your syllabus!
          </div>
        )}
        {topics.length > 0 && filteredTopics.length === 0 && (
          <div className="py-12 text-center text-neutral-500 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
            No topics match your search query.
          </div>
        )}
      </div>
    </div>
  );
};
