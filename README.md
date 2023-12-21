# 8-bit emulators

The code is plain javascript without external libraries.
Core functionality is provided by following files, which serve as the extendable generic emulator:
- index.html \- configurabe by URL parameters UI, implements base monitor commands, CPU run/stop/tests and debug windows
- hardware.js \- configurator and base implementation of emulator blocks \(CPU, memory, terminal and keyboard)
- monitor.js \- VT-100 terminal with support of ESC sequences and VGA colors by default
- utils.js \- supporting code, implements file operations, dynamic loading, formatting and simple oscillograph
- cp437.ttf \- terminal's font

All processor implementations are tested and fixed to pass extensive checking, including
8080ex1, z80exall and 6502exall tests
- js6502.js \- MOS 6502 processor
- js8080.js \- Intel 8080 processor
- jsZ80.js \- Zilog z80 processor
- js8086.js \- Intel 8086/8088 processor \(partial 80186 implementation)



## Credits:

js8080 by Chris Double (http://www.bluishcoder.co.nz/js8080/)
z80pack by Udo Munk (http://www.unix4fun.org/z80pack/)
Stefan Tramm (http://www.tramm.li/i8080/index.html)
6502.js by Gregory Estrade (https://github.com/Torlus/6502.js)
Krusader (https://github.com/st3fan/krusader)
A1 assembler (https://www.sbprojects.net/projects/apple1/a1asm.php)
CPU testing (https://github.com/Klaus2m5/6502_65C02_functional_tests)
UI ideas and KIM-1 image (https://github.com/maksimKorzh/KIM-1)
KIM-1 emulator (https://github.com/wutka/kim1-emulator)
