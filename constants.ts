
export const PIN_INPUT_BSF = `(symbol (rect 0 0 80 40)
  (text "INPUT" (rect 5 5 50 20) (font "Arial" (font_size 8)))
  (port (pt 80 20) (output) (text "PIN" (rect 60 15 75 25) (font "Arial" (font_size 8))) (line (pt 80 20) (pt 60 20)))
  (drawing (line (pt 0 10) (pt 60 10)) (line (pt 60 10) (pt 60 30)) (line (pt 60 30) (pt 0 30)) (line (pt 0 30) (pt 0 10))))`;

export const PIN_OUTPUT_BSF = `(symbol (rect 0 0 80 40)
  (text "OUTPUT" (rect 5 5 55 20) (font "Arial" (font_size 8)))
  (port (pt 0 20) (input) (text "PIN" (rect 5 15 20 25) (font "Arial" (font_size 8))) (line (pt 0 20) (pt 20 20)))
  (drawing (line (pt 20 10) (pt 80 10)) (line (pt 80 10) (pt 80 30)) (line (pt 80 30) (pt 20 30)) (line (pt 20 30) (pt 20 10))))`;

export const DEFAULT_BSF_SAMPLE = `// This file was created in Quartus
(header "symbol" (version "0.1"))
(symbol (rect 100 100 260 180)(text "2x8mux"(rect 62 0 108 16)(font "Arial"(font_size 10)))(text "0"(rect 3 69 7 79)(font "Arial"(font_size 6)))
	(port (pt 0 24)(input)(text "SEL"(rect 20 16 39 30)(font "Arial"(font_size 8)))(text "SEL"(rect 20 16 39 30)(font "Arial"(font_size 8)))
		(line (pt 0 24)(pt 16 24)(line_width 1)))
	(port (pt 0 40)(input)(text "A[7..0]"(rect 20 32 52 46)(font "Arial"(font_size 8)))(text "A[7..0]"(rect 20 32 52 46)(font "Arial"(font_size 8)))
		(line (pt 0 40)(pt 16 40)(line_width 1)))
	(port (pt 0 56)(input)(text "B[7..0]"(rect 20 48 51 62)(font "Arial"(font_size 8)))(text "B[7..0]"(rect 20 48 51 62)(font "Arial"(font_size 8)))
		(line (pt 0 56)(pt 16 56)(line_width 1)))
	(port (pt 160 24)(output)(text "Y[7..0]"(rect 108 17 140 31)(font "Arial"(font_size 8)))(text "Y[7..0]"(rect 108 17 140 31)(font "Arial"(font_size 8)))
		(line (pt 144 24)(pt 160 24)(line_width 1)))
	(drawing (text "8 X 8 MULTIPLEXER"(rect 37 65 132 79)(font "Arial"(font_size 8)))
		(line (pt 16 16)(pt 144 16)(line_width 1))
		(line (pt 16 64)(pt 144 64)(line_width 1))
		(line (pt 16 64)(pt 16 16)(line_width 1))
		(line (pt 144 64)(pt 144 16)(line_width 1))))`;
