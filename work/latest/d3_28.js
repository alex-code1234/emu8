'use strict';

// http://wang700.durgadas.com/wang700docs/wang700arch.html
// http://sebhc.durgadas.com/w700-sim/
// https://d3-28.ru/
// https://phantom.sannata.org/viewtopic.php?f=&t=29568

function Display(scr) {
    let count = 0, tm = null, prvprg = false;
    const x = new Array(33), y = new Array(33),
          trn = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 30, 31],
          vls = new Array(16),
          kbd = [],
    update = (ln, n, d, fxd, sp) => {
        let res = false, s;
        if (fxd || n < 29)
            s = (d === 15) ? ' ' :
                (n === 3 || n === 29) ? (d & 0x1) ? '-' : '+' :
                d.toString(16).toUpperCase();
        else s = ' ';
        if (ln[n] !== s) { ln[n] = s; res = true; };
        const n1 = fxd ? 3 : sp,
              ns = n + 1;
        if (!prvprg && n1 !== 31 && n === n1) { if (ln[ns] !== '.') ln[ns] = '.'; res = true; }
        else if (n < 27) { if (ln[ns] !== ' ') ln[ns] = ' '; res = true; }
        return res;
    },
    display = (v, prg = false) => {
        if (prvprg !== prg) { prvprg = prg; if (prg) clear(); }
        if (count !== 0xf - (v & 0xf)) return;
        vls[count++] = v;
        if (count > 15) {
            count = 0;
            const v15 = vls[0], // reversed sequence
                  fxdx = (v15 & 0x2000) === 0, fxdy = (v15 & 0x1000) !== 0,
                  spx = trn[v15 >> 4 & 0xf], spy = trn[v15 >> 8 & 0xf];
            let upd = false;
            for (let i = 0; i < 16; i++) {
                v = vls[i];
                const n = trn[v & 0xf];
                if (update(x, n, v >> 4 & 0xf, fxdx, spx)) upd = true;
                if (!prg && update(y, n, v >> 8 & 0xf, fxdy, spy)) upd = true;
            }
            if (upd) scr.value = y.join('') + '\n' + x.join('');
            tm = Date.now();
        }
    },
    clear = () => {
        x.fill(' '); y.fill(' ');
        x[0] = 'X'; y[0] = 'Y'; x[1] = y[1] = ':';
        scr.value = y.join('') + '\n' + x.join('');
    };
    scr.readonly = true; scr.rows = '2'; scr.cols = '33';
    clear();
    setInterval(() => {
        if (tm !== null && Date.now() - tm > 300) { clear(); tm = null; }
    }, 500);
    return {kbd, display, clear};
}

class Emulator_D3_128 extends Emulator {
    constructor(cpu, mem) {
        super(cpu, mem, 0);
        this.D_WDT = 3;
        this.D_DCW = 200;
        this.D_DRW = 300;
    }
    disassemble1(a) {
        const res = super.disassemble1(a);
        res[1] = res[1].substring(0, 4) + res[1].substring(10);
        return res;
    }
    debug_regs(wnd) {
        super.debug_regs(wnd);
        wnd[1]();
        wnd[1](this.CPU.cpu.disasmMC().replaceAll('; ', '\n'));
    }
}

class Memo_D3_128 {
    constructor(con) {
        this.ram = new Uint8Array(0x10000);
        this.ram2 = new Uint8Array(0x10000);
        this.rom = new Array(8192);
        this.rom.fill(0);
        this.CPU = null;
        this.con = con;
    }
    rd(a) {
        const res = this.ram[a]; this.ram[a] = 0; // destructive read
        return res;
    }
    wr(a, v) {
        this.ram[a] = v;
    }
    rdROM(a) {
        return this.rom[a];
    }
    input(p) {
        if (p === 0x00) return (this.con.kbd.length > 0) ? this.con.kbd.shift() : 0x00;
        return 0x00;
    }
    output(p, v) {
        if (p === 0x00) this.con.display(v, (this.CPU.cpu.getD() & 0x4) !== 0);
    }
    loadROM(dat, binary = true) {
        if (binary) {
            const len = dat.length;
            if (len !== 16384) throw new Error(`invalid length: ${len}`);
            let addr = 0, str = '';
            for (let i = 0; i < len; i++) {
                if (i > 0 && (i % 8) === 0) {
                    this.rom[addr] = pi(str.substring(8));
                    this.rom[addr + 4096] = pi(str.substring(0, 8));
                    addr++; str = '';
                }
                str = fmt(dat[i]) + str;
            }
            return 2048;
        } else {
            const lines = dat.split(/[\r\n]+/);
            let addr = 0, count = 0;
            for (let i = 0, n = lines.length; i < n; i++) {
                let line = lines[i].replaceAll(' ', '').trim();
                if (!line.startsWith('0')) continue;
                if (line.indexOf(':') !== 13) throw new Error('invalid format');
                line = line.substring(14, 58);
                if (line.length !== 44)
                    throw new Error(`invalid value: ${line} at line: ${i + 1}`);
                this.rom[addr] = pi('0b' + line.substring(12), false);
                this.rom[addr + 4096] = pi('0b' + line.substring(0, 12), false);
                addr++; count++;
            }
            return count;
        }
    }
}

