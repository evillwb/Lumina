import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  History,
  BrainCircuit,
  BookOpen,
  Settings,
  LayoutDashboard,
  LogOut,
  LogIn,
  Store,
  Lightbulb,
  Calendar as CalendarIcon,
  Timer,
  Cat,
  Menu,
  FileText,
  Map as MapIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserProfile } from "../types";
import { useTranslation } from "../locales/i18n";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const { user, signInWithGoogle, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false); // For mobile
  const [canClaimDaily, setCanClaimDaily] = useState(false);
  const [petActionCount, setPetActionCount] = useState(0);
  const [petActionType, setPetActionType] = useState<string | null>(null);
  const { t } = useTranslation();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayPet, setDisplayPet] = useState<any>(null);

  const [isEditingPetName, setIsEditingPetName] = useState(false);
  const [newPetName, setNewPetName] = useState("");
  const [petImageScale, setPetImageScale] = useState(1);

  const handleSavePetName = async () => {
    setIsEditingPetName(false);
    if (!user || !profile || !newPetName.trim()) return;
    try {
      const activePet = profile.activePet || { id: 1, name: "Basic Cat", icon: "🐱", happiness: 50 };
      const newPet = { ...activePet, name: newPetName.trim() };
      await updateDoc(doc(db, "users", user.uid), { activePet: newPet, updatedAt: serverTimestamp() });
      setProfile((prev) => prev ? { ...prev, activePet: newPet } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleScaleChange = async (newScale: number) => {
    setPetImageScale(newScale);
    if (!user || !profile) return;
    try {
      const activePet = profile.activePet || { id: 1, name: "Basic Cat", icon: "🐱", happiness: 50 };
      const newPet = { ...activePet, customScale: newScale };
      await updateDoc(doc(db, "users", user.uid), { activePet: newPet, updatedAt: serverTimestamp() });
      setProfile((prev) => prev ? { ...prev, activePet: newPet } : null);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (displayPet?.customScale !== undefined) {
       setPetImageScale(displayPet.customScale);
    }
  }, [displayPet?.customScale]);

  useEffect(() => {
    if (!user) {
      setCanClaimDaily(false);
      setProfile(null);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    import("firebase/firestore").then(({ onSnapshot }) => {
      unsubscribe = onSnapshot(doc(db, "users", user.uid), async (d) => {
        if (d.exists()) {
          const data = d.data() as UserProfile;
          const tz =
            data.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC";
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const todayStr = formatter.format(new Date());
          const now = new Date();
          const nowISO = now.toISOString();

          let updated = false;
          let newActivePet = data.activePet;

          if (data.activePet) {
            const lastDecay = data.lastPetDecayDate;
            let lastCheckTime = 0;

            if (lastDecay) {
              if (lastDecay.includes("T")) {
                lastCheckTime = new Date(lastDecay).getTime();
              } else {
                // Migrate from previous YYYY-MM-DD
                const parts = lastDecay.split("-").map(Number);
                lastCheckTime = new Date(
                  parts[0],
                  parts[1] - 1,
                  parts[2],
                ).getTime();
              }
            }

            if (lastCheckTime > 0) {
              const hoursDiff = (now.getTime() - lastCheckTime) / (1000 * 3600);

              // Persist to DB if > 1 hour elapsed, or migrating format
              if (hoursDiff > 1 || !lastDecay?.includes("T")) {
                const happinessDecay = (20 / 24) * hoursDiff;
                const funDecay = (15 / 24) * hoursDiff;
                const cleanlinessDecay = (25 / 24) * hoursDiff;
                const hydrationDecay = (15 / 24) * hoursDiff;

                newActivePet = {
                  ...data.activePet,
                  happiness: Math.max(
                    0,
                    (data.activePet.happiness ?? 50) - happinessDecay,
                  ),
                  fun: Math.max(0, (data.activePet.fun ?? 50) - funDecay),
                  cleanliness: Math.max(
                    0,
                    (data.activePet.cleanliness ?? 50) - cleanlinessDecay,
                  ),
                  hydration: Math.max(
                    0,
                    (data.activePet.hydration ?? 50) - hydrationDecay,
                  ),
                };
                updated = true;
              }
            } else if (!lastDecay) {
              updated = true;
            }
          }

          if (updated) {
            // Note: Using a background async update
            await updateDoc(doc(db, "users", user.uid), {
              activePet: newActivePet,
              lastPetDecayDate: nowISO,
              updatedAt: serverTimestamp(),
            }).catch(console.error);
          } else {
            setProfile(data);
          }

          if (data.lastClaimedDaily !== todayStr) {
            setCanClaimDaily(true);
          } else {
            setCanClaimDaily(false);
          }
        }
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  // Local effect for real-time visual decay minute-by-minute
  useEffect(() => {
    if (!profile?.activePet) {
      setDisplayPet(null);
      return;
    }

    const calculateDecay = () => {
      const lastDecay = profile.lastPetDecayDate;
      if (!lastDecay || !lastDecay.includes("T")) {
        setDisplayPet(profile.activePet);
        return;
      }

      const lastCheckTime = new Date(lastDecay).getTime();
      const now = new Date();
      const hoursDiff = (now.getTime() - lastCheckTime) / (1000 * 3600);

      if (hoursDiff > 0) {
        const happinessDecay = (20 / 24) * hoursDiff;
        const funDecay = (15 / 24) * hoursDiff;
        const cleanlinessDecay = (25 / 24) * hoursDiff;
        const hydrationDecay = (15 / 24) * hoursDiff;

        setDisplayPet({
          ...profile.activePet,
          happiness: Math.max(
            0,
            (profile.activePet.happiness ?? 50) - happinessDecay,
          ),
          fun: Math.max(0, (profile.activePet.fun ?? 50) - funDecay),
          cleanliness: Math.max(
            0,
            (profile.activePet.cleanliness ?? 50) - cleanlinessDecay,
          ),
          hydration: Math.max(
            0,
            (profile.activePet.hydration ?? 50) - hydrationDecay,
          ),
        });
      } else {
        setDisplayPet(profile.activePet);
      }
    };

    calculateDecay();
    const interval = setInterval(calculateDecay, 60000); // UI updates every 1 min

    return () => clearInterval(interval);
  }, [profile]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/png", 0.8);
        handlePetCustomImageSave(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handlePetCustomImageSave = async (dataUrl: string) => {
    if (!user || !profile) return;
    try {
      const activePet = profile.activePet || {
        id: 1,
        name: "Basic Cat",
        icon: "🐱",
        happiness: 50,
      };
      const newPet = { ...activePet, customImage: dataUrl };
      await updateDoc(doc(db, "users", user.uid), {
        activePet: newPet,
      });
      setProfile((prev) => prev ? { ...prev, activePet: newPet } : null);
    } catch (e) {
      console.error(e);
      alert("Failed to save custom image.");
    }
  };

  const feedPet = async () => {
    if (!user || !profile || !profile.petFood) return;
    if (profile.petFood <= 0) return;
    setPetActionCount((c) => c + 1);
    setPetActionType("feed");
    try {
      const newFood = profile.petFood - 1;
      const activePet = profile.activePet || {
        id: 1,
        name: "Basic Cat",
        icon: "🐱",
        happiness: 50,
      };
      const newPet = {
        ...activePet,
        happiness: Math.min(100, (activePet.happiness || 50) + 20),
      };

      await updateDoc(doc(db, "users", user.uid), {
        petFood: newFood,
        activePet: newPet,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) =>
        prev ? { ...prev, petFood: newFood, activePet: newPet } : null,
      );
    } catch (e) {
      console.error(e);
    }
  };

  const waterPet = async () => {
    if (!user || !profile || !profile.petWater) return;
    if (profile.petWater <= 0) return;
    setPetActionCount((c) => c + 1);
    setPetActionType("water");
    try {
      const newWater = profile.petWater - 1;
      const activePet = profile.activePet || {
        id: 1,
        name: "Basic Cat",
        icon: "🐱",
        hydration: 50,
      };
      const newPet = {
        ...activePet,
        hydration: Math.min(100, (activePet.hydration || 50) + 20),
      };

      await updateDoc(doc(db, "users", user.uid), {
        petWater: newWater,
        activePet: newPet,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) =>
        prev ? { ...prev, petWater: newWater, activePet: newPet } : null,
      );
    } catch (e) {
      console.error(e);
    }
  };

  const playWithPet = async () => {
    if (!user || !profile) return;
    setPetActionCount((c) => c + 1);
    setPetActionType("play");
    try {
      const activePet = profile.activePet || {
        id: 1,
        name: "Basic Cat",
        icon: "🐱",
        happiness: 50,
      };
      const newPet = {
        ...activePet,
        fun: Math.min(100, (activePet.fun || 50) + 15),
      };

      await updateDoc(doc(db, "users", user.uid), {
        activePet: newPet,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => (prev ? { ...prev, activePet: newPet } : null));
    } catch (e) {
      console.error(e);
    }
  };

  const cleanPet = async () => {
    if (!user || !profile) return;
    setPetActionCount((c) => c + 1);
    setPetActionType("clean");
    try {
      const activePet = profile.activePet || {
        id: 1,
        name: "Basic Cat",
        icon: "🐱",
        happiness: 50,
      };
      const newPet = { ...activePet, cleanliness: 100 }; // fully clean

      await updateDoc(doc(db, "users", user.uid), {
        activePet: newPet,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => (prev ? { ...prev, activePet: newPet } : null));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button
        className="md:hidden fixed z-[60] bottom-4 right-4 bg-indigo-600 text-white p-4 rounded-full shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 transform ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 transition-[transform,background-color] duration-200 ease-in-out border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#09090b] flex flex-col p-6 h-full shadow-2xl md:shadow-none overflow-y-auto`}
      >
        <div className="flex items-center justify-between mb-10 mt-4 md:mt-0 px-2">
          <button
            onClick={() => {
              setActiveTab("Dashboard");
              setIsOpen(false);
            }}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
          >
            <div className="p-2 bg-yellow-400 dark:bg-yellow-500 rounded-lg shadow-lg shadow-yellow-500/20">
              <Lightbulb className="w-5 h-5 text-yellow-950" />
            </div>
            <span className="font-bold text-sm tracking-widest text-neutral-900 dark:text-white uppercase mt-1">
              Lumina
            </span>
          </button>

          {profile && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-lg border border-orange-200 dark:border-orange-500/20 shadow-sm"
              title="Study Streak"
            >
              <span className="text-sm font-black tracking-tight">
                {profile.streak || 0}
              </span>
              <span className="text-sm leading-none">🔥</span>
            </div>
          )}
        </div>

        <nav className="space-y-1 flex-1">
          {[
            {
              name:
                t("dashboard") !== "dashboard" ? t("dashboard") : "Dashboard",
              id: "Dashboard",
              icon: LayoutDashboard,
            },
            {
              name:
                t("syllabus") !== "syllabus" ? t("syllabus") : "My Syllabus",
              id: "My Syllabus",
              icon: BookOpen,
            },
            { name: "Subject Notebook", id: "Subject Notes", icon: FileText },
            { name: "Smart Notes", id: "Smart Notes", icon: BookOpen },
            { name: "Mastery Map", id: "Mastery Map", icon: MapIcon },
            {
              name: t("calendar") !== "calendar" ? t("calendar") : "Calendar",
              id: "Calendar",
              icon: CalendarIcon,
            },
            {
              name: t("quizzes") !== "quizzes" ? t("quizzes") : "Quizzes",
              id: "Quizzes",
              icon: Lightbulb,
            },
            {
              name:
                t("focus_time") !== "focus_time"
                  ? t("focus_time")
                  : "Focus Time",
              id: "Focus Time",
              icon: Timer,
            },
            {
              name:
                t("store_title") !== "store_title"
                  ? t("store_title")
                  : "Store & Quests",
              id: "Store & Quests",
              icon: Store,
            },
            {
              name: t("settings") !== "settings" ? t("settings") : "Settings",
              id: "Settings",
              icon: Settings,
            },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 tour-${item.id.toLowerCase().replace(/[^a-z0-9]/g, "-")} ${
                activeTab === item.id
                  ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium shadow-sm"
                  : "text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-sm">{item.name}</span>
              {item.id === "Store & Quests" && canClaimDaily && (
                <span className="ml-auto w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
          ))}
        </nav>

        <div className="mt-8 space-y-4">
          {profile && (
            <div className="bg-neutral-50 dark:bg-neutral-900 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <span>My Pet</span>
                <div className="flex items-center gap-2">
                  <span>🥩 {profile.petFood || 0}</span>
                  <span>💧 {profile.petWater || 0}</span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="relative text-3xl bg-white dark:bg-black rounded-full p-1 shadow-sm border border-neutral-200 dark:border-neutral-800 flex-shrink-0 cursor-pointer group flex items-center justify-center w-20 h-20 overflow-hidden"
                      onClick={() => fileInputRef.current?.click()}
                      title="Click to change pet image"
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/png, image/jpeg"
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">Edit</span>
                      </div>
                      <motion.div
                        key={petActionCount}
                        className="w-full h-full flex items-center justify-center rounded-full overflow-hidden"
                        initial={
                          petActionType === "feed"
                            ? { scale: 0.8, y: 10 }
                            : petActionType === "water"
                              ? { scale: 0.9, rotate: -15 }
                              : petActionType === "play"
                                ? { y: -20, rotate: 15 }
                                : petActionType === "clean"
                                  ? { opacity: 0.5, scale: 1.1 }
                                  : {}
                        }
                        animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      >
                        {displayPet?.customImage ? (
                          <img 
                            src={displayPet.customImage} 
                            alt="Pet" 
                            className="w-full h-full object-cover" 
                            style={{ transform: `scale(${petImageScale})`, transformOrigin: "center" }}
                          />
                        ) : (
                          displayPet?.icon || "🐱"
                        )}
                      </motion.div>
                      <AnimatePresence>
                        {petActionCount > 0 && petActionType === "feed" && (
                          <motion.div
                            key={`particle-feed-${petActionCount}`}
                            initial={{ opacity: 1, y: 0, scale: 0.5 }}
                            animate={{ opacity: 0, y: -30, scale: 1.5 }}
                            transition={{ duration: 0.8 }}
                            className="absolute top-0 left-1/2 -translate-x-1/2 text-sm pointer-events-none"
                          >
                            🥩
                          </motion.div>
                        )}
                        {petActionCount > 0 && petActionType === "water" && (
                          <motion.div
                            key={`particle-water-${petActionCount}`}
                            initial={{ opacity: 1, y: -20, scale: 0.5 }}
                            animate={{ opacity: 0, y: 10, scale: 1.5 }}
                            transition={{ duration: 0.8 }}
                            className="absolute top-0 left-1/2 -translate-x-1/2 text-sm text-cyan-500 pointer-events-none"
                          >
                            💧
                          </motion.div>
                        )}
                        {petActionCount > 0 && petActionType === "play" && (
                          <motion.div
                            key={`particle-play-${petActionCount}`}
                            initial={{ opacity: 1, y: 0, scale: 0.5, rotate: 0 }}
                            animate={{
                              opacity: 0,
                              y: -30,
                              scale: 1.5,
                              rotate: 180,
                            }}
                            transition={{ duration: 0.8 }}
                            className="absolute top-0 left-1/2 -translate-x-1/2 text-sm pointer-events-none"
                          >
                            ✨
                          </motion.div>
                        )}
                        {petActionCount > 0 && petActionType === "clean" && (
                          <motion.div
                            key={`particle-clean-${petActionCount}`}
                            initial={{ opacity: 1, y: 0, scale: 0.5, x: -10 }}
                            animate={{ opacity: 0, y: -20, scale: 1.5, x: 20 }}
                            transition={{ duration: 0.8 }}
                            className="absolute top-0 left-1/2 -translate-x-1/2 text-sm pointer-events-none"
                          >
                            🫧
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    {displayPet?.customImage && (
                      <input 
                        type="range" 
                        min="0.5" 
                        max="2" 
                        step="0.1" 
                        value={petImageScale} 
                        onChange={(e) => setPetImageScale(parseFloat(e.target.value))}
                        onMouseUp={(e) => handleScaleChange(parseFloat((e.target as HTMLInputElement).value))}
                        onTouchEnd={(e) => handleScaleChange(parseFloat((e.target as HTMLInputElement).value))}
                        className="w-16 h-1 mt-2 appearance-none bg-neutral-200 dark:bg-neutral-700 rounded-lg outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                        title="Zoom Image"
                      />
                    )}
                  </div>
                  <div className="flex-1 w-full min-w-0 flex flex-col gap-1.5">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2 group/title">
                      {isEditingPetName ? (
                        <input 
                          type="text" 
                          value={newPetName} 
                          onChange={(e) => setNewPetName(e.target.value)} 
                          onBlur={handleSavePetName}
                          onKeyDown={(e) => e.key === 'Enter' && handleSavePetName()}
                          className="w-full bg-transparent border-b border-indigo-500 outline-none text-neutral-900 dark:text-white"
                          autoFocus
                        />
                      ) : (
                        <>
                          <span className="truncate">{displayPet?.name || "Basic Cat"}</span>
                          <button 
                            onClick={() => { setIsEditingPetName(true); setNewPetName(displayPet?.name || "Basic Cat"); }} 
                            className="text-neutral-400 hover:text-indigo-500 opacity-0 group-hover/title:opacity-100 transition-opacity"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        </>
                      )}
                    </div>

                  {/* Fullness */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-neutral-500 w-12 tracking-wide uppercase">
                      Full
                    </span>
                    <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${displayPet?.happiness || 50}%` }}
                      />
                    </div>
                  </div>

                  {/* Hydration */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-neutral-500 w-12 tracking-wide uppercase">
                      Water
                    </span>
                    <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-cyan-500 transition-all duration-300"
                        style={{ width: `${displayPet?.hydration || 50}%` }}
                      />
                    </div>
                  </div>

                  {/* Fun */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-neutral-500 w-12 tracking-wide uppercase">
                      Fun
                    </span>
                    <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-amber-500 transition-all duration-300"
                        style={{ width: `${displayPet?.fun || 50}%` }}
                      />
                    </div>
                  </div>

                  {/* Cleanliness */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-neutral-500 w-12 tracking-wide uppercase">
                      Clean
                    </span>
                    <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${displayPet?.cleanliness || 50}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mt-2">
                <button
                  onClick={feedPet}
                  disabled={!profile.petFood || profile.petFood <= 0}
                  className="w-full text-[9px] font-bold py-2 px-0 bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-rose-200 dark:hover:bg-rose-500/20 transition-colors uppercase tracking-wider text-center"
                >
                  Feed
                </button>
                <button
                  onClick={waterPet}
                  disabled={!profile.petWater || profile.petWater <= 0}
                  className="w-full text-[9px] font-bold py-2 px-0 bg-cyan-100 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyan-200 dark:hover:bg-cyan-500/20 transition-colors uppercase tracking-wider text-center"
                >
                  Drink
                </button>
                <button
                  onClick={playWithPet}
                  className="w-full text-[9px] font-bold py-2 px-0 bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 rounded-md disabled:opacity-50 hover:bg-amber-200 dark:hover:bg-amber-500/20 transition-colors uppercase tracking-wider text-center"
                >
                  Play
                </button>
                <button
                  onClick={cleanPet}
                  className="w-full text-[9px] font-bold py-2 px-0 bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 rounded-md disabled:opacity-50 hover:bg-blue-200 dark:hover:bg-blue-500/20 transition-colors uppercase tracking-wider text-center"
                >
                  Clean
                </button>
              </div>
            </div>
          )}

          {user ? (
            <div className="bg-neutral-50 dark:bg-neutral-900 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 flex flex-col items-start gap-2">
              <div className="flex items-center gap-2">
                <img
                  src={
                    user.photoURL ||
                    `https://ui-avatars.com/api/?name=${user.email}`
                  }
                  alt="Avatar"
                  className="w-8 h-8 rounded-full shadow-sm"
                />
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-900 dark:text-white font-medium truncate w-32">
                    {user.displayName || user.email}
                  </span>
                </div>
              </div>
              <button
                onClick={logout}
                className="text-xs text-rose-600 dark:text-red-500 hover:text-rose-700 dark:hover:text-red-400 flex items-center gap-1 mt-2 font-medium"
              >
                <LogOut className="w-3 h-3" /> Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="w-full bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center gap-2 text-sm text-neutral-900 dark:text-white transition-colors shadow-sm font-medium"
            >
              <LogIn className="w-4 h-4" /> Sign In w/ Google
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
