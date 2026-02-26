import React, { useMemo } from 'react';
import { BsfSymbol, BsfLine, BsfText } from '../types';

interface BsfViewerProps {
  data: BsfSymbol;
}

const PORT_COLORS = {
  input: "#2563eb",   // Blue
  output: "#059669",  // Green
  bidir: "#9333ea"    // Purple
};

const BsfViewer: React.FC<BsfViewerProps> = ({ data }) => {
  
  const viewBox = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const expand = (x: number, y: number) => {
        if (!isNaN(x)) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
        }
        if (!isNaN(y)) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    };

    data.drawing.lines.forEach(l => {
      expand(l.p1.x, l.p1.y);
      expand(l.p2.x, l.p2.y);
    });

    data.ports.forEach(p => {
        expand(p.location.x, p.location.y);
        p.lines.forEach(l => {
            expand(l.p1.x, l.p1.y);
            expand(l.p2.x, l.p2.y);
        });
    });
    
    [...data.drawing.texts, ...data.mainTexts].forEach(t => {
       expand(t.rect.x1, t.rect.y1);
       expand(t.rect.x2, t.rect.y2);
    });

    const symWidth = Math.abs(data.bounds.x2 - data.bounds.x1);
    const symHeight = Math.abs(data.bounds.y2 - data.bounds.y1);
    expand(0, 0);
    expand(symWidth, symHeight);

    const padding = 20;
    
    if (minX === Infinity) return "-20 -20 200 200";

    const width = (maxX - minX) + (padding * 2);
    const height = (maxY - minY) + (padding * 2);
    
    return `${minX - padding} ${minY - padding} ${width} ${height}`;

  }, [data]);

  const renderLine = (l: BsfLine, index: number, color: string, widthMultiplier: number = 1) => (
    <line 
      key={`line-${index}`}
      x1={l.p1.x} 
      y1={l.p1.y} 
      x2={l.p2.x} 
      y2={l.p2.y} 
      stroke={color} 
      strokeWidth={Math.max(l.width * widthMultiplier, 1)}
      strokeLinecap="square"
    />
  );

  const renderText = (t: BsfText, index: number, color: string, fontWeight: string = "normal") => {
     const cx = (t.rect.x1 + t.rect.x2) / 2;
     const cy = (t.rect.y1 + t.rect.y2) / 2;
     const fontSize = t.font.size * 1.2; 
     
     return (
        <text 
            key={`text-${index}`}
            x={cx}
            y={cy}
            dy="0.35em"
            textAnchor="middle"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize={fontSize}
            fill={color}
            fontWeight={fontWeight}
            style={{ userSelect: 'none' }}
        >
            {t.value}
        </text>
     );
  };

  const symWidth = Math.abs(data.bounds.x2 - data.bounds.x1);
  const symHeight = Math.abs(data.bounds.y2 - data.bounds.y1);

  return (
    <div className="w-full h-full flex items-center justify-center bg-white border rounded-lg shadow-inner overflow-hidden p-4 relative">
      <svg viewBox={viewBox} className="w-full h-full max-w-4xl" preserveAspectRatio="xMidYMid meet">
        
        <rect 
            x={0} 
            y={0} 
            width={symWidth} 
            height={symHeight} 
            fill="none" 
            stroke="#008080" 
            strokeWidth="1" 
            strokeDasharray="2 2"
            opacity="0.5"
        />

        <g className="main-texts">
             {data.mainTexts.map((t, i) => renderText(t, i, "#800080", "normal"))} 
        </g>

        <g className="drawing-lines">
            {data.drawing.lines.map((l, i) => renderLine(l, i, "#000000", 1.5))} 
        </g>

        <g className="drawing-texts">
            {data.drawing.texts.map((t, i) => renderText(t, i, "#008000"))}
        </g>
        
        {data.ports.map((port, i) => {
            const portColor = PORT_COLORS[port.type] || "#0000FF";
            return (
                <g key={`port-${i}`} className="port">
                    {port.lines.map((l, j) => renderLine(l, j, portColor, 1.2))}
                    
                    {Array.from(new Map(port.texts.map(t => [t.value, t] as [string, BsfText])).values()).map((t: BsfText, j) => 
                       renderText(t, j, portColor)
                    )}

                    <g transform={`translate(${port.location.x}, ${port.location.y})`}>
                        <line x1="-3" y1="-3" x2="3" y2="3" stroke={portColor} strokeWidth="1" />
                        <line x1="-3" y1="3" x2="3" y2="-3" stroke={portColor} strokeWidth="1" />
                    </g>
                </g>
            );
        })}

      </svg>
    </div>
  );
};

export default BsfViewer;