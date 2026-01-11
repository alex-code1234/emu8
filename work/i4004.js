'use strict';

function Cpu(memo) {
    let rA, fCY, test, sp, cmd, dcm, rr, cycles, rom_a, ram_c, ram_r, ram_a,
        wpm_e, wpm_n, wpm_h;
    const rSP = new Uint16Array(4),
          rRR = new Uint8Array(16),
    next = () => {
        const res = memo.rd(rSP[sp]++); rSP[sp] &= 0x0fff;
        return res;
    },
    setacc = () => {
        fCY = 0;
        if (rA & 0xf0) {
            fCY = 1; rA &= 0x0f;
        }
    },
    updateadr = () => {
        ram_c = (rr & 0xc0) >> 6;
        ram_r = (rr & 0x30) >> 4;
        ram_a = rr & 0x0f;
        rom_a = (rr & 0xf0) >> 4;
        ram_c |= dcm << 2;
    },
    ramadr = () => wpm_h << 8 | (ram_c & 0x03) << 6 | ram_r << 4 | ram_a,
    nop = () => cycles++,
    jcn = () => {
        const addr = next(),
              binv = (cmd & 0x08) != 0,
              bacc = (cmd & 0x04) != 0 && rA == 0,
              bcar = (cmd & 0x02) != 0 && fCY != 0,
              bsig = (cmd & 0x01) != 0 && test == 0;
        if (binv != (bacc || bcar || bsig)) rSP[sp] = (rSP[sp] & 0x0f00) | addr;
        cycles += 2;
    },
    fim = () => {
        const data = next(),
              num = ((cmd & 0x0e) >> 1) << 1;
        rRR[num] = (data & 0xf0) >> 4;
        rRR[num + 1] = data & 0x0f;
        cycles += 2;
    },
    src = () => {
        const num = ((cmd & 0x0e) >> 1) << 1;
        rr = (rRR[num] << 4) | rRR[num + 1];
        updateadr();
        cycles++;
    },
    fin = () => {
        const addr = (rSP[sp] & 0x0f00) | (rRR[0] << 4) | rRR[1],
              data = memo.rd(addr),
              num = ((cmd & 0x0e) >> 1) << 1;
        rRR[num] = (data & 0xf0) >> 4;
        rRR[num + 1] = data & 0x0f;
        cycles++;
    },
    jin = () => {
        const num = ((cmd & 0x0e) >> 1) << 1;
        rSP[sp] = (rSP[sp] & 0x0f00) | (rRR[num] << 4) | rRR[num + 1];
        cycles++;
    },
    jun = () => {
        rSP[sp] = ((cmd & 0x0f) << 8) | next();
        cycles += 2;
    },
    jms = () => {
        const addr = ((cmd & 0x0f) << 8) | next();
        sp++; if (sp > 3) sp = 0;
        rSP[sp] = addr;
        cycles += 2;
    },
    inc = () => {
        const num = cmd & 0x0f;
        rRR[num]++; rRR[num] &= 0x0f;
        cycles++;
    },
    isz = () => {
        const addr = next(),
              num = cmd & 0x0f;
        rRR[num]++; rRR[num] &= 0x0f;
        if (rRR[num]) rSP[sp] = (rSP[sp] & 0x0f00) | addr;
        cycles += 2;
    },
    add = () => {
        rA += fCY + rRR[cmd & 0x0f];
        setacc();
        cycles++;
    },
    sub = () => {
        rA += (~fCY & 0x01) + (~rRR[cmd & 0x0f] & 0x0f);
        setacc();
        cycles++;
    },
    ld = () => {
        rA = rRR[cmd & 0x0f];
        cycles++;
    },
    xch = () => {
        const num = cmd & 0x0f,
              temp = rA;
        rA = rRR[num]; rRR[num] = temp;
        cycles++;
    },
    bbl = () => {
        if (sp === 0) sp = 3; else --sp;
        rA = cmd & 0x0f;
        cycles++;
    },
    ldm = () => {
        rA = cmd & 0x0f;
        cycles++;
    },
    clb = () => {
        rA = fCY = 0;
        cycles++;
    },
    clc = () => {
        fCY = 0;
        cycles++;
    },
    iac = () => {
        rA++;
        setacc();
        cycles++;
    },
    cmc = () => {
        fCY = ~fCY & 0x01;
        cycles++;
    },
    cma = () => {
        rA = ~rA & 0x0f;
        cycles++;
    },
    ral = () => {
        rA = rA << 1 | fCY;
        setacc();
        cycles++;
    },
    rar = () => {
        const temp = fCY;
        fCY = rA & 0x01;
        rA = rA >> 1 | temp << 3;
        cycles++;
    },
    tcc = () => {
        rA = fCY; fCY = 0;
        cycles++;
    },
    dac = () => {
        rA--;
        fCY = 1;
        if (rA & 0xf0) {
            fCY = 0; rA &= 0x0f;
        }
        cycles++;
    },
    tcs = () => {
        rA = 9 + fCY; fCY = 0;
        cycles++;
    },
    stc = () => {
        fCY = 1;
        cycles++;
    },
    daa = () => {
        if (rA > 9 || fCY) {
            rA += 6;
            if (rA & 0xf0) {
                fCY = 1; rA &= 0x0f;
            }
        }
        cycles++;
    },
    kbp = () => {
        switch (rA) {
            case 0: case 1: case 2: break;
            case 4: rA = 3; break;
            case 8: rA = 4; break;
            default: rA = 0x0f; break;
        }
        cycles++;
    },
    dcl = () => {
        dcm = rA & 0x07;
        updateadr();
        cycles++;
    },
    wrm = () => {
        memo.wram(ram_c, ram_r, ram_a, rA);
        cycles++;
    },
    wmp = () => {
        memo.wram_port(ram_c, rA);
        cycles++;
    },
    wrr = () => {
        memo.output(rom_a, rA);
        if (rom_a === 14) wpm_e = rA & 0x01;
        else if (rom_a === 15) wpm_h = rA;
        cycles++;
    },
    wr0 = () => {
        memo.wram(ram_c, ram_r, 0x10 + 0, rA);
        cycles++;
    },
    wr1 = () => {
        memo.wram(ram_c, ram_r, 0x10 + 1, rA);
        cycles++;
    },
    wr2 = () => {
        memo.wram(ram_c, ram_r, 0x10 + 2, rA);
        cycles++;
    },
    wr3 = () => {
        memo.wram(ram_c, ram_r, 0x10 + 3, rA);
        cycles++;
    },
    sbm = () => {
        rA += (~fCY & 0x01) + (~memo.rram(ram_c, ram_r, ram_a) & 0x0f);
        setacc();
        cycles++;
    },
    rdm = () => {
        rA = memo.rram(ram_c, ram_r, ram_a);
        cycles++;
    },
    rdr = () => {
        rA = memo.input(rom_a);
        cycles++;
    },
    adm = () => {
        rA += fCY + memo.rram(ram_c, ram_r, ram_a);
        setacc();
        cycles++;
    },
    rd0 = () => {
        rA = memo.rram(ram_c, ram_r, 0x10 + 0);
        cycles++;
    },
    rd1 = () => {
        rA = memo.rram(ram_c, ram_r, 0x10 + 1);
        cycles++;
    },
    rd2 = () => {
        rA = memo.rram(ram_c, ram_r, 0x10 + 2);
        cycles++;
    },
    rd3 = () => {
        rA = memo.rram(ram_c, ram_r, 0x10 + 3);
        cycles++;
    },
    wpm = () => {
        if (wpm_e) memo.ram_wr(ramadr(), wpm_n, rA);
        else memo.output(wpm_n ? 15 : 14, memo.ram_rd(ramadr(), wpm_n));
        memo.wram(ram_c, ram_r, ram_a, rA);
        wpm_n = wpm_n ? 0 : 1;
    },
    fimsrc = () => (cmd & 0x01) ? src() : fim(),
    finjin = () => (cmd & 0x01) ? jin() : fin(),
    ops2 = [
        wrm, wmp, wrr, wpm, wr0, wr1, wr2, wr3,
        sbm, rdm, rdr, adm, rd0, rd1, rd2, rd3
    ],
    st2 = () => ops2[cmd & 0x0f](),
    ops3 = [
        clb, clc, iac, cmc, cma, ral, rar, tcc,
        dac, tcs, stc, daa, kbp, dcl, nop, nop
    ],
    st3 = () => ops3[cmd & 0x0f](),
    ops = [
        nop, jcn, fimsrc, finjin, jun, jms, inc, isz,
        add, sub, ld, xch, bbl, ldm, st2, st3
    ],
    reset = () => {
        rA = fCY = test = sp = 0;
        rSP.fill(0);
        rRR.fill(0);
        dcm = rr = rom_a = ram_c = ram_r = ram_a = 0;
        wpm_e = wpm_n = wpm_h = 0;
        cycles = 0;
    },
    step = () => {
        cmd = next();
        ops[(cmd & 0xf0) >> 4]();
        return true;
    },
    opctab = [
    'NOP  ',   '???  ',   '???  ',   '???  ',   '???  ',   '???  ',   '???  ',   '???  ',   // 00
    '???  ',   '???  ',   '???  ',   '???  ',   '???  ',   '???  ',   '???  ',   '???  ',   // 08
    '???  ',   'JCN  TZ', 'JCN  CN', '???  ',   'JCN  AZ', '???  ',   '???  ',   '???  ',   // 10
    '???  ',   'JCN  TN', 'JCN  CZ', '???  ',   'JCN  AN', '???  ',   '???  ',   '???  ',   // 18
    'FIM  P0', 'SRC  P0', 'FIM  P1', 'SRC  P1', 'FIM  P2', 'SRC  P2', 'FIM  P3', 'SRC  P3', // 20
    'FIM  P4', 'SRC  P4', 'FIM  P5', 'SRC  P5', 'FIM  P6', 'SRC  P6', 'FIM  P7', 'SRC  P7', // 28
    'FIN  P0', 'JIN  P0', 'FIN  P1', 'JIN  P1', 'FIN  P2', 'JIN  P2', 'FIN  P3', 'JIN  P3', // 30
    'FIN  P4', 'JIN  P4', 'FIN  P5', 'JIN  P5', 'FIN  P6', 'JIN  P6', 'FIN  P7', 'JIN  P7', // 38
    'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   // 40
    'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   'JUN  ',   // 48
    'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   // 50
    'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   'JMS  ',   // 58
    'INC  R0', 'INC  R1', 'INC  R2', 'INC  R3', 'INC  R4', 'INC  R5', 'INC  R6', 'INC  R7', // 60
    'INC  R8', 'INC  R9', 'INC  Ra', 'INC  Rb', 'INC  Rc', 'INC  Rd', 'INC  Re', 'INC  Rf',
    'ISZ  R0', 'ISZ  R1', 'ISZ  R2', 'ISZ  R3', 'ISZ  R4', 'ISZ  R5', 'ISZ  R6', 'ISZ  R7', // 70
    'ISZ  R8', 'ISZ  R9', 'ISZ  Ra', 'ISZ  Rb', 'ISZ  Rc', 'ISZ  Rd', 'ISZ  Re', 'ISZ  Rf',
    'ADD  R0', 'ADD  R1', 'ADD  R2', 'ADD  R3', 'ADD  R4', 'ADD  R5', 'ADD  R6', 'ADD  R7', // 80
    'ADD  R8', 'ADD  R9', 'ADD  Ra', 'ADD  Rb', 'ADD  Rc', 'ADD  Rd', 'ADD  Re', 'ADD  Rf',
    'SUB  R0', 'SUB  R1', 'SUB  R2', 'SUB  R3', 'SUB  R4', 'SUB  R5', 'SUB  R6', 'SUB  R7', // 90
    'SUB  R8', 'SUB  R9', 'SUB  Ra', 'SUB  Rb', 'SUB  Rc', 'SUB  Rd', 'SUB  Re', 'SUB  Rf',
    'LD   R0', 'LD   R1', 'LD   R2', 'LD   R3', 'LD   R4', 'LD   R5', 'LD   R6', 'LD   R7', // A0
    'LD   R8', 'LD   R9', 'LD   Ra', 'LD   Rb', 'LD   Rc', 'LD   Rd', 'LD   Re', 'LD   Rf', // A8
    'XCH  R0', 'XCH  R1', 'XCH  R2', 'XCH  R3', 'XCH  R4', 'XCH  R5', 'XCH  R6', 'XCH  R7', // B0
    'XCH  R8', 'XCH  R9', 'XCH  Ra', 'XCH  Rb', 'XCH  Rc', 'XCH  Rd', 'XCH  Re', 'XCH  Rf',
    'BBL  0',  'BBL  1',  'BBL  2',  'BBL  3',  'BBL  4',  'BBL  5',  'BBL  6',  'BBL  7',  // C0
    'BBL  8',  'BBL  9',  'BBL  a',  'BBL  b',  'BBL  c',  'BBL  d',  'BBL  e',  'BBL  f',  // C8
    'LDM  0',  'LDM  1',  'LDM  2',  'LDM  3',  'LDM  4',  'LDM  5',  'LDM  6',  'LDM  7',  // C0
    'LDM  8',  'LDM  9',  'LDM  a',  'LDM  b',  'LDM  c',  'LDM  d',  'LDM  e',  'LDM  f',  // C8
    'WRM  ',   'WMP  ',   'WRR  ',   'WPM',     'WR0  ',   'WR1  ',   'WR2  ',   'WR3  ',   // E0
    'SBM  ',   'RDM  ',   'RDR  ',   'ADM  ',   'RD0  ',   'RD1  ',   'RD2  ',   'RD3  ',   // E8
    'CLB  ',   'CLC  ',   'IAC  ',   'CMC  ',   'CMA  ',   'RAL  ',   'RAR  ',   'TCC  ',   // F0
    'DAC  ',   'TCS  ',   'STC  ',   'DAA  ',   'KBP  ',   'DCL  ',   '???  ',   '???  '    // F8
    ],
    steptab = [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 00
        2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, // 10
        2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, // 20
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 30
        2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, // 40
        2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, // 50
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 60
        2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, // 70
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 80
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 90
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // A0
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // B0
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // C0
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // D0
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // E0
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1  // F0
    ],
    disassembleInstruction = addr => {
        addr &= 0x0fff;
        const i = memo.rd(addr++); addr &= 0x0fff;
        let oper = opctab[i];
        if (steptab[i] > 1) {
            const d = memo.rd(addr++); addr &= 0x0fff;
            oper += (i > 0x3f && i < 0x60) ? fmt(((i << 8) & 0x0f00) | d) : ', ' + fmt(d);
        }
        return [addr, oper];
    },
    setRegisters = r => {
        let s = '';
        for (let i = 1; i < r.length; i += 2) {
            let reg = r[i].toLowerCase(),
                n = parseInt(r[i + 1], 16);
            switch (reg) {
                case 'a': rA = n & 0x0f; break;
                case 'fc': fCY = n ? 1 : 0; break;
                case 't': test = n ? 1 : 0; break;
                case 'pc': setPC(n); break;
                case 'r0': case 'r1': case 'r2': case 'r3': case 'r4': case 'r5':
                case 'r6': case 'r7': case 'r8': case 'r9': case 'ra': case 'rb':
                case 'rc': case 'rd': case 're': case 'rf':
                    rRR[parseInt(reg.charAt(1), 16)] = n & 0x0f;
                    break;
                default: s += ' ' + reg; break;
            }
        }
        return (s.length > 0) ? 'unknown register(s): ' + s : s;
    },
    sPn = n => fmt((rRR[n] << 4) | rRR[n + 1], 2),
    sSn = n => (sp + n) % 4,
    cpuStatus = () => {
        let s = '';
        s += `AF:${fmt(rA, 1)}${fCY} TEST:${test}|`;
        s += `P0:${sPn(0)} P1:${sPn(2)} P2:${sPn(4)} P3:${sPn(6)}|`;
        s += `P4:${sPn(8)} P5:${sPn(10)} P6:${sPn(12)} P7:${sPn(14)}||`;
        s += `${fmt(rSP[sSn(3)], 3)} ${fmt(rSP[sSn(2)], 3)} ${fmt(rSP[sSn(1)], 3)}`;
        s += `||CYCLS:${fmt(cycles, 2)}`;
        return s;
    },
    getPC = () => rSP[sp],
    setPC = v => rSP[sp] = v & 0x0fff,
    pTest = v => (v === undefined) ? test : test = v & 0x01;
    reset();
    return {
        reset, step, disassembleInstruction, setRegisters, cpuStatus, getPC, setPC, pTest,
        'cycls': () => cycles
    };
}

