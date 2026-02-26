
import React, { useState } from 'react';
import { SymbolInstance, BsfLine, BsfText } from '../types';

interface SchematicSymbolProps {
  instance: SymbolInstance;
  isSelected: boolean;
  highlightedPortIndex?: number;
  startingPortIndex?: number;
  onStart: (e: React.MouseEvent | React.TouchEvent, instanceId: string) => void;
  onPortStart: (e: React.MouseEvent | React.TouchEvent, instanceId: string, portIndex: number, location: {x: number, y: number}) => void;
  onPortClick: (e: React.MouseEvent | React.TouchEvent, instanceId: string, portIndex: number, location: {x: number, y: number}) => void;
  onEditGlue?: (instanceId: string) => void;
}

const PORT_COLORS = {
  input: "#2563eb",   // Blue
  output: "#059669",  // Green
  bidir: "#9333ea"    // Purple
};

const SchematicSymbol: React.FC<SchematicSymbolProps> = ({ 
  instance, 
  isSelected, 
  highlightedPortIndex = -1,
  startingPortIndex = -1,
  onStart, 
  onPortStart,
  onPortClick,
  onEditGlue
}) => {
  const { data, x, y, instanceName, isGlueLogic } = instance;
  const [hoveredPortIndex, setHoveredPortIndex] = useState<number | null>(null);

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
            style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
            {t.value}
        </text>
     );
  };

  const symWidth = Math.abs(data.bounds.x2 - data.bounds.x1);
  const symHeight = Math.abs(data.bounds.y2 - data.bounds.y1);

  return (
    <g transform={`translate(${x}, ${y})`}>
      <text
        x={symWidth / 2}
        y={-10}
        textAnchor="middle"
        fontSize="12"
        fontWeight="bold"
        fill={isGlueLogic ? "#b45309" : "#374151"}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {instanceName}
      </text>

      <g 
        onMouseDown={(e) => onStart(e, instance.id)}
        onTouchStart={(e) => onStart(e, instance.id)}
        onDoubleClick={() => isGlueLogic && onEditGlue?.(instance.id)}
        className="cursor-move"
      >
        {isSelected && (
           <rect 
             x={-4} y={-4} width={symWidth + 8} height={symHeight + 8}
             fill="none" stroke="#ef4444" strokeWidth="2"
             className="drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"
           />
        )}

        <rect 
          x={0} y={0} width={symWidth} height={symHeight} 
          fill={isGlueLogic ? "#fffbeb" : "white"} 
          stroke={isSelected ? "#ef4444" : "#475569"}
          strokeWidth={isSelected ? "2" : "1"}
        />

        {isGlueLogic ? (
          <g>
            <rect x={0} y={0} width={symWidth} height={symHeight} fill="none" stroke="#d97706" strokeWidth="1.5" />
            <text x={symWidth/2} y={symHeight/2} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#92400e">VHDL GLUE</text>
          </g>
        ) : (
          <g>
            <g className="main-texts">
                 {data.mainTexts.map((t, i) => renderText(t, i, "#800080", "normal"))} 
            </g>
            <g className="drawing-lines">
                {data.drawing.lines.map((l, i) => renderLine(l, i, "#000000", 1.5))} 
            </g>
            <g className="drawing-texts">
                {data.drawing.texts.map((t, i) => renderText(t, i, "#008000"))}
            </g>
          </g>
        )}
      </g>

      {data.ports.map((port, i) => {
         const portX = port.location.x;
         const portY = port.location.y;
         const isHighlighted = highlightedPortIndex === i;
         const isStart = startingPortIndex === i;
         const isHovered = hoveredPortIndex === i;
         const portColor = PORT_COLORS[port.type] || "#0000FF";
         
         return (
            <g key={`port-${i}`} className="cursor-crosshair">
                {port.lines.map((l, j) => renderLine(l, j, portColor, 1.5))}
                {port.texts.map((t, j) => renderText(t, j, portColor))}
                
                {/* Visual Terminal Indicator (Crosshair) */}
                {(isHovered || isHighlighted || isStart) && (
                  <g pointerEvents="none">
                    <line x1={portX - 4} y1={portY} x2={portX + 4} y2={portY} stroke={isStart || isHighlighted ? "#ef4444" : portColor} strokeWidth="2" />
                    <line x1={portX} y1={portY - 4} x2={portX} y2={portY + 4} stroke={isStart || isHighlighted ? "#ef4444" : portColor} strokeWidth="2" />
                    <circle cx={portX} cy={portY} r={3} fill={isStart || isHighlighted ? "#ef4444" : "white"} stroke={isStart || isHighlighted ? "#ef4444" : portColor} strokeWidth="1" />
                  </g>
                )}

                {/* Invisible Hit Area (Larger than visual handle) */}
                <circle 
                    cx={portX} 
                    cy={portY} 
                    r={10} 
                    fill="transparent" 
                    onMouseEnter={() => setHoveredPortIndex(i)}
                    onMouseLeave={() => setHoveredPortIndex(null)}
                    onMouseDown={(e) => { 
                      e.stopPropagation(); 
                      onPortStart(e, instance.id, i, { x: x + portX, y: y + portY }); 
                    }}
                    onMouseUp={(e) => { 
                      e.stopPropagation(); 
                      onPortClick(e, instance.id, i, { x: x + portX, y: y + portY }); 
                    }}
                />
            </g>
         );
      })}
    </g>
  );
};

export default SchematicSymbol;
