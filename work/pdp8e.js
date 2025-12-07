// https://deramp.com/downloads/mfe_archive/011-Digital%20Equipment%20Corporation/
// https://raymii.org/s/articles/Running_TSS_8_on_the_DEC_PiDP-8_i_and_SIMH.html

'use strict';

function pi(s8, oct = true) {          // override for 12-bit mode
    const num = oct ? `0o${s8}` : s8;
    if (isNaN(num)) throw new Error(`invalid ${oct ? 'oct' : 'num'}: ${s8}`);
    return +num;
}

function fmt(num, len = 4, base = 8) { // override for 12-bit mode
    return num.toString(base).padStart(len, '0');
}

class GenCpu12 extends GenCpu {        // override for 12-bit mode
    constructor(memo) {
        super(memo, 0);                     // CPU class MUST be Cpu(memo)
        this.memo = memo;
        if (memo.setCpu) memo.setCpu(this); // set CPU reference
    }
    chkRegs() {                        // override breakpoints, add [null, address, cond, value]
        if (this.STOP_REGS.length === 0) return true;
        const state = this.cpu.cpuStatus();
        for (let i = 0, n = this.STOP_REGS.length; i < n; i++) {
            const cond = this.STOP_REGS[i];
            let svalue;
            if (cond[0] === null) // address breakpoint
                svalue = fmt(this.memo.rd(cond[1]));
            else {                // status breakpoint
                const m = state.match(cond[1]);
                if (m === null || m.length < 2) continue; // ignore malformed entry
                svalue = m[1];
            }
            let value = cond[3];
            if (value.length < svalue.length) svalue = svalue.substr(0, value.length);
            else for (let j = 0, len = value.length; j < len; j++)
                if (value.charAt(j) === '.' && svalue.charAt(j) !== '.')
                    svalue = svalue.substring(0, j) + '.' + svalue.substring(j + 1);
            switch (cond[2]) {
                case '<': if (value >= svalue) return false; break;
                case '>': if (value <= svalue) return false; break;
                case '==': if (value !== svalue) return false; break;
                case '!=': if (value === svalue) return false; break;
                case '<=': if (value > svalue) return false; break;
                case '>=': if (value < svalue) return false; break;
            }
        }
        return true;
    }
}

class Emulator12 extends Emulator {    // override for 12-bit mode
    constructor(cpu, mem) {
        super(cpu, mem, 0);
        this.D_AMS = 0o7777;
        this.D_CMD = 1;
    }
    loadHex(text, start, mem) {        // redefine to load octal
        const lines = text.split(/[\r\n]+/);
        let length = 0;
        for (let i = 0, n = lines.length; i < n; i++) {
            let line = lines[i].trim(), idx;
            if ((idx = line.indexOf(';')) >= 0) line = line.substr(0, idx).trim();
            if (line.length === 0) continue;
            line = line.replaceAll(' ', '');
            const code = [];
            let count, s;
            idx = line.indexOf(':');
            if (idx >= 0) {
                start = pi(line.substr(0, idx));
                s = idx + 1;
                count = ((line.length - s) / 4) | 0;
            } else {
                count = (line.length / 4) | 0;
                s = 0;
            }
            for (let j = 0; j < count; j++) {
                code.push(pi(line.substr(s, 4)));
                s += 4;
            }
            length += this.loadBin(code, start, mem);
            start += count;
        }
        return length;
    }
    printMem(a, lines = 16, mem, logger = console.log) { // redefine for octal
        if (mem === undefined) mem = this.memo;
        logger(`Addr     0    1    2    3    4    5    6    7  6bit             7bit     3x8`);
        for (let i = 0; i < lines; i++) {
            let s = `${fmt(a, this.D_WDT)}: `, s2 = '', s3 = '', s4 = '', tmp, chr;
            for (let j = 0; j < 8; j++) {
                const c = mem.rd(a + j);
                if (c === undefined) break;
                s += `${fmt(c)} `;
                chr = c >> 6 & 0o77; s2 += (chr >= 0x20) ? String.fromCharCode(chr) : '.';
                chr = c & 0o77; s2 += (chr >= 0x20) ? String.fromCharCode(chr) : '.';
                chr = c & 0x7f; s3 += (chr >= 0x20) ? String.fromCharCode(chr) : '.';
                if (j % 2 === 0) {
                    chr = c & 0x7f; s4 += (chr >= 0x20) ? String.fromCharCode(chr) : '.';
                    tmp = c & 0x300;
                } else {
                    chr = c & 0x7f; s4 += (chr >= 0x20) ? String.fromCharCode(chr) : '.';
                    chr = tmp >> 4 | (chr & 0xf00) >> 8;
                    s4 += (chr >= 0x20) ? String.fromCharCode(chr) : '.';
                }
            }
            logger(s, s2, s3, s4);
            a = (a + 8) & this.D_AMS;
        }
        return a;
    }
}

class Monitor12 extends Monitor {      // override for 12-bit mode
    constructor(emu) {
        super(emu);
        this.parser = new RegExp('([_]?[0-7a-z]+)([!<>=]+)([\.0-7]+)$', 'i'); // breakpoints
    }
    prepareStop(str) {                 // override breakpoints, add [null, address, cond, value]
        if (str === null) this.emu.CPU.STOP = this.emu.disassemble1()[0] & this.emu.D_AMS;
        else {
            const idx = str.indexOf(';');
            if (idx < 0) this.emu.CPU.STOP = pi(str) & this.emu.D_AMS;
            else {
                this.emu.CPU.STOP = pi(str.substring(0, idx)) & this.emu.D_AMS;
                this.emu.CPU.STOP_REGS = str.substring(idx + 1).split(',');
                let err = null;
                for (let i = 0, n = this.emu.CPU.STOP_REGS.length; i < n; i++) {
                    const txt = this.emu.CPU.STOP_REGS[i],
                          exp = txt.match(this.parser);
                    if (exp === null || exp.length < 4) {
                        err = `invalid expression: ${txt}`; break;
                    }
                    if (exp[1].startsWith('_')) { // add memory breakpoint
                        exp[0] = null;
                        exp[1] = pi(exp[1].substring(1));
                    }
                    else exp[1] = new RegExp(`${exp[1]}\:([\.0-7]+)( |#|\||$)`, 'i');
                    this.emu.CPU.STOP_REGS[i] = exp;
                }
                if (err !== null) {
                    this.emu.CPU.STOP = -1; this.emu.CPU.STOP_REGS.length = 0;
                    throw new Error(err);
                }
            }
        }
    }
    async handler(parms, cmd) {
        let tmp, len, adr, idx, hex;
        switch (cmd) {
            case 'm':
                if (parms.length < 3) console.error('missing: adr v [v ...]');
                else this.logger(this.emu.loadBin(
                    parms.slice(2).map(i => pi(i) & this.emu.D_AMS), pi(parms[1]) & this.emu.D_AMS
                ));
                break;
            case 'r':
                if ((len = parms.length) < 2) { console.error('missing: [a=200] fn [h=0]'); break; }
                idx = 1;
                try { adr = pi(parms[1]) & this.emu.D_AMS; idx++; } catch(exc) { adr = 0o200; }
                if (len < idx + 1) { console.error('missing: [a=200] fn [h=0]'); break; }
                hex = (len > idx + 1) ? parms[idx + 1] === '1' : false;
                tmp = await loadFile(parms[idx], hex);
                if (!hex) tmp = new Uint16Array(tmp.buffer); // remap uint8 to uint16
                this.logger(hex ? this.emu.loadHex(tmp, adr) : this.emu.loadBin(tmp, adr));
                break;
            case 'w':
                if (parms.length < 3) { console.error('missing: a1 a2'); break; }
                adr = pi(parms[1]) & this.emu.D_AMS;
                len = pi(parms[2]) & this.emu.D_AMS;
                if (adr > len) {
                    console.error(`end address: ${len.toString(8)} < start: ${adr.toString(8)}`);
                    break;
                }
                tmp = new Uint16Array(len - adr + 1);
                for (let i = adr, a = 0; i <= len; i++) tmp[a++] = this.emu.memo.rd(i);
                downloadFile('block.bin', tmp);
                break;
            case 'find':
                if (parms.length >= 2) {
                    const str = parms[1].trim();
                    if ((str.length % 4) !== 0) {
                        console.error('words must be in 4 digits each'); break;
                    }
                    this.find = []; this.findidx = 0;
                    for (let i = 0, n = str.length; i < n; i += 4)
                        this.find.push(pi(str.substring(i, i + 4)));
                }
                if (this.find === null) { console.error('missing: words'); break; }
                if (this.findidx < 0) { console.log('not found'); break; }
                const maxmem = this.emu.D_AMS + 1;
                do {
                    while (this.findidx < maxmem &&
                            this.emu.memo.rd(this.findidx++) !== this.find[0]) ;
                    if (this.findidx >= maxmem) break;
                    let i = 1, tmpidx = this.findidx;
                    while (i < this.find.length &&
                            this.emu.memo.rd(this.findidx++) === this.find[i]) i++;
                    if (i >= this.find.length) break;
                    this.findidx = tmpidx;
                } while (this.findidx < maxmem);
                if (this.findidx >= maxmem) {
                    this.findidx = -1; console.log('not found'); break;
                }
                this.findidx -= this.find.length - 1;
                this.addr = this.emu.printMem(this.findidx - 1, undefined, undefined, this.logger);
                break;
            case 'sadr': case 'sadd': case 'srem': case 'swdt':
            case 'spts': console.warn('not supported'); break;
            default: await super.handler(parms, cmd); break;
        }
    }
}

