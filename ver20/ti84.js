'use strict';

class ExtMemIO extends MemIO {
    constructor(con, type, gsx_support) {
        super(con, type, gsx_support);
        this.sconsole = '';                    // console buffer
        this.ccopy = false;                    // console buffer enabled
    }
    output(p, v) {
        this.con.display(v &= 0xff);
        if (this.ccopy) this.sconsole += String.fromCharCode(v);
    }
    int(num) {}                                // 8086 stub
    setChipset(crt, kbd) {}                    // 8086 stub
}

class ExtMonitor extends Monitor {
    constructor(emu, debug_height, logger) {
        super(emu, debug_height, logger);
    }
    async runTest(instrs, stop = null) {
        const tmpInst = this.emu.CPU.CPU_INSTR_CNT, tmpStp = this.emu.CPU.HLT_STOP;
        this.emu.CPU.CPU_INSTR_CNT = instrs; this.emu.CPU.HLT_STOP = true;
        if (stop !== null) this.emu.CPU.STOP = stop;
        try { await this.emu.CPU.run(); }
        finally { this.emu.CPU.CPU_INSTR_CNT = tmpInst; this.emu.CPU.HLT_STOP = tmpStp; }
    }
    async handler(parms, cmd) {
        try {
            let tmp;
            switch (cmd) {
                case 'copy':                   // console output snapshot
                    if (parms.length < 2) {
                        console.log(this.emu.memo.sconsole);
                        this.emu.memo.ccopy = false; this.emu.memo.sconsole = '';
                    }
                    else this.emu.memo.ccopy = parms[1] === '1';
                    break;
                case 'esc':                    // send string to console
                    if (parms.length < 2) { console.error('missing: str'); break; }
                    this.emu.memo.con.print(parms[1]);
                    break;
                case 'kbd':                    // send string to keyboard buffer
                    if (parms.length < 2) { console.error('missing: str'); break; }
                    tmp = parms[1].replaceAll('\\n', '\r').replaceAll('\\s', ' ');
                    for (let i = 0, n = tmp.length; i < n; i++) {
                        this.emu.memo.con.kbd.push(tmp.charCodeAt(i));
                        await delay(15);
                    }
                    break;
                case 'tests':                  // print test names
                    switch (this.emu.memo.type) {
                        case 0: console.log('names: 8080test 80z80test 8080pre 8080ex1'); break;
                        case 1: console.log('names: 80z80test z80exall'); break;
                        case 2:
                            console.log('IDs: 0 - all valid opcodes test,', console.NB);
                            console.log('1 - extended opcodes test, 2 - interrupts test');
                            break;
                        case 3:
                        case 4:
                            console.log('names: add bcdcnv bitwise cmpneg control datatrnf div interrupt');
                            console.log('       jmpmov jump1 jump2 mul rep rotate segpr shifts strings sub');
                            console.log('       codegolf');
                            break;
                    }
                    break;
                case 'test':                   // run CPU test
                    this.emu.CPU.cpu.reset();
                    switch (this.emu.memo.type) {
                        case 0:
                        case 1:
                            if (parms.length < 2) { console.error('missing: nm'); break; }
                            this.emu.loadBin(await loadFile(`tests/${parms[1].toUpperCase()}.COM`, false), 0x0100);
                            this.emu.loadBin([ // CP/M stub
                                0x3e,0x0a,0xd3,0x00,0x76,0x3e,0x02,0xb9,0xc2,0x0f,0x00,0x7b,0xd3,0x00,0xc9,
                                0x0e,0x24,0x1a,0xb9,0xc2,0x17,0x00,0xc9,0xd3,0x00,0x13,0xc3,0x11,0x00
                            ], 0x0000);
                            this.emu.CPU.cpu.setRegisters(['x', 'sp', '0', 'pc', '100']);
                            await this.runTest(this.emu.CPU.CPU_INSTR_CNT * 1000);
                            break;
                        case 2:
                            if (parms.length < 2) { console.error('missing: ID'); break; }
                            switch (pi(parms[1])) {
                                case 0:
                                    this.emu.memo.con.print('all valid opcodes test:_'); await delay(0);
                                    this.emu.loadBin(await loadFile('tests/N6502TEST.BIN', false), 0x0000);
                                    this.emu.CPU.cpu.setPC(0x400);
                                    await this.runTest(1200000000, 0x3469);
                                    this.emu.memo.con.print((this.emu.CPU.cpu.getPC() === 0x3469) ? 'ok~' : 'error~');
                                    break;
                                case 1:
                                    const sav = this.emu.memo.wr;                       // override memo write
                                    this.emu.memo.wr = (a, v) => {
                                        if (a === 0xf000) this.emu.memo.con.display(v); // $F000 - console output
                                        else sav.call(this.emu.memo, a, v);
                                    };
                                    this.emu.memo.con.print('extended opcodes test:~'); await delay(0);
                                    this.emu.loadBin(await loadFile('tests/N6502TEST_EXT.BIN', false), 0x2000);
                                    this.emu.loadBin([0x8d, 0x00, 0xf0, 0x60], 0x2033); // STA $F000 : RTS - print char
                                    this.emu.loadBin([0x02], 0x202b);                   // KIL - stop on tests end
                                    this.emu.loadBin([0x02], 0x22bf);                   // KIL - stop on test fail
                                    this.emu.CPU.cpu.setPC(0x2000);
                                    await this.runTest(1000000, 0x10000);
                                    this.emu.memo.wr = sav;                             // restore memo write
                                    break;
                                case 2:
                                    this.emu.memo.con.print('interrupts test:_________'); await delay(0);
                                    this.emu.loadBin(await loadFile('tests/N6502TEST_INT.BIN', false), 0x0400);
                                    this.emu.CPU.cpu.setPC(0x400);
                                    do {
                                        tmp = this.emu.CPU.cpu.getPC(); this.emu.CPU.cpu.step();
                                        switch (tmp) {
                                            case 0x0434: case 0x0464: case 0x04a3: case 0x04de:
                                                this.emu.CPU.cpu.setInterrupt(1);
                                                break;
                                            case 0x05c8: case 0x05f8: case 0x0637: case 0x0672:
                                                this.emu.CPU.cpu.setInterrupt(0);
                                                break;
                                            case 0x06a0: case 0x06db:
                                                this.emu.CPU.cpu.setInterrupt(1);
                                                this.emu.CPU.cpu.setInterrupt(0);
                                                break;
                                        }
                                    } while (tmp !== this.emu.CPU.cpu.getPC());
                                    this.emu.memo.con.print((tmp === 0x06ec) ? 'ok~' : 'error~');
                                    break;
                                default: console.error(`invalid ID: ${parms[1]}`); break;
                            }
                            break;
                        case 3:
                        case 4:
                            if (parms.length < 2) { console.error('missing: nm'); break; }
                            if ((tmp = parms[1]) === 'codegolf') {
                                this.emu.loadBin(await loadFile('tests/CODEGOLF', false), 0x00000);
                                this.emu.CPU.cpu.setRegisters(['x', 'cs', '0000', 'ip', '0000', 'sp', '0100']);
                                this.emu.memo.con.print('^[?25l');                      // hide cursor to stop scroll
                                await this.runTest(this.emu.CPU.CPU_INSTR_CNT);
                                for (let i = 0x08000; i <= 0x087cf; i++) {              // print screen
                                    const addr = i - 0x08000, y = addr / 80 | 0, x = addr % 80;
                                    let value = this.emu.memo.rd(i);
                                    if (value === 0) value = 0x20;
                                    this.emu.memo.con.print(`^[${y + 1};${x + 1}H`);
                                    this.emu.memo.con.display(value);
                                }
                                this.emu.memo.con.print('^[?25h');                      // show cursor
                                break;
                            }
                            this.emu.memo.con.print(`${tmp}:_`); await delay(0);
                            for (let i = 0; i < 1024; i++) this.emu.memo.wr(i, 0x00);   // clear memory
                            this.emu.loadBin(await loadFile(`tests/${tmp.toUpperCase()}.BIN`, false), 0xf0000);
                            this.emu.CPU.cpu.setRegisters(['x', 'cs', 'f000', 'ip', 'fff0']);
                            await this.runTest(this.emu.CPU.CPU_INSTR_CNT);
                            if (tmp === 'jmpmov')
                                this.emu.memo.con.print(
                                    ((this.emu.memo.rd(0) | this.emu.memo.rd(1) << 8) === 0x4001) ?
                                    'ok~' : 'error~'
                                );
                            else {
                                const idx = await loadFile(`tests/RES_${tmp.toUpperCase()}.BIN`, false),
                                      len = (tmp === 'mul') ? 0x80 :                    // only OF, CF flags set
                                              (tmp === 'div') ? 0x90 :                  // flags undefined
                                              idx.length;
                                tmp = '';
                                for (let i = 0; i < len; i++) {
                                    const t_exp = idx[i], t_org = this.emu.memo.rd(i);
                                    if (t_exp !== t_org) {
                                        tmp = `${fmt(i, 5)}_-_${fmt(t_exp)}.${fmt(t_org)}`;
                                        break;
                                    }
                                }
                                this.emu.memo.con.print((tmp.length === 0) ? 'ok~' : `error_(${tmp})~`);
                            }
                            break;
                    }
                    break;
                case 'help':
                    term.write('<Enter>              ', 'var(--secondary)');
                    term.print('CPU one step');
                    term.write('x [reg/flg val ...]  ', 'var(--secondary)');
                    term.print('print/set CPU registers/flags');
                    term.write('g [adr] [- stop]     ', 'var(--secondary)');
                    term.print('start CPU from adr to stop address');
                    term.write('step [adr]           ', 'var(--secondary)');
                    term.print('step CPU till adr or next instruction');
                    term.write('debug                ', 'var(--secondary)');
                    term.print('start interactive debugger');
                    term.write('quit                 ', 'var(--secondary)');
                    term.print('exit interactive debugger');
                    term.write('refresh              ', 'var(--secondary)');
                    term.print('update interactive debugger UI');
                    term.write('wadd adr [adr ...]   ', 'var(--secondary)');
                    term.print('add memory adr to debugger`s watch panel');
                    term.write('wrem adr [adr ...]   ', 'var(--secondary)');
                    term.print('remove memory adr from debugger`s watch panel');
                    term.write('sadr adr             ', 'var(--secondary)');
                    term.print('set adr for debugger`s scope panel');
                    term.write('sadd msk [clr [wdt]] ', 'var(--secondary)');
                    term.print('add graph for bit mask with color and width to debugger`s');
                    term.print('                     scope panel; msk - bit mask, clr - color, wdt - width');
                    term.write('srem msk             ', 'var(--secondary)');
                    term.print('remove graph for bit mask from debugger`s scope panel');
                    term.write('swdt wdt             ', 'var(--secondary)');
                    term.print('set graphs width for debugger`s scope panel');
                    term.write('spts pts             ', 'var(--secondary)');
                    term.print('set graphs x-axis points pts for debugger`s scope panel');
                    term.write('d [adr]              ', 'var(--secondary)');
                    term.print('dump memory from address adr');
                    term.write('l [adr]              ', 'var(--secondary)');
                    term.print('disassemble memory from address adr');
                    term.write('m adr b [b ...]      ', 'var(--secondary)');
                    term.print('modify memory from address adr with bytes b');
                    term.write('r [a=100] fn [h=0]   ', 'var(--secondary)');
                    term.print('load file fn to memory at address a; h=1 - hex file');
                    term.write('w a1 a2              ', 'var(--secondary)');
                    term.print('get block of memory from address a1 to a2 inclusive');
                    term.write('cls                  ', 'var(--secondary)');
                    term.print('clear terminal');
                    term.write('copy [f]             ', 'var(--secondary)');
                    term.print('print screen copy / set screen copy enable flag f - 0|1');
                    term.write('esc str              ', 'var(--secondary)');
                    term.print('send str to console; ^ to ESC, _ to space, ~ to CRLF');
                    term.write('kbd str              ', 'var(--secondary)');
                    term.print('send str to keyboard buffer; \\n to CR, \\s to space');
                    term.write('tests                ', 'var(--secondary)');
                    term.print('print available CPU tests');
                    term.write('test nm              ', 'var(--secondary)');
                    term.print('run CPU test with name nm, send output to terminal');
                    break;
                default: await super.handler(parms, cmd); break;
            }
        } catch (e) {
            console.error(e.stack);
        }
    }
}

class TIMemIO extends ExtMemIO {
    constructor(con) {
        super(con, 1, false);
        this.rom = new Uint8Array(262144);
    }
    rd(a) {
        return this.rom[a];
    }
    output(p, v) {
        throw new Error(`unknown output port: ${fmt(p)}`);
    }
}

async function main() {
    await loadScript('../js/jsZ80.js');
    const con = await createCon(blue, 'VT220'),
          mem = new TIMemIO(con),
          cpu = new GenCpu(mem, 1),
          emu = new Emulator(cpu, mem, 1),
          mon = new ExtMonitor(emu),
          kbd = new Kbd(con, mon);
//    mem.rom.set(await loadFile('TI-83BIOSv1.10.bin', false), 0x0000);
    term.setPrompt('> ');
    while (true) mon.exec((await term.prompt()).trim());
}
