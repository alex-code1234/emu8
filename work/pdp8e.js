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
        if (memo.setCpu) memo.setCpu(this); // set CPU reference
    }
    chkRegs() {                        // override breakpoints [memo, address, cond, value]
        if (this.STOP_REGS.length === 0) return true;
        for (let i = 0, n = this.STOP_REGS.length; i < n; i++) {
            const [mem, adr, cond, val] = this.STOP_REGS[i], sval = mem.rd(adr);
            switch (cond) {
                case '<': if (val >= sval) return false;
                case '>': if (val <= sval) return false;
                case '==': if (val !== sval) return false;
                case '!=': if (val === sval) return false;
                case '<=': if (val > sval) return false;
                case '>=': if (val < sval) return false;
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
    printMem(a, lines = 16, mem, logger = console.log) {
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
    loadTape(data) {                   // PDP8E - load binary tape (.bin or .bpt file)
        const mem = this.memo, length = data.length;
        let i = 0, addr = 0;
        while (i < length) {
            const column = data[i++];
            switch (column & 0o300) {
                case 0o000: // data
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
}

class Monitor12 extends Monitor {      // override for 12-bit mode
    constructor(emu) {
        super(emu);
        this.parser = new RegExp('([0-7]+)([!<>=]+)([0-7]+)$', 'i'); // breakpoints
    }
    prepareStop(str) {                 // override breakpoints [memo, address, cond, value]
        if (str === null) this.emu.CPU.STOP = this.emu.disassemble1()[0] & this.emu.D_AMS;
        else {
            const idx = str.indexOf(';');
            if (idx < 0) this.emu.CPU.STOP = pi(str) & this.emu.D_AMS;
            else {
                this.emu.CPU.STOP = pi(str.substring(0, idx)) & this.emu.D_AMS;
                const conds = str.substring(idx + 1).split(',');
                let err = null;
                for (let i = 0, n = conds.length; i < n; i++) {
                    const txt = conds[i], exp = txt.match(this.parser);
                    if (exp === null || exp.length < 4) {
                        err = `invalid expression: ${txt}`; break;
                    }
                    this.emu.CPU.STOP_REGS.push([this.emu.memo, pi(exp[1]), exp[2], pi(exp[3])]);
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
    return {rd, wr, CPU, 'setCpu': v => CPU = v};
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
          devices = new Map(), asm = new Map(),
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
                    if (dev) dev.process(instr & 0o7);
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
    setInterrupt = flag => regs[IR] = flag ? 1 : 0;
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
            tmp2 = regs[II]; jms(a);
            if (tmp2) { regs[IF] = regs[IB]; regs[UF] = regs[UB]; }
        };
        jmp = cpu._jmp; cpu._jmp = a => {
            tmp2 = regs[II]; jmp(a);
            if (tmp2) { regs[IF] = regs[IB]; regs[UF] = regs[UB]; }
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
                case 0o00:
                    if (tse && op & 4) { regs[UIF] = 0; return; }
                    if (op & 1) regs[DF] = 0;
                    if (op & 2) { regs[IB] = 0; regs[II] = 1; }
                    break;
                case 0o10:
                    if (op & 4) regs[AC] |= regs[DF] << 3;
                    else {
                        if (op & 1) regs[DF] = 1;
                        if (op & 2) { regs[IB] = 1; regs[II] = 1; }
                    }
                    break;
                case 0o20:
                    if (op & 4) regs[AC] |= regs[IF] << 3;
                    else {
                        if (op & 1) regs[DF] = 2;
                        if (op & 2) { regs[IB] = 2; regs[II] = 1; }
                    }
                    break;
                case 0o30:
                    if (op & 4) regs[AC] |= regs[SF];
                    else {
                        if (op & 1) regs[DF] = 3;
                        if (op & 2) { regs[IB] = 3; regs[II] = 1; }
                    }
                    break;
                case 0o40:
                    if (op & 4) {
                        tmp2 = regs[SF];
                        regs[IB] = tmp2 >> 3 & 0o7; regs[DF] = tmp2 & 0o7; regs[II] = 1;
                        if (tse) regs[UB] = (tmp2 & 0o100) ? 1 : 0;
                    } else {
                        if (op & 1) regs[DF] = 4;
                        if (op & 2) { regs[IB] = 4; regs[II] = 1; }
                    }
                    break;
                case 0o50:
                    if (tse && op & 4) { if (regs[UIF]) regs[PC] = regs[PC] + 1 & 0o7777; return; }
                    if (op & 1) regs[DF] = 5;
                    if (op & 2) { regs[IB] = 5; regs[II] = 1; }
                    break;
                case 0o60:
                    if (tse && op & 4) { regs[UB] = 0; return; }
                    if (op & 1) regs[DF] = 6;
                    if (op & 2) { regs[IB] = 6; regs[II] = 1; }
                    break;
                case 0o70:
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
    };
    for (let i = 0; i < count; i++) RAM.push(MM8_E());
    return {rd, wr, setTSE, setField, CPU, setCpu};
}

function PDP_Device(                   // console IO device
        cpu,                           // cpu reference
        ready,                         // function(), returns device ready flag
        transfer,                      // function(AC), outputs AC or returns value if input device
        ie,                            // [ie], shared interrupt enabled flag
        clear_ac = true,               // true for input device, false for output device
        mask_ac = [0o10000, 0o7777]) { // input value mask to AND with AC [retain_bits, set_bits]
    let flag = 0, count = 0;
    const regs = cpu.regs,
    setFlag = value => { flag = value; if (ie[0]) cpu.setInterrupt(flag); },
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
            if (num & 4) {
                const ac = regs[AC],
                      result = transfer(ac);
                if (clear_ac) regs[AC] = (ac & mask_ac[0]) | (result & mask_ac[1]);
                else setFlag(1);
            }
        }
    };
    ie[0] = 1;
    return {status, reset, process, setFlag};
}

class ASR33 extends Kbd {              // system console
    constructor(con, mon) {
        super(con, mon);
        const cpu = mon.emu.CPU.cpu,
              ie = [0];                                 // shared interrupt flag
        this.devkbd = PDP_Device(cpu,
                () => con.kbd.length > 0,               // kbd ready
                () => (con.kbd.shift() & 0xff) | 0o200, // kbd get
                ie, true, [0o17400, 0o377]);
        cpu.devices.set(0o3, this.devkbd);       // set input device
        cpu.devices.set(0o4, PDP_Device(cpu,     // set output device
                () => true,                             // con ready
                ac => con.display(ac & 0x7f),           // con put
                ie, false));
        cpu.asm.set(0b110000011000, 'KCF'); cpu.asm.set(0b110000011001, 'KSF');
        cpu.asm.set(0b110000011010, 'KCC'); cpu.asm.set(0b110000011100, 'KRS');
        cpu.asm.set(0b110000011101, 'KIE'); cpu.asm.set(0b110000011110, 'KRB');
        cpu.asm.set(0b110000100000, 'SPF'); cpu.asm.set(0b110000100001, 'TSF');
        cpu.asm.set(0b110000100010, 'TCF'); cpu.asm.set(0b110000100100, 'TPC');
        cpu.asm.set(0b110000100101, 'SPI'); cpu.asm.set(0b110000100110, 'TLS');
    }
    processKey(val) {
        super.processKey(val);
        this.devkbd.setFlag(1);                  // set IRQ
    }
}

class PDP8EMon extends Monitor12 {     // system monitor
    constructor(emu) {
        super(emu);
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
            default: await super.handler(parms, cmd); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    const con = await createCon(amber, 'VT220'), // actual console
          mem = KM8_E(),                         // extended memory
          cpu = new GenCpu12(mem),               // CPU (uses Cpu(memo) class)
          emu = new Emulator12(cpu, mem),
          mon = new PDP8EMon(emu),
          kbd = new ASR33(con, mon);             // PDP8E system console
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
//    await mon.exec('tse 1');                                                                // TSE
//    await mon.exec('tape MAINDEC-08-DHMCA-A-pb.bpt'); await mon.exec('x pc 200 sr 0001');   // TSE
//    await mon.exec('tse 0');                                                                // TSE
//    await mon.exec('tape MAINDEC-08-DHMCA-A-pb.bpt'); await mon.exec('x pc 200 sr 4001');   // TSE
//    await mon.exec('tape FOCAL-69.bpt'); await mon.exec('x pc 200');
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