function Cpu(memo) { // 15ВМ128-018
    let S, T, U, V, KA, KB, CA, CB, GIOA, GIOB, IOB, D, L, M, N, RA, RB,
        CC, ALU, SC, Q, OFL, ERR, KBD, TMR, DIN, DOT, RBS, CURRENT, PREV,
        JL, JH, JAD, ST, KK, MOP, BD, BC, AC, AOP, ZO, BI, AI,
        JMP = null;
    const reset = () => {
        S = T = U = V = KA = KB = CA = CB = GIOA = GIOB = D = L = M = N = RA = RB = 0b0000;
        IOB = 0b000;
        CC = ALU = SC = Q = OFL = ERR = KBD = TMR = DIN = DOT = RBS = 0b0;
        JMP = null;
        setPC(0b00000000000);
    },
    decode = () => {
        let code = memo.rdROM(CURRENT);
        JL = (code >>= 1) & 0x7; JH = (code >>= 3) & 0x7; JAD = (code >>= 3) & 0x1ff;
        ST = (code >>= 9) & 0xf; KK = (code >>= 4) & 0xf; MOP = (code >>= 4) & 0xf;
        BD = (code >>= 4) & 0x1; BC = (code >>= 1) & 0x3; AC = (code >>= 2) & 0x1;
        code = memo.rdROM(CURRENT + 4096);
        AOP = code & 0x7; ZO = (code >>= 3) & 0x7; BI = (code >>= 3) & 0x7; AI = (code >> 3) & 0x7;
    },
    disasmMC = () => {
        let stack = '', nxt = JAD << 2, h = '', g = '', gx, ops = '+++++&^+', alu = '',
            mp4 = null, mp45 = null, stp10 = null, targ = '', mp56 = null, opA = null, buf = '';
        if (JH < 2) nxt |= JH << 1;
        if (JL < 2) nxt |= JL << 0;
        stack += "jump " + fmt(nxt, 3);
        if (JH >= 2 || JL >= 2) {
            stack += "[";
            switch(JH) {
                case 2: stack += "S<1>"; break; case 3: stack += "S<3>"; break;
                case 4: stack += "OV"; break;   case 5: stack += "CC"; break;
                case 6: stack += "KBD"; break;  case 7: stack += "{7}"; break;
            }
            stack += ":";
            switch(JL) {
                case 2: stack += "S<0>"; break; case 3: stack += "S<2>"; break;
                case 4: stack += "Zo"; break;   case 5: stack += "Q"; break;
                case 6: stack += "SC"; break;   case 7: stack += "{7}"; break;
            }
            stack += "]";
        }
        switch(AI) {
            case 0: h = "S"; break;  case 1: h = "T"; break;
            case 2: h = "U"; break;  case 3: h = "V"; break;
            case 4: h = "KA"; break; case 5: h = "KB"; break;
            case 6: h = "CA"; break; case 7: h = "CB"; break;
        }
        switch(BI) {
            case 0: g = "0"; break;  case 1: g = "" + fmt(KK, 1); break;
            case 2: g = "D1"; break; case 3: g = "0?"; break;
            case 4: g = "KA"; break; case 5: g = "KB"; break;
            case 6: g = "CA"; break; case 7: g = "CB"; break;
        }
        if (AC == 0) h = "0";
        gx = BD ? "9" : "f";
        switch(BC) {
            case 0: g = "0"; break; case 1: break;
            case 2: g = gx; break;  case 3: g = "(" + gx + "-" + g + ")"; break;
        }
        alu += h + " " + ops.substring(AOP, AOP + 1) + " " + g;
        switch (AOP) {
            case 1: case 4: alu += " " + ops.substring(AOP, AOP + 1) + " 1"; break;
            case 3: alu += " " + ops.substring(AOP, AOP + 1) + " SC"; break;
        }
        if (BD) alu = "BCD(" + alu + ")";
        if (AOP == 7) alu += " >> 1";
        alu += " ->[Zo";
        if (AOP == 7) alu += ",CC,SC]";
        else {
            if (AOP < 5) {
                alu += ",CC";
                switch (AOP) {
                    case 2: case 3: case 4: alu += ",SC"; break;
                }
            }
            alu += "]";
        }
        if (MOP >= 2 && MOP <= 5)
            if (MOP >= 4) mp4 = `L=f,M=${fmt(KK, 1)},N=V`;
            else mp4 = "L=T,M=U,N=V";
        switch(MOP) {
            case 10: mp45 = "KB<0>=Dot"; break; case 11: mp45 = "Din=KB<0>"; break;
            case 12: mp45 = "TMR=1,"; mp45 += (BI & 1) ? "WR" : "RD"; break;
            case 13: mp45 = "TMR=0"; break;
        }
        if (ST >= 1 && ST <= 8)
            stp10 = `S<${fmt((ST - 1) & 3, 1)}>=${fmt(((ST - 1) >> 2) ^ 1, 1)}`;
        else switch(ST) {
            case 9: stp10 = "RESET"; break;   case 10: stp10 = "S<0>=!Z"; break;
            case 11: stp10 = "S<1>=Z"; break; case 12: stp10 = "OV=1"; break;
            case 13: stp10 = "S=0"; break;    case 14: stp10 = "ERR=1"; break;
        }
        switch(ZO) {
            case 0: targ += "S"; break;  case 1: targ += "T"; break;
            case 2: targ += "U"; break;  case 3: targ += "V"; break;
            case 4: targ += "KA"; break; case 5: targ += "KB"; break;
            case 6: targ += "CA"; break; case 7: targ += "CB"; break;
        }
        if (targ.length > 0) targ += " = ";
        switch(MOP) {
            case 7: mp56 = "IOB=KB<2:0>"; break; case 14: mp56 = "GIOA,GIOB=KA,KB"; break;
        }
        switch(MOP) {
            case 0: opA = "mem(LMN) = RA=alu,RB"; break;
            case 1: opA = "mem(LMN) = RA,RB=alu"; break;
            case 2: opA = "CA,CB=RA,RB = mem(LMN)"; break;
            case 3: opA = "RA,RB = mem(LMN)"; break;
            case 4: opA = "CA,CB=RA,RB = mem(LMN)"; break;
            case 5: opA = "RA,RB = mem(LMN)"; break;
            case 6: opA = "KB<0>=RBS"; break;
            case 9: opA = (AOP == 7) ? "Q=SC" : "Q=CC"; break;
            case 15: opA = "{f}"; break;
        }
        if (mp4 != null) { if (buf.length > 0) buf += "; "; buf += mp4; }
        if (mp45 != null) { if (buf.length > 0) buf += "; "; buf += mp45; }
        if (mp56 != null) { if (buf.length > 0) buf += "; "; buf += mp56; }
        if (buf.length > 0) buf += "; ";
        buf += targ + alu;
        if (opA != null) buf += "; " + opA;
        if (stp10 != null) buf += "; " + stp10;
        if (stack.length > 0) buf += "; " + stack;
        return buf;
    },
    disassembleInstruction = a => [
        a + 1 & 0x7ff, fmt(memo.rdROM(a + 4096), 8) + fmt(memo.rdROM(a), 8)
    ],
    setRegisters = r => {
        let s = '';
        for (let i = 1; i < r.length; i += 2) {
            const reg = r[i].toLowerCase(),
                  n = parseInt(r[i + 1], 16);
            switch (reg) {
                case 's': S = n & 0xf; break; case 't': T = n & 0xf; break;
                case 'u': U = n & 0xf; break; case 'v': V = n & 0xf; break;
                case 'ka': KA = n & 0xf; break; case 'kb': KB = n & 0xf; break;
                case 'ca': CA = n & 0xf; break; case 'cb': CB = n & 0xf; break;
                case 'gioa': GIOA = n & 0xf; break; case 'giob': GIOB = n & 0xf; break;
                case 'd': D = n & 0xf; break; case 'l': L = n & 0xf; break;
                case 'm': M = n & 0xf; break; case 'n': N = n & 0xf; break;
                case 'ra': RA = n & 0xf; break; case 'rb': RB = n & 0xf; break;
                case 'iob': IOB = n & 0x7; break;
                case 'cc': CC = n & 0x1; break; case 'alu': ALU = n & 0x1; break;
                case 'sc': SC = n & 0x1; break; case 'q': Q = n & 0x1; break;
                case 'ofl': OFL = n & 0x1; break; case 'err': ERR = n & 0x1; break;
                case 'kbd': KBD = n & 0x1; break; case 'tmr': TMR = n & 0x1; break;
                case 'din': DIN = n & 0x1; break; case 'dot': DOT = n & 0x1; break;
                case 'rbs': RBS = n & 0x1; break; case 'pc': setPC(n & 0x7ff); break;
                default: s += ' ' + reg; break;
            }
        }
        return s.length ? `unknown register(s): ${s.trim()}` : s;
    },
    cpuStatus = () => `S:${fmt(S, 1)} T:${fmt(T, 1)} U:${fmt(U, 1)} V:${fmt(V, 1)} ` +
            `L:${fmt(L, 1)} M:${fmt(M, 1)} N:${fmt(N, 1)}|` +
            `KA:${fmt(KA, 1)} KB:${fmt(KB, 1)} CA:${fmt(CA, 1)} CB:${fmt(CB, 1)} ` +
            `RA:${fmt(RA, 1)} RB:${fmt(RB, 1)}|` +
            `GIOA:${fmt(GIOA, 1)} GIOB:${fmt(GIOB, 1)} IOB:${fmt(IOB, 1)} `+
            `RBS:${fmt(RBS, 1)} D:${fmt(D, 1)}|` +
            `CC:${fmt(CC, 1)} ALU:${fmt(ALU, 1)} ` +
            `SC:${fmt(SC, 1)} Q:${fmt(Q, 1)} OFL:${fmt(OFL, 1)} ERR:${fmt(ERR, 1)}|` +
            `KBD:${fmt(KBD, 1)} TMR:${fmt(TMR, 1)} DIN:${fmt(DIN, 1)} DOT:${fmt(DOT, 1)}|` +
            `PREV:${fmt(PREV, 3)}`,
    getPC = () => CURRENT,
    setPC = v => {
        CURRENT = PREV = v & 0x7ff;
        decode();
    },
    step = () => {
        let tmp, abus, bbus, zbus;
        const lat_s = S, lat_sc = SC, lat_q = Q,
        add = (c, setz = true) => {
            zbus = abus + bbus + c; CC = 0;
            if (BD) while (zbus >= 10) { zbus -= 10; CC = 1; }
            else if (zbus & 0x10) { CC = 1; zbus &= 0xf; }
            if (setz) ALU = (zbus === 0) ? 1 : 0;
        },
        wrmem = () => memo.wr(0xf << 12 | L << 8 | M << 4 | N, RA << 4 | RB),
        rdmem = () => {
            tmp = memo.rd(0xf << 12 | L << 8 | M << 4 | N);
            RA = tmp >> 4; RB = tmp & 0xf;
            memo.output(0x00, S << 12 | RA << 8 | RB << 4 | N); // display
        };
        if (AC) switch (AI) {
            case 0x0: abus = S; break;
            case 0x1: abus = T; break;
            case 0x2: abus = U; break;
            case 0x3: abus = V; break;
            case 0x4: abus = KA; break;
            case 0x5: abus = KB; break;
            case 0x6: abus = CA; break;
            case 0x7: abus = CB; break;
        }
        else abus = 0b0000;
        switch (BI) {
            case 0x0: case 0x3: bbus = 0b0000; break;
            case 0x1: bbus = KK; break;
            case 0x2: bbus = D; D &= 0x7; break;
            case 0x4: bbus = KA; break;
            case 0x5: bbus = KB; break;
            case 0x6: bbus = CA; break;
            case 0x7: bbus = CB; break;
        }
        const bdc = BD ? 0b1001 : 0b1111;
        switch (BC) {
            case 0x0: bbus = 0b0000; break;
            case 0x2: bbus = bdc; break;
            case 0x3: bbus = bdc - bbus & 0xf; break;
        }
        switch (AOP) {
            case 0x0: add(0); break;
            case 0x1: add(1); break;
            case 0x2: add(0); SC = CC; break;
            case 0x3: add(lat_sc); SC = CC; break;
            case 0x4: add(1); SC = CC; break;
            case 0x5:
                add(0, false); zbus = abus & bbus;
                ALU = (zbus === 0) ? 1 : 0;
                break;
            case 0x6:
                add(0, false); zbus = abus ^ bbus;
                ALU = (zbus === 0) ? 1 : 0;
                break;
            case 0x7:
                add(0, false);
                SC = zbus & 0x1; zbus = (zbus >> 1) | (lat_sc << 3);
                ALU = (zbus === 0) ? 1 : 0;
                break;
        }
        switch (MOP) {
            case 0x2: case 0x3: L = T; M = U; N = V; break;
            case 0x4: case 0x5: L = 0xf; M = KK; N = V; break;
            case 0x7: IOB = KB & 0x7; break;
            case 0x9: Q = (AOP === 0x7) ? SC : CC; break;
            case 0xa:
                DOT = memo.input(0x01) & 0x1;                   // tape
                KB = (KB & 0xe) | DOT;
                break;
            case 0xb:
                DIN = KB & 0x1;
                memo.output(0x01, DIN);                         // tape
                break;
            case 0xc:
                TMR = 1;
                memo.output(0x01, 0x10 | (BI & 0x1));           // tape
                break;
            case 0xd:
                TMR = 0;
                memo.output(0x01, 0x20);                        // tape
                break;
            case 0xe: GIOA = KA; GIOB = KB; break;
        }
        switch (ZO) {
            case 0x0: S = zbus; break;
            case 0x1: T = zbus; break;
            case 0x2: U = zbus; break;
            case 0x3: V = zbus; break;
            case 0x4: KA = zbus; break;
            case 0x5: KB = zbus; break;
            case 0x6: CA = zbus; break;
            case 0x7: CB = zbus; break;
        }
        switch (ST) {
            case 0x1: S |= 0x1; break;
            case 0x2: S |= 0x2; break;
            case 0x3: S |= 0x4; break;
            case 0x4: S |= 0x8; break;
            case 0x5: S &= 0xe; break;
            case 0x6: S &= 0xd; break;
            case 0x7: S &= 0xb; break;
            case 0x8: S &= 0x7; break;
            case 0x9: KA = KB = 0b0000; KBD = OFL = ERR = 0b0; break;
            case 0xa: S = (S & 0xe) | (ALU ? 0x0 : 0x1); break;
            case 0xb: S = (S & 0xd) | (ALU ? 0x2 : 0x0); break;
            case 0xc: OFL = 1; break;
            case 0xd: S = 0b0000; break;
            case 0xe: ERR = 1; break;
        }
        switch (MOP) {
            case 0x0: RA = zbus; wrmem(); break;
            case 0x1: RB = zbus; wrmem(); break;
            case 0x2: case 0x4: rdmem(); CA = RA; CB = RB; break;
            case 0x3: case 0x5: rdmem(); break;
            case 0x6: KB = (KB & 0xe) | RBS; break;
        }
        PREV = CURRENT; CURRENT = JAD << 2;
        switch (JH) {
            case 0x1: CURRENT |= 0x2; break;
            case 0x2: if (lat_s & 0x2) CURRENT |= 0x2; break;
            case 0x3: if (lat_s & 0x8) CURRENT |= 0x2; break;
            case 0x4: if (OFL) { CURRENT |= 0x2; OFL = 0; } break;
            case 0x5: if (CC) CURRENT |= 0x2; break;
            case 0x6:
                tmp = memo.input(0x00);                         // keyboard
                if (tmp) {
                    KBD = 1; KA = tmp >> 4; KB = tmp & 0xf;
                }
                if (KBD) { CURRENT |= 0x2; KBD = 0; }
                break;
        }
        switch (JL) {
            case 0x1: CURRENT |= 0x1; break;
            case 0x2: if (lat_s & 0x1) CURRENT |= 0x1; break;
            case 0x3: if (lat_s & 0x4) CURRENT |= 0x1; break;
            case 0x4: if (ALU) CURRENT |= 0x1; break;
            case 0x5: if (lat_q) CURRENT |= 0x1; break;
            case 0x6: if (lat_sc) CURRENT |= 0x1; break;
        }
        if (JMP !== null) { CURRENT = JMP; JMP = null; }
        decode();
        return true;
    },
    setJMP = v => JMP = v & 0x7ff,
    setD = v => D = v & 0xf,
    getD = () => D;
    return {
        reset, disassembleInstruction, disasmMC, setRegisters, cpuStatus, getPC, setPC, step,
        setJMP, setD, getD
    };
}