class I4004MemIO {
    constructor(c4001 = 16, c4002 = 16, c1101 = 16, c1702 = 16) {
        this.type = 0;   // 8bit memory
        this.CPU = null; // CPU reference
        this.rom = new Uint8Array(c4001 * 256);
        this.rom_ports = new Uint8Array(c4001);
        this.dram = [];
        this.dram_ports = new Uint8Array(c4002);
        this.ram = new Uint8Array(c1101 * 256);
        this.prom = new Uint8Array(c1702 * 256);
        for (let i = 0; i < c4002; i++) {
            const reg = [];
            for (let j = 0; j < 4; j++) reg.push(new Uint8Array(20));
            this.dram.push(reg);
        }
        this.active = 0; // active 0 - ROM, 1 - PROM, 2 - RAM
        this.c4001 = c4001;
        this.c4002 = c4002;
        this.ROM_mask = ((c4001 - 1) << 8) | 0xff;
        this.RAM_mask = ((c1101 - 1) << 8) | 0xff;
        this.PROM_mask = ((c1702 - 1) << 8) | 0xff;
    }
    rd(a) {
        return (this.active === 0) ? this.rom[a & this.ROM_mask] :
                (this.active === 1) ? this.prom[a & this.PROM_mask] :
                this.ram[a & this.RAM_mask];
    }
    wr(a, v) {
        if (this.active === 0) this.rom[a & this.ROM_mask] = v;
        else if (this.active === 1) this.prom[a & this.PROM_mask] = v;
        else this.ram[a & this.RAM_mask] = v;
    }
    input(p) {
        return this.rom_ports[p % this.c4001] & 0x0f;
    }
    output(p, v) {
        this.rom_ports[p % this.c4001] = v & 0x0f;
    }
    rram(c, r, a) {
        return this.dram[c % this.c4002][r][a] & 0x0f;
    }
    wram(c, r, a, v) {
        this.dram[c % this.c4002][r][a] = v & 0x0f;
    }
    wram_port(c, v) {
        this.dram_ports[c % this.c4002] = v & 0x0f;
    }
    ram_rd(a, n) {
        const res = this.ram[a & this.RAM_mask];
        return n ? res & 0x0f : res >> 4;
    }
    ram_wr(a, n, v) {
        const res = this.ram[a & this.RAM_mask];
        this.ram[a & this.RAM_mask] = n ?
                (res & 0xf0) | (v & 0x0f) : (res & 0x0f) | ((v << 4) & 0xf0);
    }
    reset(full = true) {
        if (full) {
            this.rom.fill(0);
            this.ram.fill(0);
            this.prom.fill(0);
        }
        this.rom_ports.fill(0);
        for (let i = 0; i < this.c4002; i++)
            for (let j = 0; j < 4; j++) this.dram[i][j].fill(0);
        this.dram_ports.fill(0);
    }
}

