/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCcw, Info, CheckCircle2, AlertCircle, Loader2, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';
import * as d3 from 'd3';

// Audio Assets
const SOUNDS = {
  TURN_START: 'https://www.soundjay.com/buttons/sounds/button-16.mp3',
  CORRECT: 'https://www.soundjay.com/buttons/sounds/button-37.mp3',
  ERROR: 'https://www.soundjay.com/buttons/sounds/button-10.mp3',
  VICTORY: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3'
};

// Types
interface Country {
  id: string;
  name: string;
  path: string;
  neighbors: string[];
  labelPos: { x: number; y: number };
}

// Target countries for the game
const TARGET_COUNTRY_NAMES = [
  'Guatemala', 'Belize', 'El Salvador', 'Honduras', 'Nicaragua', 'Costa Rica', 'Panama'
];

const NEIGHBOR_MAP: Record<string, string[]> = {
  'Guatemala': ['Belize', 'El Salvador', 'Honduras'],
  'Belize': ['Guatemala'],
  'El Salvador': ['Guatemala', 'Honduras'],
  'Honduras': ['Guatemala', 'El Salvador', 'Nicaragua'],
  'Nicaragua': ['Honduras', 'Costa Rica'],
  'Costa Rica': ['Nicaragua', 'Panama'],
  'Panama': ['Costa Rica']
};

// Custom Alien Icon Component
const Alien = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M12 2C7.58 2 4 5.58 4 10c0 4.42 3.58 8 8 8s8-3.58 8-8c0-4.42-3.58-8-8-8zm-3.5 9c-1.38 0-2.5-1.12-2.5-2.5S7.12 6 8.5 6 11 7.12 11 8.5 9.88 11 8.5 11zm7 0c-1.38 0-2.5-1.12-2.5-2.5S14.12 6 15.5 6 18 7.12 18 8.5 16.88 11 15.5 11z" />
  </svg>
);

