
import { SymbolInstance, Wire, BsfSymbol } from '../types';

/**
 * Sanitizes a string to be a valid VHDL identifier.
 * Strips bus notation like [7..0] and replaces invalid characters with underscores.
 */
function sanitize(name: string): string {
  // 1. Remove bracketed bus notation if present (e.g., "A[7..0]" -> "A")
  let clean = name.split('[')[0].trim();
  
  // 2. Replace non-alphanumeric characters with underscores
  clean = clean.replace(/[^a-zA-Z0-9_]/g, '_');
  
  // 3. VHDL identifiers must start with a letter
  if (!/^[a-zA-Z]/.test(clean)) {
    clean = 'v_' + clean;
  }
  
  // 4. Remove trailing underscores or consecutive underscores (optional but cleaner)
  clean = clean.replace(/_+/g, '_').replace(/_$/, '');
  
  return clean;
}

/**
 * Generates structural VHDL code representing the schematic.
 */
export function generateVHDL(instances: SymbolInstance[], wires: Wire[]): string {
  const topEntityName = "TopLevelSchematic";
  
  // 1. Identify unique component types (excluding top-level pins and glue logic)
  const uniqueSymbols = new Map<string, BsfSymbol>();
  instances.forEach(inst => {
    if (inst.templateName !== 'PIN_INPUT' && inst.templateName !== 'PIN_OUTPUT' && !inst.isGlueLogic) {
      if (!uniqueSymbols.has(inst.templateName)) {
        uniqueSymbols.set(inst.templateName, inst.data);
      }
    }
  });

  // 2. Map connectivity groups (nets)
  const portToSignalMap = new Map<string, string>();
  const signalDeclarations: string[] = [];
  const topLevelPorts: string[] = [];

  wires.forEach((wire, index) => {
    const startKey = `${wire.start.instanceId}_${wire.start.portIndex}`;
    const endKey = `${wire.end.instanceId}_${wire.end.portIndex}`;
    
    let existingSig = portToSignalMap.get(startKey) || portToSignalMap.get(endKey);
    
    if (!existingSig) {
        existingSig = `net_${index}`;
        signalDeclarations.push(`    signal ${existingSig} : ${wire.width > 1 ? `std_logic_vector(${wire.width - 1} downto 0)` : 'std_logic'};`);
    }
    
    portToSignalMap.set(startKey, existingSig);
    portToSignalMap.set(endKey, existingSig);
  });

  // 3. Process Top-Level IO Pins
  instances.filter(i => i.templateName === 'PIN_INPUT' || i.templateName === 'PIN_OUTPUT').forEach(pinInst => {
      const isInput = pinInst.templateName === 'PIN_INPUT';
      const portName = sanitize(pinInst.instanceName);
      const mainPort = pinInst.data.ports[0];
      const type = mainPort.width > 1 ? `std_logic_vector(${mainPort.width - 1} downto 0)` : 'std_logic';
      topLevelPorts.push(`        ${portName} : ${isInput ? 'IN' : 'OUT'} ${type}`);
  });

  // 4. Build Component Declarations
  const componentDecls = Array.from(uniqueSymbols.values()).map(sym => {
    const ports = sym.ports.map(p => {
        const dir = p.type.toUpperCase();
        const type = p.width > 1 ? `std_logic_vector(${p.width - 1} downto 0)` : 'std_logic';
        return `            ${sanitize(p.name)} : ${dir} ${type}`;
    }).join(';\n');
    return `    component ${sanitize(sym.name)}\n        port (\n${ports}\n        );\n    end component;`;
  }).join('\n\n');

  // 5. Build Instantiations and Glue Logic blocks
  const bodyItems = instances
    .filter(i => i.templateName !== 'PIN_INPUT' && i.templateName !== 'PIN_OUTPUT')
    .map(inst => {
        const instSanitizedName = sanitize(inst.instanceName);

        if (inst.isGlueLogic && inst.glueLogic) {
            // Glue logic: replace internal port names with connected signals in the provided code
            let processedCode = inst.glueLogic.vhdlCode;
            inst.glueLogic.ports.forEach((p, idx) => {
                let sig = portToSignalMap.get(`${inst.id}_${idx}`) || 'open';
                const connectedPin = instances.find(i => 
                    (i.templateName === 'PIN_INPUT' || i.templateName === 'PIN_OUTPUT') && 
                    portToSignalMap.get(`${i.id}_0`) === sig
                );
                if (connectedPin) sig = sanitize(connectedPin.instanceName);
                
                // Simple regex replacement for port names in user code
                const regex = new RegExp(`\\b${p.name}\\b`, 'g');
                processedCode = processedCode.replace(regex, sig);
            });

            return `    -- Glue Logic: ${instSanitizedName}\n    ${processedCode}`;
        } else {
            const templateSanitizedName = sanitize(inst.templateName);
            const mappings = inst.data.ports.map((p, idx) => {
                let sig = portToSignalMap.get(`${inst.id}_${idx}`) || 'open';
                const connectedPin = instances.find(i => 
                    (i.templateName === 'PIN_INPUT' || i.templateName === 'PIN_OUTPUT') && 
                    portToSignalMap.get(`${i.id}_0`) === sig
                );
                if (connectedPin) sig = sanitize(connectedPin.instanceName);
                return `            ${sanitize(p.name)} => ${sig}`;
            }).join(',\n');
            return `    ${instSanitizedName} : ${templateSanitizedName}\n        port map (\n${mappings}\n        );`;
        }
  }).join('\n\n');

  const filteredSignalDeclarations = signalDeclarations.filter(sigLine => {
      const parts = sigLine.trim().split(/\s+/);
      const sigName = parts[1];
      return !instances.some(i => 
          (i.templateName === 'PIN_INPUT' || i.templateName === 'PIN_OUTPUT') && 
          portToSignalMap.get(`${i.id}_0`) === sigName
      );
  });

  return `------------------------------------------------------------
-- Generated by BSF Visualizer
------------------------------------------------------------

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity ${topEntityName} is
    port (
${topLevelPorts.join(';\n')}
    );
end ${topEntityName};

architecture Structural of ${topEntityName} is

    -- Component Declarations
${componentDecls}

    -- Signal Declarations
${filteredSignalDeclarations.join('\n')}

begin

${bodyItems}

end Structural;
`;
}