class I4001_0009MemIO extends I4004MemIO {
    constructor() {
        super(1, 2, 0, 0);
    }
    wram_port(c, v) {
        super.wram_port(c, v);
        if (c % this.c4002 === 1) this.output(0, ~v & 0x0f);
        else this.CPU.cpu.pTest(v >> 3);
    }
}

class ISIM4_02MemIO extends I4004MemIO {
    constructor(con) {
        super(16, 4, 16, 16);
        this.con = con;
        this.active = 0;                                                      // mode
        this.ptr = []; this.r_delay = 75; this.pcycls = 0; this.skip = false; // TTI
        this.ptpon = false;                                                   // punch on/off
        this.ptp = ''; this.wbuff = []; this.wcycls = 0;                      // TTO
    }
    sendChar(v, tokbd = true) {
        v |= 0o200;                                                    // ASR-33 code
        const buff = tokbd ? this.con.kbd : this.ptr;
        buff.push(1);                                                  // start bit
        for (let i = 0; i < 8; i++) buff.push((v & (1 << i)) ? 0 : 1); // inverted
    }
    setActive(v) {
        this.active = v;
        if (v === 1) { this.r_delay = 855; this.count = -1; }
        else { this.r_delay = 75; this.count = 0; }
        this.CPU.cpu.reset(); this.reset(false);
    }
    wram_port(c, v) {
        super.wram_port(c, v);
        if (c === 0) {
            const cycls = this.CPU.cpu.cycls(), diff = Math.abs(cycls - this.wcycls);
            this.wcycls = cycls;
            if (this.wbuff.length === 0 ||                            // possible start bit
                    this.wbuff[this.wbuff.length - 1][1] <= diff)     // subsequent data/stop bits
                this.wbuff.push([v & 0x01, diff]);
            else {                                                    // invalid timing
                if (this.wbuff.length > 6) { // byte received
                    if (this.wbuff.length === 9) // extra start bit
                        this.wbuff.shift();      // remove
                    let char = 0;
                    for (let i = 0; i < 8; i++) {
                        if (i >= this.wbuff.length) break;
                        char |= this.wbuff[i][0] << i;
                    }
                    if (this.ptpon) this.ptp += String.fromCharCode(char);
                    char &= 0x7f;
                    if (char > 0x02 && char < 0x7f) this.con.display(char);
                }
                this.wbuff[0][0] = v & 0x01; this.wbuff[0][1] = diff; // new start bit
                this.wbuff.length = 1;                                // clear buffer
            }
        }
    }
    input(p) {
        if (p === 0) {
            const buff = ((this.dram_ports[1] & 0x01 && this.ptr.length > 0) ||   // tape enabled
                          (this.ptr.length % 9) !== 0) ? this.ptr : this.con.kbd, // or started
                  cycls = this.CPU.cpu.cycls(),
                  diff = Math.abs(cycls - this.pcycls) + 10; // add 10 cycles for var. code
            this.pcycls = cycls;
            if (buff.length === 0) return 0;
            let bit = buff[0] & 0x01;
            if ((buff.length % 9) === 0 || diff >= this.r_delay) // start bit or full cycle time
                buff.shift();                    // bit processed
            else {                                               // half cycle time
                bit = 1; this.skip = true;       // bit not processed, set 0 inverted
            }
            if ((buff.length % 9) === 1 && this.skip) {          // last bit
                buff.shift(); this.skip = false; // discard last bit
            }
            return (super.input(0) & 0x0e) | bit;
        }
        return super.input(p);
    }
}

