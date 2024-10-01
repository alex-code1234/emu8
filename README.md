# 8-bit emulators

The code is plain javascript without external libraries.
Core functionality is provided by following files, which serve as the extendable generic emulator:
- index.html \- configurabe by URL parameters UI, implements base monitor commands, CPU run/stop/tests and debug windows
- hardware.js \- configurator and base implementation of emulator blocks \(CPU, memory, terminal and keyboard)
- monitor.js \- VT-100 terminal with support of ESC sequences and VGA colors by default
- utils.js \- supporting code, implements file operations, dynamic loading, formatting and simple oscillograph
- cp437.ttf \- terminal's font
- disks.js \- disk drives support

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

By default mobile soft keyboard is supported, to use hardware keyboard (or run on non mobile device) add special 
parameter **hw_kbd=true** to the URL.

There is special parameter **zoom** to enlarge emulated display to 100%. 4 comma delimited numbers are
passed: scale_x, scale_y, margin_left, margin_top. 2 predefined values are **tablet** and **tv**.

UI structure:
- HTML input element to interact with system monitor \(command followed by \<CR> key)
- canvas element for the terminal \(can be hidden)
- console logging space

System monitor keeps history of last 7 commands \(access by CTRL-w, implemented in index.html) and supports following
commands \(all parameters are HEX numbers, if not specified; the emulator must be stopped first with CTRL-n
(default) or CTRL-s (if hardware keyboard used)):
- **\<empty>** \- one step execution
- **x** \- show/set CPU registers/flags: x \[name1 value1 ...], where name is register/flag name
- **g** \- execute program: g \[addr], if no addr then continue execution from the last stop
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
- **cls** \- clear console: cls
- **tests** \- show list of available tests for processor: tests
- **test** \- execute CPU test: test name, where name is test name/id from the list<br>
           Some tests require 64K memory with 100% R/W access, not compatible with all emulators
- **boot** \- load emulator configuration: boot name \[fnc], where name is block name, fnc is function name to call

If added block\(s) requested oscillograph, the monitor supports additional commands:
- **sadr** \- set memory address to monitor: sadr addr
- **sadd** \- add graph to show data bit changes: sadd mask \[color width], where mask is bit extract mask 0x01..0x80,
           color is html color and width is int number for graph line width
- **srem** \- remove graph: srem mask
- **swdt** \- set graphs width: swdt num, where num is graphs width in pixels
- **spts** \- set graphs max points: spts num, where num is max number of points to store for graphs

