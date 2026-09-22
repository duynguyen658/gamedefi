import React from 'react';

interface DrumOrnamentProps {
  className?: string;
  size?: number;
  animate?: boolean;
}

export const DrumOrnament: React.FC<DrumOrnamentProps> = ({ 
  className = '', 
  size = 400,
  animate = true 
}) => {
  return (
    <div 
      className={`relative flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 200 200"
        className={`w-full h-full text-amber-500/25 ${animate ? 'animate-spin-slow' : ''}`}
        fill="none"
        stroke="currentColor"
      >
        {/* Vành ngoài cùng */}
        <circle cx="100" cy="100" r="96" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        <circle cx="100" cy="100" r="91" strokeWidth="2" opacity="0.8" />
        <circle cx="100" cy="100" r="85" strokeWidth="1" strokeDasharray="1 3" />

        {/* Họa tiết chim Lạc bay quanh mặt trời */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 45 * Math.PI) / 180;
          const x = 100 + 72 * Math.cos(angle);
          const y = 100 + 72 * Math.sin(angle);
          return (
            <g key={`lac-${i}`} transform={`rotate(${i * 45 + 90} ${x} ${y})`}>
              <path
                d={`M ${x - 5} ${y} Q ${x} ${y - 8} ${x + 8} ${y} Q ${x} ${y + 3} ${x - 5} ${y}`}
                fill="currentColor"
                opacity="0.75"
              />
              <path d={`M ${x + 8} ${y} L ${x + 14} ${y - 2}`} strokeWidth="1" opacity="0.8" />
            </g>
          );
        })}

        {/* Vòng tròn đồng tâm thứ 2 */}
        <circle cx="100" cy="100" r="62" strokeWidth="1.5" opacity="0.7" />
        <circle cx="100" cy="100" r="54" strokeWidth="1" strokeDasharray="2 2" />

        {/* Vành sao 12 hoặc 14 cánh biểu tượng mặt trời Đông Sơn */}
        <circle cx="100" cy="100" r="38" strokeWidth="1.5" opacity="0.9" />
        {Array.from({ length: 12 }).map((_, i) => {
          const deg = i * 30;
          return (
            <g key={`ray-${i}`} transform={`rotate(${deg} 100 100)`}>
              <polygon
                points="100,64 96,75 104,75"
                fill="currentColor"
                opacity="0.85"
              />
            </g>
          );
        })}

        {/* Tâm mặt trời */}
        <circle cx="100" cy="100" r="22" strokeWidth="2" opacity="0.9" />
        <circle cx="100" cy="100" r="10" fill="currentColor" opacity="0.4" />
        <circle cx="100" cy="100" r="4" fill="currentColor" opacity="0.8" />
      </svg>
    </div>
  );
};
