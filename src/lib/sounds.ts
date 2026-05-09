export const playSuccessSound = () => {
  try {
    const audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();

    // Play a nice two-tone chime
    const playNote = (
      frequency: number,
      startTime: number,
      duration: number,
    ) => {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        frequency,
        audioCtx.currentTime + startTime,
      );

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime + startTime);
      gainNode.gain.linearRampToValueAtTime(
        0.3,
        audioCtx.currentTime + startTime + 0.05,
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioCtx.currentTime + startTime + duration,
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(audioCtx.currentTime + startTime);
      oscillator.stop(audioCtx.currentTime + startTime + duration);
    };

    playNote(523.25, 0, 0.2); // C5
    playNote(659.25, 0.1, 0.4); // E5
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};
