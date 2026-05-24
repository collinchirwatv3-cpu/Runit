import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';

const LIME = '#c8f000';

// ─── Street network ────────────────────────────────────────────────────────
// Viewbox: 800 × 920
// The ON button sits at approx x=400 (centre) y=530 (55-60% down).
// A main N-S artery runs at x=400 and a main E-W artery at y=530
// so the button is always on a prominent intersection.

const MAIN_H = [95, 260, 420, 530, 650, 790];   // main east–west roads
const MAIN_V = [80, 210, 400, 580, 720];          // main north–south roads

// Side streets fill in the blocks
const SIDE_H = [155, 190, 320, 360, 474, 590, 618, 718, 758];
const SIDE_V = [135, 165, 290, 340, 460, 498, 640, 685, 750];

// Diagonal roads (Cape-Town-style oblique streets)
const DIAGONALS = [
  'M -20 180 C 120 260 280 310 400 350 C 520 388 680 380 830 330',
  'M -20 620 C 100 570 240 540 400 530 C 560 522 700 550 830 590',
  'M 130 -10 C 190 120 230 270 240 420 C 250 560 220 700 180 930',
  'M 650 -10 C 620 130 610 290 600 420 C 590 560 620 700 660 930',
];

// City block fills (very slightly lighter than BG, drawn before streets)
function buildBlocks() {
  const allH = [...MAIN_H, ...SIDE_H].sort((a, b) => a - b);
  const allV = [...MAIN_V, ...SIDE_V].sort((a, b) => a - b);
  const blocks = [];
  for (let r = 0; r < allH.length - 1; r++) {
    for (let c = 0; c < allV.length - 1; c++) {
      const x = allV[c] + 1.5;
      const y = allH[r] + 1.5;
      const w = allV[c + 1] - allV[c] - 3;
      const h = allH[r + 1] - allH[r] - 3;
      if (w > 4 && h > 4) blocks.push({ x, y, w, h });
    }
  }
  return blocks;
}
const BLOCKS = buildBlocks();

// ─── Web SVG map ───────────────────────────────────────────────────────────
function WebMap() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <svg
        viewBox="0 0 800 920"
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Radial vignette — centre is at the ON button position */}
          <radialGradient id="vignette" cx="50%" cy="58%" r="60%">
            <stop offset="0%" stopColor="#080808" stopOpacity="0" />
            <stop offset="75%" stopColor="#080808" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#080808" stopOpacity="0.92" />
          </radialGradient>
        </defs>

        {/* Opacity wrapper — entire map at 9% */}
        <g opacity="0.09">

          {/* City blocks */}
          {BLOCKS.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h}
              fill={LIME} fillOpacity="0.06" />
          ))}

          {/* Diagonal roads */}
          {DIAGONALS.map((d, i) => (
            <path key={i} d={d} stroke={LIME} strokeWidth="1.2"
              fill="none" strokeOpacity="0.55" />
          ))}

          {/* Side streets */}
          {SIDE_H.map((y, i) => (
            <line key={'sh' + i} x1="0" y1={y} x2="800" y2={y}
              stroke={LIME} strokeWidth="0.6" strokeOpacity="0.5" />
          ))}
          {SIDE_V.map((x, i) => (
            <line key={'sv' + i} x1={x} y1="0" x2={x} y2="920"
              stroke={LIME} strokeWidth="0.6" strokeOpacity="0.5" />
          ))}

          {/* Main arteries */}
          {MAIN_H.map((y, i) => (
            <line key={'mh' + i} x1="0" y1={y} x2="800" y2={y}
              stroke={LIME} strokeWidth="1.4" />
          ))}
          {MAIN_V.map((x, i) => (
            <line key={'mv' + i} x1={x} y1="0" x2={x} y2="920"
              stroke={LIME} strokeWidth="1.4" />
          ))}

          {/* Intersection dots at main junctions */}
          {MAIN_H.map(y =>
            MAIN_V.map(x => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5"
                fill={LIME} fillOpacity="0.9" />
            ))
          )}

          {/* Highlighted pin intersection — aligns with ON button */}
          <circle cx="400" cy="530" r="5" fill={LIME} fillOpacity="1" />
          <circle cx="400" cy="530" r="12" fill={LIME} fillOpacity="0.18" />
          <circle cx="400" cy="530" r="20" fill={LIME} fillOpacity="0.07" />

        </g>

        {/* Vignette overlay on top — edges fade to black */}
        <rect x="0" y="0" width="800" height="920" fill="url(#vignette)" />
      </svg>
    </View>
  );
}

// ─── Native fallback (View-based grid) ────────────────────────────────────
function NativeMap() {
  const allH = [...MAIN_H, ...SIDE_H].sort((a, b) => a - b);
  const allV = [...MAIN_V, ...SIDE_V].sort((a, b) => a - b);
  const isMainH = new Set(MAIN_H);
  const isMainV = new Set(MAIN_V);

  return (
    <View style={[StyleSheet.absoluteFill, { opacity: 0.09 }]} pointerEvents="none">
      {allH.map(y => (
        <View key={'h' + y} style={{
          position: 'absolute', left: 0, right: 0,
          top: `${(y / 920) * 100}%`,
          height: isMainH.has(y) ? 1.5 : 0.7,
          backgroundColor: LIME,
        }} />
      ))}
      {allV.map(x => (
        <View key={'v' + x} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${(x / 800) * 100}%`,
          width: isMainV.has(x) ? 1.5 : 0.7,
          backgroundColor: LIME,
        }} />
      ))}
    </View>
  );
}

export default function CityMapBackground() {
  return Platform.OS === 'web' ? <WebMap /> : <NativeMap />;
}
