
import { BsfSymbol, BsfPort, BsfDrawing, BsfLine, BsfText, BsfRect, Point } from '../types';

// --- S-Expression Tokenizer & Parser ---

type SExpr = string | SExpr[];

function tokenize(input: string): string[] {
  // Add spaces around parentheses to split easily, handle quotes rudimentarily
  // This is a simplified tokenizer for the specific BSF format
  const tokens: string[] = [];
  let current = '';
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      if (char === '"') {
        inString = false;
        tokens.push(`"${current}"`);
        current = '';
      } else {
        current += char;
      }
      continue;
    }

    if (char === '(' || char === ')') {
      if (current.trim()) tokens.push(current.trim());
      tokens.push(char);
      current = '';
    } else if (char === '"') {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      inString = true;
    } else if (/\s/.test(char)) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function parseSExpr(tokens: string[]): SExpr {
  if (tokens.length === 0) return [];
  const token = tokens.shift()!;
  
  if (token === '(') {
    const list: SExpr[] = [];
    while (tokens.length > 0 && tokens[0] !== ')') {
      list.push(parseSExpr(tokens));
    }
    tokens.shift(); // consume ')'
    return list;
  } else if (token === ')') {
    throw new Error('Unexpected )');
  } else {
    // Remove quotes if present
    if (token.startsWith('"') && token.endsWith('"')) {
      return token.slice(1, -1);
    }
    return token;
  }
}

// --- Semantic Extractor ---

const parsePoint = (list: SExpr): Point => {
  // Format: (pt x y)
  if (Array.isArray(list) && list[0] === 'pt') {
    return { x: parseInt(list[1] as string, 10), y: parseInt(list[2] as string, 10) };
  }
  return { x: 0, y: 0 };
};

const parseRect = (list: SExpr): BsfRect => {
  // Format: (rect x1 y1 x2 y2)
  if (Array.isArray(list) && list[0] === 'rect') {
    return {
      x1: parseInt(list[1] as string, 10),
      y1: parseInt(list[2] as string, 10),
      x2: parseInt(list[3] as string, 10),
      y2: parseInt(list[4] as string, 10),
    };
  }
  return { x1: 0, y1: 0, x2: 0, y2: 0 };
};

const parseLine = (list: SExpr): BsfLine | null => {
  // Format: (line (pt x1 y1) (pt x2 y2) (line_width w))
  if (!Array.isArray(list) || list[0] !== 'line') return null;
  
  // Extract all points (usually 2 for a line, but structure allows list)
  const points = list.filter(i => Array.isArray(i) && i[0] === 'pt').map(p => parsePoint(p as SExpr));
  
  // Find width
  const widthArr = list.find(i => Array.isArray(i) && i[0] === 'line_width') as SExpr[];
  const width = widthArr ? parseInt(widthArr[1] as string, 10) : 1;

  if (points.length >= 2) {
    return { p1: points[0], p2: points[1], width };
  }
  return null;
};

const parseText = (list: SExpr): BsfText | null => {
  // Format: (text "content" (rect ...) (font ...))
  if (!Array.isArray(list) || list[0] !== 'text') return null;

  const value = list[1] as string;
  const rectData = list.find(i => Array.isArray(i) && i[0] === 'rect') as SExpr;
  const rect = rectData ? parseRect(rectData) : { x1: 0, y1: 0, x2: 0, y2: 0 };
  
  const fontData = list.find(i => Array.isArray(i) && i[0] === 'font') as SExpr[];
  // (font "Arial" (font_size 8))
  let font: any = { family: 'Arial', size: 10 };
  if (fontData) {
    font.family = fontData[1] as string;
    const sizePart = fontData.find(i => Array.isArray(i) && i[0] === 'font_size') as SExpr[];
    if (sizePart) font.size = parseInt(sizePart[1] as string, 10);
  }

  return { value, rect, font };
};