[Generic emulator online](https://alex-code1234.github.io/emu8/)

## KIM-1 emulator

kim1 folder contains kim.js module \- the emulator of KIM-1 SBC, created by extending the generic emulator.
The folder also contains:
- KIM-1.jpg \- used to create realistic UI \(idea of Maksim Korzh), 7-segment LEDs and keys on keypad are operational
- KIM-1_65302.bin \- original image of RIOT 002
- KIM-1_65303.bin \- original image of RIOT 003
- TinyBasic.ptp \- paper tape with Tiny Basic for KIM-1 \(start at 0x2000)
- MSBasic.ptp \- paper tape witn Microsoft K9 Basic \(start at 0x4065)

[The emulator](https://alex-code1234.github.io/emu8/?boot=kim1/kim) is loaded by adding boot=kim1/kim URL parameter
to the generic emulator URL. Audio cassette and TTY interfaces are both supported. 6530-003 timer generates NMI \- A-15
\(6530-003 PB7) is connected to E-6 \(NMI). Switch on by pressing \<RS> button.

Added system monitor commands:
- **tty** \- TTY on/off: tty num, where num is 1 to activate TTY or 0 to deactivate
- **ptr** \- paper tape reader load tape (TTY must be active): ptr fn, where fn is ptp file name<br>
          Before loading the tape, start the emulator, type L, stop emulator, load tape and start emulator again
- **ptp** \- paper tape puncher load empty tape (TTY must be active): ptp fn, where fn is ptp file name to create<br>
          First load the tape, start the emulator, set end and start addresses and type Q (see KIM-1 manual)

Experimental \(test) commands:
- **. 8** \- load Woz monitor: . 8, emulator auto starts \(TTY must be active)
- **. 7** \- first book programs list: . 7, \(7-segment indicators must be active)

## Orion-128 emulator

[The emulator](https://alex-code1234.github.io/emu8/?boot=orion128/orion) is loaded by adding boot=orion128/orion URL
parameter to the generic emulator URL. Start by **on** command.

## Apple I and II emulators

[The emulator I](https://alex-code1234.github.io/emu8/?boot=apple/apple&boot_name=aI) has Woz monitor, Basic,
Krusader and A1 assembler pre-loaded. Start by **on** command.<br>
[The emulator II](https://alex-code1234.github.io/emu8/?boot=apple/apple) supports Disk II interface on slot 6 with
pre-loaded Dos 3.3 disk. 2 variants of Apple II emulated:
- Apple IIe with 80-columns +64K card (80-columns not supported), start by **on e** command
- Apple II with language card +16K, start by **on** command

Only text mode supported.

## UCSD-Pascal emulator

[The emulator](https://alex-code1234.github.io/emu8/?boot=ucsd/ucsd) is loaded by adding boot=ucsd/ucsd URL
parameter to the generic emulator URL. Start by **on** command.

## IBM PC XT (5160) emulator

[The emulator](https://alex-code1234.github.io/emu8/?boot=8086/ibm&boot_name=xt) is loaded by adding
boot=8086/ibm&boot_name=xt URL parameter to the generic emulator URL. Uses only original software, no specialized ROMs.
Start by **on** command with optional parameter (true|false) to execute BIOS tests during boot (default true).<br>
Configuration: BIOS - IBM XT rev.1 11/08/82 (bios2.bin), IBM EGA 64K monitor (ibm_ega.bin), 2 FDC (empty) and
pre-loaded 10M HDC.

Also emulates IBM PC 5150 by removing boot_name parameter from URL.
Configuration: BIOS - IBM rev.3 10/27/82 (bios.bin), CGA monitor and 2 FDC pre-loaded with PC DOS 3.30.

## CP/M and MP/M emulator

[The emulator](https://alex-code1234.github.io/emu8/?boot=cpm/cpm&boot_name=cpm22) is loaded by adding
boot=cpm/cpm URL parameter to the generic emulator URL. **boot_name** parameter specifies OS to run:
- **cpm22** \- CP/M 2.2 \(default, 64K memory, 8080 or Z80 cpu)
- **cpm30** \- CP/M 3.0 \(160K banked memory, 8080 or Z80 cpu)
- **mpm** \- MP/M II 2.0 \(400K banked memory, 8080 or Z80 cpu)

CPU can be changed by monitor command **cpu** before OS loading or by adding URL parameter **cpu_type**<br>
All configurations support 4 256K floppy drives A:, B:, C: and D: \(with drive numbers 0..3)<br>
MP/M also supports 4M hard drives I:, J: \(8..9) and 512M hard drive P: \(15)<br>

Added system monitor commands<br>
All versions:
- **disk** \- mount disk: disk drv fname|size, where drv is drive number, fname is disk image file name,
           size is disk image size \(in bytes) to specify empty disk
           \(256256 for 0..3, 4177920 for 8..9, 536870912 for 15)
- **dump** \- save disk image: dump drv
- **read** \- read file from disk: read drv fname
- **write** \- write file to disk: write drv fname
- **basic** \- start MS 8080 Basic: basic
- **on** \- boot OS: on true|false, where true|false is flag to auto mount drives \(default true)
         bootable OS disk is mounted to drive A: \(cpma.cpm, cpm3a.cpm or mpma.cpm) and
         additional software disk is mounted to drive B: \(cpmb_turbo.cpm, cpm3b.cpm)
         or empty I: drive \(for MP/M)
- **ccopy** \- get/set save console data flag: ccopy \[true|false]. true \- save scrolled out console data
            \(clear previous data)
- **console** \- show saved console data

CP/M 2.2 and CP/M 3.0:
- **printer** \- download printer device output: printer
- **tape** \- mount tape to tape reader device: tape fname \[adr len], where fname is file name,
           binary files can be converted to Intel HEX data with:
           adr \- binary file address \(hex value), len \- HEX line length \(hex value, default 20)
- **puncher** \- download tape puncher device output: puncher
- **bank** \- get/set active memory bank: bank \[num], where num is page number \(0..2), CP/M 3.0 only

MP/M:
- **bank** \- get/set active memory bank: bank \[num], where num is page number \(0..7)

## Extending generic emulator

To implement new emulator, at least one javascript module should be created and loaded by using the boot=module URL
parameter when generic emulator starts. Alternatively, the module can be loaded after starting by using **boot**
command. The module should define a main function, which is specified by boot_name=fname URL parameter or has the same
name as module. The function has signature async function(scr), where scr is canvas id, defined in index.html. It
should create and return an object with following structure:
- **cpu** \- CPU object with properties:
   - **reset** \- reset CPU: function()
   - **step** \- execute one step: function()
   - **setInterrupt** \- request interrupt: function(level)
   - **setRegisters** \- set CPU registers/flags: function(regs), where regs is string array
                      \[empty, name1, value1, ...]
   - **cpuStatus** \- get CPU status string: function()
   - **setPC** \- set PC value: function(value)
   - **getPC** \- get PC value: function()
   - **getSP** \- get stack pointer: function()
   - **disassembleInstruction** \- disassemble instruction at the address: function(addr)
- **memo** \- memory/IO ports/mappings object with properties:
   - **rd** \- memory read: function(addr)
   - **wr** \- memory write: function(addr, value)
   - **input** \- port input: function(port), optional, if ports exist
   - **output** \- port output: function(port, value), optional, if ports exist
   - **size** \- memory size: value, optional
   - **scope** \- oscilloscope getTime function: function(), optional, if provided, oscilloscope window will
               be available in the debugger<br>
               To better synchronize graph points with debugger, the function could return CPU step counter
               \(not provided, can be created by overriding the CPU step function)
   - **key** \- key preview, used by default keyboard implementation to pre-process keys before pushing them to
             keyboard buffer: function(key), where key is key code, returns key code or null to skip the key,
             optional
- **toggleDisplay** \- show/hide terminal: function()
- **keyboard** \- keyboard control: async function(key, code, value)
- **info** \- HW info: string, optional
- **cmd** \- command processor: async function(command, parms), optional

To support full screen mode with soft keyboard the object must have:
- **resetFS** \- reset full screen mode theme: function()
- **exitFS** \- exit full screen mode: function()
- **keyboardFS** \- soft keyboard control: function(shift, ctrl, alt, txt), where shift, ctrl and alt are
                 active modifier flags, txt - pressed button text content.
                 Default handler is implemented in **defaultHW**.keyboardFS: function(con), where
                 con is terminal object, instantiated for canvas with id **scrfs**; returns the handler.

Full screen mode is activated by **showFS** method.

To use generic emulator functionality, the main function should call **defaultHW**(scr, URLSearchParams) function and
return the result. If URLSearchParams parameter is empty, the result will be generic emulator. Customization of
returned object is possible by overriding the object's properties or replacing parts of the object by providing URL
parameters for URLSearchParams:
- **mon** \- create terminal: async function(scr), where scr is canvas id, returns object with properties:
   - **con** \- actual terminal object, must have at least **print** property: function(str)
   - **toggleDisplay** \- show/hide terminal: function()
   - **cinfo** \- terminal info: string, optional
- **mem** \- create memory: async function(con), where con is actual terminal object, returns memory/IO
          ports/mappings object
- **cpu** \- create CPU: async function(memo), where memo is memory/IO ports/mappings object, returns CPU object
- **kbd** \- create keyboard: async function(con, memo), where con is actual terminal object and memo is memory/IO
          ports/mappings object, returns object with properties:
   - **keyboard** \- keyboard control: async function(key, code, value)
   - **kinfo** \- keyboard info: string, optional

Every URL parameter has accompaning parameter param **_name** to specify a function name to call \(not needed if the
function name is the same as module name), while the parameter specifies a module name to load \(not needed if the
module is already loaded).

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
KIM-1 information (http://retro.hansotten.nl/6502-sbc/kim-1-manuals-and-software/)<br>
KIM-1 manuals (https://web.archive.org/web/20220831205542/http://users.telenet.be/kim1-6502/)<br>
KIM-1 ROMs (https://github.com/w4jbm/PAL-1-6502-SBC/tree/main)<br>
apple2js (https://github.com/whscullin/apple2js)