function MM8_E() {                     // memory
    let CPU = null;
    const RAM = new Array(4096),
    rd = a => RAM[a],
    wr = (a, v) => RAM[a] = v & 0o7777;
    RAM.fill(0);
    return {rd, wr, CPU, 'setCpu': v => CPU = v, 'clear': () => RAM.fill(0)};
}

const AC = 0, PC = 1, MQ = 2, SR = 3,  // registers
      IE = 4, IR = 5, II = 6, UIF = 7, // interrupt flags
      GT = 8,                          // EAE flag
      IF = 9, DF = 10, IB = 11,        // EMC registers
      SF = 12,                         // EMC saved flags
      UF = 13, UB = 14;                // EMC user flag

function Cpu(memo) {                   // KK8_E CPU
    let tmp, dev, instr, code, addr, dat;
    const regs = new Array(15),
          devices = new Map(), asm = new Map(),     // ext devices - {status, reset, process}
    sts = (reg, chr) => regs[reg] ? chr : '.',
    reset = () => regs.fill(0),
    disassembleInstruction = a => {
        const instr = memo.rd(a),
              code = instr & 0o7000;
        let s;
        if (code < 0o6000) {                        // basic instructions
            switch (code) {
                case 0o0000: s = 'AND'; break;
                case 0o1000: s = 'TAD'; break;
                case 0o2000: s = 'ISZ'; break;
                case 0o3000: s = 'DCA'; break;
                case 0o4000: s = 'JMS'; break;
                case 0o5000: s = 'JMP'; break;
            }
            if (instr & 0o400) s += ' I';
            let addr = instr & 0o177;
            if (instr & 0o200) addr |= a & 0o7600;
            s += ` ${fmt(addr)}`;
        } else {                                    // IO or OPR instructions
            s = asm.get(instr);
            if (s === undefined)
                if (code === 0o6000) s = `IOT ${fmt(instr >> 3 & 0o77, 2)} ${instr & 0o7}`;
                else if ((instr & 0o400) === 0) {   // OPR instructions group 1
                    s = '';
                    if (instr & 0o200) s += 'CLA ';
                    if (instr & 0o100) s += 'CLL ';
                    if (instr & 0o40) s += 'CMA ';
                    if (instr & 0o20) s += 'CML ';
                    if (instr & 0o1) s += 'IAC ';
                    switch (instr & 0o16) {
                        case 0o12: s += 'RTR'; break;
                        case 0o10: s += 'RAR'; break;
                        case 0o6: s += 'RTL'; break;
                        case 0o4: s += 'RAL'; break;
                        case 0o2: s += 'BSW'; break;
                    }
                    s = s.trim();
                } else if ((instr & 0o1) === 0) {   // group 2
                    s = '';
                    if (instr & 0o100) s += ((instr & 0o10) === 0) ? 'SMA ' : 'SPA ';
                    if (instr & 0o40) s += ((instr & 0o10) === 0) ? 'SZA ' : 'SNA ';
                    if (instr & 0o20) s += ((instr & 0o10) === 0) ? 'SNL ' : 'SZL ';
                    if (instr & 0o200) s += 'CLA ';
                    if (instr & 0o4) s += 'OSR ';
                    if (instr & 0o2) s += 'HLT';
                    s = s.trim();
                } else {                            // group 3
                    s = '';
                    if (instr & 0o200) s += 'CLA ';
                    if (instr & 0o100) s += 'MQA ';
                    if (instr & 0o20) s += 'MQL';
                    s = s.trim();
                }
        }
        return [a + 1 & 0o77777, s];
    },
    setRegisters = r => {
        let s = '';
        for (let i = 1; i < r.length; i += 2) {
            const reg = r[i].toLowerCase(),
                  n = parseInt(r[i + 1], 8);
            switch (reg) {
                case 'l': if (n !== 0) regs[AC] |= 0o10000; else regs[AC] &= 0o7777; break;
                case 'ac': regs[AC] = (regs[AC] & 0o10000) | (n & 0o7777); break;
                case 'pc': regs[PC] = n & 0o7777; break;
                case 'mq': regs[MQ] = n & 0o7777; break;
                case 'sr': regs[SR] = n & 0o7777; break;
                case 'ie': regs[IE] = n ? 1 : 0; break;
                case 'ir': regs[IR] = n ? 1 : 0; break;
                case 'ii': regs[II] = n ? 1 : 0; break;
                case 'uif': regs[UIF] = n ? 1 : 0; break;
                case 'gt': regs[GT] = n ? 1 : 0; break;
                case 'if': regs[IF] = n & 0o7; break;
                case 'df': regs[DF] = n & 0o7; break;
                case 'ib': regs[IB] = n & 0o7; break;
                case 'sf': regs[SF] = n & 0o177; break;
                case 'uf': regs[UF] = n ? 1 : 0; break;
                case 'ub': regs[UB] = n ? 1 : 0; break;
                default: s += ' ' + reg; break;
            }
        }
        return s.length ? `unknown register(s): ${s}` : s;
    },
    cpuStatus = () => {
        let s = '', count = 0;
        devices.forEach((dev, key) => {
            if (dev === null) return;               // undefined device with disabled logging
            const [ie, flag] = dev.status();
            s += `${fmt(key, 2)}:${ie}${flag} `;
            count++; if (count > 3) { count = 0; s += '|'; }
        });
        const fs = `${sts(IE, 'I')}${sts(IR, 'R')}${sts(UIF, 'U')}${sts(II, 'D')}${sts(GT, 'G')}`,
        es = `${regs[IF]}.${regs[IB]}${regs[DF]} ${fmt(regs[SF], 3)} ${sts(UF, 'U')}${sts(UB, 'u')}`;
        return `LAC:${fmt(regs[AC], 5)} MQ:${fmt(regs[MQ])} ${fs}|SR:${fmt(regs[SR])} EMC:${es}|${s}`;
    },
    getPC = () => regs[PC],
    setPC = v => regs[PC] = v & 0o7777,
    _interrupt = () => { memo.wr(0, regs[PC]); regs[PC] = 1; },
    _jms = addr => { memo.wr(addr, regs[PC]); regs[PC] = addr + 1 & 0o7777; regs[II] = 0; },
    _jmp = addr => { regs[PC] = addr; regs[II] = 0; },
    _gtf = () => {
        regs[AC] &= 0b1000001111111;
        if (regs[AC] & 0o10000) regs[AC] |= 0o4000;                             // LINK
        if (regs[GT]) regs[AC] |= 0o2000;                                       // GT
        if (regs[IR] || regs[UIF]) regs[AC] |= 0o1000;                          // IR
        if (regs[IE] >= 1) regs[AC] |= 0o200;                                   // IE
    },
    _rtf = () => {
        if (regs[AC] & 0o4000) regs[AC] |= 0o10000; else regs[AC] &= 0o7777;    // LINK
        regs[GT] = (regs[AC] & 0o2000) ? 1 : 0;                                 // GT
        regs[II] = 1; regs[IE] = 4;
    },
    _ext60x0 = op => {},
    _ext62x0 = op => {},
    _eae = op => {},
    step = () => {
        if (regs[IE] > 1) regs[IE] >>= 1;                                       // delayed enabling
        if ((regs[IR] || regs[UIF]) && regs[II] === 0 && regs[IE] === 1) {
            regs[IE] = 0; _this._interrupt();       // interrupt processing
        }
        instr = memo.rd(regs[PC]); code = instr & 0o7000; dat = undefined;
        if (code < 0o6000) {                        // memory instruction
            addr = instr & 0o177;
            if (instr & 0o200) addr |= regs[PC] & 0o7600;                       // Z bit
            if (instr & 0o400) {                                                // I bit
                dat = 1;                                                        // enable DF register
                if ((addr & 0o7770) === 0o10) memo.wr(addr, memo.rd(addr) + 1); // auto-increment
                addr = memo.rd(addr);                                           // indirection
            }
        }
        regs[PC] = regs[PC] + 1 & 0o7777;           // next instruction
        switch (code) {                             // decode
            case 0o0000: regs[AC] &= 0o10000 | memo.rd(addr, dat); break;                   // AND
            case 0o1000: regs[AC] = (regs[AC] + memo.rd(addr, dat)) & 0o17777; break;       // TAD
            case 0o2000:                                                                    // ISZ
                memo.wr(addr, (tmp = memo.rd(addr, dat) + 1 & 0o7777), dat);
                if (tmp === 0) regs[PC] = regs[PC] + 1 & 0o7777;
                break;
            case 0o3000:                                                                    // DCA
                memo.wr(addr, regs[AC], dat);
                regs[AC] &= 0o10000;
                break;
            case 0o4000: _this._jms(addr); break;                                           // JMS
            case 0o5000: _this._jmp(addr); break;                                           // JMP
            case 0o6000:                                                                    // IOT
                if (regs[UF]) { regs[UIF] = 1; break; }                         // user mode
                tmp = instr >> 3 & 0o77;            // device number
                if (tmp === 0) switch (instr) {
                    case 0o6000:                                                            // SKON
                        if (regs[IE] === 1) { regs[PC] = regs[PC] + 1 & 0o7777; regs[IE] = 0; }
                        break;
                    case 0o6001: if (regs[IE] === 0) regs[IE] = 4; break;                   // ION
                    case 0o6002: regs[IE] = 0; break;                                       // IOF
                    case 0o6003:                                                            // SRQ
                        if (regs[IR] || regs[UIF]) regs[PC] = regs[PC] + 1 & 0o7777;
                        break;
                    case 0o6004: _this._gtf(); break;                                       // GTF
                    case 0o6005: _this._rtf(); break;                                       // RTF
                    case 0o6006: if (regs[GT]) regs[PC] = regs[PC] + 1 & 0o7777; break;     // SGT
                    case 0o6007:                                                            // CAF
                        regs[AC] = regs[IE] = regs[UIF] = 0;
                        devices.forEach(dev => { if (dev !== null) dev.reset(); });
                        break;
                    default: _this._ext60x0(instr); break;
                }
                else if ((instr & 0o700) === 0o200) _this._ext62x0(instr);
                else {
                    dev = devices.get(tmp);
                    if (dev) dev.process(instr & 0o7, tmp);
                    else if (dev === undefined) {
                        console.warn(`unknown device: ${fmt(tmp, 2)}`);
                        devices.set(tmp, null);     // disable logging
                    }
                }
                break;
            case 0o7000:                                                                    // OPR
                if ((instr & 0o400) === 0) {        // group 1
                    if (instr & 0o200) regs[AC] &= 0o10000;                                 // CLA
                    if (instr & 0o100) regs[AC] &= 0o7777;                                  // CLL
                    if (instr & 0o40) regs[AC] ^= 0o7777;                                   // CMA
                    if (instr & 0o20) regs[AC] ^= 0o10000;                                  // CML
                    if (instr & 0o1) regs[AC] = regs[AC] + 1 & 0o17777;                     // IAC
                    switch (instr & 0o16) {
                        case 0o12:                                                          // RTR
                            tmp = regs[AC]; regs[AC] = (tmp >> 1 | tmp << 12) & 0o17777;
                        case 0o10:                                                          // RAR
                            tmp = regs[AC]; regs[AC] = (tmp >> 1 | tmp << 12) & 0o17777;
                            break;
                        case 0o6:                                                           // RTL
                            tmp = regs[AC]; regs[AC] = (tmp >> 12 | tmp << 1) & 0o17777;
                        case 0o4:                                                           // RAL
                            tmp = regs[AC]; regs[AC] = (tmp >> 12 | tmp << 1) & 0o17777;
                            break;
                        case 0o2:                                                           // BSW
                            tmp = regs[AC];
                            regs[AC] = (tmp & 0o10000) | (tmp >> 6 & 0o77) | (tmp << 6 & 0o7700);
                            break;
                    }
                } else if ((instr & 0o1) === 0) {   // group 2
                    tmp = regs[AC];
                    tmp = (
                        (instr & 0o100 && tmp & 0o4000) ||                                  // SMA SPA
                        (instr & 0o40 && (tmp & 0o7777) === 0) ||                           // SZA SNA
                        (instr & 0o20 && tmp & 0o10000)                                     // SNL SZL
                    ) ? 0 : 0o10;
                    if (tmp === (instr & 0o10)) regs[PC] = regs[PC] + 1 & 0o7777;
                    if (instr & 0o200) regs[AC] &= 0o10000;                                 // CLA
                    if (instr & 0o4) {                                                      // OSR
                        if (regs[UF]) { regs[UIF] = 1; break; }                 // user mode
                        regs[AC] |= regs[SR];
                    }
                    if (instr & 0o2) {                                                      // HLT
                        if (regs[UF]) { regs[UIF] = 1; break; }                 // user mode
                        return false;
                    }
                } else {                            // group 3
                    if (instr & 0o200) regs[AC] &= 0o10000;                                 // CLA
                    tmp = regs[MQ];
                    if (instr & 0o20) { regs[MQ] = regs[AC] & 0o7777; regs[AC] &= 0o10000; } // MQL
                    if (instr & 0o100) regs[AC] |= tmp;                                     // MQA
                    if (instr & 0o16 || instr & 0o40) _this._eae(instr);        // EAE
                }
                break;
        }
        return true;
    },
    setInterrupt = flag => {
        if (flag & 0o1000) regs[IR] &= flag; // ~flag, clear interrupt
        else regs[IR] |= flag;               // set interrupt
    };
    reset();
    asm.set(0o6000, 'SKON'); asm.set(0o6001, 'ION'); asm.set(0o6002, 'IOF'); asm.set(0o6003, 'SRQ');
    asm.set(0o6004, 'GTF');  asm.set(0o6005, 'RTF'); asm.set(0o6006, 'SGT'); asm.set(0o6007, 'CAF');
    asm.set(0o7000, 'NOP');  asm.set(0o7041, 'CIA');
    asm.set(0o7120, 'STL');
    asm.set(0o7240, 'STA');
    asm.set(0o7400, 'NOP');  asm.set(0o7401, 'NOP'); asm.set(0o7410, 'SKP');
    asm.set(0o7521, 'SWP');
    asm.set(0o7604, 'LAS');  asm.set(0o7621, 'CAM');
    const _this = {
        regs, devices, asm,
        step, _interrupt, _jms, _jmp, _gtf, _rtf, _ext60x0, _ext62x0, _eae,
        reset, disassembleInstruction, setRegisters, cpuStatus, getPC, setPC, setInterrupt
    };
    return _this;
}