export function parseBSF(content: string): BsfSymbol {
  // Cleanup comments
  const cleanContent = content.replace(/\/\/.*$/gm, '');
  
  const tokens = tokenize(cleanContent);
  
  // Parse all top level S-expressions (e.g. header, symbol, etc.)
  const roots: SExpr[] = [];
  while(tokens.length > 0) {
      try {
        roots.push(parseSExpr(tokens));
      } catch (e) {
        // If parsing fails for a token, we might stop or skip. 
        // For now, break to avoid infinite loops if tokens aren't consumed
        console.warn("Parsing loop error or finished", e);
        break;
      }
  }

  // We want to find the 'symbol' block among the roots.
  const symbolBlock = roots.find(item => Array.isArray(item) && item[0] === 'symbol') as SExpr[];

  if (!symbolBlock) {
    // If no symbol block is found, return a default placeholder symbol
    return {
        name: 'No Symbol',
        version: '0.0',
        bounds: { x1: 0, y1: 0, x2: 200, y2: 200 },
        ports: [],
        drawing: {
            lines: [
                { p1: { x: 0, y: 0 }, p2: { x: 200, y: 0 }, width: 1 },
                { p1: { x: 200, y: 0 }, p2: { x: 200, y: 200 }, width: 1 },
                { p1: { x: 200, y: 200 }, p2: { x: 0, y: 200 }, width: 1 },
                { p1: { x: 0, y: 200 }, p2: { x: 0, y: 0 }, width: 1 }
            ],
            rectangles: [],
            circles: [],
            texts: [
                {
                    value: "Symbol Not Found",
                    rect: { x1: 50, y1: 90, x2: 150, y2: 110 },
                    font: { family: "Arial", size: 12 }
                }
            ]
        },
        mainTexts: []
    };
  }

  const result: BsfSymbol = {
    name: 'Unknown',
    version: '0.1',
    bounds: { x1: 0, y1: 0, x2: 0, y2: 0 },
    ports: [],
    drawing: { lines: [], rectangles: [], circles: [], texts: [] },
    mainTexts: [],
  };

  // Parse Symbol Attributes
  symbolBlock.forEach(item => {
    if (!Array.isArray(item)) return;

    const type = item[0];

    if (type === 'rect') {
      result.bounds = {
        x1: parseInt(item[1] as string),
        y1: parseInt(item[2] as string),
        x2: parseInt(item[3] as string),
        y2: parseInt(item[4] as string),
      };
    } else if (type === 'text') {
       const txt = parseText(item);
       if (txt) result.mainTexts.push(txt);
    } else if (type === 'port') {
      const port: BsfPort = {
        location: { x: 0, y: 0 },
        type: 'input', // default
        texts: [],
        lines: [],
        name: 'unknown',
        width: 1
      };

      // Port properties
      item.forEach(pProp => {
        if (!Array.isArray(pProp)) return;
        if (pProp[0] === 'pt') port.location = parsePoint(pProp);
        if (pProp[0] === 'input') port.type = 'input';
        if (pProp[0] === 'output') port.type = 'output';
        if (pProp[0] === 'bidir') port.type = 'bidir';
        if (pProp[0] === 'text') {
           const t = parseText(pProp);
           if (t) port.texts.push(t);
        }
        if (pProp[0] === 'line') {
           const l = parseLine(pProp);
           if (l) port.lines.push(l);
        }
      });
      
      // Calculate Name and Width
      if (port.texts.length > 0) {
        // Usually the first text is the name
        port.name = port.texts[0].value;
        // Check for bus syntax "Name[X..Y]"
        const match = port.name.match(/\[(\d+)\.\.(\d+)\]/);
        if (match) {
            const start = parseInt(match[1], 10);
            const end = parseInt(match[2], 10);
            port.width = Math.abs(start - end) + 1;
        } else {
            port.width = 1;
        }
      }

      result.ports.push(port);

    } else if (type === 'drawing') {
       item.forEach(dProp => {
         if (!Array.isArray(dProp)) return;
         if (dProp[0] === 'line') {
            const l = parseLine(dProp);
            if(l) result.drawing.lines.push(l);
         }
         if (dProp[0] === 'text') {
            const t = parseText(dProp);
            if(t) result.drawing.texts.push(t);
         }
       });
    }
  });

  return result;
}
