
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { getStrategicHint, TargetCandidate, getChatResponse } from '../services/geminiService';
import { Point, Bubble, Particle, BubbleColor, DebugInfo, Difficulty, DifficultyConfig, FloatingScore } from '../types';
import { 
  Loader2, Trophy, BrainCircuit, Play, MousePointerClick, 
  Eye, Terminal, Target, Lightbulb, 
  Monitor, MessageSquare, Send, X, Trash2, Zap,
  Mic, MicOff, Settings2, BarChart3, Radio,
  Volume2, VolumeX, ShieldAlert, Sparkles
} from 'lucide-react';

const PINCH_THRESHOLD = 0.05;
const BUBBLE_RADIUS = 22;
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);
const GRID_COLS = 12;
const GRID_ROWS = 14; 
const SLINGSHOT_BOTTOM_OFFSET = 220;
const MAX_DRAG_DIST = 180;
const MIN_FORCE_MULT = 0.15;
const MAX_FORCE_MULT = 0.45;

const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultyConfig> = {
  'easy': { startingRows: 3, newRowFrequency: 12, pointsMultiplier: 0.8 },
  'medium': { startingRows: 5, newRowFrequency: 8, pointsMultiplier: 1.0 },
  'hard': { startingRows: 7, newRowFrequency: 5, pointsMultiplier: 1.5 },
  'very-hard': { startingRows: 9, newRowFrequency: 3, pointsMultiplier: 2.5 }
};

const DIFFICULTY_UI_CONFIG: Record<Difficulty, { label: string, color: string, iconColor: string }> = {
  'easy': { label: 'Easy', color: 'bg-emerald-500/20 text-emerald-400', iconColor: 'text-emerald-400' },
  'medium': { label: 'Medium', color: 'bg-amber-500/20 text-amber-400', iconColor: 'text-amber-400' },
  'hard': { label: 'Hard', color: 'bg-orange-500/20 text-orange-400', iconColor: 'text-orange-400' },
  'very-hard': { label: 'Very Hard', color: 'bg-rose-500/20 text-rose-400', iconColor: 'text-rose-400' }
};

const COLOR_CONFIG: Record<BubbleColor, { hex: string, points: number, label: string }> = {
  red:    { hex: '#ef5350', points: 100, label: 'Red' },
  blue:   { hex: '#42a5f5', points: 150, label: 'Blue' },
  green:  { hex: '#66bb6a', points: 200, label: 'Green' },
  yellow: { hex: '#ffee58', points: 250, label: 'Yellow' },
  purple: { hex: '#ab47bc', points: 300, label: 'Purple' },
  orange: { hex: '#ffa726', points: 500, label: 'Orange' }
};

const COLOR_KEYS: BubbleColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

const adjustColor = (color: string, amount: number) => {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    const componentToHex = (c: number) => {
        const hex = c.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

// --- Audio Effects System ---
class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  setEnabled(val: boolean) {
    this.enabled = val;
  }

  private createGain(start: number, end: number, duration: number) {
    if (!this.ctx) return null;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(start, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(end, this.ctx.currentTime + duration);
    return gain;
  }

  playShot() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.createGain(0.2, 0.001, 0.3);
    if (!gain) return;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playMatch(count: number, isPerfect: boolean = false) {
    if (!this.enabled || !this.ctx) return;
    const baseFreq = 400 + (count * 20) + (isPerfect ? 200 : 0);
    const duration = 0.4;
    
    for (let i = 0; i < Math.min(count, 5); i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.createGain(0.1, 0.001, duration);
      if (!gain) continue;
      osc.type = isPerfect ? 'square' : 'sine';
      osc.frequency.setValueAtTime(baseFreq + (i * 100), this.ctx.currentTime + (i * 0.05));
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + (i * 0.05));
      osc.stop(this.ctx.currentTime + (i * 0.05) + duration);
    }
  }

  playClick() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.createGain(0.1, 0.001, 0.1);
    if (!gain) return;
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playConfirm() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.createGain(0.1, 0.001, 0.5);
    if (!gain) return;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(400, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }
}

const sfx = new SoundManager();

// --- Live Audio Utilities ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): any {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) { int16[i] = data[i] * 32768; }
  return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
}

