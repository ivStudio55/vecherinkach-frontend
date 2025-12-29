'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

interface PlayerPrinterProps {
  onPlayerJoin?: (name: string) => void;
}

export interface PlayerPrinterRef {
  addPaper: (name: string) => void;
}

interface Paper {
  name: string;
  printed: boolean;
}

export const PlayerPrinter = forwardRef<PlayerPrinterRef, PlayerPrinterProps>(({ onPlayerJoin }, ref) => {
  const [papers, setPapers] = useState<Paper[]>([]);

  useImperativeHandle(ref, () => ({
    addPaper: (name: string) => {
      setPapers(prev => [...prev, { name, printed: false }]);
      setTimeout(() => {
        setPapers(prev => prev.map((p, i) => i === prev.length - 1 ? { ...p, printed: true } : p));
      }, 50);
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



  return (
    <div className="player-printer" style={{ width: '280px', height: '320px', position: 'relative', marginRight: '20px', marginTop: '-80px' }}>
      <div className="top" style={{
        width: '240px',
        height: '48px',
        background: '#555',
        borderRadius: '12px 12px 0 0',
        position: 'absolute',
        top: 0,
        left: '20px'
      }}></div>
      <div className="middle" style={{
        width: '280px',
        height: '200px',
        background: '#333',
        borderRadius: '0 0 16px 16px',
        position: 'absolute',
        top: '48px',
        left: 0
      }}>
        <img src="/qr-code.png" alt="QR код" style={{
          width: '120px',
          height: '120px',
          position: 'absolute',
          top: '40px',
          left: '80px'
        }} />
      </div>
      <div className="tray" style={{
        width: '200px',
        height: '20px',
        background: '#444',
        position: 'absolute',
        bottom: '-24px',
        left: '40px',
        borderRadius: '4px'
      }}></div>
      <div className="eye left" style={{
        position: 'absolute',
        width: '24px',
        height: '24px',
        background: 'white',
        borderRadius: '50%',
        border: '4px solid black',
        top: '-16px',
        left: '80px',
        zIndex: 10,
        transition: 'transform 0.2s ease'
      }}>
        <div className="pupil" style={{
          position: 'absolute',
          width: '12px',
          height: '12px',
          background: 'black',
          borderRadius: '50%',
          top: '6px',
          left: '6px'
        }}></div>
      </div>
      <div className="eye right" style={{
        position: 'absolute',
        width: '24px',
        height: '24px',
        background: 'white',
        borderRadius: '50%',
        border: '4px solid black',
        top: '-16px',
        right: '80px',
        zIndex: 10,
        transition: 'transform 0.2s ease'
      }}>
        <div className="pupil" style={{
          position: 'absolute',
          width: '12px',
          height: '12px',
          background: 'black',
          borderRadius: '50%',
          top: '6px',
          left: '6px'
        }}></div>
      </div>
      <div className="led" style={{
        width: '16px',
        height: '16px',
        background: '#2ecc71',
        borderRadius: '50%',
        position: 'absolute',
        top: '16px',
        right: '24px',
        boxShadow: '0 0 12px #2ecc71',
        animation: 'blink 1.5s infinite'
      }}></div>
      {papers.map((paper, index) => (
        <div
          key={`${paper.name}-${index}`}
          className={`paper ${paper.printed ? 'printed' : ''}`}
          style={{
            width: '200px',
            height: '280px',
            background: 'white',
            position: 'absolute',
            top: '0',
            left: '40px',
            borderRadius: '4px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: '48px',
            fontWeight: '900',
            color: '#333',
            transform: 'translateY(0)',
            transition: 'transform 2.4s ease-out',
            zIndex: 1
          }}
        >
          {paper.name}
        </div>
      ))}
      <style jsx>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .paper.printed {
          transform: translateY(288px) !important;
        }
      `}</style>
    </div>
  );
});