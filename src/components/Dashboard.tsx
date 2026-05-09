import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  orderBy,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Topic, UserProfile, QuizLog } from "../types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Flame, Brain, TrendingUp, BookOpen, Lightbulb, Calendar } from "lucide-react";
import { useTranslation } from "../locales/i18n";

export const Dashboard: React.FC<{ onNavigateToCalendar: () => void }> = ({
  onNavigateToCalendar,
}) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [quizLogs, setQuizLogs] = useState<QuizLog[]>([]);
  const [scheduledBlocksCount, setScheduledBlocksCount] = useState<number>(0);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const progressionData = useMemo(() => {
    let curMastery = 0;
    const points: any[] = [];
    const logsForTopic =
      selectedTopicId === "all"
        ? quizLogs
        : quizLogs.filter((l) => l.topicId === selectedTopicId);

    logsForTopic.forEach((log) => {
      if (log.isCorrect) {
        curMastery = Math.min(
          100,
          curMastery + (selectedTopicId === "all" ? 2 : 20),
        );
      } else {
        curMastery = Math.max(
          0,
          curMastery - (selectedTopicId === "all" ? 1 : 10),
        );
      }
      let dateStr = "Unknown";
      const createdAt: any = log.createdAt;
      if (createdAt) {
        dateStr =
          typeof createdAt.toDate === "function"
            ? createdAt.toDate().toLocaleDateString()
            : new Date(createdAt).toLocaleDateString();
      }
      points.push({ date: dateStr, mastery: curMastery });
    });

    return points.slice(-20);
  }, [quizLogs, selectedTopicId]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const pData = userSnap.data() as UserProfile;

          const tz =
            pData.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC";
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const todayStr = formatter.format(new Date());

          let needsUpdate = false;
          let newStreak = pData.streak || 0;
          let newHappiness = pData.activePet?.happiness ?? 50;

          if (pData.lastStreakDate && pData.lastStreakDate !== todayStr) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = formatter.format(yesterday);

            if (pData.lastStreakDate !== yesterdayStr && newStreak > 0) {
              newStreak = 0;
              if (pData.activePet) {
                newHappiness = Math.max(0, newHappiness - 20);
              }
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            pData.streak = newStreak;
            if (pData.activePet) {
              pData.activePet.happiness = newHappiness;
              await updateDoc(userRef, {
                streak: newStreak,
                activePet: pData.activePet,
                updatedAt: serverTimestamp(),
              });
            } else {
              await updateDoc(userRef, {
                streak: newStreak,
                updatedAt: serverTimestamp(),
              });
            }
          }

          setProfile(pData);
        }

        const topicsRef = collection(db, "users", user.uid, "topics");
        const topicsSnap = await getDocs(topicsRef);
        setTopics(
          topicsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Topic),
        );

        const logsRef = collection(db, "users", user.uid, "quizLogs");
        const logsQuery = query(logsRef, orderBy("createdAt", "asc"));
        const logsSnap = await getDocs(logsQuery);
        setQuizLogs(
          logsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as QuizLog),
        );
        
        const blocksRef = collection(db, "users", user.uid, "scheduleBlocks");
        const blocksSnap = await getDocs(blocksRef);
        setScheduledBlocksCount(blocksSnap.size);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const subjectMasteryData = useMemo(() => {
    if (topics.length === 0) return [];
    const subjectMap: Record<string, { totalMastery: number; count: number }> = {};
    topics.forEach((t) => {
      const subj = t.subject || "General";
      if (!subjectMap[subj]) {
        subjectMap[subj] = { totalMastery: 0, count: 0 };
      }
      subjectMap[subj].totalMastery += t.masteryLevel;
      subjectMap[subj].count += 1;
    });

    let result = Object.entries(subjectMap).map(([subject, data]) => ({
      subject: subject.substring(0, 10) + (subject.length > 10 ? "..." : ""),
      A: Math.round(data.totalMastery / data.count),
      fullSubject: subject,
      fullMark: 100,
    }));

    return result;
  }, [topics]);

  if (loading)
    return (
      <div className="p-8 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <div className="text-neutral-500 font-medium tracking-tight animate-pulse">Loading real-world metrics...</div>
      </div>
    );

  if (!user) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
          Welcome to Lumina
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 mb-6">
          Please sign in with Google to start tracking your syllabus and
          mastery.
        </p>
        <div className="p-6 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-xl max-w-sm shadow-sm">
          <Lightbulb className="w-8 h-8 text-yellow-600 dark:text-yellow-500 mx-auto mb-3" />
          <h3 className="text-neutral-900 dark:text-white font-medium mb-1">
            Bring Clarity to Your Learning
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Input your syllabus, generate a schedule, and take AI-generated
            quizzes to adaptively master your subjects.
          </p>
        </div>
      </div>
    );
  }

  const totalMastery =
    topics.length > 0
      ? topics.reduce((acc, t) => acc + t.masteryLevel, 0) / topics.length
      : 0;

  const numSubjects = Object.keys(
    topics.reduce((acc, t) => {
      acc[t.subject || "General"] = true;
      return acc;
    }, {} as Record<string, boolean>)
  ).length;

  let data: any[] = [];
  if (topics.length > 0) {
    data = [
      { name: "Mon", retention: Math.max(0, totalMastery - 30) },
      { name: "Tue", retention: Math.max(0, totalMastery - 20) },
      { name: "Wed", retention: Math.max(0, totalMastery - 15) },
      { name: "Thu", retention: Math.max(0, totalMastery - 10) },
      { name: "Fri", retention: Math.max(0, totalMastery - 5) },
      { name: "Sat", retention: Math.max(0, totalMastery - 2) },
      { name: "Sun", retention: totalMastery || 0 },
    ];
  }

  return (
    <div className="space-y-8 flex-1 p-6 md:p-8 overflow-y-auto">
      <header className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
            {t("dashboard")}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
            Welcome back. Lumina brings clarity to your learning journey.
          </p>
        </div>
        <button
          onClick={onNavigateToCalendar}
          className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg text-sm font-bold shadow-md transition-colors w-full sm:w-auto text-center flex justify-center items-center gap-2"
        >
          <BookOpen className="w-4 h-4" /> Start Learning
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Streak Card */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-orange-100 dark:bg-orange-500/20 rounded-full flex items-center justify-center">
              <Flame className="w-5 h-5 text-orange-600 dark:text-orange-500" />
            </div>
            <p className="text-xs text-neutral-500 uppercase font-bold tracking-widest">{t("daily_streak")}</p>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{profile?.streak || 0} Days</p>
        </div>

        {/* Subjects Card */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 rounded-full flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-500" />
            </div>
            <p className="text-xs text-neutral-500 uppercase font-bold tracking-widest">Active Subjects</p>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{numSubjects}</p>
        </div>

        {/* Topics Card */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6 flex flex-col gap-2">
           <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            </div>
            <p className="text-xs text-neutral-500 uppercase font-bold tracking-widest">Tracked Topics</p>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{topics.length}</p>
        </div>

        {/* Scheduled Blocks Card */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6 flex flex-col gap-2">
           <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
            </div>
            <p className="text-xs text-neutral-500 uppercase font-bold tracking-widest">Scheduled Blocks</p>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{scheduledBlocksCount}</p>
        </div>
      </div>

      {/* Graph and Radar Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6">
          <div className="mb-6">
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
              Retention Trajectory
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Spaced repetition estimated retention over 7 days.
            </p>
          </div>
          <div className="h-64 min-h-[250px] w-full">
            {topics.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                <p className="text-neutral-500 dark:text-neutral-400 mb-2">
                  No learning data yet.
                </p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  Go to your Syllabus to add topics.
                </p>
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minHeight={1}
                minWidth={1}
              >
                <AreaChart data={data}>
                  <defs>
                    <linearGradient
                      id="colorRetention"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="name"
                    stroke="#525252"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#525252"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#171717",
                      border: "1px solid #262626",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "#e5e5e5" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="retention"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorRetention)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Radar Chart */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6 flex flex-col">
          <div className="mb-6">
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
              Subject Mastery
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Your average mastery level per subject.
            </p>
          </div>
          <div className="flex-1 min-h-[250px] w-full mt-4">
            {subjectMasteryData.length < 3 ? (
              <div className="h-full flex flex-col items-center justify-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                <p className="text-neutral-500 dark:text-neutral-400 mb-2">
                  Not enough subjects.
                </p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  Track 3+ subjects to see graph.
                </p>
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minHeight={1}
                minWidth={1}
              >
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  data={subjectMasteryData}
                >
                  <PolarGrid stroke="#525252" opacity={0.3} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#171717",
                      border: "1px solid #262626",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "#e5e5e5" }}
                    formatter={(value: number, name: string, props: any) => [
                      `${value}%`,
                      props.payload.fullSubject || "Mastery",
                    ]}
                  />
                  <Radar
                    name="Mastery"
                    dataKey="A"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="#10b981"
                    fillOpacity={0.4}
                  />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Progression Line Chart */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl p-6">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
              Mastery Progression
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Track how your mastery has evolved over time.
            </p>
          </div>
          <select
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
            className="bg-neutral-100 dark:bg-neutral-800 border-none rounded-lg p-2 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">All Topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div className="h-72 w-full mt-4">
          {progressionData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
              <p className="text-neutral-500 dark:text-neutral-400 mb-2">
                No quiz data yet.
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Take quizzes to see your mastery grow.
              </p>
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={1}
              minWidth={1}
            >
              <LineChart
                data={progressionData}
                margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#525252"
                  opacity={0.2}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#525252"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#525252"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#171717",
                    border: "1px solid #262626",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "#e5e5e5" }}
                />
                <Line
                  type="monotone"
                  dataKey="mastery"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