class ISIM4_02Kbd extends Kbd {
    constructor(con, mon) {
        SoftKeyboard(`sec
4 1,!..1    1,"..2 1,#..3 1,$..4 1,%..5 1,&..6 1,'..7 1,(..8 1,)..9 1,0     1,*..: 1,=.._
3 1,ESC     1,Q    1,W    1,E    1,R    1,T    1,Y    1,U    1,I    1,-..O  1,@..P 1,LF      1,CR
4 1,CTRL_c  1,A    1,S    1,D    1,F    1,G    1,H    1,J    1,[..K 1,\\..L 1,+..; 1,DEL
5 1,SHIFT_s 1,Z    1,X    1,C    1,V    1,B    1,^..N 1,]..M 1,<.., 1,>...  1,?../ 1,SHIFT_s
5 5 3       20,\u0020
        `);
        document.documentElement.style.setProperty('--key_size', '39px');
        const styles = document.styleSheets[0];
        styles.insertRule('.key { border-radius: 20px !important; }', 39);
        styles.insertRule('.sp20 { grid-column: span 8 !important; }', 39);
        super(con, mon);
    }
    trnCtrls(n) {
        return (n === 'SHIFT') ? 2 : (n === 'CTRL') ? 3 : super.trnCtrls(n);
    }
    translateKey(e, soft, isDown) {
        if (isDown) return null;                    // HW keyboard on key UP only
        switch (e.key) {
            case 'ESC': return 27;
            case 'LF': return 10;
            case 'CR': return 13;
            case 'DEL': return 127;
            case 'F10': if (this.fs_alt) return 10; // map LF for HW keyboard
            default: return super.translateKey(e, soft, isDown);
        }
    }
    processKey(val) {
        if (val >= 97/*a*/ && val <= 122/*z*/) val -= 32; // upperCase
        this.monitor.emu.memo.sendChar(val);
    }
}

