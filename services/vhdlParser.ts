
import { BsfSymbol, BsfPort, BsfText } from '../types';

interface ParsedPort {
    name: string;
    direction: string;
    width: number;
}

export function parseVHDL(vhdlText: string): BsfSymbol | null {
  const lines = vhdlText.split('\n')
    .map(line => line.split('--')[0].trim())
    .filter(line => line.length > 0);
  
  const cleanedVHDL = lines.join(' ');
  const entityMatch = /entity\s+(\w+)\s+is/i.exec(cleanedVHDL);
  if (!entityMatch) return null;
  const entityName = entityMatch[1];
  const searchStartIndex = entityMatch.index + entityMatch[0].length;
  const portStartRegex = /port\s*\(/i;
  const portStartMatch = portStartRegex.exec(cleanedVHDL.substring(searchStartIndex));
  
  if (!portStartMatch) return createSymbol(entityName, []);

  const portBlockStartIndex = searchStartIndex + portStartMatch.index + portStartMatch[0].length;
  let depth = 1;
  let portBlockEndIndex = -1;
  for (let i = portBlockStartIndex; i < cleanedVHDL.length; i++) {
    const char = cleanedVHDL[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (depth === 0) { portBlockEndIndex = i; break; }
  }

  if (portBlockEndIndex === -1) return createSymbol(entityName, []);
  const portContent = cleanedVHDL.substring(portBlockStartIndex, portBlockEndIndex);
  const statements = portContent.split(';').map(s => s.trim()).filter(s => s.length > 0);
  const ports: ParsedPort[] = [];

  statements.forEach(stmt => {
    if (!stmt.includes(':')) return;
    const [namesPart, rest] = stmt.split(':');
    const names = namesPart.split(',').map(n => n.trim()).filter(n => n);
    const dirTypeMatch = /^\s*(in|out|inout|buffer)\s+(.*)$/i.exec(rest.trim());
    if (!dirTypeMatch) return;
    const direction = dirTypeMatch[1].toLowerCase();
    const fullType = dirTypeMatch[2].split(':=')[0].trim();
    let width = 1;
    const vectorMatch = /vector\s*\(\s*(\d+)\s+downto\s+(\d+)\s*\)/i.exec(fullType);
    if (vectorMatch) {
        const high = parseInt(vectorMatch[1], 10);
        const low = parseInt(vectorMatch[2], 10);
        width = Math.abs(high - low) + 1;
    }
    names.forEach(name => { ports.push({ name, direction, width }); });
  });

  return createSymbol(entityName, ports);
}

function createSymbol(name: string, parsedPorts: ParsedPort[]): BsfSymbol {
    const pigtail = 16;
    const portPitch = 16;
    const topMargin = 24;
    const bottomMargin = 16;
    const inputs = parsedPorts.filter(p => p.direction === 'in');
    const outputs = parsedPorts.filter(p => p.direction !== 'in');
    const maxPorts = Math.max(inputs.length, outputs.length);
    const contentHeight = (maxPorts > 0 ? (maxPorts - 1) * portPitch : 0);
    const bodyHeight = topMargin + contentHeight + bottomMargin;
    const charWidth = 7;
    const maxInputLen = inputs.reduce((acc, p) => Math.max(acc, p.name.length + (p.width > 1 ? 5 : 0)), 0);
    const maxOutputLen = outputs.reduce((acc, p) => Math.max(acc, p.name.length + (p.width > 1 ? 5 : 0)), 0);
    const minBodyWidth = 60;
    const centerGap = 20;
    const calcBodyWidth = (maxInputLen * charWidth) + centerGap + (maxOutputLen * charWidth);
    const bodyWidth = Math.max(minBodyWidth, Math.ceil(calcBodyWidth / 10) * 10);
    const totalWidth = bodyWidth + (2 * pigtail);
    const totalHeight = bodyHeight;
    const bsfPorts: BsfPort[] = [];
    
    inputs.forEach((p, i) => {
        const y = topMargin + (i * portPitch);
        const label = p.width > 1 ? `${p.name}[${p.width-1}..0]` : p.name;
        bsfPorts.push({
            name: p.name, width: p.width, type: 'input', location: { x: 0, y },
            lines: [{ p1: { x: 0, y }, p2: { x: pigtail, y }, width: 1 }],
            texts: [{ value: label, rect: { x1: pigtail + 4, y1: y - 6, x2: pigtail + 4 + (label.length * 6), y2: y + 6 }, font: { family: 'Arial', size: 8 } }]
        });
    });

    outputs.forEach((p, i) => {
        const y = topMargin + (i * portPitch);
        const label = p.width > 1 ? `${p.name}[${p.width-1}..0]` : p.name;
        const type = p.direction === 'inout' ? 'bidir' : 'output';
        const labelWidth = label.length * 6;
        bsfPorts.push({
            name: p.name, width: p.width, type: type, location: { x: totalWidth, y },
            lines: [{ p1: { x: totalWidth - pigtail, y }, p2: { x: totalWidth, y }, width: 1 }],
            texts: [{ value: label, rect: { x1: totalWidth - pigtail - 4 - labelWidth, y1: y - 6, x2: totalWidth - pigtail - 4, y2: y + 6 }, font: { family: 'Arial', size: 8 } }]
        });
    });

    const titleWidth = name.length * 8;
    const titleX = totalWidth / 2;

    return {
        name: name, version: '1.0', bounds: { x1: 0, y1: 0, x2: totalWidth, y2: totalHeight },
        ports: bsfPorts,
        drawing: {
            lines: [
                { p1: {x: pigtail, y: 0}, p2: {x: totalWidth - pigtail, y: 0}, width: 1 },
                { p1: {x: totalWidth - pigtail, y: 0}, p2: {x: totalWidth - pigtail, y: totalHeight}, width: 1 },
                { p1: {x: totalWidth - pigtail, y: totalHeight}, p2: {x: pigtail, y: totalHeight}, width: 1 },
                { p1: {x: pigtail, y: totalHeight}, p2: {x: pigtail, y: 0}, width: 1 },
            ],
            rectangles: [], circles: [],
            texts: [{ value: name, rect: { x1: titleX - (titleWidth/2), y1: 2, x2: titleX + (titleWidth/2), y2: 18 }, font: { family: 'Arial', size: 10 } }]
        },
        mainTexts: []
    };
}
