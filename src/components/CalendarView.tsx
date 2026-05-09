import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useTranslation } from "../locales/i18n";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  serverTimestamp,
  setDoc,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import { ScheduleBlock, STUDY_HOURS, Topic } from "../types";
import {
  CheckCircle2,
  XCircle,
  CalendarIcon,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  RefreshCw,
  Crown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  generateQuizQuestions,
  generateDynamicQuiz,
} from "../services/geminiService";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { v4 as uuidv4 } from "uuid";

const formatDateLocal = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const BreakOverlay = ({
  breakEndTime,
  onSkip,
}: {
  breakEndTime: number | null;
  onSkip: () => void;
}) => {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!breakEndTime) return;

    // Initial calculation
    const initRemaining = breakEndTime - Date.now();
    if (initRemaining <= 0) {
      onSkip();
      return;
    }
    setTimeLeft(initRemaining);

    const interval = setInterval(() => {
      const remaining = breakEndTime - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
        onSkip();
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [breakEndTime, onSkip]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className="fixed bottom-6 right-6 z-[150] bg-white dark:bg-neutral-900 border-2 border-indigo-500 dark:border-indigo-500 p-6 rounded-2xl shadow-2xl w-[calc(100vw-3rem)] sm:w-80 max-w-sm"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="font-bold text-neutral-900 dark:text-white">
            Break Time
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Rest your brain before the next session.
          </p>
        </div>
      </div>
      <div className="text-center py-4">
        <span className="text-4xl font-black tracking-tight text-indigo-600 dark:text-indigo-500 font-mono">
          {Math.floor(timeLeft / 60000)}:
          {Math.floor((timeLeft % 60000) / 1000)
            .toString()
            .padStart(2, "0")}
        </span>
      </div>
      <button
        onClick={onSkip}
        className="w-full py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 uppercase tracking-wider"
      >
        Skip Break
      </button>
    </motion.div>
  );
};