const GeminiSlingshot: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  
  const ballPos = useRef<Point>({ x: 0, y: 0 });
  const ballVel = useRef<Point>({ x: 0, y: 0 });
  const anchorPos = useRef<Point>({ x: 0, y: 0 });
  const isPinching = useRef<boolean>(false);
  const isFlying = useRef<boolean>(false);
  const flightStartTime = useRef<number>(0);
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<Particle[]>([]);
  const floatingScores = useRef<FloatingScore[]>([]);
  const scoreRef = useRef<number>(0);
  const aimTargetRef = useRef<Point | null>(null);
  const isAiThinkingRef = useRef<boolean>(false);
  const captureRequestRef = useRef<boolean>(false);
  const selectedColorRef = useRef<BubbleColor>('red');
  const shotsTakenRef = useRef<number>(0);
  const activeShotTargetRef = useRef<Point | null>(null);
  
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [loading, setLoading] = useState(true);
  const [aiHint, setAiHint] = useState<string | null>("Initializing Fast strategy...");
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [aimTarget, setAimTarget] = useState<Point | null>(null);
  const [score, setScore] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [selectedColor, setSelectedColor] = useState<BubbleColor>('red');
  const [availableColors, setAvailableColors] = useState<BubbleColor[]>([]);
  const [aiRecommendedColor, setAiRecommendedColor] = useState<BubbleColor | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
    { role: 'model', text: 'Hi! I am Gemini Pro. Ask me about difficulty levels or advanced tactics!' }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  // --- Live API State ---
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const liveSessionRef = useRef<any>(null);
  const audioContexts = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());

  // --- Animated Score Hook ---
  useEffect(() => {
    if (displayScore < score) {
      const diff = score - displayScore;
      const step = Math.ceil(diff / 10);
      const timer = setTimeout(() => {
        setDisplayScore(prev => Math.min(prev + step, score));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [score, displayScore]);

  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);

  useEffect(() => {
    sfx.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const getBubblePos = (row: number, col: number, width: number) => {
    const xOffset = (width - (GRID_COLS * BUBBLE_RADIUS * 2)) / 2 + BUBBLE_RADIUS;
    const isOdd = row % 2 !== 0;
    const x = xOffset + col * (BUBBLE_RADIUS * 2) + (isOdd ? BUBBLE_RADIUS : 0);
    const y = BUBBLE_RADIUS + row * ROW_HEIGHT;
    return { x, y };
  };

  const updateAvailableColors = () => {
    const activeColors = new Set<BubbleColor>();
    bubbles.current.forEach(b => { if (b.active) activeColors.add(b.color); });
    const colors = Array.from(activeColors);
    setAvailableColors(colors);
    if (!activeColors.has(selectedColorRef.current) && colors.length > 0) {
        setSelectedColor(colors[0]);
    }
  };

  const addNewRow = useCallback((width: number) => {
    bubbles.current.forEach(b => {
      b.row++;
      const pos = getBubblePos(b.row, b.col, width);
      b.x = pos.x;
      b.y = pos.y;
    });

    const newRowIndex = 0;
    const isOdd = newRowIndex % 2 !== 0;
    const cols = isOdd ? GRID_COLS - 1 : GRID_COLS;
    for (let c = 0; c < cols; c++) {
      const { x, y } = getBubblePos(newRowIndex, c, width);
      bubbles.current.push({
        id: `${Date.now()}-${newRowIndex}-${c}`,
        row: newRowIndex, col: c, x, y,
        color: COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)],
        active: true
      });
    }
    updateAvailableColors();
  }, []);

  const initGrid = useCallback((width: number, diff: Difficulty) => {
    const config = DIFFICULTY_SETTINGS[diff];
    const newBubbles: Bubble[] = [];
    for (let r = 0; r < config.startingRows; r++) { 
      const isOdd = r % 2 !== 0;
      const cols = isOdd ? GRID_COLS - 1 : GRID_COLS;
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.05) {
            const { x, y } = getBubblePos(r, c, width);
            newBubbles.push({
              id: `${r}-${c}`, row: r, col: c, x, y,
              color: COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)],
              active: true
            });
        }
      }
    }
    bubbles.current = newBubbles;
    shotsTakenRef.current = 0;
    setScore(0);
    setDisplayScore(0);
    scoreRef.current = 0;
    updateAvailableColors();
    setTimeout(() => { captureRequestRef.current = true; }, 1000);
  }, []);

  useEffect(() => {
    if (canvasRef.current) initGrid(canvasRef.current.width, difficulty);
  }, [difficulty]);

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particles.current.push({
        x, y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, life: 1.0, color
      });
    }
  };

  const spawnFloatingScore = (x: number, y: number, value?: number, color: string = '#ffffff', label?: string, isSpecial: boolean = false) => {
    floatingScores.current.push({
      x, y, value, life: 1.0, color, label, isSpecial
    });
  };

  const isPathClear = (target: Bubble) => {
    if (!anchorPos.current) return false;
    const startX = anchorPos.current.x;
    const startY = anchorPos.current.y;
    const dx = target.x - startX;
    const dy = target.y - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(distance / (BUBBLE_RADIUS / 2)); 
    for (let i = 1; i < steps - 2; i++) { 
        const t = i / steps;
        const cx = startX + dx * t;
        const cy = startY + dy * t;
        for (const b of bubbles.current) {
            if (!b.active || b.id === target.id) continue;
            const distSq = Math.pow(cx - b.x, 2) + Math.pow(cy - b.y, 2);
            if (distSq < Math.pow(BUBBLE_RADIUS * 1.8, 2)) return false; 
        }
    }
    return true;
  };

  const getAllReachableClusters = (): TargetCandidate[] => {
    const activeBubbles = bubbles.current.filter(b => b.active);
    const uniqueColors = Array.from(new Set(activeBubbles.map(b => b.color))) as BubbleColor[];
    const allClusters: TargetCandidate[] = [];
    for (const color of uniqueColors) {
        const visited = new Set<string>();
        for (const b of activeBubbles) {
            if (b.color !== color || visited.has(b.id)) continue;
            const clusterMembers: Bubble[] = [];
            const queue = [b];
            visited.add(b.id);
            while (queue.length > 0) {
                const curr = queue.shift()!;
                clusterMembers.push(curr);
                const neighbors = activeBubbles.filter(n => !visited.has(n.id) && n.color === color && isNeighbor(curr, n));
                neighbors.forEach(n => { visited.add(n.id); queue.push(n); });
            }
            clusterMembers.sort((a,b) => b.y - a.y); 
            const hittableMember = clusterMembers.find(m => isPathClear(m));
            if (hittableMember) {
                const xPct = hittableMember.x / (gameContainerRef.current?.clientWidth || window.innerWidth);
                let desc = xPct < 0.33 ? "Left" : (xPct > 0.66 ? "Right" : "Center");
                allClusters.push({
                    id: hittableMember.id, color, size: clusterMembers.length, row: hittableMember.row, col: hittableMember.col,
                    pointsPerBubble: COLOR_CONFIG[color].points, description: desc
                });
            }
        }
    }
    return allClusters;
  };

  const isNeighbor = (a: Bubble, b: Bubble) => {
    const dr = b.row - a.row;
    const dc = b.col - a.col;
    if (Math.abs(dr) > 1) return false;
    if (dr === 0) return Math.abs(dc) === 1;
    return a.row % 2 !== 0 ? (dc === 0 || dc === 1) : (dc === -1 || dc === 0);
  };

  const performAiAnalysis = async (screenshot: string) => {
    isAiThinkingRef.current = true;
    setIsAiThinking(true);
    setAiHint("Flash-Lite analyzing...");
    const allClusters = getAllReachableClusters();
    const maxRow = bubbles.current.reduce((max, b) => b.active ? Math.max(max, b.row) : max, 0);
    const canvasWidth = canvasRef.current?.width || 1000;

    getStrategicHint(screenshot, allClusters, maxRow).then(aiResponse => {
        const { hint, debug } = aiResponse;
        setDebugInfo(debug);
        setAiHint(hint.message);
        setAiRationale(hint.rationale || null);
        if (hint.suggestSkip) {
          setShowSkipConfirm(true);
          sfx.playConfirm();
        }
        if (typeof hint.targetRow === 'number' && typeof hint.targetCol === 'number') {
            if (hint.recommendedColor) {
                setAiRecommendedColor(hint.recommendedColor);
                setSelectedColor(hint.recommendedColor);
            }
            const pos = getBubblePos(hint.targetRow, hint.targetCol, canvasWidth);
            setAimTarget(pos);
            aimTargetRef.current = pos;
        }
        isAiThinkingRef.current = false;
        setIsAiThinking(false);
    });
  };

  const drawBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colorKey: BubbleColor) => {
    const config = COLOR_CONFIG[colorKey];
    const baseColor = config.hex;
    const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.2, baseColor); grad.addColorStop(1, adjustColor(baseColor, -60));
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = adjustColor(baseColor, -80); ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x - radius * 0.3, y - radius * 0.35, radius * 0.25, radius * 0.15, Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.fill();
  };

  // --- Live API Session Management ---
  const toggleLiveApi = async () => {
    sfx.init();
    sfx.playClick();
    if (isLiveActive) {
      if (liveSessionRef.current) liveSessionRef.current.close();
      setIsLiveActive(false);
      return;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const inputCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const outputCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    audioContexts.current = { input: inputCtx, output: outputCtx };
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          const source = inputCtx.createMediaStreamSource(stream);
          const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            sessionPromise.then(session => session.sendRealtimeInput({ media: createBlob(inputData) }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputCtx.destination);
          setIsLiveActive(true);
        },
        onmessage: async (msg) => {
          const audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audio) {
            setIsSpeaking(true);
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
            const buffer = await decodeAudioData(decode(audio), outputCtx, 24000, 1);
            const source = outputCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outputCtx.destination);
            source.addEventListener('ended', () => { 
                audioSourcesRef.current.delete(source); 
                if (audioSourcesRef.current.size === 0) setIsSpeaking(false);
            });
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            audioSourcesRef.current.add(source);
          }
          if (msg.serverContent?.interrupted) {
            audioSourcesRef.current.forEach(s => s.stop());
            audioSourcesRef.current.clear();
            nextStartTimeRef.current = 0;
            setIsSpeaking(false);
          }
        },
        onclose: () => setIsLiveActive(false),
        onerror: () => setIsLiveActive(false),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        systemInstruction: "You are the Live Commentator for Gemini Slingshot. Watch the game and commentate cheerfully. Encourage the player, give strategic tips based on bubbles they see, and react to their shots."
      }
    });
    liveSessionRef.current = await sessionPromise;
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !gameContainerRef.current) return;
    const canvas = canvasRef.current;
    const container = gameContainerRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    anchorPos.current = { x: canvas.width / 2, y: canvas.height - SLINGSHOT_BOTTOM_OFFSET };
    ballPos.current = { ...anchorPos.current };
    initGrid(canvas.width, difficulty);

    let camera: any = null;
    let hands: any = null;
    const onResults = (results: any) => {
      setLoading(false);
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth; canvas.height = container.clientHeight;
        anchorPos.current = { x: canvas.width / 2, y: canvas.height - SLINGSHOT_BOTTOM_OFFSET };
      }
      ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(18, 18, 18, 0.85)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      let handPos: Point | null = null;
      let pinchDist = 1.0;
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        handPos = { x: (landmarks[8].x * canvas.width + landmarks[4].x * canvas.width) / 2, y: (landmarks[8].y * canvas.height + landmarks[4].y * canvas.height) / 2 };
        pinchDist = Math.sqrt(Math.pow(landmarks[8].x - landmarks[4].x, 2) + Math.pow(landmarks[8].y - landmarks[4].y, 2));
        if (window.drawConnectors) window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {color: '#669df6', lineWidth: 1});
        if (window.drawLandmarks) window.drawLandmarks(ctx, landmarks, {color: '#aecbfa', lineWidth: 1, radius: 2});
        ctx.beginPath(); ctx.arc(handPos.x, handPos.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = pinchDist < PINCH_THRESHOLD ? '#66bb6a' : '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      }
      const isLocked = isAiThinkingRef.current || showSkipConfirm;
      if (!isLocked && handPos && pinchDist < PINCH_THRESHOLD && !isFlying.current) {
        if (!isPinching.current && Math.sqrt(Math.pow(handPos.x - ballPos.current.x, 2) + Math.pow(handPos.y - ballPos.current.y, 2)) < 100) {
          isPinching.current = true;
          sfx.init();
        }
        if (isPinching.current) {
            ballPos.current = { x: handPos.x, y: handPos.y };
            const dragDist = Math.sqrt(Math.pow(ballPos.current.x - anchorPos.current.x, 2) + Math.pow(ballPos.current.y - anchorPos.current.y, 2));
            if (dragDist > MAX_DRAG_DIST) {
                const angle = Math.atan2(ballPos.current.y - anchorPos.current.y, ballPos.current.x - anchorPos.current.x);
                ballPos.current.x = anchorPos.current.x + Math.cos(angle) * MAX_DRAG_DIST;
                ballPos.current.y = anchorPos.current.y + Math.sin(angle) * MAX_DRAG_DIST;
            }
        }
      } else if (isPinching.current && (!handPos || pinchDist >= PINCH_THRESHOLD || isLocked)) {
        isPinching.current = false;
        if (!isLocked) {
            const dx = anchorPos.current.x - ballPos.current.x, dy = anchorPos.current.y - ballPos.current.y;
            const stretchDist = Math.sqrt(dx*dx + dy*dy);
            if (stretchDist > 30) {
                isFlying.current = true; flightStartTime.current = performance.now();
                const velMult = MIN_FORCE_MULT + (MAX_FORCE_MULT - MIN_FORCE_MULT) * Math.pow(Math.min(stretchDist / MAX_DRAG_DIST, 1.0), 2);
                ballVel.current = { x: dx * velMult, y: dy * velMult };
                shotsTakenRef.current++;
                activeShotTargetRef.current = aimTargetRef.current ? { ...aimTargetRef.current } : null;
                sfx.playShot();
                const diffCfg = DIFFICULTY_SETTINGS[difficulty];
                if (shotsTakenRef.current % diffCfg.newRowFrequency === 0) { addNewRow(canvas.width); }
            } else ballPos.current = { ...anchorPos.current };
        } else ballPos.current = { ...anchorPos.current };
      } else if (!isFlying.current && !isPinching.current) {
          ballPos.current.x += (anchorPos.current.x - ballPos.current.x) * 0.15;
          ballPos.current.y += (anchorPos.current.y - ballPos.current.y) * 0.15;
      }
      if (isFlying.current) {
        if (performance.now() - flightStartTime.current > 5000) {
            isFlying.current = false; ballPos.current = { ...anchorPos.current };
        } else {
            const steps = Math.ceil(Math.sqrt(ballVel.current.x**2 + ballVel.current.y**2) / (BUBBLE_RADIUS * 0.8)); 
            let collision = false;
            for (let i = 0; i < steps; i++) {
                ballPos.current.x += ballVel.current.x / steps; ballPos.current.y += ballVel.current.y / steps;
                if (ballPos.current.x < BUBBLE_RADIUS || ballPos.current.x > canvas.width - BUBBLE_RADIUS) { ballVel.current.x *= -1; }
                if (ballPos.current.y < BUBBLE_RADIUS) { collision = true; break; }
                for (const b of bubbles.current) {
                    if (b.active && Math.sqrt(Math.pow(ballPos.current.x - b.x, 2) + Math.pow(ballPos.current.y - b.y, 2)) < BUBBLE_RADIUS * 1.8) {
                        collision = true; break;
                    }
                }
                if (collision) break;
            }
            if (collision) {
                isFlying.current = false;
                let bestDist = Infinity, bestRow = 0, bestCol = 0, bestX = 0, bestY = 0;
                for (let r = 0; r < GRID_ROWS; r++) {
                    for (let c = 0; c < (r % 2 !== 0 ? GRID_COLS - 1 : GRID_COLS); c++) {
                        const { x, y } = getBubblePos(r, c, canvas.width);
                        if (bubbles.current.some(b => b.active && b.row === r && b.col === c)) continue;
                        const d = Math.sqrt(Math.pow(ballPos.current.x - x, 2) + Math.pow(ballPos.current.y - y, 2));
                        if (d < bestDist) { bestDist = d; bestRow = r; bestCol = c; bestX = x; bestY = y; }
                    }
                }
                
                // --- Accuracy Calculation ---
                let accuracyLabel = "";
                let accuracyBonus = 1.0;
                let accuracyColor = "#ffffff";
                
                if (activeShotTargetRef.current) {
                   const distToSuggested = Math.sqrt(Math.pow(bestX - activeShotTargetRef.current.x, 2) + Math.pow(bestY - activeShotTargetRef.current.y, 2));
                   if (distToSuggested < BUBBLE_RADIUS) {
                       accuracyLabel = "CRITICAL HIT!";
                       accuracyBonus = 2.0;
                       accuracyColor = "#fdd835";
                   } else if (distToSuggested < BUBBLE_RADIUS * 2.5) {
                       accuracyLabel = "GREAT AIM!";
                       accuracyBonus = 1.5;
                       accuracyColor = "#42a5f5";
                   } else {
                       accuracyLabel = "OFF TARGET";
                       accuracyBonus = 1.0;
                       accuracyColor = "#9e9e9e";
                   }
                   spawnFloatingScore(bestX, bestY - 40, undefined, accuracyColor, accuracyLabel, accuracyBonus > 1);
                }

                const newB: Bubble = { id: `${bestRow}-${bestCol}-${Date.now()}`, row: bestRow, col: bestCol, x: bestX, y: bestY, color: selectedColorRef.current, active: true };
                bubbles.current.push(newB);
                const checkMatches = (start: Bubble) => {
                    const toCheck = [start], visited = new Set<string>(), matches: Bubble[] = [];
                    while (toCheck.length > 0) {
                        const curr = toCheck.pop()!; if (visited.has(curr.id)) continue; visited.add(curr.id);
                        if (curr.color === start.color) {
                            matches.push(curr);
                            toCheck.push(...bubbles.current.filter(b => b.active && !visited.has(b.id) && isNeighbor(curr, b)));
                        }
                    }
                    if (matches.length >= 3) {
                        matches.forEach(b => { b.active = false; createExplosion(b.x, b.y, COLOR_CONFIG[b.color].hex); });
                        sfx.playMatch(matches.length, accuracyBonus > 1.5);
                        const multiplier = DIFFICULTY_SETTINGS[difficulty].pointsMultiplier;
                        const pointsGained = Math.floor(matches.length * COLOR_CONFIG[start.color].points * multiplier * (matches.length > 3 ? 1.5 : 1) * accuracyBonus);
                        spawnFloatingScore(start.x, start.y, pointsGained, COLOR_CONFIG[start.color].hex);
                        scoreRef.current += pointsGained;
                        setScore(scoreRef.current);
                    }
                };
                checkMatches(newB); updateAvailableColors();
                ballPos.current = { ...anchorPos.current }; captureRequestRef.current = true;
            }
        }
      }
      bubbles.current.forEach(b => b.active && drawBubble(ctx, b.x, b.y, BUBBLE_RADIUS - 1, b.color));
      const currentAim = aimTargetRef.current, currentSelected = selectedColorRef.current;

      // AI Target Path Visualization
      if ((currentAim && !isFlying.current && (!aiRecommendedColor || aiRecommendedColor === currentSelected)) || isAiThinkingRef.current) {
          ctx.save();
          const col = isAiThinkingRef.current ? '#a8c7fa' : COLOR_CONFIG[currentSelected].hex;
          const target = currentAim || { x: anchorPos.current.x, y: anchorPos.current.y - 200 };
          
          // Breathing Effect Variables
          const breath = 0.8 + Math.sin(performance.now() / 400) * 0.2; // Cycles between 0.6 and 1.0
          const breathSlow = 0.9 + Math.sin(performance.now() / 800) * 0.1; // Slower oscillation

          // Outer Soft Glow Path (Breathing Glow)
          ctx.shadowBlur = 15 + (15 * breath);
          ctx.shadowColor = col;
          ctx.strokeStyle = isAiThinkingRef.current ? 'rgba(168, 199, 250, 0.15)' : `${col}44`;
          ctx.lineWidth = 12 * breathSlow;
          ctx.beginPath();
          ctx.moveTo(anchorPos.current.x, anchorPos.current.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();

          // Animated Dash Flow (Breathing thickness and opacity)
          ctx.globalAlpha = 0.7 + (0.3 * breathSlow);
          ctx.setLineDash([15, 20]);
          ctx.lineDashOffset = -(performance.now() / 12) % 35;
          ctx.strokeStyle = isAiThinkingRef.current ? 'rgba(168, 199, 250, 0.7)' : col;
          ctx.lineWidth = 4 * breath;
          ctx.lineCap = 'round';
          ctx.stroke();

          // Path-Following "Stream" Particles
          const time = performance.now() / 1000;
          const numDots = 4;
          for (let i = 0; i < numDots; i++) {
            const offset = (i / numDots + time * 0.4) % 1;
            const px = anchorPos.current.x + (target.x - anchorPos.current.x) * offset;
            const py = anchorPos.current.y + (target.y - anchorPos.current.y) * offset;
            
            // Visual feedback: Dots grow near center and fade at ends, also pulse with breath
            const size = (1 - Math.pow(Math.abs(offset - 0.5) * 2, 2)) * 6 * breath;
            
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 10 * breath;
            ctx.shadowColor = col;
            ctx.fill();
          }

          // Target Pulse Highlight
          if (currentAim && !isAiThinkingRef.current) {
            const pulse = 1 + Math.sin(performance.now() / 200) * 0.15;
            ctx.beginPath();
            ctx.arc(currentAim.x, currentAim.y, BUBBLE_RADIUS * 1.5 * pulse, 0, Math.PI * 2);
            ctx.strokeStyle = col;
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.3 * (1 - (pulse - 0.85) / 0.3);
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }

          ctx.restore();
      }

      ctx.beginPath(); ctx.moveTo(anchorPos.current.x - 35, anchorPos.current.y - 10); ctx.lineTo(ballPos.current.x, ballPos.current.y);
      ctx.lineWidth = 5; ctx.strokeStyle = isPinching.current ? '#fdd835' : 'rgba(255,255,255,0.4)'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.save(); if (isLocked && !isFlying.current) ctx.globalAlpha = 0.5;
      drawBubble(ctx, ballPos.current.x, ballPos.current.y, BUBBLE_RADIUS, selectedColorRef.current); ctx.restore();
      ctx.beginPath(); ctx.moveTo(ballPos.current.x, ballPos.current.y); ctx.lineTo(anchorPos.current.x + 35, anchorPos.current.y - 10);
      ctx.lineWidth = 5; ctx.strokeStyle = isPinching.current ? '#fdd835' : 'rgba(255,255,255,0.4)'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(anchorPos.current.x, canvas.height); ctx.lineTo(anchorPos.current.x, anchorPos.current.y + 40); ctx.lineTo(anchorPos.current.x - 40, anchorPos.current.y);
      ctx.moveTo(anchorPos.current.x, anchorPos.current.y + 40); ctx.lineTo(anchorPos.current.x + 40, anchorPos.current.y);
      ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.strokeStyle = '#616161'; ctx.stroke();
      
      // Update & Draw Particles
      for (let i = particles.current.length - 1; i >= 0; i--) {
          const p = particles.current[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.05;
          if (p.life <= 0) particles.current.splice(i, 1);
          else { ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); ctx.globalAlpha = 1.0; }
      }

      // Update & Draw Floating Scores and Accuracy Labels
      ctx.save();
      ctx.scale(-1, 1); // Compensate for global canvas mirror
      for (let i = floatingScores.current.length - 1; i >= 0; i--) {
        const fs = floatingScores.current[i];
        fs.y -= 1.5; fs.life -= 0.015;
        if (fs.life <= 0) {
          floatingScores.current.splice(i, 1);
        } else {
          ctx.globalAlpha = fs.life;
          ctx.fillStyle = fs.color;
          ctx.shadowBlur = fs.isSpecial ? 15 : 10; 
          ctx.shadowColor = fs.isSpecial ? fs.color : 'rgba(0,0,0,0.5)';
          
          if (fs.label) {
            ctx.font = `bold ${fs.isSpecial ? 24 : 18}px Roboto`;
            ctx.textAlign = 'center';
            ctx.fillText(fs.label, -fs.x, fs.y);
          } else if (fs.value !== undefined) {
            ctx.font = `bold ${Math.floor(20 + (1.0 - fs.life) * 15)}px Roboto`;
            ctx.textAlign = 'left';
            ctx.fillText(`+${fs.value}`, -fs.x, fs.y);
          }
        }
      }
      ctx.restore();

      if (captureRequestRef.current) {
        captureRequestRef.current = false;
        const offscreen = document.createElement('canvas'); const targetWidth = 480; const scale = Math.min(1, targetWidth / canvas.width);
        offscreen.width = canvas.width * scale; offscreen.height = canvas.height * scale;
        const oCtx = offscreen.getContext('2d');
        if (oCtx) { oCtx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height); setTimeout(() => performAiAnalysis(offscreen.toDataURL("image/jpeg", 0.6)), 0); }
      }
    };
    if (window.Hands) {
      hands = new window.Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      hands.onResults(onResults);
      if (window.Camera) { camera = new window.Camera(videoRef.current, { onFrame: async () => { if (videoRef.current && hands) await hands.send({ image: videoRef.current }); }, width: 1280, height: 720 }); camera.start(); }
    }
    return () => { if (camera) camera.stop(); if (hands) hands.close(); };
  }, [initGrid, difficulty]);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setIsChatLoading(true);
    sfx.playClick();
    try {
        const response = await getChatResponse(msg, []);
        setChatMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (e) {
        setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I'm having trouble connecting." }]);
    } finally {
        setIsChatLoading(false);
    }
  };

  const skipTurn = () => {
    sfx.playClick();
    setShowSkipConfirm(false);
    shotsTakenRef.current++;
    const diffCfg = DIFFICULTY_SETTINGS[difficulty];
    if (shotsTakenRef.current % diffCfg.newRowFrequency === 0 && canvasRef.current) { addNewRow(canvasRef.current.width); }
    captureRequestRef.current = true;
  };

  const currentDiffUI = DIFFICULTY_UI_CONFIG[difficulty];

  return (
    <div className="flex w-full h-screen bg-[#121212] overflow-hidden font-roboto text-[#e3e3e3]">
      
      {/* SKIP CONFIRMATION MODAL */}
      {showSkipConfirm && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#1e1e1e] border border-[#444746] rounded-[28px] p-8 max-sm:p-6 max-w-sm w-full shadow-2xl">
            <div className="bg-[#ef5350]/20 w-16 h-16 rounded-full flex items-center justify-center mb-6 mx-auto">
              <Trash2 className="w-8 h-8 text-[#ef5350]" />
            </div>
            <h3 className="text-xl font-bold text-center mb-2">Skip this shot?</h3>
            <p className="text-[#c4c7c5] text-center mb-8">Gemini suggests skipping this turn to wait for better ammo. Are you sure you want to skip this shot?</p>
            <div className="flex flex-col gap-3">
              <button onClick={skipTurn} className="w-full bg-[#ef5350] hover:bg-[#d32f2f] text-white font-bold py-3 rounded-xl transition-colors">Yes, Skip Shot</button>
              <button onClick={() => { setShowSkipConfirm(false); sfx.playClick(); }} className="w-full bg-[#333] hover:bg-[#444] text-[#e3e3e3] font-bold py-3 rounded-xl transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* CHATBOT WINDOW */}
      <div className={`fixed bottom-24 right-6 z-[150] w-[350px] transition-all duration-300 transform ${isChatOpen ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
        <div className="bg-[#1e1e1e] border border-[#444746] rounded-3xl shadow-2xl flex flex-col h-[500px] overflow-hidden">
          <div className="p-4 bg-[#2a2a2a] border-b border-[#444746] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-[#a8c7fa]" />
              <span className="font-bold text-sm tracking-wide">Gemini Pro Assistant</span>
            </div>
            <button onClick={() => { setIsChatOpen(false); sfx.playClick(); }} className="p-1 hover:bg-white/10 rounded-full"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-[#42a5f5] text-white rounded-tr-none' : 'bg-[#333] text-[#e3e3e3] rounded-tl-none border border-white/5'}`}>{m.text}</div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start"><div className="bg-[#333] p-3 rounded-2xl flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-[#a8c7fa]" /><span className="text-xs text-gray-400">Thinking...</span></div></div>
            )}
          </div>
          <div className="p-4 border-t border-[#444746] flex items-center gap-2">
            <input type="text" placeholder="Ask about difficulty..." className="flex-1 bg-black/30 border border-[#444746] rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#42a5f5]/50" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} />
            <button onClick={handleSendMessage} className="p-2 bg-[#42a5f5] hover:bg-[#1e88e5] rounded-full transition-colors"><Send className="w-4 h-4 text-white" /></button>
          </div>
        </div>
      </div>

      <button onClick={() => { setIsChatOpen(!isChatOpen); sfx.playClick(); }} className="fixed bottom-6 right-6 z-[160] w-14 h-14 bg-[#42a5f5] hover:bg-[#1e88e5] rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95">
        {isChatOpen ? <X className="w-6 h-6 text-white" /> : <MessageSquare className="w-6 h-6 text-white" />}
      </button>

      {/* MOBILE BLOCKER */}
      <div className="fixed inset-0 z-[100] bg-[#121212] flex flex-col items-center justify-center p-8 text-center md:hidden">
         <Monitor className="w-16 h-16 text-[#ef5350] mb-6 animate-pulse" />
         <h2 className="text-2xl font-bold mb-4">Desktop View Required</h2>
         <p className="text-[#c4c7c5] max-w-md">Webcam tracking requires a larger display.</p>
      </div>

      {/* LEFT: Game Area */}
      <div ref={gameContainerRef} className="flex-1 relative h-full overflow-hidden">
        <video ref={videoRef} className="absolute hidden" playsInline />
        <canvas ref={canvasRef} className="absolute inset-0" />

        {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#121212] z-50">
                <div className="flex flex-col items-center">
                    <Loader2 className="w-12 h-12 text-[#42a5f5] animate-spin mb-4" />
                    <p className="text-lg font-medium">Booting Strategy Engine...</p>
                </div>
            </div>
        )}

        {isAiThinking && (
          <div className="absolute left-1/2 -translate-x-1/2 z-50 flex flex-col items-center justify-center pointer-events-none" style={{ bottom: '220px', transform: 'translate(-50%, 50%)' }}>
             <div className="w-[72px] h-[72px] rounded-full border-4 border-t-[#a8c7fa] border-r-[#a8c7fa] border-b-transparent border-l-transparent animate-spin" />
             <p className="mt-4 text-[#a8c7fa] font-bold text-xs tracking-widest animate-pulse uppercase">Flash-Lite Analyzing...</p>
          </div>
        )}

        {/* TOP BAR: Score & Controls */}
        <div className="absolute top-6 left-6 right-6 z-40 flex items-center justify-between pointer-events-none">
            <div className="flex gap-4 pointer-events-auto items-center">
                {/* Score Card */}
                <div className={`bg-[#1e1e1e] p-4 rounded-[28px] border border-[#444746] shadow-2xl flex items-center gap-4 min-w-[160px] transition-all duration-300 ${displayScore < score ? 'scale-110 border-[#42a5f5] shadow-[#42a5f5]/20' : ''}`}>
                    <div className={`bg-[#42a5f5]/20 p-3 rounded-full ${displayScore < score ? 'animate-bounce' : ''}`}><Trophy className="w-6 h-6 text-[#42a5f5]" /></div>
                    <div>
                      <p className="text-[10px] text-[#c4c7c5] uppercase tracking-wider font-bold opacity-70">Score</p>
                      <p className="text-2xl font-bold text-white tabular-nums leading-tight">{displayScore.toLocaleString()}</p>
                    </div>
                </div>

                {/* Difficulty Badge */}
                <div className={`bg-[#1e1e1e] p-4 rounded-[28px] border border-[#444746] shadow-2xl flex items-center gap-4 transition-all duration-500`}>
                    <div className={`p-3 rounded-full ${currentDiffUI.color}`}><ShieldAlert className={`w-6 h-6 ${currentDiffUI.iconColor}`} /></div>
                    <div>
                      <p className="text-[10px] text-[#c4c7c5] uppercase tracking-wider font-bold opacity-70">Difficulty</p>
                      <p className={`text-2xl font-bold leading-tight ${currentDiffUI.iconColor}`}>{currentDiffUI.label}</p>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 pointer-events-auto">
              <div className="bg-[#1e1e1e] p-4 rounded-[28px] border border-[#444746] shadow-2xl flex items-center gap-4">
                <button 
                  onClick={() => { setSoundEnabled(!soundEnabled); sfx.playClick(); }}
                  className="bg-white/5 p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                  {soundEnabled ? <Volume2 className="w-5 h-5 text-gray-300" /> : <VolumeX className="w-5 h-5 text-gray-500" />}
                </button>
                <div className="w-[1px] h-6 bg-white/10" />
                <div className="bg-[#ffee58]/10 p-2 rounded-full"><BarChart3 className="w-5 h-5 text-[#ffee58]" /></div>
                <div className="flex gap-1">
                  {(['easy', 'medium', 'hard', 'very-hard'] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => { setDifficulty(d); sfx.playClick(); }} className={`px-3 py-1 rounded-full text-[10px] uppercase font-bold transition-all ${difficulty === d ? 'bg-[#ffee58] text-black shadow-lg shadow-amber-500/20' : 'hover:bg-white/5 text-gray-500'}`}>{d.replace('-', ' ')}</button>
                  ))}
                </div>
              </div>
              
              <button 
                onClick={toggleLiveApi} 
                className={`flex items-center gap-3 px-6 py-4 rounded-[28px] border transition-all shadow-xl group ${isLiveActive ? 'bg-[#ef5350] border-[#ef5350] text-white ring-4 ring-[#ef5350]/20' : 'bg-[#1e1e1e] border-[#444746] text-[#e3e3e3] hover:border-white/20'}`}
              >
                <div className={`relative flex items-center justify-center ${isLiveActive && 'animate-pulse'}`}>
                  {isLiveActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-gray-500" />}
                  {isSpeaking && <div className="absolute -inset-2 rounded-full border-2 border-white animate-ping opacity-50" />}
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Gemini Live</p>
                  <p className="text-sm font-bold">{isLiveActive ? 'Voice Active' : 'Enable Voice'}</p>
                </div>
                <Radio className={`w-4 h-4 ml-1 ${isLiveActive ? 'text-white' : 'text-gray-600'}`} />
              </button>
            </div>
        </div>

        {/* BOTTOM: Color Selector */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40">
            <div className="bg-[#1e1e1e] px-6 py-4 rounded-[32px] border border-[#444746] shadow-2xl flex items-center gap-4">
                <p className="text-xs text-[#c4c7c5] uppercase font-bold tracking-wider mr-2 hidden md:block">Ammo</p>
                {availableColors.length === 0 ? <p className="text-sm text-gray-500">Out of Ammo</p> : (
                    COLOR_KEYS.filter(c => availableColors.includes(c)).map(color => {
                        const isSelected = selectedColor === color, isRec = aiRecommendedColor === color, config = COLOR_CONFIG[color];
                        return (
                            <button key={color} onClick={() => { setSelectedColor(color); sfx.playClick(); }}
                                className={`relative w-14 h-14 rounded-full transition-all duration-300 transform flex items-center justify-center ${isSelected ? 'scale-110 ring-4 ring-white/50 z-10' : 'opacity-80 hover:opacity-100 hover:scale-105'}`}
                                style={{ background: `radial-gradient(circle at 35% 35%, ${config.hex}, ${adjustColor(config.hex, -60)})`, boxShadow: isSelected ? `0 0 20px ${config.hex}, inset 0 -4px 4px rgba(0,0,0,0.3)` : '0 4px 6px rgba(0,0,0,0.3), inset 0 -4px 4px rgba(0,0,0,0.3)' }}
                            >
                                <div className="absolute top-2 left-3 w-4 h-2 bg-white/40 rounded-full transform -rotate-45 filter blur-[1px]" />
                                {isRec && !isSelected && <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-black text-[10px] font-bold flex items-center justify-center rounded-full animate-bounce shadow-md">!</span>}
                                {isSelected && <MousePointerClick className="w-6 h-6 text-white/90 drop-shadow-md" />}
                            </button>
                        )
                    })
                )}
                <div className="w-[1px] h-8 bg-white/10 mx-2" />
                <button onClick={() => { setShowSkipConfirm(true); sfx.playClick(); }} className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all group" title="Discard Ammo / Skip"><Trash2 className="w-5 h-5 text-gray-400 group-hover:text-[#ef5350]" /></button>
            </div>
        </div>

        {!isPinching.current && !isFlying.current && !isAiThinking && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none opacity-50">
                <div className="flex items-center gap-2 bg-[#1e1e1e]/90 px-4 py-2 rounded-full border border-[#444746] backdrop-blur-sm">
                    <Play className="w-3 h-3 text-[#42a5f5] fill-current" />
                    <p className="text-[#e3e3e3] text-xs font-medium uppercase tracking-widest">Pinch & Pull to Shoot</p>
                </div>
            </div>
        )}
      </div>

      {/* RIGHT: Telemetry Panel */}
      <div className="w-[380px] bg-[#1e1e1e] border-l border-[#444746] flex flex-col h-full overflow-hidden shadow-2xl">
        <div className="p-5 border-b-4 transition-colors duration-500 flex flex-col gap-2" style={{ backgroundColor: '#252525', borderColor: aiRecommendedColor ? COLOR_CONFIG[aiRecommendedColor].hex : '#444746' }}>
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-[#ffee58]" />
                    <h2 className="font-bold text-sm tracking-widest uppercase text-[#ffee58]">Fast Response AI</h2>
                </div>
                {isAiThinking && <Loader2 className="w-4 h-4 animate-spin text-white/50" />}
             </div>
             <p className="text-[#e3e3e3] text-sm leading-relaxed font-bold">{aiHint}</p>
             {aiRationale && <div className="flex gap-2 mt-1"><Lightbulb className="w-4 h-4 text-[#a8c7fa] shrink-0 mt-0.5" /><p className="text-[#a8c7fa] text-xs italic opacity-90 leading-tight">{aiRationale}</p></div>}
             {aiRecommendedColor && (
                <div className="flex items-center gap-2 mt-3 bg-black/20 p-2 rounded">
                    <Target className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-400 uppercase tracking-wide">Rec:</span>
                    <span className="text-xs font-bold uppercase" style={{ color: COLOR_CONFIG[aiRecommendedColor].hex }}>{COLOR_CONFIG[aiRecommendedColor].label}</span>
                </div>
             )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="bg-[#2a2a2a] p-4 rounded-2xl border border-[#444746]">
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2 text-[#ffee58]"><Settings2 className="w-4 h-4" /><span className="text-[10px] font-bold uppercase tracking-widest">Difficulty Config</span></div>
                 <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${currentDiffUI.color}`}>{currentDiffUI.label}</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-xs text-gray-500">Starting Rows</span><span className="text-xs font-mono font-bold">{DIFFICULTY_SETTINGS[difficulty].startingRows}</span></div>
                <div className="flex justify-between items-center"><span className="text-xs text-gray-500">Row Add Interval</span><span className="text-xs font-mono font-bold">{DIFFICULTY_SETTINGS[difficulty].newRowFrequency} shots</span></div>
                <div className="flex justify-between items-center"><span className="text-xs text-gray-500">Score Multiplier</span><span className="text-xs font-mono font-bold text-[#66bb6a]">x{DIFFICULTY_SETTINGS[difficulty].pointsMultiplier}</span></div>
              </div>
            </div>

            <div className="bg-[#42a5f5]/10 p-4 rounded-2xl border border-[#42a5f5]/30">
               <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-[#42a5f5]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#42a5f5]">Accuracy Bonus</span>
               </div>
               <div className="space-y-2">
                  <div className="flex justify-between text-[10px]"><span className="text-gray-400">Critical (Perfect)</span> <span className="text-yellow-400 font-bold">2.0x Points</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-gray-400">Great Aim</span> <span className="text-blue-400 font-bold">1.5x Points</span></div>
               </div>
            </div>

            <div>
                <div className="flex items-center gap-2 mb-2 text-[#c4c7c5] text-xs font-bold uppercase tracking-wider"><Eye className="w-3 h-3" /> Visual Frame</div>
                <div className="rounded-lg overflow-hidden border border-[#444746] bg-black/50 relative group aspect-video">
                    {debugInfo?.screenshotBase64 ? <img src={debugInfo.screenshotBase64} alt="AI Vision" className="w-full h-auto opacity-80" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-600">Waiting for first frame...</div>}
                </div>
            </div>

            {debugInfo && (
                <div>
                    <div className="flex items-center gap-2 mb-2 text-[#c4c7c5] text-xs font-bold uppercase tracking-wider"><Radio className="w-3 h-3" /> Telemetry Stream</div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                         <div className="bg-[#2a2a2a] p-2 rounded border border-[#444746]"><p className="text-[10px] text-gray-500 mb-1">Latency</p><div className="flex items-center gap-1 text-[#a8c7fa] font-mono font-bold">{debugInfo.latency}ms</div></div>
                         <div className="bg-[#2a2a2a] p-2 rounded border border-[#444746]"><p className="text-[10px] text-gray-500 mb-1">Color Suggest</p><div className="flex items-center gap-1 text-[#e3e3e3] font-mono font-bold capitalize">{debugInfo.parsedResponse?.recommendedColor || '--'}</div></div>
                    </div>
                    <div className="bg-[#121212] p-3 rounded-lg border border-[#444746] font-mono text-[10px] text-[#66bb6a] max-h-40 overflow-y-auto whitespace-pre-wrap leading-tight border-l-2 border-l-[#66bb6a]">
                        {debugInfo.rawResponse}
                    </div>
                </div>
            )}
        </div>
        <div className="p-3 bg-[#252525] border-t border-[#444746] text-center"><p className="text-[10px] text-gray-500 font-medium tracking-widest uppercase">Flash-Lite Strategic Core v2.5</p></div>
      </div>
    </div>
  );
};

export default GeminiSlingshot;
