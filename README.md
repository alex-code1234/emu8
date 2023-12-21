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

## Generic emulator

Without adding new blocks \(javascript files), the emulator has following configuration:
- default system monitor, implemented in index.html and extended in hardware.js
- CPU, implemented in hardware.js
- VT-100 terminal with generic ANSI keyboard, implemented in hardware.js
- 64K memory for 8-bit systems or 1M memory for 16-bit systems, implemented in hardware.js
- IO system with ports or mapped memory \(depending on the CPU) to access the terminal and keyboard

Default CPU is 8080, can be changed by URL parameter cpu_type=type, where type is:
- **0**: 8080, **1**: z80, **2**: 6502, **3**: 8086, **4**: 80186

UI structure:
- HTML input element to interact with system monitor \(command followed by \<CR> key)
- canvas element for the terminal \(can be hidden)
- console logging space

System monitor supports following commands \(all parameters are HEX numbers, if not specified):
- **\<empty>** \- one step execution
- **x** \- show/set CPU registers/flags: x \[name1 value1 ...], where name is register/flag name
- **g** \- execute program: g \[addr]
- **step** \- set stop point and execute program: step \[addr], if no address - stop at next instruction
- **d** \- dump memory: d \[addr]
- **l** \- disassemble memory: l \[addr]
- **m** \- modify memory: m addr value1 \[value2 ...]
- **r** \- read file into memory: r \[addr=100] fn \[hex=0], where fn is file name, hex is 0 for binary files
        or 1 for hex files
- **w** \- write memory to binary file block.bin: w addr1 addr2, where addr1 is start address and addr2 is
        end address \(inclusive)
- **debug** \- open debug window: debug, \<CR> key to execute one step
- **quit** \- close debug window: quit
- **refresh** \- refresh debug data: refresh, provided if something changed outside the debugger
- **wadd** \- add watch addresses: wadd addr1 \[addr2 ...]
- **wrem** \- remove watch addresses: wrem addr1 \[addr2 ...]
- **cpu** \- show/set CPU type: cpu \[type], where type is 0..4
- **stop** \- show/set/clear stop point: stop \[addr], clear stop point if addr is \<none>; after stop address is
           reached it cleared automatically
- **scr** \- show/hide terminal window: scr
- **escs** \- send string to the terminal: escs str, where str is data to send to the terminal, for VT-100 can contain
           special characters \(^ converted to ESC, _ converted to space, ~ converted to CRLF)
- **tests** \- show list of available tests for processor: tests
- **test** \- execute CPU test: test name, where name is test name/id from the list
- **boot** \- load emulator configuration: boot name \[fnc], where name is block name, fnc is function name to call

If added block\(s) requested oscillograph, the monitor supports additional commands:
- **sadr** \- set memory address to monitor: sadr addr
- **sadd** \- add graph to show data bit changes: sadd mask \[color width], where mask is bit extract mask 0x01..0x80,
           color is html color and width is int number for graph line width
- **srem** \- remove graph: srem mask
- **swdt** \- set graphs width: swdt num, where num is graphs width in pixels
- **spts** \- set graphs max points: spts num, where num is max number of points to store for graphs

[Generic emulator online](https://alex-code1234.github.io/emu8/)

## Credits:

js8080 by Chris Double (http://www.bluishcoder.co.nz/js8080/)<br>
z80pack by Udo Munk (http://www.unix4fun.org/z80pack/)<br>
Stefan Tramm (http://www.tramm.li/i8080/index.html)<br>
6502.js by Gregory Estrade (https://github.com/Torlus/6502.js)<br>
Krusader (https://github.com/st3fan/krusader)<br>
A1 assembler (https://www.sbprojects.net/projects/apple1/a1asm.php)<br>
CPU testing (https://github.com/Klaus2m5/6502_65C02_functional_tests)<br>
UI ideas and KIM-1 image (https://github.com/maksimKorzh/KIM-1)<br>
KIM-1 emulator (https://github.com/wutka/kim1-emulator)<br>
