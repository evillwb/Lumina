import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";

export const PomodoroTimer: React.FC = () => {
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isFocus, setIsFocus] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isRunning) {
      setTimeLeft(isFocus ? focusDuration * 60 : breakDuration * 60);
    }
  }, [focusDuration, breakDuration, isFocus]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Play sound at end
            try {
              const audioCtx = new (
                window.AudioContext || (window as any).webkitAudioContext
              )();
              const oscillator = audioCtx.createOscillator();
              oscillator.type = "sine";
              oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
              oscillator.connect(audioCtx.destination);
              oscillator.start();
              oscillator.stop(audioCtx.currentTime + 1);
            } catch (e) {}

            setIsRunning(false);
            if (isFocus) {
              setIsFocus(false);
              return breakDuration * 60;
            } else {
              setIsFocus(true);
              return focusDuration * 60;
            }
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, isFocus, focusDuration, breakDuration]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(isFocus ? focusDuration * 60 : breakDuration * 60);
  };

  const toggleMode = () => {
    setIsRunning(false);
    const newFocus = !isFocus;
    setIsFocus(newFocus);
  };

  const adjTime = (amount: number) => {
    if (isRunning) return;
    if (isFocus) {
      setFocusDuration(Math.max(1, Math.min(600, focusDuration + amount)));
    } else {
      setBreakDuration(Math.max(1, Math.min(600, breakDuration + amount)));
    }
  };

  const setPreset = (mins: number) => {
    if (isRunning) return;
    if (isFocus) {
      setFocusDuration(mins);
    } else {
      setBreakDuration(mins);
    }
  };

  const mins = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const secs = (timeLeft % 60).toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-center p-6 bg-white dark:bg-[#18181b] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm relative">
      <div className="flex items-center gap-2 mb-4 text-blue-600 dark:text-blue-500">
        <Timer className="w-5 h-5" />
        <span className="font-semibold">
          {isFocus ? "Focus Time" : "Break Time"}
        </span>
      </div>

      {/* Preset Timers */}
      <div className="flex gap-2 mb-6">
        <button
          disabled={isRunning}
          onClick={() => setPreset(15)}
          className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 disabled:opacity-30 transition-colors"
        >
          15m
        </button>
        <button
          disabled={isRunning}
          onClick={() => setPreset(25)}
          className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 disabled:opacity-30 transition-colors"
        >
          25m
        </button>
        <button
          disabled={isRunning}
          onClick={() => setPreset(60)}
          className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 disabled:opacity-30 transition-colors"
        >
          1h
        </button>
        <button
          disabled={isRunning}
          onClick={() => setPreset(120)}
          className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 disabled:opacity-30 transition-colors"
        >
          2h
        </button>
      </div>

      <div className="flex flex-col items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-2">
            <button
              disabled={isRunning}
              onClick={() => adjTime(-60)}
              className="px-2 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors text-neutral-500"
            >
              -1h
            </button>
            <button
              disabled={isRunning}
              onClick={() => adjTime(-10)}
              className="px-2 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors text-neutral-500"
            >
              -10m
            </button>
            <button
              disabled={isRunning}
              onClick={() => adjTime(-1)}
              className="px-2 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors text-neutral-500"
            >
              -1m
            </button>
          </div>

          <div className="text-6xl font-mono font-bold text-neutral-900 dark:text-white tracking-tight tabular-nums w-48 text-center shrink-0">
            {mins}:{secs}
          </div>

          <div className="flex flex-col gap-2">
            <button
              disabled={isRunning}
              onClick={() => adjTime(60)}
              className="px-2 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors text-neutral-500"
            >
              +1h
            </button>
            <button
              disabled={isRunning}
              onClick={() => adjTime(10)}
              className="px-2 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors text-neutral-500"
            >
              +10m
            </button>
            <button
              disabled={isRunning}
              onClick={() => adjTime(1)}
              className="px-2 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors text-neutral-500"
            >
              +1m
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <button
          onClick={toggleTimer}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-colors ${isRunning ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-500 hover:bg-amber-200 dark:hover:bg-amber-500/30" : "bg-blue-600 text-white hover:bg-blue-700"}`}
        >
          {isRunning ? (
            <>
              <Pause className="w-4 h-4" /> Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Start
            </>
          )}
        </button>
        <button
          onClick={resetTimer}
          className="p-2.5 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 transition-colors"
          title="Reset Timer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={toggleMode}
        className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
      >
        Switch to {isFocus ? "Break" : "Focus"}
      </button>
    </div>
  );
};