class IBusicomMemIO extends I4004MemIO {
    constructor(con) {
        super(5, 2, 0, 0);
        this.con = con;
        this.init_data();
        this.columns = [
            '000000000000000 \x01#',    '111111111111111 +*',    '222222222222222 -I',
            '333333333333333 X\x02',    '444444444444444 /\x03', '555555555555555 \x04\x04',
            '666666666666666 \x05\x05', '777777777777777 ^T',    '888888888888888 =K',
            '999999999999999 \x06E',    '............... %\x07', '............... CC',
            '--------------- RM'
        ];
        this.specsym = ['<>', 'II', 'I3', 'M+', 'M-', 'SQ', 'Ex'];
    }
    init_data() {
        this.count1 = 0; this.count2 = 0; this.count3 = 0; this.kbd_cnt = 0;
        this.kbd_ptr = 0; this.kbd_buf = [0, 0, 0, 0, 0, 0];
        this.kbd_key = 0; this.kbd_shift = 0; this.kbd_mask = 0;
        this.prt_shift = 0;
        this.dg_point_switch = 0; this.round_switch = 0;
        this.lcolor = 0;
        this.line = [
            ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
            ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '
        ];
    }
    init_signals() {
        this.CPU.cpu.pTest(1); // printer drum sector signal
        this.rom_ports[2] = 0; // printer drum index signal (bit 0), paper advance btn (bit 3)
    }
    init(lights) {
        const step = this.CPU.cpu.step;
        this.CPU.cpu.step = () => {
            const res = step();
            this.count1++;                  // sector signal
            if (this.count1 > 785) {        // ~ 28ms
                this.count1 = 0;
                const test = ~this.CPU.cpu.pTest() & 0x01;
                this.CPU.cpu.pTest(test);
                if (test === 1) {
                    this.count2++;          // index signal
                    if (this.count2 > 12) { // ~ 364ms
                        this.count2 = 0;
                        this.rom_ports[2] |= 0x01;
                    }
                }
                else if (this.rom_ports[2] & 0x01) this.rom_ports[2] &= 0x0e;
                if (this.count3 > 0) {      // paper advance btn signal active
                    this.count3--;          // 3 cycles
                    if (this.count3 === 0) this.rom_ports[2] &= 0x07;
                }
            }
            return res;
        };
        this.init_signals();
        if (lights.length === 3) {
            lights[0].style.backgroundColor = '#ff000000';
            lights[1].style.backgroundColor = '#00ff0000';
            lights[2].style.backgroundColor = '#fffdd000';
            this.lights = lights; this.lbits = [2, 4, 1];
        }
    }
    reset(full) {
        super.reset(full);
        this.init_data();
        this.init_signals();
    }
    rd(a) {
        return this.rom[a & (((a & 0x700) > 0x400) ? 0xff : 0x7ff)];
    }
    wr(a, v) {
        this.rom[a & (((a & 0x700) > 0x400) ? 0xff : 0x7ff)] = v;
    }
    output(p, v) {
        if (p === 0) { // 4003 shifters
            const old = this.rom_ports[0];
            if ((old & 0x01) === 0 && v & 0x01) { // keyboard matrix column shifter clock
                this.kbd_shift = (this.kbd_shift << 1 | (v & 0x02) >> 1) & 0x3ff;
                if (this.kbd_shift === 0x3fe && this.kbd_ptr > 0 && this.kbd_cnt === 0) {
                    const kcode = this.kbd_buf[0];
                    this.kbd_ptr--;
                    for (let i = 0; i < this.kbd_ptr; i++) this.kbd_buf[i] = this.kbd_buf[i + 1];
                    this.kbd_mask = kcode & 0x3ff; this.kbd_key = kcode >> 12 & 0x0f;
                }
                if (this.kbd_cnt > 0) this.kbd_cnt--;
                if (this.kbd_shift === 0x1ff) this.rom_ports[1] = this.round_switch;
                else if (this.kbd_shift === 0x2ff) this.rom_ports[1] = this.dg_point_switch;
                else if (this.kbd_mask === this.kbd_shift) {
                    this.rom_ports[1] = this.kbd_key;
                    this.kbd_mask = this.kbd_key = 0;
                    this.kbd_cnt = 20;
                }
                else if (this.rom_ports[1] !== 0) this.rom_ports[1] = 0;
            }
            if ((old & 0x04) === 0 && v & 0x04)   // printer shifter clock (2 cascaded 4003)
                this.prt_shift = (this.prt_shift << 1 | (v & 0x02) >> 1) & 0xfffff;
        }
        super.output(p, v);
    }
    wram_port(c, v) {
        if (c === 1) {
            const old = this.dram_ports[1];
            if (old !== (v & 0x0f) && this.lights)
                for (let i = 0; i < 3; i++) {
                    const l = this.lights[i], bg = l.style.backgroundColor,
                          b = v & this.lbits[i];
                    if ((b && bg.endsWith('0)')) || (!b && bg.endsWith('5)')))
                        l.style.backgroundColor = bg.replace(/[^,]+(?=\))/,
                                (v & this.lbits[i]) ? '0.95' : '0');
                }
        }
        super.wram_port(c, v);
        if (c === 0) {
            const prtstr = s => {
                const c = this.con;
                for (let i = 0, n = s.length; i < n; i++) c.display(s.charCodeAt(i) & 0x7f);
            };
            if (v & 0x08) {      // printer paper advanced
                if (this.lcolor === 1) prtstr('\x1b[34m');
                prtstr(this.line.join('') + '\r\n');
                if (this.lcolor === 1) prtstr('\x1b[37m');
                this.line = [
                    ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
                    ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '
                ];
                this.lcolor = 0;
            }
            else if (v & 0x02) { // printer hammers fired
                let mask = 0x00001;
                for (let i = 16, j = 16; i < 18; i++, j += 2) {
                    if (this.prt_shift & mask) {
                        const chr = this.columns[this.count2].charAt(i),
                              chrc = chr.charCodeAt(0);
                        if (chrc > 7) this.line[j] = chr;
                        else {
                            const rch = this.specsym[chrc - 1];
                            this.line[j] = rch.charAt(0);
                            this.line[j + 1] = rch.charAt(1);
                        }
                    }
                    mask <<= 1;
                }
                mask = 0x20000;
                for (let i = 14; i >= 0; i--) {
                    if (this.prt_shift & mask)
                        this.line[i] = this.columns[this.count2].charAt(i);
                    mask >>= 1;
                }
            }
            else if (v & 0x01)   // printer tape color
                this.lcolor = 1;
        }
    }
    key_pressed(v) {
        let val;
        if (this.kbd_ptr >= 6) return;
        switch (v) {
            //   1111111110     3FE                   bit0   bit1   bit2   bit3
            case 0x81: val = 0x13fe; break; // KBC0   CM
            case 0x82: val = 0x23fe; break; // KBC0          RM
            case 0x83: val = 0x43fe; break; // KBC0                 M-
            case 0x84: val = 0x83fe; break; // KBC0                        M+
            case 0x85: val = 0x13fd; break; // KBC1   SQRT
            case 0x86: val = 0x23fd; break; // KBC1          %
            case 0x87: val = 0x43fd; break; // KBC1                 M=-
            case 0x88: val = 0x83fd; break; // KBC1                        M=+
            case 0x89: val = 0x13fb; break; // KBC2   <>
            case 0x8a: val = 0x23fb; break; // KBC2          /
            case 0x8b: val = 0x43fb; break; // KBC2                 *
            case 0x8c: val = 0x83fb; break; // KBC2                        =
            case 0x8d: val = 0x13f7; break; // KBC3   -
            case 0x8e: val = 0x23f7; break; // KBC3          +
            case 0x91: val = 0x13ef; break; // KBC4   9
            case 0x92: val = 0x23ef; break; // KBC4          6
            case 0x93: val = 0x43ef; break; // KBC4                 3
            case 0x94: val = 0x83ef; break; // KBC4                        .
            case 0x95: val = 0x13df; break; // KBC5   8
            case 0x96: val = 0x23df; break; // KBC5          5
            case 0x97: val = 0x43df; break; // KBC5                 2
            case 0x98: val = 0x83df; break; // KBC5                        00
            case 0x99: val = 0x13bf; break; // KBC6   7
            case 0x9a: val = 0x23bf; break; // KBC6          4
            case 0x9b: val = 0x43bf; break; // KBC6                 1
            case 0x9c: val = 0x83bf; break; // KBC6                        0
            case 0x9d: val = 0x137f; break; // KBC7   Sign
            case 0x9e: val = 0x237f; break; // KBC7          EX
            case 0x9f: val = 0x437f; break; // KBC7                 CE
            case 0xa0: val = 0x837f; break; // KBC7                        C
            case 0: case 1: case 2: case 3:
            case 4: case 5: case 6: case 8: this.dg_point_switch = v; return;
            case 10: this.round_switch = 1; return;
            case 11: this.round_switch = 0; return;
            case 12: this.round_switch = 8; return;
            default: return;
        }
        this.kbd_buf[this.kbd_ptr++] = val;
    }
}

