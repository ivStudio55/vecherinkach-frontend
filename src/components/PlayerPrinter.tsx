'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

interface PlayerPrinterProps {
  onPlayerJoin?: (name: string) => void;
}

export interface PlayerPrinterRef {
  addPaper: (name: string) => void;
}

export const PlayerPrinter = forwardRef<PlayerPrinterRef, PlayerPrinterProps>(({ onPlayerJoin }, ref) => {
  const [papers, setPapers] = useState<string[]>([]);

  useImperativeHandle(ref, () => ({
    addPaper: (name: string) => {
      setPapers(prev => [...prev, name]);
      setTimeout(() => {
        setPapers(prev => prev.slice(1));
      }, 2000);
    },
  }));

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const eyes = document.querySelectorAll('.player-printer .eye');
      const printer = document.querySelector('.player-printer');
      if (!printer) return;
      const rect = printer.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      eyes.forEach(eye => {
        const eyeRect = (eye as HTMLElement).getBoundingClientRect();
        const eyeX = eyeRect.left + eyeRect.width / 2;
        const eyeY = eyeRect.top + eyeRect.height / 2;

        const angle = Math.atan2(e.clientY - eyeY, e.clientX - eyeX);
        const dx = Math.cos(angle) * 2;
        const dy = Math.sin(angle) * 2;

        const pupil = eye.querySelector('.pupil') as HTMLElement;
        if (pupil) {
          pupil.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const addPaper = (name: string) => {
    setPapers(prev => [...prev, name]);
    setTimeout(() => {
      setPapers(prev => prev.slice(1));
    }, 2000); // Remove after animation
  };



  return (
    <div className="player-printer" style={{ width: '140px', height: '160px', position: 'relative', marginRight: '20px' }}>
      <div className="top" style={{
        width: '120px',
        height: '24px',
        background: '#555',
        borderRadius: '6px 6px 0 0',
        position: 'absolute',
        top: 0,
        left: '10px'
      }}></div>
      <div className="middle" style={{
        width: '140px',
        height: '100px',
        background: '#333',
        borderRadius: '0 0 8px 8px',
        position: 'absolute',
        top: '24px',
        left: 0
      }}></div>
      <div className="tray" style={{
        width: '100px',
        height: '10px',
        background: '#444',
        position: 'absolute',
        bottom: '-12px',
        left: '20px',
        borderRadius: '2px'
      }}></div>
      <div className="eye left" style={{
        position: 'absolute',
        width: '12px',
        height: '12px',
        background: 'white',
        borderRadius: '50%',
        border: '2px solid black',
        top: '-8px',
        left: '40px',
        zIndex: 10,
        transition: 'transform 0.2s ease'
      }}>
        <div className="pupil" style={{
          position: 'absolute',
          width: '6px',
          height: '6px',
          background: 'black',
          borderRadius: '50%',
          top: '3px',
          left: '3px'
        }}></div>
      </div>
      <div className="eye right" style={{
        position: 'absolute',
        width: '12px',
        height: '12px',
        background: 'white',
        borderRadius: '50%',
        border: '2px solid black',
        top: '-8px',
        right: '40px',
        zIndex: 10,
        transition: 'transform 0.2s ease'
      }}>
        <div className="pupil" style={{
          position: 'absolute',
          width: '6px',
          height: '6px',
          background: 'black',
          borderRadius: '50%',
          top: '3px',
          left: '3px'
        }}></div>
      </div>
      <div className="led" style={{
        width: '8px',
        height: '8px',
        background: '#2ecc71',
        borderRadius: '50%',
        position: 'absolute',
        top: '8px',
        right: '12px',
        boxShadow: '0 0 6px #2ecc71',
        animation: 'blink 1.5s infinite'
      }}></div>
      {papers.map((name, index) => (
        <div
          key={index}
          className="paper"
          style={{
            width: '100px',
            height: '140px',
            background: 'white',
            position: 'absolute',
            top: '24px',
            left: '20px',
            borderRadius: '2px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#333',
            transform: 'translateY(0)',
            transition: 'transform 1.2s ease-out',
            zIndex: 1
          }}
        >
          {name}
        </div>
      ))}
      <style jsx>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .paper {
          animation: print 1.2s ease-out forwards;
        }
        @keyframes print {
          0% { transform: translateY(0); }
          100% { transform: translateY(120px); }
        }
      `}</style>
    </div>
  );
});