class Kbd_D3_128 extends SoftKbd {
    constructor(kbd_elem, con, con_elem, cpu) {
        super(kbd_elem, con, con_elem);
        this.cpu = cpu;
        this.keys = kbd_elem.getElementsByClassName('key');
        this.high4 = 0;
    }
    switchKeyClass(num, dval) {
        if (!this.keys[num].classList.contains('ivkey')) return null;
        this.keys[num].classList.remove('ivkey');
        for (let i = 0; i < 4; i++) if (i !== num) this.keys[i].classList.add('ivkey');
        this.cpu.setD(dval);
        return null;
    }
    jumpKey(addr) {
        if (this.cpu.getD() & 0x4 && addr !== 0) this.cpu.setJMP(addr + 4);
        else this.cpu.setJMP(addr);
        return null;
    }
    toggleKeyClass(key) {
        const c = +key.charAt(0),
              num = (c === 8) ? 4 : (c === 4) ? 5 : (c === 2) ? 6 : 7;
        if (this.keys[num].classList.contains('ivkey')) {
            this.keys[num].classList.remove('ivkey');
            this.high4 |= c;
        } else {
            this.keys[num].classList.add('ivkey');
            this.high4 &= ~c & 0xf;
        }
        return null;
    }
    translateKey(e, soft) {
        switch (e.key) {
            case 'Run': return this.switchKeyClass(0, 0x0);
            case 'Learn': return this.switchKeyClass(1, 0x4);
            case 'Learn&Print': return this.switchKeyClass(2, 0x6);
            case 'ListPrgram': return this.switchKeyClass(3, 0x2);
            case 'S.M.PRIME': return this.jumpKey(0x000);
            case 'INSST PC': return this.jumpKey(0x002);
            case 'B.S.VF PG': return this.jumpKey(0x001);
            case 'DELRC PG': return this.jumpKey(0x003);
            case 'STEP': this.cpu.setD(this.cpu.getD() | 0x8); return null;
            case '80': case '40': case '20': case '10': return this.toggleKeyClass(e.key);
            case '00': case '01': case '02': case '03': case '04': case '05': case '06':
            case '07': case '08': case '09': case '10': case '11': case '12': case '13':
            case '14': case '15': return this.high4 << 4 | +e.key;
            case 'WRITEALPHA': return 0x4c; case 'ENDALPHA': return 0x4d;
            case 'RCALLINDIR': return 0x55; case '\u21c4INDIR': return 0x56;
            case '\u21c4DIRECT': return 0x46; case 'RCALLDIR': return 0x45;
            case 'CHNGESIGN': return 0x7b; case '\u221aX': return 0x6c;
            case 'X\u00b2': return 0x7d; case 'CLEARX': return 0x7f;
            case 'LOADPROG': return 0x5d; case 'SKIPERROR': return 0x5a;
            case 'MARK': return 0x48; case 'WRITE': return 0x4b; case '1/X': return 0x6f;
            case 'STOREINDIR': return 0x54; case '÷INDIR': return 0x53;
            case '÷DIRECT': return 0x43; case 'STOREDIR': return 0x44;
            case '+': return 0x60; case '-': return 0x61;
            case '×': return 0x62; case '÷': return 0x63;
            case '0': case '1': case '2': case '3': case '4':
            case '5': case '6': case '7': case '8': case '9': return 0x70 + (+e.key - +'0');
            case 'ENDPROG': return 0x5c; case 'SKIPY \u2265 X': return 0x57;
            case 'RTURN': return 0x5b; case 'INTGRX': return 0x68;
            case '|X|': return 0x67; case 'RCALLRSDUE': return 0x7e;
            case '×INDIR': return 0x52; case '×DIRECT': return 0x42;
            case '\u2193': return 0x65; case 'STOP': return 0x5f;
            case 'SKIPY = X': return 0x59; case 'GROUP1': return 0x49;
            case '10\u02e3': return 0x6d; case 'LOG\u2081\u2080X': return 0x6a;
            case '\u03c0': return 0x69; case '-INDIR': return 0x51;
            case '-DIRECT': return 0x41; case '\u2191': return 0x64;
            case 'GO': return 0x5e; case 'SKIPY < X': return 0x58;
            case 'GROUP2': return 0x4a; case 'e\u02e3': return 0x6e;
            case 'LOG\u2091X': return 0x6b; case '\u21c5': return 0x66;
            case '+INDIR': return 0x50; case '+DIRECT': return 0x40;
            case '.': return 0x7c; case 'SETEXP': return 0x7a; case 'SEARCH': return 0x47;
            default: console.warn(e.key); return null;
        }
    }
}