function KM8_E(count = 1) {            // extension
    if (count < 1 || count > 7) throw new Error(`invalid field count: ${count}`);
    let regs, tse = false, tmp, tmp2,
        interrupt, jms, jmp, gtf, rtf,
        CPU = null;
    const RAM = [MM8_E()],
    rd = (a, dat) => ((tmp = dat ? regs[DF] : regs[IF]) <= count) ? RAM[tmp].rd(a) : 0,
    wr = (a, v, dat) => ((tmp = dat ? regs[DF] : regs[IF]) <= count) ? RAM[tmp].wr(a, v) : undefined,
    setTSE = v => tse = v,             // time sharing option enable/disable
    setField = v => regs[IF] = v & 0o7,
    setCpu = v => {
        CPU = v;
        const cpu = v.cpu;
        regs = cpu.regs;
        interrupt = cpu._interrupt; cpu._interrupt = () => {
            regs[SF] = regs[IF] << 3 | regs[DF]; regs[IF] = regs[IB] = regs[DF] = 0;
            if (tse) { if (regs[UF]) regs[SF] |= 0o100; regs[UF] = regs[UB] = 0; }
            interrupt();
        };
        jms = cpu._jms; cpu._jms = a => {
            regs[IF] = regs[IB]; regs[UF] = regs[UB];
            jms(a);
        };
        jmp = cpu._jmp; cpu._jmp = a => {
            regs[IF] = regs[IB]; regs[UF] = regs[UB];
            jmp(a);
        };
        gtf = cpu._gtf; cpu._gtf = () => {
            gtf(); regs[AC] = (regs[AC] & 0b1111110000000) | regs[SF];
        };
        rtf = cpu._rtf; cpu._rtf = () => {
            rtf(); tmp2 = regs[AC];
            regs[IB] = tmp2 >> 3 & 0o7; regs[DF] = tmp2 & 0o7;
            if (tse) regs[UB] = (tmp2 & 0o100) ? 1 : 0;
        };
        cpu._ext62x0 = op => {
            switch (op & 0o70) {
                case 0o00: // CINT, CDF 0, CIF 0
                    if (tse && op & 4) { regs[UIF] = 0; return; }
                    if (op & 1) regs[DF] = 0;
                    if (op & 2) { regs[IB] = 0; regs[II] = 1; }
                    break;
                case 0o10: // RDF, CDF 1, CIF 1
                    if (op & 4) regs[AC] |= regs[DF] << 3;
                    else {
                        if (op & 1) regs[DF] = 1;
                        if (op & 2) { regs[IB] = 1; regs[II] = 1; }
                    }
                    break;
                case 0o20: // RIF, CDF 2, CIF 2
                    if (op & 4) regs[AC] |= regs[IF] << 3;
                    else {
                        if (op & 1) regs[DF] = 2;
                        if (op & 2) { regs[IB] = 2; regs[II] = 1; }
                    }
                    break;
                case 0o30: // RIB, CDF 3, CIF 3
                    if (op & 4) regs[AC] |= regs[SF];
                    else {
                        if (op & 1) regs[DF] = 3;
                        if (op & 2) { regs[IB] = 3; regs[II] = 1; }
                    }
                    break;
                case 0o40: // RMF, CDF 4, CIF 4
                    if (op & 4) {
                        tmp2 = regs[SF];
                        regs[IB] = tmp2 >> 3 & 0o7; regs[DF] = tmp2 & 0o7; regs[II] = 1;
                        if (tse) regs[UB] = (tmp2 & 0o100) ? 1 : 0;
                    } else {
                        if (op & 1) regs[DF] = 4;
                        if (op & 2) { regs[IB] = 4; regs[II] = 1; }
                    }
                    break;
                case 0o50: // SINT, CDF 5, CIF 5
                    if (tse && op & 4) { if (regs[UIF]) regs[PC] = regs[PC] + 1 & 0o7777; return; }
                    if (op & 1) regs[DF] = 5;
                    if (op & 2) { regs[IB] = 5; regs[II] = 1; }
                    break;
                case 0o60: // CUF, CDF 6, CIF 6
                    if (tse && op & 4) { regs[UB] = 0; return; }
                    if (op & 1) regs[DF] = 6;
                    if (op & 2) { regs[IB] = 6; regs[II] = 1; }
                    break;
                case 0o70: // SUF, CDF 7, CIF 7
                    if (tse && op & 4) { regs[UB] = 1; regs[II] = 1; return; }
                    if (op & 1) regs[DF] = 7;
                    if (op & 2) { regs[IB] = 7; regs[II] = 1; }
                    break;
            }
        };
        for (let i = 0; i < 8; i++) {
            const num = i << 3;
            cpu.asm.set(0o6201 | num, `CDF ${i}`); cpu.asm.set(0o6202 | num, `CIF ${i}`);
            cpu.asm.set(0o6203 | num, `CDI ${i}`);
        }
        cpu.asm.set(0o6214, 'RDF'); cpu.asm.set(0o6224, 'RIF');
        cpu.asm.set(0o6234, 'RIB'); cpu.asm.set(0o6244, 'RMF');
        if (tse) {
            cpu.asm.set(0o6204, 'CINT'); cpu.asm.set(0o6254, 'SINT');
            cpu.asm.set(0o6264, 'CUF');  cpu.asm.set(0o6274, 'SUF');
        }
    },
    clear = () => {
        for (let i = 0; i <= count; i++) RAM[i].clear();
    };
    for (let i = 0; i < count; i++) RAM.push(MM8_E());
    return {rd, wr, setTSE, setField, CPU, setCpu, clear};
}