export const CalendarView: React.FC = () => {
  const { user } = useAuth();
  const { language } = usePreferences();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<any>(null);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [topics, setTopics] = useState<Record<string, Topic>>({});
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  // Quiz Modal State
  const [currentQuiz, setCurrentQuiz] = useState<ScheduleBlock | null>(null);
  const [quizData, setQuizData] = useState<{
    question: string;
    options: string[];
    correctAnswer: string;
  } | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);

  const [viewMode, setViewMode] = useState<"Day" | "Week" | "Month">("Week");

  // Manual Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newBlockTopicId, setNewBlockTopicId] = useState("");
  const [newBlockDate, setNewBlockDate] = useState(() =>
    formatDateLocal(new Date()),
  );
  const [newBlockStartTime, setNewBlockStartTime] = useState("14:00");
  const [newBlockEndTime, setNewBlockEndTime] = useState("16:00");
  const [milestoneBadge, setMilestoneBadge] = useState<{
    subject: string;
    topic: string;
  } | null>(null);

  // Details Modal State
  const [selectedBlockDetail, setSelectedBlockDetail] =
    useState<ScheduleBlock | null>(null);

  // Break Mechanics State
  const [breakEndTime, setBreakEndTime] = useState<number | null>(null);
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(
    null,
  );
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);

  const handleDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    newDay: string,
  ) => {
    e.preventDefault();
    if (!draggedBlockId || !user) return;

    let newStart = "08:00";
    if (viewMode !== "Month") {
      const rect = e.currentTarget.getBoundingClientRect();
      const dropY = e.clientY - rect.top;
      let targetHour = Math.floor(dropY / 60) + STUDY_HOURS.start;
      if (targetHour < STUDY_HOURS.start) targetHour = STUDY_HOURS.start;
      if (targetHour > STUDY_HOURS.end) targetHour = STUDY_HOURS.end;
      newStart = `${targetHour.toString().padStart(2, "0")}:00`;
    }

    const block = schedule.find((b) => b.id === draggedBlockId);
    if (!block) return;

    let newEndHour =
      parseInt(newStart.split(":")[0]) +
      (parseInt(block.endTime.split(":")[0]) -
        parseInt(block.startTime.split(":")[0]));
    if (newEndHour > 24) newEndHour = 24;
    const newEnd =
      newEndHour === 24
        ? "23:59"
        : `${newEndHour.toString().padStart(2, "0")}:${block.endTime.split(":")[1]}`;

    try {
      await updateDoc(doc(db, "users", user.uid, "scheduleBlocks", block.id), {
        day: newDay,
        startTime: newStart,
        endTime: newEnd,
        updatedAt: serverTimestamp(),
      });
      setSchedule((s) =>
        s.map((b) =>
          b.id === draggedBlockId
            ? { ...b, day: newDay, startTime: newStart, endTime: newEnd }
            : b,
        ),
      );
      setDraggedBlockId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "scheduleBlocks");
    }
  };

  const triggerEndBreakHighlight = () => {
    const now = new Date();
    const today = formatDateLocal(now);
    const curTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const nextBlock = schedule
      .filter(
        (b) =>
          b.status === "upcoming" &&
          (b.day > today || (b.day === today && b.startTime >= curTime)),
      )
      .sort((a, b) => {
        if (a.day !== b.day) return a.day.localeCompare(b.day);
        return a.startTime.localeCompare(b.startTime);
      })[0];

    if (nextBlock) {
      setHighlightedBlockId(nextBlock.id);
      setTimeout(() => setHighlightedBlockId(null), 10000);
    }
  };

  const fetchScheduleAndTopics = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const pDoc = await getDoc(doc(db, "users", user.uid));
      if (pDoc.exists()) setProfile(pDoc.data());

      const bSnap = await getDocs(
        collection(db, "users", user.uid, "scheduleBlocks"),
      );
      setSchedule(bSnap.docs.map((d) => d.data() as ScheduleBlock));

      const tSnap = await getDocs(collection(db, "users", user.uid, "topics"));
      const tMap: Record<string, Topic> = {};
      tSnap.docs.forEach((doc) => {
        tMap[doc.id] = { id: doc.id, ...doc.data() } as Topic;
      });
      setTopics(tMap);
      if (tSnap.docs.length > 0) setNewBlockTopicId(tSnap.docs[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      if (e.key === "ArrowLeft") {
        setWeekOffset((w) => w - 1);
      } else if (e.key === "ArrowRight") {
        setWeekOffset((w) => w + 1);
      } else if (e.key.toLowerCase() === "t") {
        setWeekOffset(0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadSampleSyllabus = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Add topics
      // Clear existing topics and blocks first
      const topicsRef = collection(db, "users", user.uid, "topics");
      const existingTopics = await getDocs(topicsRef);
      for (const d of existingTopics.docs) {
        await deleteDoc(d.ref);
      }
      
      const blocksRef = collection(db, "users", user.uid, "scheduleBlocks");
      const existingBlocks = await getDocs(blocksRef);
      for (const d of existingBlocks.docs) {
        await deleteDoc(d.ref);
      }

      const sampleTopics = [
        {
          id: uuidv4(),
          title: "Reading Comprehension",
          subject: "Reading",
          priority: "emergency",
          masteryLevel: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        {
          id: uuidv4(),
          title: "Speaking fluently",
          subject: "Speaking",
          priority: "emergency",
          masteryLevel: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        {
          id: uuidv4(),
          title: "Writing essays",
          subject: "Writing",
          priority: "normal",
          masteryLevel: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        {
          id: uuidv4(),
          title: "Listening active",
          subject: "Listening",
          priority: "emergency",
          masteryLevel: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      ];
      const tMap: Record<string, Topic> = { ...topics };
      for (const t of sampleTopics) {
        await setDoc(doc(db, "users", user.uid, "topics", t.id), t);
        tMap[t.id] = t as any;
      }
      setTopics(tMap);

      // Add Blocks
      const baseDate = new Date();
      // Find nearest Monday
      const day = baseDate.getDay();
      const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(baseDate.setDate(diff));
      const mondayStr = formatDateLocal(monday);

      const tuesday = new Date(monday);
      tuesday.setDate(tuesday.getDate() + 1);
      const tuesdayStr = formatDateLocal(tuesday);

      const newBlocks: ScheduleBlock[] = [
        {
          id: uuidv4(),
          userId: user.uid,
          title: sampleTopics[0].title,
          topicId: sampleTopics[0].id,
          day: mondayStr,
          startTime: "15:00",
          endTime: "17:00",
          status: "upcoming",
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        },
        {
          id: uuidv4(),
          userId: user.uid,
          title: sampleTopics[1].title,
          topicId: sampleTopics[1].id,
          day: mondayStr,
          startTime: "19:00",
          endTime: "21:00",
          status: "upcoming",
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        },
        {
          id: uuidv4(),
          userId: user.uid,
          title: sampleTopics[2].title,
          topicId: sampleTopics[2].id,
          day: tuesdayStr,
          startTime: "15:00",
          endTime: "17:00",
          status: "upcoming",
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        },
        {
          id: uuidv4(),
          userId: user.uid,
          title: sampleTopics[3].title,
          topicId: sampleTopics[3].id,
          day: tuesdayStr,
          startTime: "20:00",
          endTime: "22:00",
          status: "upcoming",
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        },
      ];

      for (const b of newBlocks) {
        await setDoc(doc(db, "users", user.uid, "scheduleBlocks", b.id), b);
      }

      setSchedule([...schedule, ...newBlocks]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBlock = async () => {
    if (
      !user ||
      !newBlockTopicId ||
      !newBlockDate ||
      !newBlockStartTime ||
      !newBlockEndTime ||
      isAdding
    )
      return;
    setIsAdding(true);
    try {
      const blockId = uuidv4();
      const topic = topics[newBlockTopicId];
      const newBlock: ScheduleBlock = {
        id: blockId,
        userId: user.uid,
        topicId: newBlockTopicId,
        title: topic.title,
        day: newBlockDate,
        startTime: newBlockStartTime,
        endTime: newBlockEndTime,
        status: "upcoming",
        isReview: false,
      };
      await setDoc(doc(db, "users", user.uid, "scheduleBlocks", blockId), {
        ...newBlock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSchedule([...schedule, newBlock]);
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      alert("Error adding session");
    } finally {
      setIsAdding(false);
    }
  };

  useEffect(() => {
    fetchScheduleAndTopics();
  }, [user, user?.uid]);

  const openQuiz = async (block: ScheduleBlock) => {
    setCurrentQuiz(block);
    setQuizLoading(true);
    const topic = topics[block.topicId];
    try {
      if (topic) {
        const q = await generateDynamicQuiz(topic.title, language, topic.notes);
        setQuizData({
          question: q.question,
          options: [...q.options],
          correctAnswer: q.options[q.correctIndex],
        });
      } else {
        setQuizData({
          question: `What is this topic?`,
          options: ["A", "B"],
          correctAnswer: "A",
        });
      }
    } catch (err) {
      console.error("Failed to fetch quiz:", err);
      alert("Failed to load quiz from AI. Please try again.");
      setCurrentQuiz(null);
    } finally {
      setQuizLoading(false);
    }
  };

  const getLocalTodayDateString = () => {
    try {
      const tz =
        profile?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "UTC";
      return new Date().toLocaleDateString("en-CA", { timeZone: tz });
    } catch (e) {
      return new Date().toLocaleDateString("en-CA");
    }
  };

  const currentWeekDays = React.useMemo(() => {
    const days = [];
    const localNowStr = getLocalTodayDateString();

    if (viewMode === "Day") {
      const today = new Date(`${localNowStr}T00:00:00`);
      today.setHours(0, 0, 0, 0);
      today.setDate(today.getDate() + weekOffset);
      days.push(today);
    } else if (viewMode === "Week") {
      const today = new Date(`${localNowStr}T00:00:00`);
      today.setHours(0, 0, 0, 0);
      const dayOfWeek = today.getDay(); // 0 is Sunday
      const diffToMonday =
        today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      today.setDate(diffToMonday + weekOffset * 7);

      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        days.push(d);
      }
    } else if (viewMode === "Month") {
      const today = new Date(`${localNowStr}T00:00:00`);
      today.setHours(0, 0, 0, 0);
      today.setMonth(today.getMonth() + weekOffset);
      today.setDate(1); // 1st of the month

      const dayOfWeek = today.getDay();
      const diffToMonday =
        today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const startDate = new Date(today);
      startDate.setDate(diffToMonday);

      for (let i = 0; i < 35; i++) {
        // 5 weeks layout
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        days.push(d);
      }
    }
    return days;
  }, [viewMode, weekOffset, profile?.timezone]);

  const findNextAvailableSlot = (
    blocks: ScheduleBlock[],
    startDate: Date,
    delayDays: number = 1,
    searchWindow: number = 3,
  ): { day: string; start: string } | null => {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + delayDays);

    for (let i = 0; i < searchWindow; i++) {
      const dateString = formatDateLocal(checkDate);
      const dayBlocks = blocks
        .filter((b) => b.day === dateString)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      for (let hour = STUDY_HOURS.start; hour <= STUDY_HOURS.end; hour += 2) {
        const potentialStart = `${hour.toString().padStart(2, "0")}:00`;
        let nextHour = hour + 2;
        const potentialEnd =
          nextHour === 24
            ? "23:59"
            : `${nextHour.toString().padStart(2, "0")}:00`;

        const isOverlap = dayBlocks.some(
          (b) => potentialStart < b.endTime && potentialEnd > b.startTime,
        );

        if (!isOverlap) {
          return { day: dateString, start: potentialStart };
        }
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
    return null;
  };

  const [selectedFeedback, setSelectedFeedback] = useState<{
    option: string;
    isCorrect: boolean;
  } | null>(null);

  const submitAnswer = async (selectedAnswer: string) => {
    if (!currentQuiz || !quizData || !user || selectedFeedback !== null) return;
    const isCorrect = selectedAnswer === quizData.correctAnswer;

    setSelectedFeedback({ option: selectedAnswer, isCorrect });

    // Wait 1 second before proceeding to show color feedback
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      // 1. Log Quiz Result
      const logId = uuidv4();
      await setDoc(doc(db, "users", user.uid, "quizLogs", logId), {
        userId: user.uid,
        topicId: currentQuiz.topicId,
        blockId: currentQuiz.id,
        question: quizData.question,
        userAnswer: selectedAnswer,
        isCorrect,
        createdAt: serverTimestamp(),
      });

      // 2. Update Topic Mastery
      const topicRef = doc(
        db,
        "users",
        user.uid,
        "topics",
        currentQuiz.topicId,
      );
      const currTopic = topics[currentQuiz.topicId];
      const currMastery = currTopic?.masteryLevel || 0;
      const failedAttempts = currTopic?.failedAttempts || 0;
      const newMastery = isCorrect
        ? Math.min(100, currMastery + 20)
        : Math.max(0, currMastery - 10);
      const newFailedAttempts = isCorrect
        ? Math.max(0, failedAttempts - 1)
        : failedAttempts + 1;

      await updateDoc(topicRef, {
        masteryLevel: newMastery,
        failedAttempts: newFailedAttempts,
        lastReviewed: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });

      if (newMastery === 100 && currMastery < 100) {
        setMilestoneBadge({
          subject: currTopic?.subject || "Scholar",
          topic: currTopic?.title || "Topic",
        });
      }

      // Update local state early so subsequent reads are accurate natively if needed
      setTopics((prev) => ({
        ...prev,
        [currentQuiz.topicId]: {
          ...currTopic,
          masteryLevel: newMastery,
          failedAttempts: newFailedAttempts,
        },
      }));

      // 3. Update Block Status and User Credits
      const blockRef = doc(
        db,
        "users",
        user.uid,
        "scheduleBlocks",
        currentQuiz.id,
      );
      await updateDoc(blockRef, {
        status: isCorrect ? "mastered" : "failed",
        updatedAt: serverTimestamp(),
      });

      const newBlocks = [...schedule];
      const bIdx = newBlocks.findIndex((b) => b.id === currentQuiz.id);
      if (bIdx > -1) newBlocks[bIdx].status = isCorrect ? "mastered" : "failed";

      const localNowStr = getLocalTodayDateString();
      const todayBlocks = newBlocks.filter((b) => b.day === localNowStr);
      const allTodayDone =
        todayBlocks.length > 0 &&
        todayBlocks.every((b) => b.status === "mastered");

      // Award credits if correct
      if (isCorrect || allTodayDone) {
        const userRef = doc(db, "users", user.uid);
        const uDoc = await getDoc(userRef);
        if (uDoc.exists()) {
          const uData = uDoc.data();
          let bonus = 0;
          if (isCorrect && uData.activePet) {
            if (uData.activePet.id === 2) bonus = 2;
            else if (uData.activePet.id === 3) bonus = 5;
            else if (uData.activePet.id === 4) bonus = 10;
            else if (uData.activePet.id === 5) bonus = 15;
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
          let newStreakDate = uData.lastStreakDate;

          if (allTodayDone && uData.lastStreakDate !== todayStr) {
            newStreak += 1;
            newStreakDate = todayStr;
          }

          // Optionally add streak bonus credits here
          await updateDoc(userRef, {
            credits: (uData.credits || 0) + (isCorrect ? 15 + bonus : 0),
            streak: newStreak,
            lastStreakDate: newStreakDate,
            updatedAt: serverTimestamp(),
          });
        }
      }

      if (isCorrect || allTodayDone) {
        import("../utils/confetti").then((module) => {
          module.triggerConfetti();
        });
      }

      // 4. Adaptive Rescheduling if Failed
      if (!isCorrect) {
        // Reschedule within the next 2-3 days based on available slots
        let delayDays = 2;
        let searchWindow = 2; // checks day + 2 and day + 3

        if (newMastery > 50 && newFailedAttempts === 1) {
          // Minor slip, try again towards the end of the window (3 days)
          delayDays = 3;
          searchWindow = 1;
        } else if (newFailedAttempts > 2 || newMastery < 30) {
          // Struggling, review as soon as the window starts (2 days)
          delayDays = 2;
          searchWindow = 1;
        }

        const quizDate = new Date(currentQuiz.day);
        let nextSlot = findNextAvailableSlot(
          newBlocks,
          quizDate,
          delayDays,
          searchWindow,
        );
        if (!nextSlot) {
          // Fallback: search up to 14 days ahead if the first window is full
          nextSlot = findNextAvailableSlot(newBlocks, quizDate, delayDays, 14);
        }

        if (nextSlot) {
          const newBlockId = uuidv4();
          const newBlock: ScheduleBlock = {
            id: newBlockId,
            userId: user.uid,
            topicId: currentQuiz.topicId,
            title: `${currentQuiz.title.replace(" (Review)", "")} (Review)`,
            day: nextSlot.day,
            startTime: nextSlot.start,
            endTime:
              parseInt(nextSlot.start.split(":")[0]) + 2 === 24
                ? "23:59"
                : `${(parseInt(nextSlot.start.split(":")[0]) + 2).toString().padStart(2, "0")}:00`,
            status: "upcoming",
            isReview: true,
          };

          await setDoc(
            doc(db, "users", user.uid, "scheduleBlocks", newBlockId),
            {
              ...newBlock,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          );

          newBlocks.push(newBlock);
        } else {
          alert(
            "No available slots found within the next 72 hours to reschedule this topic. Please free up some time or manually add a review block.",
          );
        }
      }

      setSchedule(newBlocks);
      setBreakEndTime(Date.now() + 5 * 60 * 1000);
    } catch (err) {
      console.error(err);
      alert("Error saving progress.");
    } finally {
      setCurrentQuiz(null);
      setQuizData(null);
      setSelectedFeedback(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-4 md:p-8 space-y-8 bg-neutral-50 dark:bg-[#0c0c0e] animate-pulse">
        <div className="h-8 w-48 bg-neutral-200 dark:bg-neutral-800 rounded-md"></div>
        <div className="h-10 w-full md:w-3/4 bg-neutral-200 dark:bg-neutral-800 rounded-xl"></div>
        <div className="h-[500px] w-full bg-neutral-200 dark:bg-neutral-800 rounded-2xl"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
          Authentication Required
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400">
          Please sign in with Google from the sidebar to view your learning
          schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8 bg-neutral-50 dark:bg-[#0c0c0e]">
      <header className="mb-8 flex flex-col items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-neutral-900 dark:text-white tracking-tight">
            Timeline
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
            Review your upcoming Lumina study sessions.
          </p>
        </div>
        <div className="flex flex-wrap w-full items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20 active:scale-95"
            >
              <Plus className="w-4 h-4" /> Add Session
            </button>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="flex bg-neutral-200 dark:bg-neutral-800 p-1 rounded-lg">
              {["Day", "Week", "Month"].map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m as any)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === m ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm" : "text-neutral-500 dark:text-neutral-400"}`}
                >
                  {m === "Day"
                    ? t("day")
                    : m === "Week"
                      ? t("week")
                      : t("month")}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                className="p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-900 dark:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className="px-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm font-medium text-neutral-900 dark:text-white transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                className="p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-900 dark:text-white transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {schedule.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-[#09090b] rounded-2xl border border-neutral-200 dark:border-neutral-800 animate-in fade-in duration-700">
          <div className="w-20 h-20 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm rotate-3">
            <CalendarIcon className="w-10 h-10 text-blue-500 dark:text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Your academic journey starts here
          </h3>
          <p className="mt-2 text-neutral-500 max-w-sm leading-relaxed mb-6">
            You don't have any study sessions scheduled yet. Start by loading
            your syllabus or adding a manual session.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-md transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" /> Add First Session
            </button>
            <button
              onClick={loadSampleSyllabus}
              className="flex items-center gap-2 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-xl font-medium shadow-sm transition-all active:scale-95"
            >
              Load Example Syllabus
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#09090b] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-x-auto relative">
          <div className="min-w-[700px] md:min-w-[900px] flex">
            {/* Time axis */}
            {(viewMode === "Day" || viewMode === "Week") && (
              <div className="w-16 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/30 flex flex-col pt-[72px]">
                {Array.from({
                  length: STUDY_HOURS.end - STUDY_HOURS.start + 1,
                }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[60px] text-[10px] font-bold text-neutral-400 text-right pr-2 -mt-2"
                  >
                    {`${(STUDY_HOURS.start + i).toString().padStart(2, "0")}:00`}
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div
                className={`grid ${viewMode === "Day" ? "grid-cols-1" : viewMode === "Week" ? "grid-cols-7" : "grid-cols-7"} border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/30`}
              >
                {(viewMode === "Month"
                  ? currentWeekDays.slice(0, 7)
                  : currentWeekDays
                ).map((date, i) => {
                  const localTodayDate = new Date(
                    `${getLocalTodayDateString()}T00:00:00`,
                  );
                  localTodayDate.setHours(0, 0, 0, 0);
                  const isToday =
                    localTodayDate.toDateString() === date.toDateString();
                  return (
                    <div
                      key={i}
                      className={`py-4 text-center border-r border-neutral-200 dark:border-neutral-800 last:border-r-0 ${isToday && viewMode !== "Month" ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                    >
                      <span
                        className={`text-[10px] font-bold uppercase tracking-widest ${isToday && viewMode !== "Month" ? "text-blue-600 dark:text-blue-500" : "text-neutral-500"}`}
                      >
                        {date.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      {viewMode !== "Month" && (
                        <div
                          className={`mt-1 text-lg font-medium ${isToday ? "text-blue-600 dark:text-blue-400" : "text-neutral-900 dark:text-white"}`}
                        >
                          {date.getDate()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Grid */}
              <div
                className={`grid ${viewMode === "Day" ? "grid-cols-1" : viewMode === "Week" ? "grid-cols-7" : "grid-cols-7"} relative`}
                style={{
                  minHeight:
                    viewMode === "Month"
                      ? "600px"
                      : `${(STUDY_HOURS.end - STUDY_HOURS.start + 1) * 60}px`,
                }}
              >
                {/* Horizontal background lines for Time */}
                {(viewMode === "Day" || viewMode === "Week") && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col">
                    {Array.from({
                      length: STUDY_HOURS.end - STUDY_HOURS.start + 1,
                    }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[60px] border-b border-neutral-100 dark:border-neutral-800/50 w-full shrink-0"
                      />
                    ))}
                  </div>
                )}

                {currentWeekDays.map((date, i) => {
                  const dateString = formatDateLocal(date);
                  const localTodayDate = new Date(
                    `${getLocalTodayDateString()}T00:00:00`,
                  );
                  localTodayDate.setHours(0, 0, 0, 0);
                  const isToday =
                    localTodayDate.toDateString() === date.toDateString();
                  const isMonthView = viewMode === "Month";

                  return (
                    <div
                      key={i}
                      className={`border-r border-b border-neutral-200 dark:border-neutral-800 relative ${isToday ? "bg-blue-50/20 dark:bg-blue-900/5" : ""} ${isMonthView ? "p-2 space-y-2 min-h-[120px]" : ""}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, dateString)}
                    >
                      {isMonthView && (
                        <div
                          className={`text-sm font-medium mb-2 ${isToday ? "bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center" : "text-neutral-500"}`}
                        >
                          {date.getDate()}
                        </div>
                      )}
                      {schedule
                        .filter((b) => b.day === dateString)
                        .map((block) => {
                          const startHour = parseInt(
                            block.startTime.split(":")[0],
                          );
                          const startMin = parseInt(
                            block.startTime.split(":")[1] || "0",
                          );
                          let endHour = parseInt(block.endTime.split(":")[0]);
                          let endMin = parseInt(
                            block.endTime.split(":")[1] || "0",
                          );
                          if (endMin === 59) {
                            endHour += 1;
                            endMin = 0;
                          } // Hack for 23:59

                          const topPx = isMonthView
                            ? 0
                            : Math.max(
                                0,
                                (startHour - STUDY_HOURS.start) * 60 + startMin,
                              );
                          const heightPx = isMonthView
                            ? "auto"
                            : Math.max(
                                30,
                                (endHour - startHour) * 60 +
                                  (endMin - startMin),
                              );

                          return (
                            <motion.div
                              layoutId={block.id}
                              key={block.id}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDraggedBlockId(block.id);
                              }}
                              onDragEnd={() => setDraggedBlockId(null)}
                              onClick={() => setSelectedBlockDetail(block)}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              style={
                                isMonthView
                                  ? {}
                                  : {
                                      position: "absolute",
                                      top: topPx,
                                      height: heightPx,
                                      left: 4,
                                      right: 4,
                                    }
                              }
                              className={`p-2 sm:p-3 rounded-lg border transition-all group flex flex-col z-10 overflow-hidden cursor-pointer hover:shadow-md ${isMonthView ? "" : "shadow-sm backdrop-blur-xl"} ${
                                block.id === highlightedBlockId
                                  ? "animate-pulse ring-2 ring-indigo-500 z-50 scale-105"
                                  : ""
                              } ${
                                block.status === "mastered"
                                  ? "bg-emerald-50/90 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/50"
                                  : block.status === "failed"
                                    ? "bg-rose-50/90 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/50"
                                    : block.status === "upcoming" &&
                                        block.isReview
                                      ? "bg-orange-50/90 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/50"
                                      : "bg-white/90 border-neutral-200 dark:bg-neutral-800/90 dark:border-neutral-700"
                              }`}
                            >
                              <div
                                className={`flex justify-between items-start ${isMonthView ? "mb-0" : "mb-1"}`}
                              >
                                <span
                                  className={`${isMonthView ? "text-[8px] sm:text-[9px]" : "text-[9px]"} font-bold uppercase tracking-widest ${
                                    block.status === "mastered"
                                      ? "text-emerald-600 dark:text-emerald-500"
                                      : block.status === "failed"
                                        ? "text-rose-600 dark:text-rose-500"
                                        : block.status === "upcoming" &&
                                            block.isReview
                                          ? "text-orange-700 dark:text-orange-500"
                                          : "text-blue-700 dark:text-blue-500"
                                  }`}
                                >
                                  {block.startTime}
                                </span>
                                {!isMonthView &&
                                  block.status === "mastered" && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
                                  )}
                                {!isMonthView && block.status === "failed" && (
                                  <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-500" />
                                )}
                                {!isMonthView &&
                                  block.status === "upcoming" &&
                                  block.isReview && (
                                    <RefreshCw className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400 animate-spin-slow" />
                                  )}
                              </div>

                              <h3
                                className={`font-semibold leading-snug mb-2 ${isMonthView ? "text-[9px] sm:text-xs truncate" : "text-xs"} ${
                                  block.status === "mastered"
                                    ? "text-emerald-900 dark:text-emerald-100"
                                    : block.status === "failed"
                                      ? "text-rose-900 dark:text-rose-100"
                                      : block.status === "upcoming" &&
                                          block.isReview
                                        ? "text-orange-900 dark:text-orange-100"
                                        : "text-blue-900 dark:text-blue-100"
                                }`}
                              >
                                {block.title}
                              </h3>

                              {!isMonthView && (
                                <div className="mt-auto pointer-events-auto">
                                  {block.status === "upcoming" && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openQuiz(block);
                                      }}
                                      className="w-full py-1.5 bg-blue-600 rounded-lg text-[9px] font-bold text-white uppercase tracking-wider hover:bg-blue-700 transition-all shadow-md active:scale-95"
                                    >
                                      Review
                                    </button>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      {isMonthView &&
                        schedule.filter((b) => b.day === dateString).length ===
                          0 && (
                          <div className="min-h-[100px] border border-dashed border-neutral-300 dark:border-neutral-800/60 rounded-xl flex items-center justify-center text-[10px] text-neutral-400 dark:text-neutral-600 uppercase tracking-widest font-bold">
                            Free Slot
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Session Modal */}
      <AnimatePresence>
        {selectedBlockDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setSelectedBlockDetail(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white dark:bg-[#18181b] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl p-6 z-20 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span
                    className={`text-xs font-bold uppercase tracking-widest ${
                      selectedBlockDetail.status === "mastered"
                        ? "text-emerald-600"
                        : selectedBlockDetail.status === "failed"
                          ? "text-rose-600"
                          : "text-blue-600"
                    }`}
                  >
                    {selectedBlockDetail.status}
                  </span>
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-1">
                    {selectedBlockDetail.title}
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    {selectedBlockDetail.day} • {selectedBlockDetail.startTime}{" "}
                    - {selectedBlockDetail.endTime}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedBlockDetail(null)}
                  className="p-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">
                    Topic Information
                  </h3>
                  {topics[selectedBlockDetail.topicId] ? (
                    <>
                      <div className="mb-3">
                        <div className="text-sm text-neutral-900 dark:text-neutral-200 mb-1">
                          <span className="font-medium">Subject:</span>{" "}
                          {topics[selectedBlockDetail.topicId].subject}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-200">
                            Mastery:
                          </span>
                          <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{
                                width: `${topics[selectedBlockDetail.topicId].masteryLevel}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-500">
                            {topics[selectedBlockDetail.topicId].masteryLevel}%
                          </span>
                        </div>
                      </div>
                      {topics[selectedBlockDetail.topicId].notes && (
                        <div>
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-200">
                            Notes:
                          </span>
                          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
                            {topics[selectedBlockDetail.topicId].notes}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      Topic details no longer available.
                    </p>
                  )}
                </div>

                {selectedBlockDetail.status === "upcoming" && (
                  <button
                    onClick={() => {
                      setSelectedBlockDetail(null);
                      openQuiz(selectedBlockDetail);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-md active:scale-95 transition-all"
                  >
                    <Lightbulb className="w-4 h-4" /> Start Review Session
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Session Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white dark:bg-[#18181b] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl p-6 overflow-hidden z-20 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                  Add Study Session
                </h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                    Topic
                  </label>
                  <select
                    value={newBlockTopicId}
                    onChange={(e) => setNewBlockTopicId(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {Object.values(topics).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={newBlockDate}
                    onChange={(e) => setNewBlockDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={newBlockStartTime}
                      onChange={(e) => setNewBlockStartTime(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      step="1800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={newBlockEndTime}
                      onChange={(e) => setNewBlockEndTime(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-200 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      step="1800"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddBlock}
                  disabled={isAdding}
                  className="w-full mt-4 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all active:scale-95 shadow-md"
                >
                  {isAdding ? "Saving..." : "Save Session"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quiz Modal Overlay */}
      <AnimatePresence>
        {currentQuiz && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
              onClick={() => setCurrentQuiz(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative w-full max-w-lg bg-white dark:bg-[#18181b] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl p-6 md:p-8 z-20 max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600" />

              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center mb-6">
                <Lightbulb className="w-6 h-6 text-blue-600 dark:text-blue-500" />
              </div>

              <div className="mb-2 text-[10px] font-bold text-blue-600 dark:text-blue-500 uppercase tracking-[0.2em]">
                Knowledge Gate
              </div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4 leading-tight">
                Review:{" "}
                <span className="text-blue-600 dark:text-blue-400">
                  {currentQuiz.title.split(":")[0]}
                </span>
              </h2>

              {quizLoading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="relative w-12 h-12 mb-6">
                    <div className="absolute inset-0 rounded-full border-t-2 border-blue-600 dark:border-blue-500 animate-spin"></div>
                    <div className="absolute inset-2 rounded-full bg-blue-100 dark:bg-blue-500/20 animate-pulse"></div>
                  </div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 animate-pulse">
                    Synthesizing dynamic question for {currentQuiz.title}...
                  </p>
                </div>
              ) : quizData ? (
                <>
                  <div className="text-neutral-700 dark:text-neutral-300 text-sm mb-8 leading-relaxed font-medium break-words whitespace-pre-wrap">
                    <MarkdownRenderer content={quizData.question} />
                  </div>
                  <div className="flex flex-col md:flex-row md:flex-wrap gap-4">
                    {quizData.options.map((opt, i) => {
                      let btnClass =
                        "text-left w-full md:flex-1 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-blue-600 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all text-sm text-neutral-700 dark:text-neutral-300";
                      if (selectedFeedback && selectedFeedback.option === opt) {
                        btnClass = selectedFeedback.isCorrect
                          ? "text-left w-full md:flex-1 p-4 rounded-xl border border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 transition-all text-sm font-semibold"
                          : "text-left w-full md:flex-1 p-4 rounded-xl border border-rose-500 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 transition-all text-sm font-semibold";
                      } else if (
                        selectedFeedback &&
                        opt === quizData.correctAnswer
                      ) {
                        btnClass =
                          "text-left w-full md:flex-1 p-4 rounded-xl border border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 transition-all text-sm font-semibold opacity-50";
                      } else if (selectedFeedback) {
                        btnClass =
                          "text-left w-full md:flex-1 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 transition-all text-sm opacity-50 cursor-not-allowed";
                      }
                      return (
                        <button
                          key={i}
                          disabled={selectedFeedback !== null}
                          onClick={() => submitAnswer(opt)}
                          className={`${btnClass} break-words`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p>Failed to load question.</p>
              )}

              <p className="mt-8 text-center text-[10px] text-neutral-500 dark:text-neutral-600 uppercase tracking-widest font-bold">
                Note: Failure will trigger immediate adaptive rescheduling.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Break Overlay */}
      <AnimatePresence>
        {breakEndTime && (
          <BreakOverlay
            breakEndTime={breakEndTime}
            onSkip={() => {
              setBreakEndTime(null);
              triggerEndBreakHighlight();
            }}
          />
        )}
      </AnimatePresence>

      {/* Milestone Badge Overlay */}
      <AnimatePresence>
        {milestoneBadge && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              onClick={() => setMilestoneBadge(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 50, rotateX: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -50 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className="relative bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full text-center border-4 border-indigo-400"
            >
              <div className="w-24 h-24 bg-yellow-400 rounded-full flex items-center justify-center mb-6 shadow-inner border-4 border-yellow-300">
                <Crown className="w-12 h-12 text-yellow-900" />
              </div>
              <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
                Mastery Achieved!
              </h2>
              <div className="bg-black/20 rounded-xl p-4 mb-6 w-full">
                <p className="text-indigo-100 text-sm font-bold uppercase tracking-widest mb-1">
                  {milestoneBadge.subject} Expert
                </p>
                <p className="text-white font-medium">{milestoneBadge.topic}</p>
              </div>
              <button
                onClick={() => setMilestoneBadge(null)}
                className="w-full py-4 bg-white hover:bg-neutral-100 text-indigo-700 font-bold rounded-xl shadow-lg transition-all active:scale-95"
              >
                Claim Badge
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