class Monitor_D3_128 extends Monitor {
    constructor(emu) {
        super(emu, undefined, undefined, 220);
    }
    async handler(parms, cmd) {
        try { switch (cmd) {
            
            default: await super.handler(parms, cmd); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    const [scr_elem, kbd_elem, con_elem] = createUI(
        addTab('emul', 'EMULATOR', 1, true),
        'wng', 'wng1', '36px', 40, 7, 'calc(36px / 10)', '', '', `
@font-face { font-family: 'Nixie'; src: url('d3_28/RobotoMono.ttf'); }
.scr_wng { background-color: #282828; color: #b38000; font: 200 32px Nixie;
           border: none; resize: none; height: 100px; }
.ivkey { background-color: var(--onbackground); color: var(--background); }
.bkey { background-color: #a7eeff; color: #000000; }
.rkey { background-color: #ffa9a9; color: #000000; }
.gkey { background-color: #d8d8d8; color: #000000; }
.sms { font-size: 7px; margin-left: auto; }
.sbg { font-weight: 600; }
.sbgf { font-size: 14px; }
.sbgf2 { font-size: 12px; }
.sp8 { grid-column: span 8; }
.sp24 { grid-column: span 24; }
.sp6 { grid-column: span 6; }
.rsp2 { grid-row: span 2; }
`, `
<div class='section sec_wng sec_wng_left'>
    <div class='sp8'></div><div class='key key_wng'>Run</div>
    <div class='key key_wng ivkey'>Learn</div>
    <div class='key key_wng ivkey'><span>Learn&</span><span>Print</span></div>
    <div class='key key_wng ivkey'><span>List</span><span>Prgram</span></div>
    <div class='sp24'></div>
    <div class='key key_wng ivkey'>80</div><div class='key key_wng ivkey'>40</div>
    <div class='key key_wng ivkey'>20</div><div class='key key_wng ivkey'>10</div>
    <div class='key key_wng'>00</div><div class='key key_wng'>01</div>
    <div class='key key_wng'>02</div><div class='key key_wng'>03</div>
    <div class='key key_wng'>04</div><div class='key key_wng'>05</div>
    <div class='key key_wng'>06</div><div class='key key_wng'>07</div>
    <div class='key key_wng'>08</div><div class='key key_wng'>09</div>
    <div class='key key_wng'>10</div><div class='key key_wng'>11</div>
    <div class='key key_wng'>12</div><div class='key key_wng'>13</div>
    <div class='key key_wng'>14</div><div class='key key_wng'>15</div>
    <div class='sp6'></div>
    <div class='key key_wng bkey'><span>WRITE</span><span>ALPHA</span></div>
    <div class='key key_wng bkey'><span>END</span><span>ALPHA</span></div><div class='sp2'></div>
    <div class='key key_wng rkey'><span>RCALL</span><span>INDIR</span></div>
    <div class='key key_wng rkey'><span>&#8644;</span><span>INDIR</span></div>
    <div class='key key_wng gkey'><span>&#8644;</span><span>DIRECT</span></div>
    <div class='key key_wng gkey'><span>RCALL</span><span>DIR</span></div><div class='sp2'></div>
    <div class='key key_wng'><span>CHNGE</span><span>SIGN</span></div>
    <div class='key key_wng rkey'>&#8730;X</div><div class='key key_wng rkey'>X&#x00b2;</div>
    <div class='key key_wng'><span>CLEAR</span><span>X</span></div><div class='sp2'></div>
    <div class='key key_wng rkey'><span>LOAD</span><span>PROG</span></div>
    <div class='key key_wng rkey'><span>SKIP</span><span>ERROR</span></div>
    <div class='key key_wng rkey'>MARK</div>
    <div class='key key_wng'><span class='sms'>S.M.</span><span>PRIME</span></div>
    <div class='sp6'></div><div class='key key_wng bkey'>WRITE</div>
    <div class='key key_wng bkey'>1/X</div><div class='sp2'></div>
    <div class='key key_wng rkey'><span>STORE</span><span>INDIR</span></div>
    <div class='key key_wng rkey'><span class='sbg'>÷</span><span>INDIR</span></div>
    <div class='key key_wng gkey'><span class='sbg'>÷</span><span>DIRECT</span></div>
    <div class='key key_wng gkey'><span>STORE</span><span>DIR</span></div>
    <div class='sp2'></div><div class='key key_wng rkey sbg sbgf'>÷</div>
    <div class='key key_wng'>7</div><div class='key key_wng'>8</div>
    <div class='key key_wng'>9</div><div class='sp2'></div>
    <div class='key key_wng rkey'><span>END</span><span>PROG</span></div>
    <div class='key key_wng rkey'><span>SKIP</span><span>Y &#x2265; X</span></div>
    <div class='key key_wng rkey'>RTURN</div>
    <div class='key key_wng gkey'><span class='sms'>INS</span><span>ST PC</span></div>
    <div class='sp6'></div>
    <div class='key key_wng bkey'><span>INTGR</span><span>X</span></div>
    <div class='key key_wng bkey'>|X|</div><div class='sp2'></div>
    <div class='key key_wng'><span>RCALL</span><span>RSDUE</span></div>
    <div class='key key_wng rkey'><span class='sbg'>×</span><span>INDIR</span></div>
    <div class='key key_wng gkey'><span class='sbg'>×</span><span>DIRECT</span></div>
    <div class='key key_wng i'>&#8595;</div><div class='sp2'></div>
    <div class='key key_wng rkey sbg sbgf'>×</div>
    <div class='key key_wng'>4</div><div class='key key_wng'>5</div>
    <div class='key key_wng'>6</div><div class='sp2'></div>
    <div class='key key_wng rkey'>STOP</div>
    <div class='key key_wng rkey'><span>SKIP</span><span>Y = X</span></div>
    <div class='key key_wng rkey'><span>GROUP</span><span>1</span></div>
    <div class='key key_wng gkey'><span class='sms'>B.S.</span><span>VF PG</span></div>
    <div class='sp6'></div><div class='key key_wng bkey'>10&#x02e3;</div>
    <div class='key key_wng bkey'>LOG&#x2081;&#x2080;X</div><div class='sp2'></div>
    <div class='key key_wng sbgf'>&#x03c0;</div>
    <div class='key key_wng rkey'><span class='sbg'>-</span><span>INDIR</span></div>
    <div class='key key_wng gkey'><span class='sbg'>-</span><span>DIRECT</span></div>
    <div class='key key_wng i rsp2'>&#8593;</div><div class='sp2'></div>
    <div class='key key_wng rkey sbg sbgf'>-</div>
    <div class='key key_wng'>1</div><div class='key key_wng'>2</div>
    <div class='key key_wng'>3</div><div class='sp2'></div>
    <div class='key key_wng rsp2'>GO</div>
    <div class='key key_wng rkey'><span>SKIP</span><span>Y < X</span></div>
    <div class='key key_wng rkey'><span>GROUP</span><span>2</span></div>
    <div class='key key_wng gkey'><span class='sms'>DEL</span><span>RC PG</span></div>
    <div class='sp6'></div><div class='key key_wng bkey sbgf2'>e&#x02e3;</div>
    <div class='key key_wng bkey'>LOG&#x2091;X</div><div class='sp2'></div>
    <div class='key key_wng i'>&#x21c5;</div>
    <div class='key key_wng rkey'><span class='sbg'>+</span><span>INDIR</span></div>
    <div class='key key_wng gkey'><span class='sbg'>+</span><span>DIRECT</span></div>
    <div class='sp2'></div><div class='key key_wng rkey sbg sbgf'>+</div>
    <div class='key key_wng'>0</div><div class='key key_wng sbg sbgf'>.</div>
    <div class='key key_wng'><span>SET</span><span>EXP</span></div><div class='sp2'></div>
    <div class='key key_wng sp4'>SEARCH</div><div class='key key_wng gkey'>STEP</div>
</div>  `),
        elem = document.createElement('textarea');
    elem.id = scr_elem.id; elem.className = 'scr_wng';
    elem.addEventListener('click', e => kbd_elem['data-inp'].focus());
    scr_elem.replaceWith(elem);
    const con = Display(elem),
          mem = new Memo_D3_128(con),
          cpu = new GenCpu(mem, 0),
          emu = new Emulator_D3_128(cpu, mem),
          mon = new Monitor_D3_128(emu),
          kbd = new Kbd_D3_128(kbd_elem, con, con_elem, cpu.cpu);
console.log(mem.loadROM(await loadFile('d3_28/wang720c.rom', false)));
//mem.loadROM(await loadFile('d3_28/pel3_065_001__rom/pel3_065_001__rom.txt', true), false));
    cpu.cpu.reset();
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
