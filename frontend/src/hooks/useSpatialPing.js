/**
 * VisionAssist – useSpatialPing Hook
 * Spatial obstacle pings using Web Audio API (HRTF panner).
 */
import { useRef, useState, useCallback } from 'react';

const CRITICAL_DISTANCE_M = 1.2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function useSpatialPing() {
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const lastPingRef = useRef({ key: '', ts: 0 });
  const [isEnabled, setIsEnabled] = useState(true);

  const init = useCallback(async () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // Listener forward is -Z by default; +Z is perceived as behind.
    if (ctx.listener && typeof ctx.listener.forwardZ !== 'undefined') {
      ctx.listener.positionX.value = 0;
      ctx.listener.positionY.value = 0;
      ctx.listener.positionZ.value = 0;
      ctx.listener.forwardX.value = 0;
      ctx.listener.forwardY.value = 0;
      ctx.listener.forwardZ.value = -1;
      ctx.listener.upX.value = 0;
      ctx.listener.upY.value = 1;
      ctx.listener.upZ.value = 0;
    }

    audioCtxRef.current = ctx;
    masterGainRef.current = master;
  }, []);

  const stop = useCallback(() => {
    lastPingRef.current = { key: '', ts: 0 };
  }, []);

  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  const playObstaclePing = useCallback(
    async (obstacle) => {
      if (!isEnabled || !obstacle || obstacle.severity === 'INFO') return;

      await init();
      const ctx = audioCtxRef.current;
      const master = masterGainRef.current;
      if (!ctx || !master) return;

      const now = performance.now();
      const distanceM = typeof obstacle.distance === 'number' ? obstacle.distance : 4.0;
      const nearFactor = clamp(1 - distanceM / 3.5, 0, 1);
      const cooldownMs = obstacle.severity === 'CRITICAL'
        ? 120 + (1 - nearFactor) * 140
        : 180 + (1 - nearFactor) * 220;
      const key = `${obstacle.direction}_${obstacle.severity}`;
      if (lastPingRef.current.key === key && now - lastPingRef.current.ts < cooldownMs) {
        return;
      }
      lastPingRef.current = { key, ts: now };

      // Strongly emphasize near objects: loudness grows non-linearly as distance shrinks.
      const closeFactor = clamp(Math.pow(nearFactor, 0.55), 0.05, 1.0);

      let x = 0;
      if (obstacle.direction === 'left') x = -1;
      if (obstacle.direction === 'right') x = 1;

      // Default to front. For very close critical obstacles, bias to rear cue.
      let z = -0.7;
      if (obstacle.severity === 'CRITICAL' && distanceM <= CRITICAL_DISTANCE_M) {
        z = 1.0;
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const panner = ctx.createPanner();

      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 0.6;
      panner.maxDistance = 20;
      panner.rolloffFactor = 1.3;

      panner.positionX.value = x;
      panner.positionY.value = 0;
      panner.positionZ.value = z;

      const baseFreq = obstacle.severity === 'CRITICAL' ? 1240 : 900;
      const pingDuration = obstacle.severity === 'CRITICAL' ? 0.16 : 0.12;
      const minGain = obstacle.severity === 'CRITICAL' ? 0.22 : 0.12;
      const maxCeiling = obstacle.severity === 'CRITICAL' ? 1.25 : 0.85;
      const maxGain = minGain + (maxCeiling - minGain) * closeFactor;

      const t0 = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t0);
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.84, t0 + pingDuration);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, maxGain), t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + pingDuration);

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(master);

      osc.start(t0);
      osc.stop(t0 + pingDuration + 0.01);
    },
    [init, isEnabled]
  );

  return {
    isEnabled,
    init,
    stop,
    toggle,
    playObstaclePing,
  };
}