function PDP_Device(                   // console IO device
        cpu,                           // cpu reference
        ready,                         // function(), returns device ready flag
        transfer,                      // function([AC]), outputs AC or returns value if input
        ie,                            // [ie], shared interrupt enabled flag
        clear_ac,                      // true for input device, false for output device
        mask_ac = 0o7777,              // input value mask
        int_bit = 1) {                 // iterrupt request bit
    let flag = 0, kbuf = 0;            // ready flag and keyboard buffer
    const regs = cpu.regs,
    setFlag = value => {
        flag = value;
        if (ie[0]) cpu.setInterrupt(flag ? int_bit : ~int_bit);
    },
    status = () => [ie[0], flag],
    reset = () => { ie[0] = 1; setFlag(0); },
    process = num => {
        if (num === 0) setFlag(clear_ac ? 0 : 1);
        else if (num === 0o5) {
            if (clear_ac) ie[0] = regs[AC] & 0o1;
            else if (ie[0] && flag) regs[PC] = regs[PC] + 1 & 0o7777;
        } else {
            if (num & 1) {
                if (clear_ac && ready()) setFlag(1);
                if (flag) regs[PC] = regs[PC] + 1 & 0o7777;
            }
            if (num & 2) { setFlag(0); if (clear_ac) regs[AC] &= 0o10000; }
            if (num & 4)
                if (clear_ac) {
                    if (kbuf === 0) kbuf = transfer(); // fill keyboard buffer
                    regs[AC] |= kbuf & mask_ac;
                } else {
                    transfer(regs[AC]); setFlag(1);
                }
            if (clear_ac && num & 2) kbuf = 0;         // clear keyboard buffer
        }
    };
    ie[0] = 1;
    return {status, reset, process, setFlag};
}