class IBusicomKbd extends Kbd {
    constructor(con, mon) {
        SoftKeyboard(`sec
5 2         1,OVR 1,NEG 1,M      1,Sign 1,7 1,8  1,9 1,- 1,<> 1,SQRT 1,CM
5 2         1,-R- 1,-F- 1,-T-   1,EX   1,4 1,5  1,6 4,+      1,%    1,RM
5     1,-0- 1,-1- 1,-2- 1,-3-   1,CE   1,1 1,2  1,3 1,/ 1,*  1,M+   1,M-
5     1,-4- 1,-5- 1,-6- 1,-8-   1,C    1,0 1,00 1,. 4,=      1,M+=  1,M-=
        `);
        document.documentElement.style.setProperty('--key_size', '42px');
        const keys = document.getElementsByClassName('key'),
              btns = new Map(), lights = [];
        let sel1 = null, sel2 = null;
        for (let e of keys) {
            const txt = e.innerText;
            if (txt === 'OVR' || txt === 'NEG' || txt === 'M') lights.push(e);
            else if (txt.charAt(0) === '-' && txt.length > 1) {
                const chr = txt.charAt(1);
                let clr = '#cccccc80';
                if (chr === '0' || chr === 'F') {
                    clr = '#cccccc20';
                    if (chr === '0') sel1 = e;
                    else sel2 = e;
                }
                e.style.backgroundColor = clr;
                btns.set(chr, e);
            }
        }
        super(con, mon);
        this.monitor.emu.memo.init(lights); // everything set up, initialize memo
        this.btns = btns; this.sel1 = sel1; this.sel2 = sel2;
    }
    translateKey(e, soft, isDown) {
        if (isDown) return null; // HW keyboard on key UP only
        switch (e.key) {
            case '0': return 0x9c;
            case '1': return 0x9b;
            case '2': return 0x97;
            case '3': return 0x93;
            case '4': return 0x9a;
            case '5': return 0x96;
            case '6': return 0x92;
            case '7': return 0x99;
            case '8': return 0x95;
            case '9': return 0x91;
            case '.': return 0x94;
            case '+': return 0x8e;
            case '-': return 0x8d;
            case '*': return 0x8b;
            case '/': return 0x8a;
            case '=': return 0x8c;
            case 'SQRT': return 0x85;
            case '%': return 0x86;
            case 'C': return 0xa0;
            case 'EX': return 0x9e;
            case 'CE': return 0x9f;
            case 'Sign': return 0x9d;
            case '00': return 0x98;
            case '<>': return 0x89;
            case 'M+': return 0x84;
            case 'M+=': return 0x88;
            case 'CM': return 0x81;
            case 'RM': return 0x82;
            case 'M-': return 0x83;
            case 'M-=': return 0x87;
            case '-0-': case '-1-': case '-2-': case '-3-':
            case '-4-': case '-5-': case '-6-': case '-8-':
                if (this.sel1 !== null) this.sel1.style.backgroundColor = '#cccccc80';
                this.sel1 = this.btns.get(e.key.charAt(1));
                if (this.sel1 !== null) this.sel1.style.backgroundColor = '#cccccc20';
                return e.key.charCodeAt(1) - 48;
            case '-R-': case '-F-': case '-T-':
                const chr = e.key.charAt(1);
                if (this.sel2 !== null) this.sel2.style.backgroundColor = '#cccccc80';
                this.sel2 = this.btns.get(chr);
                if (this.sel2 !== null) this.sel2.style.backgroundColor = '#cccccc20';
                return (chr === 'R') ? 10 : (chr === 'F') ? 11 : 12;
            default: return null;
        }
    }
    processKey(val) {
        this.monitor.emu.memo.key_pressed(val);
    }
}

