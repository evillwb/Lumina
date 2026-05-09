import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Lightbulb,
  Play,
  UploadCloud,
} from "lucide-react";
import { generateQuizQuestions } from "../services/geminiService";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useTranslation } from "../locales/i18n";
import { Topic } from "../types";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";

interface QuizLog {
  id: string;
  topicId: string;
  question: string;
  userAnswer: string;
  isCorrect: boolean;
  createdAt: any;
  explanation?: string;
}

export const Quizzes: React.FC = () => {
  const { user } = useAuth();
  const { language } = usePreferences();
  const { t } = useTranslation();
  const [logs, setLogs] = useState<QuizLog[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "Take Quiz" | "Flashcards" | "History" | "Review Mistakes"
  >("Take Quiz");

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  });
  const todayWeekday = formatter.format(new Date());
  const isSunday = todayWeekday === "Sunday";

  // Quiz Setup State
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [numQuestions, setNumQuestions] = useState<number>(5);
  const [timeLimitSecs, setTimeLimitSecs] = useState<number>(0); // 0 = no limit
  const [quizFiles, setQuizFiles] = useState<File[]>([]);

  // Active Quiz State
  const [quizData, setQuizData] = useState<
    | {
        question: string;
        options: string[];
        correctAnswer: string;
        explanation?: string;
      }[]
    | null
  >(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [quizResults, setQuizResults] = useState<
    {
      isCorrect: boolean;
      answer: string;
      correct: string;
      explanation?: string;
    }[]
  >([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [quizFinished, setQuizFinished] = useState(false);

  const [filterTopicId, setFilterTopicId] = useState<string>("all");
  const [filterCorrectness, setFilterCorrectness] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<string>("all");
  const [bossBattleActive, setBossBattleActive] = useState(false);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);
  const [examModeActive, setExamModeActive] = useState(false);
  const [showOnlyIncorrect, setShowOnlyIncorrect] = useState(false);
  const [generatingExplanations, setGeneratingExplanations] = useState<
    Record<string, boolean>
  >({});
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});

  const generateExplanationOnFly = async (
    logId: string,
    question: string,
    userAnswer: string,
  ) => {
    if (!user) return;
    setGeneratingExplanations((prev) => ({ ...prev, [logId]: true }));
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Give a concise explanation of why the answer "${userAnswer}" is incorrect for this multiple choice question: "${question}", and what the correct answer should be. Respond directly with the explanation in ${language}.`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      const expl = response.text || "Failed to generate explanation.";
      await updateDoc(doc(db, "users", user.uid, "quizLogs", logId), {
        explanation: expl,
      });
      setLogs((prev) =>
        prev.map((l) => (l.id === logId ? { ...l, explanation: expl } : l)),
      );
    } catch (e) {
      console.error(e);
      alert("Failed to generate explanation");
    } finally {
      setGeneratingExplanations((prev) => ({ ...prev, [logId]: false }));
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (quizData && !quizFinished && timeLeft !== null && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev && prev <= 1) {
            clearInterval(timer);

            // Score remaining as incorrect
            const remaining = quizData.slice(currentQuestionIdx).map((q) => ({
              isCorrect: false,
              answer: "Time's up",
              correct: q.correctAnswer,
            }));
            setQuizResults((prevRes) => [...prevRes, ...remaining]);
            setQuizFinished(true);
            return 0;
          }
          return prev ? prev - 1 : 0;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [quizData, quizFinished, timeLeft, currentQuestionIdx]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [qLogs, qTopics] = await Promise.all([
          getDocs(
            query(
              collection(db, "users", user.uid, "quizLogs"),
              orderBy("createdAt", "desc"),
              limit(50),
            ),
          ),
          getDocs(collection(db, "users", user.uid, "topics")),
        ]);

        setLogs(qLogs.docs.map((d) => ({ id: d.id, ...d.data() }) as QuizLog));
        const fetchedTopics = qTopics.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Topic,
        );
        setTopics(fetchedTopics);
        if (fetchedTopics.length > 0) setSelectedTopicId(fetchedTopics[0].id);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const startQuiz = async () => {
    if (!selectedTopicId || !user) return;
    const topic = topics.find((t) => t.id === selectedTopicId);
    if (!topic) return;

    setQuizLoading(true);
    setQuizResults([]);
    setCurrentQuestionIdx(0);
    setQuizFinished(false);
    setQuizData(null);
    setBossBattleActive(false);
    setExamModeActive(false);
    setTimeLeft(timeLimitSecs > 0 ? timeLimitSecs : null);
    setShowOnlyIncorrect(false);

    try {
      const processedFiles: { mimeType: string; data: string }[] = [];
      for (const file of quizFiles) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () =>
            resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        processedFiles.push({ mimeType: file.type, data: base64 });
      }

      const qArray = await generateQuizQuestions(
        topic.subject,
        topic.title,
        topic.notes,
        language,
        processedFiles,
        numQuestions,
      );
      setQuizData(qArray);
      setQuizFiles([]); // Clear after use
    } catch (e) {
      console.error(e);
      alert("Failed to generate quiz. Check API key.");
    } finally {
      setQuizLoading(false);
    }
  };

  const startBossBattle = async () => {
    if (!user) return;
    const wrongLogs = logs.filter((l) => !l.isCorrect).slice(0, 5); // limit to 5
    if (wrongLogs.length === 0) {
      alert("You have no wrong answers to review! Great job!");
      return;
    }

    setQuizLoading(true);
    setQuizResults([]);
    setCurrentQuestionIdx(0);
    setQuizFinished(false);
    setQuizData(null);
    setBossBattleActive(true);
    setExamModeActive(false);
    setTimeLeft(null);
    setShowOnlyIncorrect(false);

    try {
      const qArray = await generateQuizQuestions(
        "General Review",
        "Boss Battle",
        `Review these concepts the user got wrong: ${wrongLogs.map((l) => l.question).join(" | ")}`,
        language,
        [],
        wrongLogs.length,
      );
      setQuizData(qArray);
      // Let's set selectedTopicId to something for the DB log to pass, or use a dummy ID
      setSelectedTopicId(topics[0]?.id || "boss");
    } catch (e) {
      console.error(e);
      alert("Failed to create Boss Battle. Check API key.");
    } finally {
      setQuizLoading(false);
    }
  };

  const startExam = async () => {
    if (!selectedTopicId || !user) return;
    const topic = topics.find((t) => t.id === selectedTopicId);
    if (!topic) return;

    setQuizLoading(true);
    setQuizResults([]);
    setCurrentQuestionIdx(0);
    setQuizFinished(false);
    setQuizData(null);
    setBossBattleActive(false);
    setExamModeActive(true);
    const timeLimit = timeLimitSecs > 0 ? timeLimitSecs : 600; // 10 minutes default if 0
    setTimeLeft(timeLimit);
    setShowOnlyIncorrect(false);

    try {
      const processedFiles: { mimeType: string; data: string }[] = [];
      for (const file of quizFiles) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () =>
            resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        processedFiles.push({ mimeType: file.type, data: base64 });
      }

      const qArray = await generateQuizQuestions(
        topic.subject,
        topic.title,
        topic.notes,
        language,
        processedFiles,
        numQuestions,
      );
      setQuizData(qArray);
      setQuizFiles([]); // Clear after use
    } catch (e) {
      console.error(e);
      alert("Failed to generate exam. Check API key.");
    } finally {
      setQuizLoading(false);
    }
  };

  const [selectedFeedback, setSelectedFeedback] = useState<{
    option: string;
    isCorrect: boolean;
  } | null>(null);

  const submitAnswer = async (selectedAnswer: string) => {
    if (
      !quizData ||
      !user ||
      !selectedTopicId ||
      selectedFeedback !== null ||
      isProcessingAnswer
    )
      return;
    setIsProcessingAnswer(true);
    const currentQ = quizData[currentQuestionIdx];
    const isCorrect = selectedAnswer === currentQ.correctAnswer;

    let answerResults = [...quizResults];

    if (!examModeActive) {
      setSelectedFeedback({ option: selectedAnswer, isCorrect });
      // Wait 1 second before proceeding
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setSelectedFeedback(null);
    }

    const newResults = [
      ...quizResults,
      {
        isCorrect,
        answer: selectedAnswer,
        correct: currentQ.correctAnswer,
        explanation: currentQ.explanation,
      },
    ];
    setQuizResults(newResults);

    try {
      // Log Quiz Result
      const logId = uuidv4();
      const newLog: any = {
        userId: user.uid,
        topicId: selectedTopicId || "mixed",
        blockId: "manual-quiz",
        question: currentQ.question,
        userAnswer: selectedAnswer,
        isCorrect,
        createdAt: serverTimestamp(),
      };
      if (currentQ.explanation) {
        newLog.explanation = currentQ.explanation;
      }
      await setDoc(doc(db, "users", user.uid, "quizLogs", logId), newLog);

      setLogs((prev) => [
        {
          id: logId,
          ...newLog,
          createdAt: { toDate: () => new Date() },
        } as any,
        ...prev,
      ]);

      // Update Topic Mastery
      const topicRef = doc(db, "users", user.uid, "topics", selectedTopicId);
      const topic = topics.find((t) => t.id === selectedTopicId);
      const currMastery = topic?.masteryLevel || 0;
      await updateDoc(topicRef, {
        masteryLevel: isCorrect
          ? Math.min(100, currMastery + 5)
          : Math.max(0, currMastery - 2),
        lastReviewed: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });

      // Award credits if correct
      if (isCorrect) {
        const userRef = doc(db, "users", user.uid);
        const uDoc = await getDoc(userRef);
        if (uDoc.exists()) {
          const uData = uDoc.data();
          let bonus = 0;
          if (uData.activePet) {
            if (uData.activePet.id === 1) bonus = 1;
            else if (uData.activePet.id === 2) bonus = 2;
            else if (uData.activePet.id === 3) bonus = 5;
            else if (uData.activePet.id === 4) bonus = 10;
            else if (uData.activePet.id === 5) bonus = 15;
            else if (uData.activePet.id === 6) bonus = 20;
            else if (uData.activePet.id === 7) bonus = 30;
            else if (uData.activePet.id === 8) bonus = 50;
            else if (uData.activePet.id === 9) bonus = 70;
            else if (uData.activePet.id === 10) bonus = 100;
            else if (uData.activePet.id === 11) bonus = 150;
          }
          const tz =
            uData.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC";
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const todayStr = formatter.format(new Date());
          let newStreak = uData.streak || 0;
          if (uData.lastStreakDate !== todayStr) {
            newStreak += 1;
          }

          await updateDoc(userRef, {
            credits: (uData.credits || 0) + 10 + bonus,
            streak: newStreak,
            lastStreakDate: todayStr,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      console.error(err);
    }

    if (currentQuestionIdx < quizData.length - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1);
    } else {
      setQuizFinished(true);

      const allCorrect = newResults.every((r) => r.isCorrect);
      if (allCorrect) {
        import("../utils/confetti").then((module) => {
          module.triggerConfetti();
        });
      }

      if (bossBattleActive) {
        if (allCorrect) {
          const userRef = doc(db, "users", user.uid);
          getDoc(userRef).then((uDoc) => {
            if (uDoc.exists()) {
              const uData = uDoc.data();
              updateDoc(userRef, {
                credits: (uData.credits || 0) + 500,
                updatedAt: serverTimestamp(),
              });
              import("canvas-confetti").then((confetti) => {
                confetti.default({
                  particleCount: 150,
                  spread: 80,
                  origin: { y: 0.6 },
                });
              });
              alert(
                "AMAZING! You conquered the Sunday Boss Battle and earned 500 Credits!",
              );
            }
          });
        } else {
          alert(
            "Boss Battle finished, but you didn't get all of them correct. Try again next week!",
          );
        }
      }
    }
    setIsProcessingAnswer(false);
  };

  if (!user) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
          Authentication Required
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400">
          Please sign in with Google to view quizzes.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-neutral-400">Loading quizzes...</div>;
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
          {t("quizzes")}
        </h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
          {t("dashboard")}
        </p>
      </header>

      <div className="flex flex-col md:flex-row mb-6 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl w-full sm:w-auto overflow-hidden gap-2 md:gap-4 lg:w-max">
        {["Take Quiz", "Flashcards", "History", "Review Mistakes"].map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
            >
              {tab === "Take Quiz"
                ? t("take_quiz")
                : tab === "History"
                  ? t("history")
                  : tab === "Flashcards"
                    ? "Flashcards"
                    : "Review Mistakes"}
            </button>
          ),
        )}
      </div>

      {activeTab === "Take Quiz" && (
        <div className="max-w-2xl">
          {!quizData && !quizLoading && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center mb-6">
                <Lightbulb className="w-6 h-6 text-blue-600 dark:text-blue-500" />
              </div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                On-Demand Practice
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
                Select a topic from your syllabus to immediately generate a
                custom AI quiz based on your personal notes.
              </p>

              {topics.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  You need to add topics to your syllabus first.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">
                      Select Topic
                    </label>
                    <select
                      value={selectedTopicId}
                      onChange={(e) => setSelectedTopicId(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                    >
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.subject})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">
                        Number of Questions
                      </label>
                      <select
                        value={numQuestions}
                        onChange={(e) =>
                          setNumQuestions(parseInt(e.target.value))
                        }
                        className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value={1}>1 Question</option>
                        <option value={5}>5 Questions</option>
                        <option value={10}>10 Questions</option>
                        <option value={15}>15 Questions</option>
                        <option value={30}>30 Questions</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">
                        Time Limit
                      </label>
                      <select
                        value={timeLimitSecs}
                        onChange={(e) =>
                          setTimeLimitSecs(parseInt(e.target.value))
                        }
                        className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value={0}>None</option>
                        <option value={60}>1 Minute</option>
                        <option value={300}>5 Minutes</option>
                        <option value={600}>10 Minutes</option>
                        <option value={1800}>30 Minutes</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">
                      Upload Context Document (Optional)
                    </label>
                    <label className="border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-950 transition-colors">
                      <UploadCloud className="w-6 h-6 text-neutral-400 mb-2" />
                      <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                        Click to upload PDF or text file
                      </span>
                      <span className="text-xs text-neutral-400 mt-1">
                        If provided, the AI will use this to generate the
                        question
                      </span>
                      <input
                        type="file"
                        accept=".pdf,text/plain,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            setQuizFiles(Array.from(e.target.files));
                          }
                        }}
                        multiple
                      />
                    </label>
                    {quizFiles.length > 0 && (
                      <div className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-500">
                        {quizFiles.length} file(s) selected
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={startQuiz}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium p-3 rounded-lg flex justify-center items-center gap-2 shadow-lg hover:shadow-blue-900/20 transition-all active:scale-95"
                    >
                      <Play className="w-4 h-4" /> {t("start_ai_quiz")}
                    </button>
                    <button
                      onClick={startExam}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white font-medium p-3 rounded-lg flex justify-center items-center gap-2 shadow-lg hover:shadow-rose-900/20 transition-all active:scale-95"
                    >
                      <Clock className="w-4 h-4" /> {t("start_exam")}
                    </button>
                  </div>

                  {isSunday && (
                    <div className="mt-8 border-2 border-indigo-500 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 p-6 flex flex-col justify-center items-center text-center">
                      <h3 className="text-lg font-bold text-indigo-700 dark:text-indigo-400 mb-2">
                        🔥 Sunday Boss Battle! 🔥
                      </h3>
                      <p className="text-sm text-indigo-600 dark:text-indigo-300 mb-4 opacity-90">
                        Review all the questions you got wrong this week. Get a
                        perfect score and win 500 Credits!
                      </p>
                      <button
                        onClick={startBossBattle}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg uppercase tracking-wider"
                      >
                        Challenge the Boss
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {quizLoading && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 shadow-sm flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-500 mb-4"></div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                AI is analyzing your notes and generating a question...
              </p>
            </div>
          )}

          {quizData && !quizLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm p-6 overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600" />

              <div className="flex justify-between items-center mb-6 mt-2">
                <div className="text-[10px] font-bold text-blue-600 dark:text-blue-500 uppercase tracking-[0.2em]">
                  {examModeActive ? "Exam Mode" : "Practice Session"} •{" "}
                  {currentQuestionIdx + 1}/{quizData.length}
                </div>
                {timeLeft !== null && (
                  <div
                    className={`text-xs font-bold px-3 py-1 rounded-full ${timeLeft < 60 ? "bg-rose-100 text-rose-600" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}
                  >
                    Time: {Math.floor(timeLeft / 60)}:
                    {(timeLeft % 60).toString().padStart(2, "0")}
                  </div>
                )}
              </div>

              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-6 leading-tight">
                Review:{" "}
                <span className="text-blue-600 dark:text-blue-400">
                  {topics.find((t) => t.id === selectedTopicId)?.title}
                </span>
              </h2>

              {!quizFinished ? (
                <>
                  <div className="text-neutral-700 dark:text-neutral-300 text-sm mb-8 leading-relaxed font-medium">
                    <MarkdownRenderer
                      content={quizData[currentQuestionIdx].question}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {quizData[currentQuestionIdx].options.map((opt, i) => {
                      const letter = String.fromCharCode(65 + i);
                      let containerClass = "flex items-center gap-4 text-left w-full p-4 rounded-xl border-2 transition-all duration-200 group ";
                      let iconClass = "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ";
                      
                      if (selectedFeedback && selectedFeedback.option === opt) {
                        if (selectedFeedback.isCorrect) {
                          containerClass += "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)] scale-[1.02] z-10";
                          iconClass += "bg-emerald-500 text-white";
                        } else {
                          containerClass += "border-rose-500 bg-rose-50 dark:bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.2)] scale-[1.02] z-10";
                          iconClass += "bg-rose-500 text-white";
                        }
                      } else if (selectedFeedback && opt === quizData[currentQuestionIdx].correctAnswer) {
                        containerClass += "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/5 opacity-80";
                        iconClass += "bg-emerald-500 text-white";
                      } else if (selectedFeedback) {
                        containerClass += "border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 opacity-40 cursor-not-allowed";
                        iconClass += "bg-neutral-200 dark:bg-neutral-800 text-neutral-500";
                      } else {
                        containerClass += "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-blue-500 hover:shadow-md cursor-pointer hover:-translate-y-0.5";
                        iconClass += "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 group-hover:bg-blue-100 group-hover:text-blue-600 dark:group-hover:bg-blue-500/20 dark:group-hover:text-blue-400";
                      }

                      return (
                        <button
                          key={i}
                          disabled={selectedFeedback !== null || isProcessingAnswer}
                          onClick={() => submitAnswer(opt)}
                          className={containerClass}
                        >
                          <span className={iconClass}>{letter}</span>
                          <span className="flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-300 leading-snug">
                            {opt}
                          </span>
                          {selectedFeedback && selectedFeedback.option === opt && (
                            <span className="flex-shrink-0">
                              {selectedFeedback.isCorrect ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-rose-500" />}
                            </span>
                          )}
                          {selectedFeedback && selectedFeedback.option !== opt && opt === quizData[currentQuestionIdx].correctAnswer && (
                            <span className="flex-shrink-0">
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 opacity-50" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div className="p-6 rounded-xl border bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20 text-center">
                    <h3 className="text-xl font-bold text-blue-800 dark:text-blue-400 mb-2">
                      {examModeActive ? "Exam Complete!" : "Quiz Complete!"}
                    </h3>
                    <p className="text-blue-600 dark:text-blue-500">
                      You scored {quizResults.filter((r) => r.isCorrect).length}{" "}
                      out of {quizData.length}
                      {examModeActive && (
                        <span className="block mt-2 font-bold">
                          {(
                            (quizResults.filter((r) => r.isCorrect).length /
                              quizData.length) *
                            100
                          ).toFixed(0)}
                          % Final Score
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold text-neutral-900 dark:text-white">
                        Review your answers:
                      </h4>
                      {quizResults.some((r) => !r.isCorrect) && (
                        <button
                          onClick={() =>
                            setShowOnlyIncorrect(!showOnlyIncorrect)
                          }
                          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          {showOnlyIncorrect ? "Show All" : "Review Wrong Only"}
                        </button>
                      )}
                    </div>
                    {quizResults
                      .map((result, idx) => ({ result, originalIdx: idx }))
                      .filter((item) =>
                        showOnlyIncorrect ? !item.result.isCorrect : true,
                      )
                      .map(({ result, originalIdx }) => (
                        <div
                          key={originalIdx}
                          className={`p-4 rounded-xl border ${result.isCorrect ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200" : "bg-rose-50 dark:bg-rose-500/10 border-rose-200"}`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            {result.isCorrect ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-600" />
                            )}
                            <span
                              className={`text-sm font-semibold ${result.isCorrect ? "text-emerald-700" : "text-rose-700"}`}
                            >
                              Q{originalIdx + 1}:{" "}
                              {result.isCorrect ? "Correct" : "Incorrect"}
                            </span>
                          </div>
                          {!result.isCorrect && (
                            <div className="mt-2 text-xs">
                              <p className="text-rose-800 dark:text-rose-300">
                                Your answer: {result.answer} <br />
                                Correct answer: {result.correct}
                              </p>
                              {result.explanation && (
                                <p className="mt-2 text-rose-700 dark:text-rose-400 font-medium bg-rose-100 dark:bg-rose-500/20 p-2 rounded-lg">
                                  <span className="font-bold uppercase tracking-wider text-[10px] block mb-1">
                                    Explanation:
                                  </span>
                                  {result.explanation}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>

                  <button
                    onClick={() => {
                      setQuizData(null);
                      setQuizResults([]);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium p-3 rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {activeTab === "Flashcards" && (
        <div className="space-y-6 max-w-4xl">
          <div className="flex justify-between items-center bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">
                Study Flashcards
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Review your syllabus topics front-to-back.
              </p>
            </div>
            <div>
              <button
                onClick={() => setFlippedCards({})}
                className="text-sm text-blue-600 dark:text-blue-500 hover:underline"
              >
                Reset All Cards
              </button>
            </div>
          </div>

          {topics.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
              You have no topics in your syllabus. Add some topics to generate
              flashcards.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topics.map((topic) => (
                <div
                  key={topic.id}
                  onClick={() =>
                    setFlippedCards((prev) => ({
                      ...prev,
                      [topic.id]: !prev[topic.id],
                    }))
                  }
                  className="relative w-full h-[250px] [perspective:1000px] cursor-pointer group"
                >
                  <div
                    className={`w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${flippedCards[topic.id] ? "[transform:rotateY(180deg)]" : ""}`}
                  >
                    {/* Front Side (Title & Subject) */}
                    <div className="absolute w-full h-full backface-hidden [backface-visibility:hidden] bg-white dark:bg-neutral-900 border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl shadow-sm flex flex-col items-center justify-center p-6 text-center">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-500 uppercase tracking-widest mb-3 bg-blue-50 dark:bg-blue-500/10 px-3 py-1 rounded-full">
                        {topic.subject || "Topic"}
                      </span>
                      <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                        {topic.title}
                      </h3>
                      <div className="absolute bottom-4 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full">
                          Click to flip
                        </span>
                      </div>
                    </div>

                    {/* Back Side (Summary/Notes) */}
                    <div className="absolute w-full h-full backface-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] bg-blue-500 text-white rounded-2xl shadow-lg p-6 overflow-y-auto">
                      <div className="h-full flex flex-col">
                        <h4 className="text-sm font-semibold opacity-90 mb-3 pb-3 border-b border-white/20">
                          {topic.title}
                        </h4>
                        <div
                          className="flex-1 overflow-y-auto text-sm leading-relaxed prose prose-invert prose-sm"
                          dir="auto"
                        >
                          {topic.notes ? (
                            <div className="whitespace-pre-wrap font-medium">
                              {topic.notes.split("\n").map((line, i) => (
                                <React.Fragment key={i}>
                                  {line}
                                  <br />
                                </React.Fragment>
                              ))}
                            </div>
                          ) : (
                            <p className="opacity-70 italic text-center mt-10">
                              No notes provided for this topic.
                            </p>
                          )}
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/20 text-center text-xs opacity-70">
                          Click to flip back
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "History" && (
        <div className="space-y-4 max-w-4xl">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">
                Filter by Topic
              </label>
              <select
                value={filterTopicId}
                onChange={(e) => setFilterTopicId(e.target.value)}
                className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2.5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 shadow-sm"
              >
                <option value="all">All Topics</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.subject})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">
                Filter by Status
              </label>
              <select
                value={filterCorrectness}
                onChange={(e) => setFilterCorrectness(e.target.value)}
                className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2.5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 shadow-sm"
              >
                <option value="all">All Answers</option>
                <option value="correct">Correct</option>
                <option value="incorrect">Incorrect</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-neutral-500 font-bold uppercase mb-2 block">
                Filter by Date Range
              </label>
              <select
                value={filterDateRange}
                onChange={(e) => setFilterDateRange(e.target.value)}
                className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2.5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 shadow-sm"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>
          </div>

          {logs.filter((log) => {
            if (filterTopicId !== "all" && log.topicId !== filterTopicId)
              return false;
            if (filterCorrectness === "correct" && !log.isCorrect) return false;
            if (filterCorrectness === "incorrect" && log.isCorrect)
              return false;
            if (filterDateRange !== "all" && log.createdAt?.toDate) {
              const logDate = log.createdAt.toDate();
              const now = new Date();
              // Calculate difference in calendar days
              logDate.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffTime = Math.abs(today.getTime() - logDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (filterDateRange === "today" && diffDays > 0) return false;
              if (filterDateRange === "week" && diffDays > 7) return false;
              if (filterDateRange === "month" && diffDays > 30) return false;
            }
            return true;
          }).length === 0 ? (
            <div className="py-12 text-center text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
              No quiz history matches your filters!
            </div>
          ) : (
            logs
              .filter((log) => {
                if (filterTopicId !== "all" && log.topicId !== filterTopicId)
                  return false;
                if (filterCorrectness === "correct" && !log.isCorrect)
                  return false;
                if (filterCorrectness === "incorrect" && log.isCorrect)
                  return false;
                if (filterDateRange !== "all" && log.createdAt?.toDate) {
                  const logDate = log.createdAt.toDate();
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const compareDate = new Date(logDate);
                  compareDate.setHours(0, 0, 0, 0);
                  const diffTime = today.getTime() - compareDate.getTime();
                  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                  
                  if (filterDateRange === "today" && diffDays > 0) return false;
                  if (filterDateRange === "week" && diffDays > 7) return false;
                  if (filterDateRange === "month" && diffDays > 30) return false;
                }
                return true;
              })
              .map((log) => (
                <div
                  key={log.id}
                  className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="font-medium text-sm text-neutral-900 dark:text-neutral-200 leading-relaxed max-w-[85%]">
                      <MarkdownRenderer content={log.question} />
                    </div>
                    <div className="flex shrink-0 mt-0.5">
                      {log.isCorrect ? (
                        <div className="p-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 rounded-lg">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-1.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-500 rounded-lg">
                          <XCircle className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs text-neutral-500 dark:text-neutral-500 uppercase tracking-widest font-bold block mb-1">
                          Your Answer
                        </span>
                        <span
                          className={`text-sm font-medium ${log.isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                        >
                          {log.userAnswer}
                        </span>
                      </div>

                      {log.createdAt && (
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                          <Clock className="w-3.5 h-3.5" />
                          {log.createdAt?.toDate
                            ? log.createdAt.toDate().toLocaleDateString() +
                              " " +
                              log.createdAt
                                .toDate()
                                .toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                            : "Just now"}
                        </div>
                      )}
                    </div>
                    {log.explanation ? (
                      <div className="bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700/50">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-widest font-bold block mb-1">
                          Explanation
                        </span>
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          <MarkdownRenderer content={log.explanation} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-400 italic">
                          No explanation available.
                        </span>
                        <button
                          onClick={() => {
                            generateExplanationOnFly(
                              log.id,
                              log.question,
                              log.userAnswer || "an unknown answer",
                            );
                          }}
                          disabled={generatingExplanations[log.id]}
                          className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          <Lightbulb className="w-3 h-3" />
                          {generatingExplanations[log.id]
                            ? "Generating..."
                            : "Get Explanation"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {activeTab === "Review Mistakes" && (
        <div className="space-y-4 max-w-4xl">
          <h2 className="text-lg font-semibold text-rose-600 dark:text-rose-400 mb-4">
            Review Your Mistakes
          </h2>
          {logs.filter((log) => !log.isCorrect).length === 0 ? (
            <div className="py-12 text-center text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
              You have no incorrect answers recorded! Great job!
            </div>
          ) : (
            logs
              .filter((log) => !log.isCorrect)
              .map((log) => (
                <div
                  key={log.id}
                  className="bg-white dark:bg-neutral-900 border border-rose-200 dark:border-rose-900/50 rounded-xl p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="font-medium text-sm text-neutral-900 dark:text-neutral-200 leading-relaxed max-w-[85%]">
                      <MarkdownRenderer content={log.question} />
                    </div>
                    <div className="flex shrink-0 mt-0.5">
                      <div className="p-1.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-500 rounded-lg">
                        <XCircle className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs text-rose-400 dark:text-rose-500/80 uppercase tracking-widest font-bold block mb-1">
                          Your Incorrect Answer
                        </span>
                        <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
                          {log.userAnswer}
                        </span>
                      </div>
                      {log.createdAt && (
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                          <Clock className="w-3.5 h-3.5" />
                          {log.createdAt?.toDate
                            ? log.createdAt.toDate().toLocaleDateString()
                            : "Just now"}
                        </div>
                      )}
                    </div>
                    {log.explanation ? (
                      <div className="bg-rose-50 dark:bg-rose-900/10 p-3 rounded-lg border border-rose-100 dark:border-rose-900/30">
                        <span className="text-xs text-rose-500 dark:text-rose-400 uppercase tracking-widest font-bold block mb-1">
                          AI Explanation
                        </span>
                        <div className="text-sm text-rose-800 dark:text-rose-200 opacity-90">
                          <MarkdownRenderer content={log.explanation} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-400 italic">
                          No explanation available.
                        </span>
                        <button
                          onClick={() => {
                            generateExplanationOnFly(
                              log.id,
                              log.question,
                              log.userAnswer || "an unknown answer",
                            );
                          }}
                          disabled={generatingExplanations[log.id]}
                          className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          <Lightbulb className="w-3 h-3" />
                          {generatingExplanations[log.id]
                            ? "Generating..."
                            : "Get Explanation"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
};
