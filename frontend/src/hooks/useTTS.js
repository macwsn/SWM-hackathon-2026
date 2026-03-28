/**
 * VisionAssist – useTTS Hook
 * Web Speech API wrapper with queue, priority, and Polish voice selection.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

export function useTTS() {
  const synth = useRef(window.speechSynthesis);
  const voiceRef = useRef(null);
  const queueRef = useRef([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  // Find a Polish voice
  const loadVoice = useCallback(() => {
    const voices = synth.current.getVoices();
    const polishVoice = voices.find(
      (v) => v.lang.startsWith('pl') || v.name.toLowerCase().includes('polish')
    );
    voiceRef.current = polishVoice || voices[0] || null;
  }, []);

  useEffect(() => {
    loadVoice();
    // Chrome loads voices asynchronously
    if (synth.current.onvoiceschanged !== undefined) {
      synth.current.onvoiceschanged = loadVoice;
    }
  }, [loadVoice]);

  const speak = useCallback(
    (text, priority = 2) => {
      if (!isEnabled || !text) return;

      // For CRITICAL alerts (priority 0), cancel current speech
      if (priority === 0) {
        synth.current.cancel();
        queueRef.current = [];
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pl-PL';
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        processQueue();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        processQueue();
      };

      if (synth.current.speaking && priority > 0) {
        // Queue non-critical messages
        queueRef.current.push(utterance);
      } else {
        synth.current.speak(utterance);
      }
    },
    [isEnabled]
  );

  const processQueue = useCallback(() => {
    if (queueRef.current.length > 0 && !synth.current.speaking) {
      const next = queueRef.current.shift();
      synth.current.speak(next);
    }
  }, []);

  const speakAlerts = useCallback(
    (alerts) => {
      if (!alerts || alerts.length === 0) return;

      // Sort by priority, speak highest priority first
      const sorted = [...alerts].sort((a, b) => a.priority - b.priority);

      for (const alert of sorted) {
        speak(alert.text, alert.priority);
      }
    },
    [speak]
  );

  const stop = useCallback(() => {
    synth.current.cancel();
    queueRef.current = [];
    setIsSpeaking(false);
  }, []);

  const toggle = useCallback(() => {
    if (isEnabled) {
      stop();
    }
    setIsEnabled((prev) => !prev);
  }, [isEnabled, stop]);

  return {
    isSpeaking,
    isEnabled,
    speak,
    speakAlerts,
    stop,
    toggle,
  };
}
