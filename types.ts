
export interface Point {
  x: number;
  y: number;
}

export interface BsfRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BsfFont {
  family: string;
  size: number;
}

export interface BsfText {
  value: string;
  rect: BsfRect;
  font: BsfFont;
}

export interface BsfLine {
  p1: Point;
  p2: Point;
  width: number;
}

export interface BsfPort {
  location: Point;
  type: 'input' | 'output' | 'bidir';
  texts: BsfText[]; 
  lines: BsfLine[]; 
  name: string;   
  width: number;  
}

export interface BsfDrawing {
  lines: BsfLine[];
  rectangles: BsfRect[];
  circles: { center: Point; radius: number }[];
  texts: BsfText[];
}

export interface BsfSymbol {
  name: string;
  version: string;
  bounds: BsfRect; 
  ports: BsfPort[];
  drawing: BsfDrawing;
  mainTexts: BsfText[]; 
}

// --- Editor Specific Types ---

export interface GlueLogicData {
  vhdlCode: string;
  ports: BsfPort[];
}

export interface SymbolInstance {
  id: string;
  templateName: string; 
  instanceName: string; 
  x: number;
  y: number;
  data: BsfSymbol;
  isGlueLogic?: boolean;
  glueLogic?: GlueLogicData;
}

export interface WireConnection {
  instanceId: string;
  portIndex: number;
  location: Point; 
}

export interface Wire {
  id: string;
  start: WireConnection;
  end: WireConnection;
  route?: Point[]; 
  width: number; 
}
