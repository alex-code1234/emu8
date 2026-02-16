'use strict';

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
    reset = (full = true) => {
        let p, s;
        if (!full) { p = regs[PC]; s = regs[SR]; }
        regs.fill(0);
        if (!full) { regs[PC] = p; regs[SR] = s; }
    },
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
    return {rd, wr, setTSE, setField, CPU, setCpu, clear, RAM};
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