export default function App() {
  const [geoData, setGeoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [player1Ids, setPlayer1Ids] = useState<string[]>([]);
  const [player2Ids, setPlayer2Ids] = useState<string[]>([]);
  const [turnHubId, setTurnHubId] = useState<string | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [scores, setScores] = useState({ 1: 0, 2: 0 });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' }>({
    text: 'Player 1: Pick a Hub for this turn!',
    type: 'info'
  });
  const [draggedCountry, setDraggedCountry] = useState<Country | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  
  const mapRef = useRef<SVGSVGElement>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Load voices and listen for changes
  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Unlock audio on first interaction
  useEffect(() => {
    const unlock = () => {
      if (audioUnlocked) return;
      
      // Silent play to unlock audio
      const audio = new Audio();
      audio.play().catch(() => {});
      
      // Test speech (some browsers need this to unlock)
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance("");
        window.speechSynthesis.speak(utterance);
      }
      
      setAudioUnlocked(true);
      
      // Announce current state once unlocked
      if (message.text) {
        announce(message.text);
      }
      
      // Remove listeners
      window.removeEventListener('mousedown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('mousedown', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);

    return () => {
      window.removeEventListener('mousedown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [audioUnlocked]);

  // New Local TTS / Sound Effect Helper
  const announce = (text: string, soundUrl?: string) => {
    if (!voiceEnabled || !audioUnlocked) return;

    // Play Sound Effect
    if (soundUrl) {
      const audio = new Audio(soundUrl);
      audio.volume = 0.4;
      audio.play().catch((e) => console.warn('Audio play failed:', e));
    }

    // Local Speech Synthesis (Offline/No Service)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any pending speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.2;
      utterance.pitch = 0.9;
      
      // Try to find a British voice (en-GB)
      const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const britishVoice = voices.find(v => v.lang === 'en-GB' || v.name.includes('UK') || v.name.includes('British'));
      if (britishVoice) utterance.voice = britishVoice;
      
      window.speechSynthesis.speak(utterance);
    }
  };

  // Watch for message changes to announce (only after unlock)
  useEffect(() => {
    if (message.text && audioUnlocked) {
      let sound = undefined;
      if (message.type === 'success') sound = SOUNDS.CORRECT;
      if (message.type === 'error') sound = SOUNDS.ERROR;
      
      announce(message.text, sound);
    }
  }, [message.text, audioUnlocked]);

  const allPlacedIds = useMemo(() => [...player1Ids, ...player2Ids], [player1Ids, player2Ids]);

  // Turn start sound (only after unlock)
  useEffect(() => {
    if (gameOver || !voiceEnabled || !audioUnlocked) return;
    const audio = new Audio(SOUNDS.TURN_START);
    audio.volume = 0.5;
    audio.play().catch((e) => console.warn('Turn audio failed:', e));
  }, [currentPlayer, voiceEnabled, gameOver, audioUnlocked]);

  // Fetch GeoJSON on mount
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(res => res.json())
      .then(data => {
        setGeoData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch map data:', err);
        setLoading(false);
      });
  }, []);

  // Process GeoJSON into projected paths
  const { countries, backgroundCountries, projection } = useMemo(() => {
    if (!geoData) return { countries: [], backgroundCountries: [], projection: null };

    // Set up projection focused on Central America
    const projection = d3.geoMercator()
      .center([-85, 13]) // Center on Central America
      .scale(2500)
      .translate([400, 300]);

    const pathGenerator = d3.geoPath().projection(projection);

    // Filter and project target countries
    const targetCountries: Country[] = geoData.features
      .filter((f: any) => TARGET_COUNTRY_NAMES.includes(f.properties.name))
      .map((f: any) => {
        const name = f.properties.name;
        const path = pathGenerator(f) || '';
        const centroid = pathGenerator.centroid(f);
        
        return {
          id: name.toLowerCase().replace(/\s+/g, '-'),
          name,
          path,
          neighbors: NEIGHBOR_MAP[name]?.map(n => n.toLowerCase().replace(/\s+/g, '-')) || [],
          labelPos: { x: centroid[0], y: centroid[1] }
        };
      });

    // Background countries for context (Mexico, Colombia, etc.)
    const backgroundCountries = geoData.features
      .filter((f: any) => {
        const name = f.properties.name;
        if (TARGET_COUNTRY_NAMES.includes(name)) return false;
        const bgNames = ['Mexico', 'Colombia', 'Columbia', 'Jamaica', 'Cuba', 'Haiti', 'Dominican Republic'];
        return bgNames.some(bg => bg.toLowerCase() === name.toLowerCase());
      })
      .map((f: any) => ({
        id: f.properties.name,
        name: f.properties.name,
        path: pathGenerator(f) || ''
      }));

    return { countries: targetCountries, backgroundCountries, projection };
  }, [geoData]);

  const availableCountries = countries.filter(c => !allPlacedIds.includes(c.id));

  const resetGame = () => {
    setPlayer1Ids([]);
    setPlayer2Ids([]);
    setTurnHubId(null);
    setScores({ 1: 0, 2: 0 });
    setCurrentPlayer(1);
    setGameOver(false);
    setMessage({ text: 'Player 1: Pick a Hub for this turn!', type: 'info' });
  };

  const handleDragStart = (country: Country) => {
    setDraggedCountry(country);
  };

  const switchTurn = (errorMsg: string) => {
    const nextPlayer = currentPlayer === 1 ? 2 : 1;
    setCurrentPlayer(nextPlayer);
    setTurnHubId(null);
    setMessage({
      text: `${errorMsg} Turn over! Player ${nextPlayer}'s turn.`,
      type: 'error'
    });
  };

  const handleDragEnd = (event: any, info: any, country: Country) => {
    if (!mapRef.current) return;

    // Use a small search radius for better hit detection on small countries
    const radius = 5;
    const points = [
      { x: info.point.x, y: info.point.y },
      { x: info.point.x + radius, y: info.point.y },
      { x: info.point.x - radius, y: info.point.y },
      { x: info.point.x, y: info.point.y + radius },
      { x: info.point.x, y: info.point.y - radius },
    ];

    let hitName: string | null = null;
    
    for (const pt of points) {
      const elements = document.elementsFromPoint(pt.x, pt.y);
      
      // Prioritize hitting the correct country if multiple elements overlap
      const correctHit = elements.find(el => 
        el.getAttribute('data-country-name')?.toLowerCase() === country.name.toLowerCase()
      );
      
      if (correctHit) {
        hitName = correctHit.getAttribute('data-country-name');
        break;
      }
      
      // Fallback to any country hit
      const anyHit = elements.find(el => el.hasAttribute('data-country-name'));
      if (anyHit) {
        hitName = anyHit.getAttribute('data-country-name');
        break;
      }
    }

    if (hitName) {
      // Use case-insensitive comparison for robustness
      if (hitName.toLowerCase() === country.name.toLowerCase()) {
        // Correct country!
        if (!turnHubId) {
          // First move of turn - can be any available country
          placeCountry(country.id, 1);
        } else {
          // Subsequent moves must be adjacent to this turn's Hub
          const isAdjacentToTurnHub = country.neighbors.includes(turnHubId);
          
          if (isAdjacentToTurnHub) {
            placeCountry(country.id, 2);
          } else {
            switchTurn(`Not adjacent to this turn's Hub!`);
          }
        }
      } else if (TARGET_COUNTRY_NAMES.some(n => n.toLowerCase() === hitName.toLowerCase()) || 
        ['Mexico', 'Colombia', 'Columbia', 'Jamaica', 'Cuba', 'Haiti', 'Dominican Republic'].some(n => n.toLowerCase() === hitName.toLowerCase())) {
        // Hit a different country (target or background)
        switchTurn(`That's ${hitName}, not ${country.name}!`);
      } else {
        // Hit some other country not in our list
        setMessage({
          text: `Dropped in the water! Try again, Player ${currentPlayer}.`,
          type: 'info'
        });
      }
    } else {
      // Dropped in water
      setMessage({
        text: `Dropped in the water! Try again, Player ${currentPlayer}.`,
        type: 'info'
      });
    }
    setDraggedCountry(null);
  };

  const placeCountry = (id: string, points: number) => {
    const isFirstMoveOfTurn = !turnHubId;
    const currentHubId = isFirstMoveOfTurn ? id : turnHubId;
    
    if (isFirstMoveOfTurn) setTurnHubId(id);

    const setPlayerIds = currentPlayer === 1 ? setPlayer1Ids : setPlayer2Ids;
    setPlayerIds(prev => [...prev, id]);
    setScores(prev => ({ ...prev, [currentPlayer]: prev[currentPlayer] + points }));
    
    const countryName = countries.find(c => c.id === id)?.name;
    const isBonus = points === 2;
    
    const nextAllPlacedIds = [...allPlacedIds, id];
    
    // Check if turn should end based on current turn's Hub
    const hubCountry = countries.find(c => c.id === currentHubId);
    // Neighbors of Turn Hub that haven't been placed by ANYONE yet
    const remainingHubNeighbors = hubCountry?.neighbors.filter(nId => !nextAllPlacedIds.includes(nId)) || [];
    
    const isGameOver = nextAllPlacedIds.length === countries.length;
    
    if (isGameOver) {
      setGameOver(true);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
      
      const finalScores = { ...scores, [currentPlayer]: scores[currentPlayer] + points };
      const winner = finalScores[1] > finalScores[2] ? 1 : finalScores[2] > finalScores[1] ? 2 : 0;
      const winnerText = winner === 0 ? "The game is a draw!" : `Player ${winner} is the victor!`;
      
      setMessage({ text: `Game Over! ${countryName} placed. ${winnerText} Final score: Player 1: ${finalScores[1]}, Player 2: ${finalScores[2]}.`, type: 'success' });
      return;
    }

    if (remainingHubNeighbors.length === 0) {
      const nextPlayer = currentPlayer === 1 ? 2 : 1;
      setCurrentPlayer(nextPlayer);
      setTurnHubId(null);
      setMessage({
        text: `${countryName} placed (+${points}). ${isFirstMoveOfTurn ? 'Hub has no neighbors!' : 'Hub territory complete!'} Player ${nextPlayer}'s turn.`,
        type: 'success'
      });
    } else {
      setMessage({ 
        text: `Correct! ${countryName} (+${points})${isBonus ? ' — Hub Bonus!' : ''}. Still your turn!`, 
        type: 'success' 
      });
    }
  };

  if (geoData === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050507]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-cyan-400" size={48} />
          <p className="text-sm font-display tracking-widest text-cyan-300">INITIALIZING MAP DATA...</p>
        </div>
      </div>
    );
  }

  const winner = scores[1] > scores[2] ? 1 : scores[2] > scores[1] ? 2 : 0;

  return (
    <div className="min-h-screen text-[#E2E2E2] font-sans p-4 md:p-8 flex flex-col items-center relative overflow-hidden bg-[#050507]">
      <div className="w-full flex flex-col items-center">
        {/* Header */}
      <header className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex flex-col items-center md:items-start">
          <h1 className="text-4xl font-display font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">Geography Invaders</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300 font-medium">Central America Challenge</p>
            <span className="px-2 py-0.5 bg-cyan-900/30 text-cyan-400 text-[10px] border border-cyan-400/30 rounded-sm font-bold uppercase tracking-tighter">2 Players</span>
            <button 
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`p-1.5 rounded-md border transition-all ${voiceEnabled ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'bg-stone-900/50 border-stone-700 text-stone-500'}`}
              title={voiceEnabled ? "Disable Tactical Voice" : "Enable Tactical Voice"}
            >
              {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className={`flex flex-col items-center px-4 py-2 rounded-xl border transition-all ${currentPlayer === 1 ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-105' : 'opacity-30 border-transparent'}`}>
            <div className="flex items-center gap-2">
              <Alien className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-widest font-bold font-display">Player 1</span>
            </div>
            <span className="text-2xl font-mono font-medium">{scores[1]}</span>
          </div>
          
          <div className={`flex flex-col items-center px-4 py-2 rounded-xl border transition-all ${currentPlayer === 2 ? 'bg-purple-500/10 border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)] scale-105' : 'opacity-30 border-transparent'}`}>
            <div className="flex items-center gap-2">
              <Alien className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-widest font-bold font-display">Player 2</span>
            </div>
            <span className="text-2xl font-mono font-medium">{scores[2]}</span>
          </div>

          <button 
            onClick={resetGame}
            className="p-3 rounded-xl border border-white/10 hover:bg-white/10 hover:border-white/30 transition-all text-white/60 hover:text-white"
            title="Reset Game"
          >
            <RefreshCcw size={20} />
          </button>
        </div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Map Area */}
        <div className="lg:col-span-8 bg-[#121214]/60 backdrop-blur-md rounded-[32px] shadow-2xl border border-white/5 p-6 relative overflow-hidden aspect-[4/3] flex items-center justify-center">
          {/* Turn Indicator Overlay */}
          <div className={`absolute top-6 left-6 z-10 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg border ${currentPlayer === 1 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-purple-500/20 border-purple-500 text-purple-400'}`}>
            <Alien className="w-4 h-4" />
            Player {currentPlayer}'s Turn
          </div>

          <svg 
            ref={mapRef}
            viewBox="0 0 800 600" 
            className="w-full h-full drop-shadow-2xl pointer-events-auto"
            style={{ filter: 'drop-shadow(0 0 30px rgba(0,0,0,0.5))' }}
          >
            <defs>
              <clipPath id="map-clip">
                <rect width="800" height="600" rx="20" />
              </clipPath>
            </defs>

            {/* Background Ocean */}
            <rect width="800" height="600" fill="#0077BE" rx="20" />

            <g clipPath="url(#map-clip)">
              {/* Grid Lines (Subtle) */}
              <g className="opacity-[0.05] pointer-events-none">
                {Array.from({ length: 11 }).map((_, i) => (
                  <line key={`v-${i}`} x1={i * 80} y1="0" x2={i * 80} y2="600" stroke="cyan" strokeWidth="1" />
                ))}
                {Array.from({ length: 9 }).map((_, i) => (
                  <line key={`h-${i}`} x1="0" y1={i * 75} x2="800" y2={i * 75} stroke="cyan" strokeWidth="1" />
                ))}
              </g>
              
              {/* Background Countries (Mexico, Colombia, etc.) */}
              {backgroundCountries.map((country) => (
                <path
                  key={country.id}
                  d={country.path}
                  data-country-name={country.name}
                  className="fill-stone-200 stroke-stone-300 pointer-events-auto"
                  strokeWidth="1"
                />
              ))}

              {/* Target Countries (Ghost layer) */}
              {countries.map((country) => (
                <path
                  key={`ghost-${country.id}`}
                  d={country.path}
                  data-country-name={country.name}
                  className="fill-white stroke-stone-400"
                  strokeWidth="1.5"
                />
              ))}

              {/* Interactive Countries */}
              {countries.map((country) => {
                const p1Placed = player1Ids.includes(country.id);
                const p2Placed = player2Ids.includes(country.id);
                const isPlaced = p1Placed || p2Placed;
                
                return (
                  <g key={country.id}>
                    <path
                      d={country.path}
                      data-country-name={country.name}
                      className={`transition-all duration-500 ease-out cursor-default pointer-events-auto
                        ${p1Placed ? 'fill-emerald-500 stroke-emerald-300' : 
                          p2Placed ? 'fill-purple-500 stroke-purple-300' : 
                          'fill-white fill-opacity-[0.05] stroke-[#4A4A4F]'
                        }`}
                      strokeWidth="2"
                    />
                    {/* Hub Indicator */}
                    {turnHubId === country.id && (
                      <motion.circle
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        cx={country.labelPos.x}
                        cy={country.labelPos.y}
                        r="24"
                        className={`fill-none stroke-[4] pointer-events-none ${currentPlayer === 1 ? 'stroke-emerald-400/40' : 'stroke-purple-400/40'}`}
                        style={{ strokeDasharray: '6 3' }}
                      />
                    )}
                    {isPlaced && (
                      <motion.text
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        x={country.labelPos.x}
                        y={country.labelPos.y}
                        textAnchor="middle"
                        className={`text-[10px] font-bold font-display pointer-events-none uppercase tracking-tighter ${p1Placed ? 'fill-emerald-950' : 'fill-purple-950'}`}
                      >
                        {country.name}
                      </motion.text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Adjacency Hint Overlay */}
          <div className="absolute bottom-6 left-6 flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 text-[10px] uppercase tracking-widest font-bold text-cyan-300">
            <Info size={14} className="text-cyan-400" />
            <span>Target Hub Neighbors</span>
          </div>
        </div>

        {/* Controls / Draggable Items */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Status Message */}
          <motion.div 
            key={message.text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border backdrop-blur-md flex items-start gap-3 ${
              message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' :
              message.type === 'error' ? 'bg-rose-500/10 border-rose-500/50 text-rose-400' :
              'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
            }`}
          >
            {message.type === 'success' && <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
            {message.type === 'error' && <AlertCircle size={18} className="mt-0.5 shrink-0" />}
            {message.type === 'info' && <Info size={18} className="mt-0.5 shrink-0" />}
            <p className="text-xs font-bold font-display uppercase tracking-wider leading-tight">{message.text}</p>
          </motion.div>

          {/* Draggable List */}
          <div className="bg-[#121214]/60 backdrop-blur-md rounded-[32px] p-6 border border-white/5 shadow-xl">
            <h2 className="text-xs uppercase tracking-[0.3em] font-bold text-cyan-300 mb-6 font-display">Available Sectors</h2>
            
            <div className="flex flex-wrap gap-3">
              <AnimatePresence mode="popLayout">
                {availableCountries.length > 0 ? (
                  availableCountries.map((country) => (
                    <motion.div
                      key={country.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      drag
                      dragMomentum={false}
                      dragSnapToOrigin
                      onDragStart={() => handleDragStart(country)}
                      onDragEnd={(e, info) => handleDragEnd(e, info, country)}
                      whileDrag={{ scale: 1.1, zIndex: 50, pointerEvents: 'none' }}
                      className="px-5 py-3 bg-[#1A1A1F]/60 hover:bg-[#2A2A2F]/80 text-cyan-400 rounded-xl cursor-grab active:cursor-grabbing border border-cyan-400/20 text-sm font-bold font-display shadow-[0_0_10px_rgba(34,211,238,0.1)] hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] select-none"
                    >
                      {country.name}
                    </motion.div>
                  ))
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full py-12 flex flex-col items-center justify-center text-center gap-4"
                  >
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center border-2 ${
                      winner === 1 ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 
                      winner === 2 ? 'bg-purple-500/10 border-purple-500 text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 
                      'bg-stone-500/10 border-stone-500 text-stone-400'
                    }`}>
                      <Alien className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-display font-black tracking-tighter uppercase">
                        {winner === 0 ? "STALEMATE" : `PLAYER ${winner} DOMINATES`}
                      </h3>
                      <p className="text-xs font-mono opacity-60 mt-1">
                        FINAL SCORE — P1: {scores[1]} | P2: {scores[2]}
                      </p>
                    </div>
                    <button 
                      onClick={resetGame}
                      className="mt-4 px-8 py-3 bg-cyan-500 text-black rounded-lg text-sm font-black font-display uppercase tracking-widest hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                    >
                      RE-ENGAGE
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-[#0A0A0B]/60 backdrop-blur-md border border-cyan-400/20 rounded-[32px] p-6 shadow-[inset_0_0_20px_rgba(34,211,238,0.05)]">
            <h3 className="text-xs uppercase tracking-[0.3em] font-black text-cyan-300 font-display mb-4">Tactical Briefing</h3>
            <ul className="space-y-4 text-xs font-medium text-cyan-100">
              <li className="flex gap-3">
                <span className="text-cyan-400 font-mono font-bold">01</span>
                <span className="leading-relaxed">Establish a <span className="text-cyan-400 font-bold">HUB</span> by deploying to any available sector.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-cyan-400 font-mono font-bold">02</span>
                <span className="leading-relaxed">Expand territory by deploying to sectors <span className="text-cyan-400 font-bold">ADJACENT</span> to your current Hub.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-cyan-400 font-mono font-bold">03</span>
                <span className="leading-relaxed">Secure <span className="text-cyan-400 font-bold">BONUS DATA</span> (+2 pts) for each neighbor captured.</span>
              </li>
            </ul>
          </div>
        </div>
      </main>

      </div>

      {/* Footer */}
      <footer className="mt-auto pt-12 pb-6 text-center opacity-30 text-[10px] uppercase tracking-[0.5em] font-display font-bold text-cyan-400">
        GEOGRAPHY INVADERS // CENTRAL AMERICA OPS &copy; 2026
      </footer>
    </div>
  );
}
