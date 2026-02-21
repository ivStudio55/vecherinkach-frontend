'use client';

import React, { useEffect, useState } from 'react';

export function ComicBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#ff9a3c] pointer-events-none">
      {/* Sunburst Background */}
      <div className="absolute inset-[-50%] animate-[spin_60s_linear_infinite] opacity-40">
        <div className="w-full h-full" style={{
          background: 'repeating-conic-gradient(from 0deg, transparent 0deg 15deg, #ff5757 15deg 30deg)'
        }} />
      </div>

      {/* Halftone Dots Overlay */}
      <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{
        backgroundImage: 'radial-gradient(#000 2px, transparent 2.5px)',
        backgroundSize: '12px 12px'
      }} />

      {/* Floating Geometric Shapes (Memphis Style) */}
      <div className="absolute inset-0">
        {/* Shape 1: Yellow Star */}
        <svg className="absolute top-[10%] left-[15%] w-24 h-24 animate-[float_6s_ease-in-out_infinite] drop-shadow-[4px_4px_0_#000]" viewBox="0 0 100 100">
          <polygon points="50,5 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35" fill="#ffde00" stroke="#000" strokeWidth="4" />
        </svg>

        {/* Shape 2: Blue Triangle */}
        <svg className="absolute top-[20%] right-[20%] w-20 h-20 animate-[float_8s_ease-in-out_infinite_1s] drop-shadow-[4px_4px_0_#000] rotate-12" viewBox="0 0 100 100">
          <polygon points="50,10 90,90 10,90" fill="#00c3ff" stroke="#000" strokeWidth="4" />
        </svg>

        {/* Shape 3: Pink Circle */}
        <svg className="absolute bottom-[30%] left-[10%] w-16 h-16 animate-[float_7s_ease-in-out_infinite_2s] drop-shadow-[4px_4px_0_#000]" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="#ff007f" stroke="#000" strokeWidth="4" />
        </svg>

        {/* Shape 4: Green Zig-Zag */}
        <svg className="absolute bottom-[15%] right-[15%] w-24 h-24 animate-[float_9s_ease-in-out_infinite_0.5s] drop-shadow-[4px_4px_0_#000] -rotate-12" viewBox="0 0 100 100">
          <polyline points="10,50 30,20 50,80 70,20 90,50" fill="none" stroke="#4ade80" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Shape 5: Striped Circle */}
        <svg className="absolute top-[40%] left-[5%] w-20 h-20 animate-[float_10s_ease-in-out_infinite_1.5s] drop-shadow-[4px_4px_0_#000] rotate-45" viewBox="0 0 100 100">
          <defs>
            <pattern id="stripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="10" stroke="#000" strokeWidth="4" />
            </pattern>
          </defs>
          <circle cx="50" cy="50" r="40" fill="url(#stripes)" stroke="#000" strokeWidth="4" />
        </svg>

        {/* Shape 6: Yellow Square */}
        <svg className="absolute top-[60%] right-[5%] w-16 h-16 animate-[float_6.5s_ease-in-out_infinite_2.5s] drop-shadow-[4px_4px_0_#000] rotate-12" viewBox="0 0 100 100">
          <rect x="10" y="10" width="80" height="80" fill="#ffde00" stroke="#000" strokeWidth="4" rx="8" />
        </svg>
        
        {/* Shape 7: Pink Pill */}
        <svg className="absolute top-[5%] right-[40%] w-24 h-12 animate-[float_7.5s_ease-in-out_infinite_0.8s] drop-shadow-[4px_4px_0_#000] -rotate-12" viewBox="0 0 100 50">
          <rect x="5" y="5" width="90" height="40" fill="#ff007f" stroke="#000" strokeWidth="4" rx="20" />
        </svg>
      </div>
    </div>
  );
}
