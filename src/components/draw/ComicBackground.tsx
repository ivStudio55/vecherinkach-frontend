"use client";

import React from 'react';

export default function ComicBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#FFD700] font-sans">
      {/* Halftone pattern overlay */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#000 2px, transparent 2.5px)',
          backgroundSize: '12px 12px',
          backgroundPosition: '0 0, 6px 6px'
        }}
      />

      {/* Animated Comic Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top Left Lightning */}
        <div className="absolute top-[-5%] left-[5%] w-32 h-48 bg-[#B266FF] border-[6px] border-black -rotate-12 animate-[float_6s_ease-in-out_infinite]"
             style={{ clipPath: 'polygon(50% 0%, 100% 0, 60% 40%, 100% 40%, 20% 100%, 40% 60%, 0 60%)' }} />
        
        {/* Top Right Explosion */}
        <div className="absolute top-[-10%] right-[-5%] w-64 h-64 bg-[#FF69B4] border-[6px] border-black rounded-full rotate-12 animate-[pulse_4s_ease-in-out_infinite]">
          <div className="absolute inset-2 bg-[#FFD700] border-[4px] border-black rounded-full" />
        </div>

        {/* Bottom Left Cross */}
        <div className="absolute bottom-[5%] left-[-5%] w-40 h-40 bg-[#00BFFF] border-[6px] border-black rotate-45 animate-[float_5s_ease-in-out_infinite]"
             style={{ clipPath: 'polygon(33% 0, 66% 0, 66% 33%, 100% 33%, 100% 66%, 66% 66%, 66% 100%, 33% 100%, 33% 66%, 0 66%, 0 33%, 33% 33%)' }} />

        {/* Bottom Right Exclamation */}
        <div className="absolute bottom-[10%] right-[5%] w-16 h-48 rotate-12 animate-[bounce_3s_ease-in-out_infinite]">
          <div className="w-full h-32 bg-[#B266FF] border-[6px] border-black mb-4 -skew-x-12" />
          <div className="w-full h-16 bg-[#B266FF] border-[6px] border-black rounded-full" />
        </div>

        {/* Stars */}
        <div className="absolute top-[20%] right-[15%] w-16 h-16 bg-[#FFB6C1] border-[4px] border-black rotate-45 animate-[spin_10s_linear_infinite]"
             style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />
        <div className="absolute bottom-[25%] left-[10%] w-20 h-20 bg-[#FFB6C1] border-[4px] border-black -rotate-12 animate-[spin_12s_linear_infinite_reverse]"
             style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl bg-white border-[8px] border-black rounded-3xl p-6 sm:p-10 shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] relative">
          {/* Inner Halftone Cloud (optional decorative) */}
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-white border-[6px] border-black rounded-full -z-10" />
          <div className="absolute -top-6 -left-16 w-24 h-24 bg-white border-[6px] border-black rounded-full -z-10" />
          
          {children}
        </div>
      </div>
    </div>
  );
}