class ASR33 extends Kbd {              // system console
    static init(con, mon, ka, ta, int) {
        const cpu = mon.emu.CPU.cpu,
              ie = [0],                                  // shared interrupt flag
              ptr_ptp = [0o200, null],                   // PTR mask and PTP output
        devkbd = PDP_Device(cpu,
            () => con.kbd.length > 0,                    // kbd ready
            () => (con.kbd.shift() & 0xff) | ptr_ptp[0], // kbd get
            ie, true, 0o377, int                         // 8bit
        ),
        devcon = PDP_Device(cpu,
            () => true,                                  // con ready
            ac => {                                      // con put
                con.display(ac & 0x7f);
                if (ptr_ptp[1] !== null) ptr_ptp[1] += String.fromCharCode(ac & 0x7f);
            },
            ie, false, undefined, int
        );
        cpu.devices.set(ka, devkbd);             // set input device
        cpu.devices.set(ta, devcon);             // set output device
        cpu.asm.set(0b110000000000 | ka << 3, 'KCF'); cpu.asm.set(0b110000000001 | ka << 3, 'KSF');
        cpu.asm.set(0b110000000010 | ka << 3, 'KCC'); cpu.asm.set(0b110000000100 | ka << 3, 'KRS');
        cpu.asm.set(0b110000000101 | ka << 3, 'KIE'); cpu.asm.set(0b110000000110 | ka << 3, 'KRB');
        cpu.asm.set(0b110000000000 | ta << 3, 'SPF'); cpu.asm.set(0b110000000001 | ta << 3, 'TSF');
        cpu.asm.set(0b110000000010 | ta << 3, 'TCF'); cpu.asm.set(0b110000000100 | ta << 3, 'TPC');
        cpu.asm.set(0b110000000101 | ta << 3, 'SPI'); cpu.asm.set(0b110000000110 | ta << 3, 'TLS');
        return {devkbd, devcon, ptr_ptp};
    }
    constructor(con, mon) {
        super(con, mon);
        const devs = ASR33.init(con, mon, 0o3, 0o4, 1);
        this.devkbd = devs.devkbd;
        this.devcon = devs.devcon;
        this.ptr_ptp = devs.ptr_ptp;
    }
    processKey(val) {
        super.processKey(val);
        this.devkbd.setFlag(1);                  // set IRQ
    }
}

function RX01(CPU) {                   // RX8E/RX01 disk drive
    let ie = 0, flags = 0,                       // IE bit and flags
        intf = 0, err = 0, errst = 0,            // interface, error code and error status
        cmd = 0, maint = 0, bit8 = 0,            // command, maint. mode and 8-bit transfer flag
        drv = 0, trk = 0, sec = 0,               // drive, track and sector
        part = 0, count = 0;                     // transfer part and count
    const DSK = [null, null], BUF = new Uint8Array(128), mmm = ArrMemo(BUF),
          cpu = CPU.cpu, regs = cpu.regs,
    status = () => [ie, flags],
    reset = () => process(7),
    process = num => {
        switch (num) {
            case 0: // SEL
                console.warn('drive select not implemented');
                break;
            case 1: // LCD
                const tmp = regs[AC] & 0o7777; regs[AC] &= 0o10000;
                cmd = tmp >> 1 & 0o7; maint = tmp & 0o200; bit8 = tmp & 0o100;
                drv = (tmp & 0o20) ? 1 : 0;
                if (maint) flags = 0o7;
                else switch (cmd) {
                    case 0: // fill buffer
                    case 2: // write sector
                    case 3: // read sector
                    case 6: // write deleted data
                        part = 0; flags |= 4;
                        break;
                    case 1: // empty buffer
                        empty12();
                        break;
                    case 4: // nop
                        errst &= 0o303;     // turn off Init Done bit
                        part = 0; count = 0;
                        done();
                        break;
                    case 5: // read status
                        if (DSK[drv] === null) {
                            err = 0o110; flags |= 2;
                            done();
                        }
                        else if (sec === 1) {
                            errst |= 0o200; // turn on Drv Rdy bit
                            errst &= 0o303; // turn off Init Done bit
                            done();
                        }
                        break;
                    case 7: // read error register
                        part = 0; count = 0;
                        done();
                        intf = err;         // reset interface reg to error
                        break;
                }
                break;
            case 2: // XDR
                if (maint) regs[AC] |= intf & 0o7777;
                else switch (cmd) {
                    case 0: // fill buffer
                        intf = regs[AC] & 0o7777;
                        if (part) {
                            BUF[count++] |= (intf & 0o7400) >> 8;
                            BUF[count++] = intf & 0o0377;
                            part = 0;
                        } else {
                            BUF[count++] = (intf & 0o7760) >> 4;
                            BUF[count] = (intf & 0o0017) << 4;
                            part = 1;
                        }
                        if (count < 96) flags |= 4;
                        else {
                            for (; count < 128; count++) BUF[count] = BUF[96];
                            part = 0; count = 0;
                            done();
                        }
                        break;
                    case 1: // empty buffer
                        regs[AC] = (regs[AC] & 0o10000) | (intf & 0o7777);
                        empty12();
                        break;
                    case 2: // write sector
                    case 3: // read sector
                        intf = regs[AC] & 0o7777;
                        if (part === 0) { sec = intf & 0o177; flags |= 4; part = 1; }
                        else {
                            part = 0; count = 0;
                            trk = intf & 0o377;
                            if (trk < 0 || trk > 76) { err = 0o40; flags |= 2; }
                            else if (sec < 1 || sec > 26) { err = 0o70; flags |= 2; }
                            else if (DSK[drv] === null) { err = 0o110; flags |= 2; }
                            else {
                                err = 0;
                                DSK[drv].transfer(trk, sec, 0, mmm, cmd === 3);
                            }
                            done();
                        }
                        break;
                    case 4: // nop
                    case 5: // read status
                    case 7: // read error register
                        regs[AC] |= intf & 0o7777;
                        break;
                    case 6: // write deleted data
                        console.warn('write deleted not implemented');
                        break;
                }
                break;
            case 3: // STR
                if (flags & 4) {
                    regs[PC] = regs[PC] + 1 & 0o7777;
                    if (maint === 0) flags &= ~4;
                }
                break;
            case 4: // SER
                if (flags & 2) {
                    regs[PC] = regs[PC] + 1 & 0o7777;
                    if (maint === 0) flags &= ~2;
                }
                break;
            case 5: // SDN
                if (flags & 1) {
                    regs[PC] = regs[PC] + 1 & 0o7777;
                    if (maint === 0) {
                        if (ie) cpu.setInterrupt(~2);
                        flags &= ~1;
                    }
                }
                break;
            case 6: // INTR
                if (ie && flags & 1) cpu.setInterrupt(~2);
                ie = regs[AC] & 1;
                if (ie && flags & 1) cpu.setInterrupt(2);
                break;
            case 7: // INIT
                intf = 0; err = 0; errst = 0;
                cmd = 0; maint = 0; bit8 = 0;
                drv = 0; trk = 1; sec = 1;
                part = 0; count = 0;
                if (ie) cpu.setInterrupt(~2);
                ie = 0; flags = 0;
                if (DSK[drv] === null) { err = 0o110; flags |= 2; }
                else DSK[drv].transfer(trk, sec, 0, mmm, true);
                done();
                break;
        }
    },
    done = () => {
        flags |= 1; intf = errst; if (ie) cpu.setInterrupt(2);
    },
    empty12 = () => {
        if (count < 96) {
            if (part) {
                intf = ((BUF[count++] & 0o17) << 8) | BUF[count++];
                part = 0;
            } else {
                intf = (BUF[count++] << 4) | (BUF[count] >> 4);
                part = 1;
            }
            flags |= 4;
        } else {
            part = 0; count = 0;
            done();
        }
    },
    res = {
        status, reset, process,
        'setDsk': (drv, img) => {                // set drive image
            if (img === null) DSK[drv] = null;
            else {
                DSK[drv] = Disk(77, 26, 128, 1, 0x10000, null); // empty disk
                if (img.length > 0) {
                    if (img.length !== 256256) throw new Error(`disk image error: ${img.length}`);
                    DSK[drv].drive.set(img, 0);
                }
            }
            reset();
        },
        'getDsk': drv => DSK[drv]?.drive         // get drive image
    };
    reset();
    cpu.devices.set(0o75, res);
    cpu.asm.set(0o6751, 'LCD');  cpu.asm.set(0o6752, 'XDR');
    cpu.asm.set(0o6753, 'STR');  cpu.asm.set(0o6754, 'SER'); cpu.asm.set(0o6755, 'SDN');
    cpu.asm.set(0o6756, 'INTR'); cpu.asm.set(0o6757, 'INIT');
    return res;
}

