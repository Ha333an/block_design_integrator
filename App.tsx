
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { parseBSF } from './services/bsfParser';
import { parseVHDL } from './services/vhdlParser';
import { BsfSymbol, SymbolInstance, Wire, WireConnection, Point } from './types';
import SchematicSymbol from './components/SchematicSymbol';
import { DEFAULT_BSF_SAMPLE, PIN_INPUT_BSF, PIN_OUTPUT_BSF } from './constants';
import { generateVHDL } from './services/vhdlExporter';

interface PortMenuState { source: WireConnection; screenPos: { x: number; y: number }; }
interface WireMenuState { wireId: string; screenPos: { x: number; y: number }; }
interface InstanceMenuState { instanceId: string; screenPos: { x: number; y: number }; }
interface SchematicState { instances: SymbolInstance[]; wires: Wire[]; counters: Record<string, number>; }

const SNAP_THRESHOLD = 25; 
const DRAG_THRESHOLD = 5; 
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

const App: React.FC = () => {
  const [library, setLibrary] = useState<BsfSymbol[]>([]);
  const [schematic, setSchematic] = useState<SchematicState>({ instances: [], wires: [], counters: {} });
  const [history, setHistory] = useState<SchematicState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [vhdlOutput, setVhdlOutput] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  
  const [dragState, setDragState] = useState<{ instanceId: string; offsetX: number; offsetY: number; startX: number; startY: number; dragDist: number } | null>(null);
  const [wireState, setWireState] = useState<{ start: WireConnection; startPos: Point; currentEnd: Point; dragDist: number; startScreenPos: Point } | null>(null);
  const [snappedPort, setSnappedPort] = useState<WireConnection | null>(null);
  const [panState, setPanState] = useState<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const [menuState, setMenuState] = useState<PortMenuState | null>(null);
  const [wireMenuState, setWireMenuState] = useState<WireMenuState | null>(null);
  const [instanceMenuState, setInstanceMenuState] = useState<InstanceMenuState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [containerSize, setContainerSize] = useState({ w: 1, h: 1 });

  const commitToHistory = useCallback((newState: SchematicState) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, JSON.parse(JSON.stringify(newState))];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setSchematic(JSON.parse(JSON.stringify(history[prevIndex])));
      setHistoryIndex(prevIndex);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setSchematic(JSON.parse(JSON.stringify(history[nextIndex])));
      setHistoryIndex(nextIndex);
    }
  }, [history, historyIndex]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
        }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      const parsed = parseBSF(DEFAULT_BSF_SAMPLE);
      parsed.name = "2x8mux";
      const pinInput = parseBSF(PIN_INPUT_BSF);
      pinInput.name = "PIN_INPUT";
      const pinOutput = parseBSF(PIN_OUTPUT_BSF);
      pinOutput.name = "PIN_OUTPUT";
      setLibrary([parsed, pinInput, pinOutput]);
      const initialState = { instances: [], wires: [], counters: {} };
      setSchematic(initialState);
      setHistory([initialState]);
      setHistoryIndex(0);
    } catch (e) { console.error(e); }
  }, []);

  const getInteractionPos = useCallback((e: any) => {
    if (!svgRef.current) return { x: 0, y: 0, clientX: 0, clientY: 0, svgX: 0, svgY: 0 };
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return { x: 0, y: 0, clientX: 0, clientY: 0, svgX: 0, svgY: 0 };
    const native = e.nativeEvent || e;
    const touch = native.touches?.[0] || native.changedTouches?.[0];
    const clientX = touch ? touch.clientX : (native.clientX || 0);
    const clientY = touch ? touch.clientY : (native.clientY || 0);
    const svgX = (clientX - CTM.e) / CTM.a;
    const svgY = (clientY - CTM.f) / CTM.d;
    return { 
        x: (svgX - viewport.x) / viewport.scale, 
        y: (svgY - viewport.y) / viewport.scale, 
        svgX, svgY, clientX, clientY 
    };
  }, [viewport]);

  const snapToGrid = (val: number) => Math.round(val / 10) * 10;
  
  const getPortInfo = useCallback((instanceId: string, portIndex: number) => {
    const inst = schematic.instances.find(i => i.id === instanceId);
    return inst?.data.ports[portIndex] || null;
  }, [schematic.instances]);

  const isExternalPin = useCallback((instanceId: string) => {
    const inst = schematic.instances.find(i => i.id === instanceId);
    return inst?.templateName === 'PIN_INPUT' || inst?.templateName === 'PIN_OUTPUT';
  }, [schematic.instances]);

  const isConnectionValid = useCallback((start: WireConnection, targetInstanceId: string, targetPortIndex: number) => {
    if (start.instanceId === targetInstanceId) return false;
    const inst1 = schematic.instances.find(i => i.id === start.instanceId);
    const inst2 = schematic.instances.find(i => i.id === targetInstanceId);
    if (!inst1 || !inst2) return false;
    if (isExternalPin(start.instanceId) && isExternalPin(targetInstanceId)) return false;
    const p1 = getPortInfo(start.instanceId, start.portIndex);
    const p2 = getPortInfo(targetInstanceId, targetPortIndex);
    if (!p1 || !p2) return false;
    if (p1.width !== p2.width) return false;
    const t1 = p1.type;
    const t2 = p2.type;
    if (inst1.templateName === 'PIN_INPUT' && (t2 === 'output')) return false;
    if (inst2.templateName === 'PIN_INPUT' && (t1 === 'output')) return false;
    if (inst1.templateName === 'PIN_OUTPUT' && (t2 === 'input')) return false;
    if (inst2.templateName === 'PIN_OUTPUT' && (t1 === 'input')) return false;
    if (t1 === 'bidir' || t2 === 'bidir') return true;
    if (t1 === 'input' && t2 === 'output') return true;
    if (t1 === 'output' && t2 === 'input') return true;
    return false;
  }, [getPortInfo, isExternalPin, schematic.instances]);

  const handleFitToScreen = useCallback((targetSchematic?: SchematicState) => {
    const activeSchematic = targetSchematic || schematic;
    if (activeSchematic.instances.length === 0) { setViewport({ x: 0, y: 0, scale: 1 }); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    activeSchematic.instances.forEach(inst => {
      const width = Math.abs(inst.data.bounds.x2 - inst.data.bounds.x1);
      const height = Math.abs(inst.data.bounds.y2 - inst.data.bounds.y1);
      minX = Math.min(minX, inst.x);
      minY = Math.min(minY, inst.y);
      maxX = Math.max(maxX, inst.x + width);
      maxY = Math.max(maxY, inst.y + height);
    });
    minX -= 50; minY -= 50; maxX += 50; maxY += 50;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return;
    const scale = Math.min(Math.min(containerSize.w / contentW, containerSize.h / contentH), 2); 
    setViewport({
        x: -minX * scale + (containerSize.w - contentW * scale) / 2,
        y: -minY * scale + (containerSize.h - contentH * scale) / 2,
        scale
    });
  }, [schematic, containerSize]);

  const performAutoLayout = async (targetSchematic: SchematicState) => {
    if (targetSchematic.instances.length === 0) {
      setSchematic(targetSchematic);
      commitToHistory(targetSchematic);
      return;
    }
    setIsLayoutRunning(true);
    try {
        const elk = new ELK();
        const graph = {
            id: "root",
            layoutOptions: { 
                'elk.algorithm': 'layered', 
                'elk.direction': 'RIGHT', 
                'elk.spacing.nodeNode': '100', 
                'elk.edgeRouting': 'ORTHOGONAL',
                'elk.layered.spacing.nodeNodeBetweenLayers': '100'
            },
            children: targetSchematic.instances.map(inst => ({
                id: inst.id, 
                width: Math.abs(inst.data.bounds.x2 - inst.data.bounds.x1), 
                height: Math.abs(inst.data.bounds.y2 - inst.data.bounds.y1),
                layoutOptions: { 'portConstraints': 'FIXED_POS' },
                ports: inst.data.ports.map((p, idx) => ({ id: `${inst.id}-p${idx}`, x: p.location.x, y: p.location.y, width: 0, height: 0 }))
            })),
            edges: targetSchematic.wires.map(w => ({ 
                id: w.id, 
                sources: [`${w.start.instanceId}-p${w.start.portIndex}`], 
                targets: [`${w.end.instanceId}-p${w.end.portIndex}`] 
            }))
        };
        const result = await elk.layout(graph);
        if (result && result.children) {
            const nextInstances = targetSchematic.instances.map(inst => {
                const node = result.children?.find((n: any) => n.id === inst.id);
                return node ? { ...inst, x: node.x || 0, y: node.y || 0 } : inst;
            });
            const nextState = { 
                ...targetSchematic, 
                instances: nextInstances, 
                wires: targetSchematic.wires.map(w => {
                 const edge = result.edges?.find((e: any) => e.id === w.id) as any;
                 if (edge?.sections?.[0]) {
                    const section = edge.sections[0];
                    return { ...w, route: [{ x: section.startPoint.x, y: section.startPoint.y }, ...(section.bendPoints || []), { x: section.endPoint.x, y: section.endPoint.y }] };
                 }
                 return w;
                }) 
            };
            setSchematic(nextState); 
            commitToHistory(nextState);
            requestAnimationFrame(() => handleFitToScreen(nextState));
        }
    } catch (e) { console.error(e); } finally { setIsLayoutRunning(false); }
  };

  const handleZoom = useCallback((delta: number, zoomPoint?: { x: number, y: number }) => {
    setViewport(prev => {
        const scaleChange = delta > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(prev.scale * scaleChange, MIN_SCALE), MAX_SCALE);
        const px = zoomPoint ? zoomPoint.x : containerSize.w / 2;
        const py = zoomPoint ? zoomPoint.y : containerSize.h / 2;
        const newX = px - (px - prev.x) * (newScale / prev.scale);
        const newY = py - (py - prev.y) * (newScale / prev.scale);
        return { x: newX, y: newY, scale: newScale };
    });
  }, [containerSize]);

  const handleMouseDown = useCallback((e: any) => {
    const pos = getInteractionPos(e);
    const native = e.nativeEvent || e;
    if (native.button === 1 || (native.button === 0 && native.shiftKey)) {
      setPanState({ startX: pos.clientX, startY: pos.clientY, viewX: viewport.x, viewY: viewport.y });
    } else if (native.button === 0) {
      setSelectedInstanceId(null);
      setSelectedWireId(null);
      setMenuState(null);
      setWireMenuState(null);
      setInstanceMenuState(null);
    }
  }, [viewport.x, viewport.y, getInteractionPos]);

  const handleMouseMove = useCallback((e: any) => {
    const pos = getInteractionPos(e);
    if (dragState) {
        const dx = pos.clientX - dragState.startX;
        const dy = pos.clientY - dragState.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        setDragState(prev => prev ? { ...prev, dragDist: dist } : null);
        
        setSchematic(prev => ({
            ...prev,
            instances: prev.instances.map(inst => 
                inst.id === dragState.instanceId 
                ? { ...inst, x: snapToGrid(pos.x - dragState.offsetX), y: snapToGrid(pos.y - dragState.offsetY) }
                : inst
            )
        }));
    } else if (wireState) {
        const dx = pos.clientX - wireState.startScreenPos.x;
        const dy = pos.clientY - wireState.startScreenPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        setWireState(prev => prev ? { ...prev, currentEnd: { x: pos.x, y: pos.y }, dragDist: dist } : null);
        let snap: WireConnection | null = null;
        for (const inst of schematic.instances) {
            for (let idx = 0; idx < inst.data.ports.length; idx++) {
                const p = inst.data.ports[idx];
                const px = inst.x + p.location.x;
                const py = inst.y + p.location.y;
                const d = Math.sqrt(Math.pow(pos.x - px, 2) + Math.pow(pos.y - py, 2));
                if (d < SNAP_THRESHOLD && isConnectionValid(wireState.start, inst.id, idx)) {
                    snap = { instanceId: inst.id, portIndex: idx, location: { x: px, y: py } };
                    break;
                }
            }
            if (snap) break;
        }
        setSnappedPort(snap);
    } else if (panState) {
        const dx = pos.clientX - panState.startX;
        const dy = pos.clientY - panState.startY;
        setViewport(prev => ({ ...prev, x: panState.viewX + dx, y: panState.viewY + dy }));
    }
  }, [dragState, wireState, panState, getInteractionPos, schematic.instances, isConnectionValid]);

  const handleMouseUp = useCallback((e: any) => {
    if (dragState) {
      // Only show menu if we didn't drag it very far
      if (dragState.dragDist < DRAG_THRESHOLD) {
        const pos = getInteractionPos(e);
        setInstanceMenuState({ instanceId: dragState.instanceId, screenPos: { x: pos.clientX, y: pos.clientY } });
      } else {
        commitToHistory(schematic);
      }
    }
    setDragState(null); setWireState(null); setPanState(null); setSnappedPort(null);
  }, [dragState, schematic, commitToHistory, getInteractionPos]);

  const handleAutoConnect = () => {
    const newWires: Wire[] = [];
    const getBaseName = (name: string) => name.split('[')[0].trim().toLowerCase();
    schematic.instances.forEach(inst1 => {
      inst1.data.ports.forEach((p1, idx1) => {
        const base1 = getBaseName(p1.name);
        schematic.instances.forEach(inst2 => {
          if (inst1.id === inst2.id) return;
          inst2.data.ports.forEach((p2, idx2) => {
            const base2 = getBaseName(p2.name);
            if (base1 === base2 && p1.width === p2.width) {
              if (isConnectionValid({ instanceId: inst1.id, portIndex: idx1, location: {x:0,y:0} }, inst2.id, idx2)) {
                const exists = schematic.wires.some(w => 
                  (w.start.instanceId === inst1.id && w.start.portIndex === idx1 && w.end.instanceId === inst2.id && w.end.portIndex === idx2) ||
                  (w.start.instanceId === inst2.id && w.start.portIndex === idx2 && w.end.instanceId === inst1.id && w.end.portIndex === idx1)
                );
                if (!exists) {
                  newWires.push({
                    id: `auto_w_${Date.now()}_${newWires.length}`,
                    start: { instanceId: inst1.id, portIndex: idx1, location: { x: inst1.x + p1.location.x, y: inst1.y + p1.location.y } },
                    end: { instanceId: inst2.id, portIndex: idx2, location: { x: inst2.x + p2.location.x, y: inst2.y + p2.location.y } },
                    width: p1.width
                  });
                }
              }
            }
          });
        });
      });
    });
    if (newWires.length > 0) {
      const nextState = { ...schematic, wires: [...schematic.wires, ...newWires] };
      performAutoLayout(nextState);
      setNotification(`⚡ Auto Connect established ${newWires.length} net(s)!`);
      setTimeout(() => setNotification(null), 3000);
    } else {
      setNotification("No compatible port matches found.");
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const deleteWire = (wireId: string) => {
    const nextState = { ...schematic, wires: schematic.wires.filter(w => w.id !== wireId) };
    performAutoLayout(nextState);
    setWireMenuState(null);
    setSelectedWireId(null);
  };

  const deleteInstance = (instanceId: string) => {
    const nextState = {
        ...schematic,
        instances: schematic.instances.filter(i => i.id !== instanceId),
        wires: schematic.wires.filter(w => w.start.instanceId !== instanceId && w.end.instanceId !== instanceId)
    };
    performAutoLayout(nextState);
    setInstanceMenuState(null);
    setSelectedInstanceId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          let parsed: BsfSymbol | null = null;
          const fileName = file.name.toLowerCase();
          if (fileName.endsWith('.bsf')) {
             parsed = parseBSF(content);
             if (!parsed.name || parsed.name === 'Unknown') parsed.name = parsed.mainTexts[0]?.value || file.name.replace(/\.[^/.]+$/, "");
          } else if (fileName.endsWith('.vhd') || fileName.endsWith('.vhdl')) { parsed = parseVHDL(content); }
          if (parsed) setLibrary(prev => [...prev, parsed!]);
        } catch(err) { console.error(err); }
      };
      reader.readAsText(file);
    });
  };

  const addInstance = (symbol: BsfSymbol) => {
    const templateName = symbol.name;
    const count = (schematic.counters[templateName] || 0) + 1;
    const worldCenter = { x: (containerSize.w / 2 - viewport.x) / viewport.scale, y: (containerSize.h / 2 - viewport.y) / viewport.scale };
    const newInstance: SymbolInstance = {
      id: `inst_${Date.now()}`,
      templateName,
      instanceName: `${templateName}_${count}`,
      x: snapToGrid(worldCenter.x - (symbol.bounds.x2 - symbol.bounds.x1) / 2),
      y: snapToGrid(worldCenter.y - (symbol.bounds.y2 - symbol.bounds.y1) / 2),
      data: JSON.parse(JSON.stringify(symbol))
    };
    const nextState = { ...schematic, instances: [...schematic.instances, newInstance], counters: { ...schematic.counters, [templateName]: count } };
    performAutoLayout(nextState);
  };

  const onStart = (e: any, instanceId: string) => {
    const pos = getInteractionPos(e);
    const inst = schematic.instances.find(i => i.id === instanceId);
    if (!inst) return;
    setDragState({ 
        instanceId, 
        offsetX: pos.x - inst.x, 
        offsetY: pos.y - inst.y,
        startX: pos.clientX,
        startY: pos.clientY,
        dragDist: 0
    });
    setSelectedInstanceId(instanceId);
    setSelectedWireId(null);
    setWireMenuState(null);
    setInstanceMenuState(null); // Reset it here, it will be triggered on mouseUp if dragDist is low
  };

  const onPortStart = (e: any, instanceId: string, portIndex: number, location: Point) => {
    const pos = getInteractionPos(e);
    setWireState({
      start: { instanceId, portIndex, location },
      startPos: location,
      currentEnd: location,
      dragDist: 0,
      startScreenPos: { x: pos.clientX, y: pos.clientY }
    });
    // Stop from triggering block drag
    e.stopPropagation();
  };

  const onPortClick = (e: any, instanceId: string, portIndex: number, location: Point) => {
    if (wireState) {
        let finalized = false;
        if (wireState.dragDist > DRAG_THRESHOLD && snappedPort) {
            const newWire: Wire = {
                id: `w_${Date.now()}`,
                start: wireState.start,
                end: snappedPort,
                width: getPortInfo(wireState.start.instanceId, wireState.start.portIndex)?.width || 1
            };
            const nextState = { ...schematic, wires: [...schematic.wires, newWire] };
            performAutoLayout(nextState);
            finalized = true;
        } 
        if (!finalized) {
            const pos = getInteractionPos(e);
            setMenuState({
                source: { instanceId, portIndex, location },
                screenPos: { x: pos.clientX, y: pos.clientY }
            });
        }
        setWireState(null); setSnappedPort(null);
    }
  };

  const getCompatiblePorts = useCallback((source: WireConnection) => {
    const list: { instanceId: string; portIndex: number; label: string; location: Point }[] = [];
    schematic.instances.forEach(inst => {
        inst.data.ports.forEach((p, idx) => {
            if (isConnectionValid(source, inst.id, idx)) {
                list.push({
                    instanceId: inst.id,
                    portIndex: idx,
                    label: `${inst.instanceName}: ${p.name}`,
                    location: { x: inst.x + p.location.x, y: inst.y + p.location.y }
                });
            }
        });
    });
    return list;
  }, [schematic.instances, isConnectionValid]);

  const connectToPort = (source: WireConnection, target: { instanceId: string; portIndex: number; location: Point }) => {
    const startPort = getPortInfo(source.instanceId, source.portIndex);
    if (startPort) {
        const newWire: Wire = {
            id: `w_${Date.now()}`,
            start: source,
            end: { instanceId: target.instanceId, portIndex: target.portIndex, location: target.location },
            width: startPort.width
        };
        const nextState = { ...schematic, wires: [...schematic.wires.filter(w => !((w.start.instanceId === source.instanceId && w.start.portIndex === source.portIndex) || (w.end.instanceId === source.instanceId && w.end.portIndex === source.portIndex))) , newWire] };
        performAutoLayout(nextState);
    }
    setMenuState(null);
  };

  const handleExportToPin = (source: WireConnection, type: 'input' | 'output') => {
    const port = getPortInfo(source.instanceId, source.portIndex);
    if (!port) return;
    const pinSym = library.find(s => s.name === (type === 'input' ? 'PIN_INPUT' : 'PIN_OUTPUT'));
    if (!pinSym) return;
    const pinX = snapToGrid(source.location.x + (type === 'input' ? -120 : 40));
    const pinY = snapToGrid(source.location.y - 20);
    const pinInst: SymbolInstance = { 
        id: `inst_${Date.now()}`, templateName: pinSym.name, instanceName: `${port.name}_pin`, x: pinX, y: pinY, 
        data: JSON.parse(JSON.stringify(pinSym)) 
    };
    const newWire: Wire = { 
        id: `w_${Date.now()}`, start: source, 
        end: { instanceId: pinInst.id, portIndex: 0, location: { x: pinInst.x + pinInst.data.ports[0].location.x, y: pinInst.y + pinInst.data.ports[0].location.y } }, 
        width: port.width 
    };
    const nextState = { 
        ...schematic,
        instances: [...schematic.instances, pinInst], 
        wires: [...schematic.wires, newWire], 
        counters: { ...schematic.counters, [pinSym.name]: (schematic.counters[pinSym.name] || 0) + 1 } 
    };
    performAutoLayout(nextState);
    setMenuState(null);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden text-sm">
      <div className="h-12 bg-white border-b flex items-center px-4 justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg text-blue-600">BSF Schematic Pro</h1>
          <div className="flex gap-1 border-l pl-4">
            <button onClick={undo} disabled={historyIndex <= 0} className="p-2 hover:bg-gray-100 rounded disabled:opacity-30" title="Undo">↺</button>
            <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-gray-100 rounded disabled:opacity-30" title="Redo">↻</button>
          </div>
        </div>
        <div className="flex gap-2">
            <label className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded cursor-pointer transition-colors flex items-center gap-2 border border-blue-200">
                <span>Upload BSF/VHDL</span>
                <input type="file" multiple accept=".bsf,.vhd,.vhdl" onChange={handleFileUpload} className="hidden" />
            </label>
            <button onClick={handleAutoConnect} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded flex items-center gap-2 shadow-sm transition-colors font-medium">
                <span className="text-lg leading-none">⚡</span>
                <span>Auto Connect</span>
            </button>
            <button onClick={() => performAutoLayout(schematic)} disabled={isLayoutRunning} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded disabled:opacity-50 transition-colors">
                {isLayoutRunning ? 'Routing...' : 'Auto Layout'}
            </button>
            <button onClick={() => setVhdlOutput(generateVHDL(schematic.instances, schematic.wires))} className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded shadow-sm">
                Export VHDL
            </button>
        </div>
      </div>
      {notification && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-2 rounded-full shadow-2xl z-50 animate-bounce text-xs font-bold tracking-tight">
          {notification}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r flex flex-col shadow-sm">
          <div className="p-3 font-semibold border-b bg-gray-50 uppercase text-xs tracking-wider">Symbol Library</div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {library.map((sym, i) => (
              <div key={i} onClick={() => addInstance(sym)} className="p-3 border rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all group">
                <div className="font-medium group-hover:text-blue-700">{sym.name}</div>
                <div className="text-[10px] text-gray-500 mt-1">{sym.ports.length} ports</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 relative" ref={containerRef}>
          <div className="absolute inset-0" onWheel={(e) => { e.preventDefault(); const pos = getInteractionPos(e); handleZoom(e.deltaY, { x: pos.svgX, y: pos.svgY }); }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            <svg ref={svgRef} width="100%" height="100%" className="bg-slate-50" style={{ cursor: panState ? 'grabbing' : 'auto' }}>
              <defs>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e2e8f0" strokeWidth="0.5"/></pattern>
                <pattern id="grid-large" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#grid)"/><path d="M 100 0 L 0 0 0 100" fill="none" stroke="#cbd5e1" strokeWidth="1"/></pattern>
              </defs>
              <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}>
                <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid-large)" pointerEvents="none" />
                {schematic.wires.map(wire => {
                    const isSelected = selectedWireId === wire.id;
                    const path = wire.route ? `M ${wire.route.map(p => `${p.x},${p.y}`).join(' L ')}` : `M ${wire.start.location.x},${wire.start.location.y} L ${wire.end.location.x},${wire.end.location.y}`;
                    return (
                        <g 
                          key={wire.id} 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setSelectedWireId(wire.id); 
                            setSelectedInstanceId(null); 
                            const pos = getInteractionPos(e);
                            setWireMenuState({ wireId: wire.id, screenPos: { x: pos.clientX, y: pos.clientY } });
                          }}
                        >
                          <path 
                            d={path} 
                            fill="none" 
                            stroke={isSelected ? "#ef4444" : "#475569"} 
                            strokeWidth={wire.width > 1 ? 5 : 3} 
                            className="cursor-pointer transition-colors hover:stroke-red-400"
                          />
                        </g>
                    );
                })}
                {wireState && <line x1={wireState.startPos.x} y1={wireState.startPos.y} x2={snappedPort ? snappedPort.location.x : wireState.currentEnd.x} y2={snappedPort ? snappedPort.location.y : wireState.currentEnd.y} stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 2"/>}
                {schematic.instances.map(inst => (
                    <SchematicSymbol key={inst.id} instance={inst} isSelected={selectedInstanceId === inst.id} highlightedPortIndex={snappedPort?.instanceId === inst.id ? snappedPort.portIndex : -1} 
                        startingPortIndex={wireState?.start.instanceId === inst.id ? wireState.start.portIndex : -1} onStart={onStart} onPortStart={onPortStart} onPortClick={onPortClick}/>
                ))}
              </g>
            </svg>
          </div>
          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <button onClick={() => handleFitToScreen()} className="bg-white p-2 rounded-full shadow-lg border hover:bg-gray-50 text-gray-600">⛶</button>
            <div className="flex flex-col border rounded-full overflow-hidden shadow-lg bg-white">
                <button onClick={() => handleZoom(-1)} className="p-2 hover:bg-gray-50 text-gray-600 border-b">+</button>
                <button onClick={() => handleZoom(1)} className="p-2 hover:bg-gray-50 text-gray-600">-</button>
            </div>
          </div>
        </div>
      </div>
      
      {wireMenuState && (
        <div className="fixed z-[100] bg-white shadow-2xl border border-gray-200 rounded-xl p-1 min-w-[160px] animate-in fade-in zoom-in duration-200 backdrop-blur-md" 
             style={{ top: wireMenuState.screenPos.y, left: wireMenuState.screenPos.x }} onClick={e => e.stopPropagation()}>
            <button 
                onClick={() => deleteWire(wireMenuState.wireId)} 
                className="w-full text-left px-4 py-2 text-sm text-red-600 font-medium hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors"
            >
                <span className="text-lg">🗑</span> Delete Net
            </button>
        </div>
      )}

      {instanceMenuState && (
        <div className="fixed z-[100] bg-white shadow-2xl border border-gray-200 rounded-xl p-1 min-w-[160px] animate-in fade-in zoom-in duration-200 backdrop-blur-md" 
             style={{ top: instanceMenuState.screenPos.y, left: instanceMenuState.screenPos.x }} onClick={e => e.stopPropagation()}>
            <button 
                onClick={() => deleteInstance(instanceMenuState.instanceId)} 
                className="w-full text-left px-4 py-2 text-sm text-red-600 font-medium hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors"
            >
                <span className="text-lg">🗑</span> Delete Block
            </button>
        </div>
      )}

      {menuState && (
        <div className="fixed z-[100] bg-white shadow-2xl border border-gray-200 rounded-xl p-2 min-w-[240px] animate-in fade-in zoom-in duration-200 backdrop-blur-md" 
             style={{ top: menuState.screenPos.y, left: menuState.screenPos.x }} onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b mb-1 flex justify-between items-center">
                {(() => {
                    const port = getPortInfo(menuState.source.instanceId, menuState.source.portIndex);
                    return <span>{port?.name} ({port?.type})</span>;
                })()}
                <button onClick={() => setMenuState(null)} className="hover:text-red-500 transition-colors">&times;</button>
            </div>
            <div className="p-1 space-y-1">
                {(() => {
                    const port = getPortInfo(menuState.source.instanceId, menuState.source.portIndex);
                    const compatible = getCompatiblePorts(menuState.source);
                    const isPortFromPin = isExternalPin(menuState.source.instanceId);
                    if (!port) return null;
                    return (
                        <>
                            <div className="text-[10px] text-gray-400 px-3 py-1">Quick Actions</div>
                            {!isPortFromPin && (
                                <>
                                    {(port.type === 'input' || port.type === 'bidir') && (
                                        <button onClick={() => handleExportToPin(menuState.source, 'input')} className="w-full text-left px-4 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 rounded-lg flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>Connect to External Input
                                        </button>
                                    )}
                                    {(port.type === 'output' || port.type === 'bidir') && (
                                        <button onClick={() => handleExportToPin(menuState.source, 'output')} className="w-full text-left px-4 py-2 text-sm text-emerald-600 font-medium hover:bg-emerald-50 rounded-lg flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Connect to External Output
                                        </button>
                                    )}
                                </>
                            )}
                            <div className="h-px bg-gray-100 my-1"></div>
                            <div className="text-[10px] text-gray-400 px-3 py-1">Connect To...</div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {compatible.length === 0 ? (
                                    <div className="px-4 py-3 text-xs text-gray-400 italic">No compatible ports found (W:{port.width})</div>
                                ) : (
                                    compatible.map((target, idx) => (
                                        <button key={idx} onClick={() => connectToPort(menuState.source, target)} className="w-full text-left px-4 py-2 text-xs hover:bg-blue-600 hover:text-white rounded-lg flex items-center gap-2 group">
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-200 group-hover:bg-white shrink-0"></span><span className="truncate">{target.label}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    );
                })()}
            </div>
        </div>
      )}
      {vhdlOutput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-8 z-50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden border">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="font-bold text-gray-700">Structural VHDL Generated</h2>
                    <button onClick={() => setVhdlOutput(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-gray-900"><pre className="text-emerald-400 font-mono text-xs leading-relaxed">{vhdlOutput}</pre></div>
                <div className="p-4 border-t flex justify-end gap-2 bg-gray-50"><button onClick={() => setVhdlOutput(null)} className="px-4 py-2 border rounded hover:bg-white bg-gray-100">Close</button></div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