class MonI4004 extends Monitor {
    constructor(emu) {
        super(emu);
    }
    async handler(parms, cmd) {
        let text, tmp;
        try { switch (cmd) {
            case 'dd':
                console.log('Addr  01 23 45 67 89 AB CD EF  01 23  ASCII');
                const dram = this.emu.memo.dram;
                for (let i = 0; i < this.emu.memo.c4002; i++)
                    for (let j = 0; j < 4; j++) {
                        console.log((j === 0) ? `${fmt(i, 1)}: ` : '   ', console.NB);
                        console.log(`${fmt(j, 1)}  `, console.NB);
                        let str = '';
                        for (let k = 0; k < 20; k += 2) {
                            const val = dram[i][j][k] << 4 | dram[i][j][k + 1];
                            console.log(`${fmt(val, 2)} `, console.NB);
                            if (k === 14) console.log(' ', console.NB);
                            str += (val >= 0x20 && val <= 0x7f) ? String.fromCharCode(val) : '.';
                        }
                        console.log(` ${str}`);
                    }
                break;
            case 'dm':
                if (parms.length < 5) { console.error('missing chip reg adr val ...'); break; }
                const ch = pi(parms[1]), rg = pi(parms[2]);
                let ad = pi(parms[3]), cnt = 0;
                for (let i = 4; i < parms.length; i++) {
                    this.emu.memo.dram[ch][rg][ad++] = pi(parms[i]) & 0x0f; cnt++;
                    if (ad >= 20) break;
                }
                console.log(cnt);
                break;
            case 'reset':
                if (parms.length < 2) tmp = false;
                else {
                    if (parms[1] !== 'sys') { console.error('missing [sys]'); break; }
                    tmp = true;
                }
                this.emu.memo.CPU.cpu.reset(); this.emu.memo.reset(tmp);
                break;
            case 'mode':
                if (parms.length > 1) {
                    const mod = pi(parms[1]);
                    if (mod < 0 || mod > 2) { console.error(`invalid mode: ${mod}`); break; }
                    this.emu.memo.setActive(mod);
                }
                const cm = this.emu.memo.active;
                console.log(cm === 0 ? 'ROM' : (cm === 1) ? 'PROM' : 'RAM');
                break;
            case 'ptr':
                if (parms.length < 2) { console.error('missing fname|ptp'); break; }
                if (parms[1] !== 'ptp') text = await loadFile(parms[1], true);
                else {
                    text = this.emu.memo.ptp; this.emu.memo.ptp = '';
                }
                this.emu.memo.ptr = [];
                for (let i = 0, n = text.length; i < n; i++)
                    this.emu.memo.sendChar(text.charCodeAt(i), false);
                console.log(text.length);
                break;
            case 'ptp':
                if (parms.length < 2) {
                    text = this.emu.memo.ptp; this.emu.memo.ptp = '';
                    downloadFile('ptp.txt', new Uint8Array(
                        text.split('').map(c => c.charCodeAt(0))
                    ));
                } else {
                    this.emu.memo.ptpon = pi(parms[1]) !== 0;
                    this.emu.memo.ptp = '';
                    console.log(this.emu.memo.ptpon ? 'on' : 'off');
                }
                break;
            default: await super.handler(parms, cmd); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    const con = await VT_100('scr', {
              SCR_WIDTH: 72, SCR_HEIGHT: 24, AA: true,
              COLORS: ['#fff8dc', null, null, null, '#d0312d', null, null, '#3d3c3a']
          }),
          mem = new /*I4001_0009MemIO()*//*ISIM4_02MemIO(con)*/IBusicomMemIO(con),
          cpu = new GenCpu(mem, 0),
          emu = new Emulator(cpu, mem, 0),
          mon = new MonI4004(emu),
          kbd = new /*ISIM4_02Kbd(con, mon)*/IBusicomKbd(con, mon);
    emu.D_AMS = 0xfff; // mem mask
    /*await mon.exec('r 0 4001_0009.hex 1');*/
    /*await mon.exec('r 0 4004_mon.hex 1');
    mem.active = 1; await mon.exec('r 0 4004_asm.hex 1'); mem.active = 0;*/
    await mon.exec('r 0 4004_bus.hex 1');
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