function DK8EA(CPU) {                  // DK8EA line frequency clock (100 ticks/sec)
    let ie = 0,                                  // IE bit
        tick_flag = 0,                           // set by clock tick, reset by user
        irq_count = 0;                           // interrupt issued
    const cpu = CPU.cpu, regs = cpu.regs,
    status = () => [ie, tick_flag << 1 | irq_count],
    reset = () => {
        if (irq_count > 0) { irq_count = 0; cpu.setInterrupt(~4); }
        ie = 0; tick_flag = 0;
    },
    process = num => {
        switch (num) {
            case 1: // CLEI
                if (ie === 0) {
                    if (tick_flag && irq_count === 0) {
                        irq_count = 1; cpu.setInterrupt(4);
                    }
                    ie = 1;
                }
                break;
            case 2: // CLDI
                if (ie) {
                    if (irq_count) {
                        irq_count = 0; cpu.setInterrupt(~4);
                    }
                    ie = 0;
                }
                break;
            case 3: // CLSK
                if (tick_flag) {
                    regs[PC] = regs[PC] + 1 & 0o7777;
                    if (irq_count) {
                        irq_count = 0; cpu.setInterrupt(~4);
                    }
                    tick_flag = 0;
                }
                break;
        }
    },
    timer = () => {
        if (tick_flag === 0) {
            tick_flag = 1;
            if (ie && irq_count === 0) {
                irq_count = 1; cpu.setInterrupt(4);
            }
        }
        setTimeout(timer, 100);
    },
    res = {status, reset, process};
    timer();
    cpu.devices.set(0o13, res);
    cpu.asm.set(0o6131, 'CLEI'); cpu.asm.set(0o6132, 'CLDI'); cpu.asm.set(0o6133, 'CLSK');
    return res;
}

function RF08(mem) {                   // RF08/RS08 fixed head disk
    let done = 0, sta = 0, da = 0;               // done flag, status and disk address
    const DSK = new Uint16Array(4 * 128 * 2048), // disk buffer (1,048,576 x 2)
          CPU = mem.CPU, cpu = CPU.cpu, regs = cpu.regs,
    status = () => [(sta & 0o700) >> 6, (sta & 0o7) | done << 3],
    reset = () => { done = 1; sta = 0; da = 0; cpu.setInterrupt(~8); },
    process = (num, adr) => {
        switch (num) {
            case 1: switch (adr) {
                case 0o60: da &= ~0o7777; done = 0; sta &= ~0o1007; intr(); break;    // DCMA
                case 0o61: sta &= 0o7007; cpu.setInterrupt(~8); break;                // DCIM
                case 0o62: if (sta & 0o1007) regs[PC] = regs[PC] + 1 & 0o7777; break; // DFSE
                case 0o64: da &= 0o7777; intr(); break;                               // DCXA
            } break;
            case 2: switch (adr) {
                case 0o61:                                                            // DSAC
                    if (true) // maintenace not implemented
                        regs[PC] = regs[PC] + 1 & 0o7777;
                    regs[AC] &= 0o10000;
                    break;
                case 0o62: if (done) regs[PC] = regs[PC] + 1 & 0o7777; break;         // DFSC
            } break;
            case 3: switch (adr) {
                case 0o60: dma(true); break;                                          // DMAR
                case 0o62:                                                            // DISK
                    if (sta & 0o1007 || done) regs[PC] = regs[PC] + 1 & 0o7777;
                    break;
                case 0o64:                                                            // DXAL
                    da &= 0o7777; da |= (regs[AC] & 0o377) << 12; regs[AC] &= 0o10000; intr();
                    break;
            } break;
            case 5: switch (adr) {
                case 0o60: dma(false); break;                                         // DMAW
                case 0o61:                                                            // DIML
                    sta = (sta & 0o7007) | (regs[AC] & 0o770); regs[AC] &= 0o10000; intr();
                    break;
                case 0o64:                                                            // DXAC
                    regs[AC] &= 0o10000; regs[AC] |= da >> 12 & 0o377; intr();
                    break;
            } break;
            case 6: switch (adr) {
                case 0o61: regs[AC] = (regs[AC] & 0o10000) | (sta & 0o7777); break;   // DIMA
                case 0o62: regs[AC] = (regs[AC] & 0o10000) | (da & 0o7777); break;    // DMAC
                case 0o64:                                                            // DMMT
                    // maintenace not implemented
                    regs[AC] &= 0o10000;
                    break;
            } break;
        }
    },
    intr = () => {
        cpu.setInterrupt(
            ((done && sta & 0o100) ||
            (sta & 0o1007 && sta & 0o400) ||
            (sta & 0o4000 && sta & 0o200)) ? 8 : ~8
        );
    },
    dma = read => {
        da |= regs[AC] & 0o7777; regs[AC] &= 0o10000;
        const sif = regs[IF],                            // save IF register
              nif = (sta & 0o70) >> 3;                   // set extension
        let wc, wa;
        do {
            regs[IF] = 0;                                // WC and WA in core 0
            mem.wr(0o7750, mem.rd(0o7750) + 1 & 0o7777); // incr word count
            wc = mem.rd(0o7750);                         // word count
            mem.wr(0o7751, mem.rd(0o7751) + 1 & 0o7777); // incr mem addr
            wa = mem.rd(0o7751);                         // word address
            regs[IF] = nif;                              // set core
            if (read) mem.wr(wa, DSK[da]);
            else DSK[da] = mem.rd(wa);
            da = da + 1 & 0o3777777;                     // incr disk addr
        } while (wc !== 0);
        regs[IF] = sif;                                  // restore IF register
        done = 1; intr();
    },
    res = {
        status, reset, process,
        'setDsk': img => {                       // set drive image
            if (img === null) DSK.fill(0);
            else DSK.set(new Uint16Array(img.buffer), 0);
            reset();
        },
        'getDsk': () => DSK                      // get drive image
    };
    reset();
    cpu.devices.set(0o60, res); cpu.devices.set(0o61, res);
    cpu.devices.set(0o62, res); cpu.devices.set(0o64, res);
    cpu.asm.set(0o6601, 'DCMA'); cpu.asm.set(0o6603, 'DMAR'); cpu.asm.set(0o6605, 'DMAW');
    cpu.asm.set(0o6611, 'DCIM'); cpu.asm.set(0o6612, 'DSAC'); cpu.asm.set(0o6615, 'DIML');
    cpu.asm.set(0o6616, 'DIMA'); cpu.asm.set(0o6621, 'DFSE'); cpu.asm.set(0o6622, 'DFSC');
    cpu.asm.set(0o6623, 'DISK'); cpu.asm.set(0o6626, 'DMAC'); cpu.asm.set(0o6641, 'DCXA');
    cpu.asm.set(0o6643, 'DXAL'); cpu.asm.set(0o6645, 'DXAC'); cpu.asm.set(0o6646, 'DMMT');
    return res;
}

