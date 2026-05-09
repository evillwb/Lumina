import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Topic } from '../types';
import { motion } from 'motion/react';
import { Crown, AlertTriangle, Book, Loader2, Calendar } from 'lucide-react';

export const MasteryMap: React.FC = () => {
  const { user } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const fetchTopics = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'users', user.uid, 'topics'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Topic));
            setTopics(fetched);
        } catch(e) {
            handleFirestoreError(e, OperationType.GET, 'topics');
        } finally {
            setLoading(false);
        }
    }
    fetchTopics();
  }, [user]);

  const getMasteryColor = (level: number) => {
    if (level < 31) return 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-600';
    if (level < 71) return 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-700/50 text-amber-700 dark:text-amber-400 hover:border-amber-400 dark:hover:border-amber-600';
    return 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400 hover:border-emerald-400 dark:hover:border-emerald-600';
  };

  const getMasteryIcon = (level: number) => {
    if (level < 31) return <Book className="w-5 h-5 mb-2 opacity-50" />;
    if (level < 71) return <AlertTriangle className="w-5 h-5 mb-2" />;
    return <Crown className="w-5 h-5 mb-2" />;
  };

  const calculateNextReview = (topic: Topic) => {
    if (!topic.lastReviewed) return 'Needs Review';
    const last = new Date(topic.lastReviewed);
    const daysSince = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > 3 ? 'Review Soon' : 'Up to Date';
  }

  if (loading) {
     return (
        <div className="flex-1 p-8 flex items-center justify-center">
           <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
     );
  }

  // Group by Subject
  const subjectsMap: Record<string, Topic[]> = {};
  topics.forEach(t => {
      const subj = t.subject || 'Uncategorized';
      if (!subjectsMap[subj]) subjectsMap[subj] = [];
      subjectsMap[subj].push(t);
  });

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-neutral-50 dark:bg-[#09090b]">
        <div className="max-w-6xl mx-auto">
            <header className="mb-10 text-center">
                <h1 className="text-3xl font-black text-neutral-900 dark:text-white tracking-tight mb-3">Mastery Map</h1>
                <p className="text-neutral-500 dark:text-neutral-400 max-w-xl mx-auto">Visualize your learning progress across all subjects. Turn grey topics into gold as you master them through quizzes and spaced repetition.</p>
            </header>

            {Object.keys(subjectsMap).length === 0 ? (
                <div className="text-center p-12 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-3xl">
                    <p className="text-neutral-500">No topics found. Start by importing a syllabus!</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {Object.entries(subjectsMap).map(([subject, subTopics], idx) => (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          key={subject}
                        >
                            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200 mb-6 flex items-center gap-2">
                                <div className="w-3 h-8 bg-indigo-500 rounded-full" />
                                {subject}
                            </h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {subTopics.map((topic, i) => (
                                    <motion.div 
                                      key={topic.id}
                                      whileHover={{ scale: 1.02 }}
                                      className={`group relative p-4 rounded-2xl border-2 transition-all cursor-crosshair flex flex-col items-center justify-center text-center h-40 ${getMasteryColor(topic.masteryLevel || 0)}`}
                                    >
                                        {getMasteryIcon(topic.masteryLevel || 0)}
                                        <h3 className="font-bold text-sm leading-tight mb-2 line-clamp-2 md:px-2">{topic.title}</h3>
                                        <div className="mt-auto">
                                            <span className="text-xs font-black opacity-80">{topic.masteryLevel || 0}%</span>
                                        </div>

                                        {/* Tooltip */}
                                        <div className="absolute inset-0 bg-neutral-900/95 text-white p-4 justify-center items-center rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col z-10 pointer-events-none">
                                            <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-1">Details</span>
                                            <p className="text-xs mb-2">Attempts: {topic.failedAttempts || 0}</p>
                                            <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                                                <Calendar className="w-3 h-3" />
                                                {calculateNextReview(topic)}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};
