'use strict';

class TestsIO extends MemIO {
    constructor(con, type) {
        super(con, 3);            // max memory size
        this.type = type;         // current type
    }
    input(p) {
        return 0;                 // no input
    }
    output(p, v) {
        if (v < 8) v = 32;
        console.log(String.fromCharCode(v), console.NB);
    }
    add(strt_a, end_a, wr, rd) {} // 8086 stub
    int(num) {}                   // 8086 stub
    setChipset(crt, kbd) {}       // 8086 stub
}

class TestsMonitor extends Monitor {
    constructor(emu) {
        super(emu);
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
                case 'cpu':
                    if (parms.length < 2) {
                        switch (this.emu.memo.type) {
                            case 0: console.log('Intel 8080 (КР580ВМ80А)'); break;
                            case 1: console.log('Zilog Z80'); break;
                            case 2: console.log('MOS 6502'); break;
                            case 3: console.log('Intel 8086'); break;
                            case 4: console.log('Intel 80186 (partial)'); break;
                        }
                        break;
                    }
                    const num = pi(parms[1], false);
                    if (num === this.emu.memo.type) break;
                    if (num >= 0 && num <= 4) {
                        new GenCpu(this.emu.memo, num);
                        this.emu.memo.type = num;
                        this.emu.CPU = this.emu.memo.CPU;
                    }
                    else console.error(`invalid CPU type: ${num}`);
                    break;
                case 'test':
                    if (parms.length < 2) {
                        switch (this.emu.memo.type) {
                            case 0: console.log('names: 8080test 80z80test 8080pre 8080ex1'); break;
                            case 1: console.log('names: 80z80test z80exall'); break;
                            case 2:
                                console.log('IDs: 0 - all valid opcodes test,', console.NB);
                                console.log('1 - extended opcodes test, 2 - interrupts test');
                                break;
                            case 3:
                            case 4:
                                console.log(
                                'names: add bcdcnv bitwise cmpneg control datatrnf div interrupt');
                                console.log(
                                '       jmpmov jump1 jump2 mul rep rotate segpr shifts strings sub');
                                console.log(
                                '       codegolf');
                                break;
                        }
                        break;
                    }
                    this.emu.CPU.cpu.reset();
                    for (let i = 0; i < 1024; i++) this.emu.memo.wr(i, 0x00); // clear memory
                    switch (this.emu.memo.type) {
                        case 0:
                        case 1:
                            this.emu.loadBin(await loadFile(`tests/${parms[1].toUpperCase()}.COM`,
                                    false), 0x0100);
                            this.emu.loadBin([ // CP/M stub
                                0x3e,0x0a,0xd3,0x00,0x76,0x3e,0x02,0xb9,0xc2,0x0f,0x00,0x7b,0xd3,
                                0x00,0xc9,0x0e,0x24,0x1a,0xb9,0xc2,0x17,0x00,0xc9,0xd3,0x00,0x13,
                                0xc3,0x11,0x00
                            ], 0x0000);
                            this.emu.CPU.cpu.setRegisters(['x', 'sp', '0', 'pc', '100']);
                            await this.runTest(this.emu.CPU.CPU_INSTR_CNT * 1000);
                            break;
                        case 2:
                            switch (pi(parms[1])) {
                                case 0:
                                    console.log('all valid opcodes test: ', console.NB);
                                    this.emu.loadBin(await loadFile('tests/N6502TEST.BIN',
                                            false), 0x0000);
                                    this.emu.CPU.cpu.setPC(0x400);
                                    await this.runTest(1200000000, 0x3469);
                                    console.log((this.emu.CPU.cpu.getPC() === 0x3469) ?
                                            'ok' : 'error');
                                    break;
                                case 1:
                                    const sav = this.emu.memo.wr;     // override memo write
                                    let skip = false;
                                    this.emu.memo.wr = (a, v) => {
                                        if (a === 0xf000) {           // $F000 - console output
                                            if (!skip && v === 70) skip = true;
                                            else if (skip && v === 45) skip = false;
                                            if (!skip)
                                                console.log(String.fromCharCode(v), console.NB);
                                        }
                                        else sav.call(this.emu.memo, a, v);
                                    };
                                    console.log('extended opcodes test:');
                                    this.emu.loadBin(await loadFile('tests/N6502TEST_EXT.BIN',
                                            false), 0x2000);          // STA $F000 : RTS - print char
                                    this.emu.loadBin([0x8d, 0x00, 0xf0, 0x60], 0x2033);
                                    this.emu.loadBin([0x02], 0x202b); // KIL - stop on tests end
                                    this.emu.loadBin([0x02], 0x22bf); // KIL - stop on test fail
                                    this.emu.CPU.cpu.setPC(0x2000);
                                    await this.runTest(1000000, 0x10000);
                                    this.emu.memo.wr = sav;           // restore memo write
                                    break;
                                case 2:
                                    console.log('interrupts test: ', console.NB);
                                    this.emu.loadBin(await loadFile('tests/N6502TEST_INT.BIN',
                                            false), 0x0400);
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
                                    console.log((tmp === 0x06ec) ? 'ok' : 'error');
                                    break;
                                default: console.error(`invalid ID: ${parms[1]}`); break;
                            }
                            break;
                        case 3:
                        case 4:
                            if ((tmp = parms[1]) === 'codegolf') {
                                this.emu.loadBin(await loadFile('tests/CODEGOLF', false), 0x00000);
                                this.emu.CPU.cpu.setRegisters(
                                        ['x', 'cs', '0000', 'ip', '0000', 'sp', '0100']);
                                await this.runTest(this.emu.CPU.CPU_INSTR_CNT);
                                let str = '';
                                for (let i = 0x08000; i <= 0x087cf; i++) { // print screen
                                    const addr = i - 0x08000, y = addr / 80 | 0, x = addr % 80;
                                    let value = this.emu.memo.rd(i);
                                    if (value < 8) value = 0x20;
                                    str += String.fromCharCode(value);
                                    if (x === 79) {
                                        console.log(str); str = '';
                                    }
                                }
                                break;
                            }
                            console.log(`${tmp}: `, console.NB);
                            this.emu.loadBin(await loadFile(`tests/${tmp.toUpperCase()}.BIN`,
                                    false), 0xf0000);
                            this.emu.CPU.cpu.setRegisters(['x', 'cs', 'f000', 'ip', 'fff0']);
                            await this.runTest(this.emu.CPU.CPU_INSTR_CNT);
                            if (tmp === 'jmpmov')
                                console.log(
                                    ((this.emu.memo.rd(0) | this.emu.memo.rd(1) << 8) === 0x4001) ?
                                    'ok' : 'error'
                                );
                            else {
                                const idx = await loadFile(`tests/RES_${tmp.toUpperCase()}.BIN`,
                                        false),
                                      len = (tmp === 'mul') ? 0x80 :   // only OF, CF flags set
                                              (tmp === 'div') ? 0x90 : // flags undefined
                                              idx.length;
                                tmp = '';
                                for (let i = 0; i < len; i++) {
                                    const t_exp = idx[i], t_org = this.emu.memo.rd(i);
                                    if (t_exp !== t_org) {
                                        tmp = `${fmt(i, 5)} - ${fmt(t_exp)}.${fmt(t_org)}`;
                                        break;
                                    }
                                }
                                console.log((tmp.length === 0) ? 'ok' : `error (${tmp})`);
                            }
                            break;
                    }
                    break;
                default: await super.handler(parms, cmd); break;
            }
        } catch (e) {
            console.error(e.stack);
        }
    }
}

async function main() {
    const loads = [
        loadScript('js/js8080.js'), loadScript('js/jsZ80.js'),
        loadScript('js/js6502.js'), loadScript('js/js8086.js'),
        loadScript('js/chipset.js')
    ];
    await Promise.all(loads);
    const mem = new TestsIO(null, 0),
          cpu = new GenCpu(mem, 0),
          emu = new Emulator(cpu, mem, 0),
          mon = new TestsMonitor(emu);
    console.MAX_LENGTH = term._prms.MAX_LENGTH = 100000; // keep more lines
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