class PDP8EEmu extends Emulator12 {    // emulator
    constructor(cpu, mem) {
        super(cpu, mem);
    }
    loadTape(data) {                   // load binary tape (.bin or .bpt file)
        const mem = this.memo, length = data.length;
        let i = 0, addr = 0;
        while (i < length) {
            const column = data[i++];
            switch (column & 0o300) {
                case 0o000: // data
                    if (addr < 0o10000) // check for address overflow
                        mem.wr(addr++ & 0o7777, column << 6 & 0o7700 | data[i++] & 0o77);
                    break;
                case 0o100: // origin
                    addr = column << 6 & 0o7700 | data[i++] & 0o77;
                    break;
                case 0o300: // field
                    const field = column >> 3 & 0o7;
                    if (mem.setField) mem.setField(field);
                    else console.warn(`field ${field} setting at column: ${i}`);
                    break;
            }
        }
        return length;
    }
    saveCore() {                       // generate octal core dump
        const mem = this.memo, regs = mem.CPU.cpu.regs, MAXMEM = 32768, sif = regs[IF],
        rm = a => { regs[IF] = a >> 12; return mem.rd(a & 0o7777); };
        let str = '', ma = 0;
        do {
            str += `${fmt(ma, 5)}:`;
            for (let i = 0; i < 8; i++) str += ` ${fmt(rm(ma + i), 4)}`;
            str += '\n';
            do {
                ma += 8;
                if (ma >= MAXMEM - 8) break;
            } while (
                rm(ma)     === rm(ma - 8) && rm(ma + 1) === rm(ma - 7) &&
                rm(ma + 2) === rm(ma - 6) && rm(ma + 3) === rm(ma - 5) &&
                rm(ma + 4) === rm(ma - 4) && rm(ma + 5) === rm(ma - 3) &&
                rm(ma + 6) === rm(ma - 2) && rm(ma + 7) === rm(ma - 1)
            );
        } while (ma < MAXMEM);
        regs[IF] = sif;
        return str;
    }
    loadCore(str) {                    // load octal core dump
        const mem = this.memo, regs = mem.CPU.cpu.regs, MAXMEM = 32768, sif = regs[IF],
              data = str.split('\n'),
        wm = (a, v) => { regs[IF] = a >> 12; mem.wr(a & 0o7777, v); };
        mem.clear();
        let count = 0, ma;
        for (let i = 0, n = data.length; i < n; i++) {
            const s = data[i];
            if (s.length === 0) continue;
            count++;
            const d = s.split(' ');
            if (d.length !== 9 || !d[0].endsWith(':')) throw new Error(`invalid core format: ${s}`);
            ma = pi(d[0].substring(0, d[0].length - 1));
            for (let j = 1; j < 9; j++) wm(ma++, pi(d[j]));
        }
        regs[IF] = sif;
        return count * 8;
    }
    loadPAL(str) {                     // load PAL listing
        const mem = this.memo, regs = mem.CPU.cpu.regs, MAXMEM = 32768, sif = regs[IF],
              data = str.split('\n'),
        wm = (a, v) => { regs[IF] = a >> 12; mem.wr(a & 0o7777, v); };
        let count = 0, ma, vv;
        for (let i = 0, n = data.length; i < n; i++) {
            const s = data[i];
            if (s.length < 11) continue;
            try {
                ma = pi(s.substring(0, 5));
                vv = pi(s.substring(7, 11));
            } catch {
                continue;
            }
            wm(ma, vv);
            count++;
        }
        regs[IF] = sif;
        return count;
    }
}

class PDP8EMon extends Monitor12 {     // system monitor
    constructor(emu) {
        super(emu);
    }
    async sendstr(str, nlms = 100, ms = 50) {
        let i = 0;
        while (i < str.length) {
            let ctrl = false, chr = str.charAt(i++);
            if (chr === '`') { ctrl = true; chr = str.charAt(i++); }
            let cod = chr.charCodeAt(0);
            if (ctrl) { if (cod >= 0x60) cod -= 0x60; if (cod >= 0x40) cod -= 0x40; }
            this.kbd.processKey(cod);
            await delay(chr === '\r' ? nlms : ms);
        }
    }
    async handler(parms, cmd) {
        let tmp;
        try { switch (cmd) {
            case 'tape': // load binary tape
                if (parms.length < 2) { console.error('missing fname'); break; }
                console.log(this.emu.loadTape(await loadFile(parms[1], false)));
                break;
            case 'tse':  // set TSE (time sharing enabled) flag
                if (parms.length < 2) { console.error('missing flag [1|0]'); break; }
                tmp = pi(parms[1], false) ? 1 : 0;
                if (this.emu.memo.setTSE) this.emu.memo.setTSE(tmp);
                else tmp = 0;
                console.log(tmp);
                break;
            case 'core': // octal core dump save/load
                if (parms.length < 2) {
                    tmp = this.emu.saveCore();
                    downloadFile('core.txt', new Uint8Array(
                        tmp.split('').map(c => c.charCodeAt(0))
                    ));
                } else {
                    tmp = await loadFile(parms[1], true);
                    console.log(this.emu.loadCore(tmp));
                }
                break;
            case 'pal':  // load PAL listing
                if (parms.length < 2) { console.error('missing fname'); break; }
                tmp = await loadFile(parms[1], true);
                console.log(this.emu.loadPAL(tmp));
                break;
            case 'type': // automated keyboard input
                switch (parms[1]) {
                    case 'start': await this.sendstr('S\r12-06-84\r16:52\r\r'); break;
                    case 'login': await this.sendstr('LOGIN 2 LXHE\r'); break;
                    default:
                        const txt = await loadFile(parms[1], true);
                        await this.sendstr(txt.replaceAll('\n', ''));
                        break;
                }
                break;
            case 'ptp':  // low speed PTP
                if (parms.length < 2) {
                    console.log(this.kbd.ptr_ptp[1]);
                    if (this.kbd.ptr_ptp[1] !== null) this.kbd.ptr_ptp[1] = '';
                    break;
                }
                const ptpprm = parms[1];
                if (ptpprm !== 'on' && ptpprm !== 'off') {
                    console.error('invalid parameter [on|off]'); break;
                }
                this.kbd.ptr_ptp[1] = (ptpprm === 'on') ? '' : null;
                console.log(ptpprm);
                break;
            case 'ptr':  // low speed PTR
                if (parms.length < 2) { console.error('missing fname'); break; }
                await this.sendstr(await loadFile(parms[1], true), 50);
                break;
            case 'rf08': // download RF08 disk data
                const rf08 = this.fds.getDsk();
                downloadFile('rf08.img', new Uint8Array(rf08.buffer));
                break;
            case 'rx01': // download RX01 disk data
                if (parms.length < 2) { console.error('missing drv'); break; }
                const num = pi(parms[1]);
                if (num < 0 || num > 1) { console.error(`invalid drv: ${num}`); break; }
                const rx01 = this.dsk.getDsk(num);
                if (rx01 === undefined) console.log('empty drive');
                else downloadFile('rx01.img', rx01);
                break;
            default: await super.handler(parms, cmd); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    await loadScript('../emu/github/emu8/js/disks.js');
    const con = await createCon(amber, 'VT220'), // actual console
          mem = KM8_E(7),                        // 8K extended memory
          cpu = new GenCpu12(mem),               // CPU (uses Cpu(memo) class)
          emu = new PDP8EEmu(cpu, mem),
          mon = new PDP8EMon(emu),
          kbd = new ASR33(con, mon),             // PDP8E system console
          dsk = RX01(cpu);                       // RX8E/RX01 disk
    mon.kbd = kbd;                               // access to ASR33
    mon.dsk = dsk;                               // access to RX01
//    await mon.exec('tape MAINDEC-8E-D0AB-pb.bpt'); await mon.exec('x pc 200 sr 7777');      // #1
//    await mon.exec('tape MAINDEC-8E-D0BB-pb.bpt'); await mon.exec('x pc 200');              // #2
//    await mon.exec('tape MAINDEC-8E-D0GC-pb.bpt'); await mon.exec('x pc 200 if 0');         // DCA
/*    await mon.exec('tape MAINDEC-8E-D0FC-pb.bpt'); await mon.exec('x pc 200 if 0');         // ISZ
    await mon.exec('m 1 5001 2 3 0 0 202 547 7 0 0 7401 3607 3 2421 5116 5141 0 0');        // ISZ
    await mon.exec('m 23 0 0 4 400 200 100 0 257 201 206 413 1014 600 4441 614 15 ' +       // ISZ
                   '7640 5426 1036 3165 7604 30');                                          // ISZ
    await mon.exec('m 51 7440 5055 4164 3022 7604 27 7640 5065 4164 3021 1021 4151 ' +      // ISZ
                   '7604 26 7640 5075 4164 3002');                                          // ISZ
    await mon.exec('m 73 1002 4151 7240 1002 3011 1016 3411 1017 3411 1020 3411 1022 ' +    // ISZ
                   '3421 1022 3023 1023 7001');                                             // ISZ
    await mon.exec('m 114 3024 5407 7604 7004 7710 5132 1421 7041 1024 7640 5433 1421 ' +   // ISZ
                   '7650 5433 7604 25 7650');                                               // ISZ
    await mon.exec('m 135 5047 7001 1023 5111 7604 7004 7710 5047 1421 7640 5434 5047 ' +   // ISZ
                   '0 7510 5160 1003 7700');                                                // ISZ
    await mon.exec('m 156 5551 5165 1006 7700 5165 5551 0 1014 7104 7430 1015 3014 ' +      // ISZ
                   '1014 5564 1000 0');                                                     // ISZ
    await mon.exec('m 200 5040 1340 3332 7040 3031 5210 1331 3332 1002 3011 1370 4342 ' +   // ISZ
                   '1021 3011 1371 4342 1022');                                             // ISZ
    await mon.exec('m 221 3011 1372 4342 1023 3011 1373 4342 1421 3011 1374 4342 6002 ' +   // ISZ
                   '1032 3011 1411 6046 6041');                                             // ISZ
    await mon.exec('m 242 5241 1013 7640 5237 6042 6001 7604 7700 7402 1031 7650 5047 ' +   // ISZ
                   '3031 5132 306 240 0 0 0 0');                                            // ISZ
    await mon.exec('m 266 240 240 324 240 0 0 0 0 215 212 215 215 317 240 0 0 0 0');        // ISZ*/
/*    await mon.exec('tape MAINDEC-8E-D0CC-pb.bpt'); await mon.exec('x pc 200 if 0 sr 0400'); // TAD
    await mon.exec('m 1 5001 2 3');                                                         // TAD
    await mon.exec('m 21 22 7777');                                                         // TAD
    await mon.exec('m 41 37');                                                              // TAD
    await mon.exec('m 46 1600 1652 1133 1200 756 1157 1140 1657 1000 1031 0504 523 3000 ' + // TAD
                   '3730 3017 3037 3027 3046');                                             // TAD
    await mon.exec('m 70 7775 7776 7777 3512 410 552 240 260 261 6000 102 4000 2000 ' +     // TAD
                   '1000 400 200 100 40 20 10 4 2');                                        // TAD
    await mon.exec('m 116 1 0 4000 1 2004 2043 2076 2200 2232 2270 2400 2436 2472 2600 ' +  // TAD
                   '2634 2667 1376 7001 5404');                                             // TAD
    await mon.exec('m 141 5402 7070 2376 2000 2410 4000 4776 4410 5403 5401 4377 2004 ' +   // TAD
                   '5301 6007 7604 0106 7650');                                             // TAD
    await mon.exec('m 162 5177 7240 170 3024 5567 202 7777 0 7 70 0 0 0 7410 5156 3024 ' +  // TAD
                   '3023 3035 7340 23 7421');                                               // TAD
    await mon.exec('m 207 7040 24 7501');                                                   // TAD
    await mon.exec('m 364 7000'); // patch (ignore carry flag for addition simulator)       // TAD*/
//    await mon.exec('tape MAINDEC-8E-D1FB-pb.bpt'); await mon.exec('x pc 200 sr 0002');      // ExMem
//    await mon.exec('tape MAINDEC-8E-D0DB-pb.bpt'); await mon.exec('x pc 200 if 0');         // AND
//    await mon.exec('tape MAINDEC-8E-D0EB-pb.bpt'); await mon.exec('x pc 200 if 0');         // TAD
//    await mon.exec('tape MAINDEC-08-D1EB-pb.bpt'); await mon.exec('x pc 200');              // ExMem
/*    await mon.exec('tse 1');                                                                // TSE
    await mon.exec('tape MAINDEC-08-DHMCA-A-pb.bpt'); await mon.exec('x pc 200 sr 0001');   // TSE*/
/*    await mon.exec('tse 0');                                                                // TSE
    await mon.exec('tape MAINDEC-08-DHMCA-A-pb.bpt'); await mon.exec('x pc 200 sr 4001');   // TSE*/
//    await mon.exec('tape MAINDEC-8E-D0JC-pb.bpt'); await mon.exec('x pc 200 if 0');         // JMx
//    await mon.exec('tape FOCAL-69.bpt'); await mon.exec('x pc 200');
/*    await mon.exec('tape MAINDEC-08-DIRXA-D-pb.bpt'); await mon.exec('x pc 200');           // RX8E
    dsk.setDsk(0, []); dsk.setDsk(1, []);*/
/*    await mon.exec('m 200 1607 6046 6041 5202 2207 5200 7402 7600');   // print ASCII example
    await mon.exec('m 7600 240 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1');
    await mon.exec('m 7640   1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1');*/
/*    await mon.exec('m 0 201 2022 7410 7402 3017 7004 3020 1422 6046'); // print ASCII interrupt
    await mon.exec('m 11 7300 1020 7010 1017 6001 5400 1 0 0 7577');
    await mon.exec('m 200 5010 7004 2021 5202 5201');
    await mon.exec('m 7600 240 241 242 243 244 245 246 247 250 251 252 253 254 255 256 257');
    await mon.exec('m 7620 260 261 262 263 264 265 266 267 270 271 272 273 274 275 276 277');
    await mon.exec('m 7640 300 301 302 303 304 305 306 307 310 311 312 313 314 315 316 317');
    await mon.exec('m 7660 320 321 322 323 324 325 326 327 330 331 332 333 334 335 336 337');*/
/*    dsk.setDsk(0, (await loadFile('pdp8/os8sys', false)).slice(256));
    await mon.exec('m 20 0000 0000 0000 0000 7126 1060 6751 7201');
    await mon.exec('m 30 4053 4053 7104 6755 5054 6754 7450 7610');
    await mon.exec('m 40 5046 1060 7041 1061 3060 5024 6751 4053');
    await mon.exec('m 50 3002 2050 5047 0000 6753 5033 6752 5453');
    await mon.exec('m 60 7024 6030 0000 0000 0000 0000 0000 0000');
    await mon.exec('x pc 33');*/
/*    dsk.setDsk(0, await loadFile('pdp8/os8_rx.rx01', false));
    await mon.exec('r pdp8/os8boot3.oct 1');
    await mon.exec('x pc 22');*/
    const cons = addKey('&#x21c4'),                    // console switch button
          cnv2 = document.createElement('canvas');     // second console
    cnv2.style.display = 'none';                       // initially hidden
    con.canvas.canvas.parentNode.insertBefore(cnv2, con.canvas.canvas);
    const con2 = await createCon(green, 'VT220', undefined, undefined, cnv2),
          kbd2 = ASR33.init(con2, mon, 0o40, 0o41, 1); // 1st terminal on PT08
    cons.onclick = e => {                              // console switch button
        if (cnv2.style.display === 'none') {
            con.canvas.canvas.style.display = 'none';
            cnv2.style.display = 'block';
        } else {
            cnv2.style.display = 'none';
            con.canvas.canvas.style.display = 'block';
        }
    };
    kbd.processKey = function(val) {                   // process 2 terminals
        if (cnv2.style.display === 'none') {
            this.con.kbd.push(val);
            this.devkbd.setFlag(1);
        } else {
            con2.kbd.push(val);
            kbd2.devkbd.setFlag(1);
        }
    };
/*    await mon.exec('tape pdp8/edu20c.pt');                                                  // Edu20
    await mon.exec('x if 0 df 1 pc 7645');*/
    const clc = DK8EA(cpu),                      // system clock
          fds = RF08(mem);                       // RF08 disk
    mon.fds = fds;                               // access to RF08
//    await mon.exec('tape MAINDEC-8E-D8AC-pb.bpt'); await mon.exec('x pc 200');              // DK8EA
//    await mon.exec('tape pdp8/maindec-x8-dirfa-a-pb'); ???                                  // RF08
//    await mon.exec('tape pdp8/maindec-08-d5fa-pb'); await mon.exec('x pc 150');             // RF08
    await mon.exec('tse 1'); // set 32K!                                                    // TSS8
    await mon.exec('tape pdp8/tss8_init.bin');
    fds.setDsk(await loadFile('pdp8/tss8_rf.dsk', false));
    await mon.exec('x if 2 ib 2 pc 4200');
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
