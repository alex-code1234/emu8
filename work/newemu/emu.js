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
                case '<': if (svalue >= value) return false; break;
                case '>': if (svalue <= value) return false; break;
                case '==': if (svalue !== value) return false; break;
                case '!=': if (svalue === value) return false; break;
                case '<=': if (svalue > value) return false; break;
                case '>=': if (svalue < value) return false; break;
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
    async sendstr(str, nlms = 100, ms = 50, brk = false) {
        let i = 0, count = 0;
        while (i < str.length) {
            let ctrl = false, chr = str.charAt(i++);
            if (chr === '`') { ctrl = true; chr = str.charAt(i++); }
            let cod = chr.charCodeAt(0);
            if (ctrl) { if (cod >= 0x60) cod -= 0x60; if (cod >= 0x40) cod -= 0x40; }
            this.kbd.processKey(cod);
            await delay(chr === '\r' ? nlms : ms);
            count++;
            if (brk && chr === '\r' && count > 5000) {
                await this.sendstr('`LP\rK\rA\r', nlms + 1100, nlms + 500);
                count = 0;
            }
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
                    case 'start': await this.sendstr('S\r12-06-84\r16:52\r\r'); break;  // TSS8
//                    case 'login': await this.sendstr('LOGIN 1 VH3M\r', 300, 80); break; // TSS8
                    case 'login': await this.sendstr('LOGIN 2 LXHE\r', 300, 80); break; // TSS8
                    default:
                        const txt = await loadFile(parms[1], true);
                        await this.sendstr(txt.replaceAll('\n', ''));
                        break;
                }
                break;
            case 'tss8copy': // TSS8 copy external file to disk
            case 'os8copy':  // OS8 copy external file to disk
                if (parms.length < 2) { console.error('missing fname'); break; }
                const path = parms[1],
                      fnam = path.match(/([^/]+?)(\.[^.]*$|$)/);
                if (fnam === null || fnam.length < 3) {
                    console.error(`invalid fname: ${path}`); break;
                }
                if (cmd === 'tss8copy') {
                    await this.sendstr('R PIP\r', 1800);
                    await this.sendstr(`\r${fnam[1]}\rT\r`, 300);
                    await this.sendstr(await loadFile(path, true), 50);
                    await this.sendstr('`C`BS\r', 50, 300);
                } else {
                    if (fnam[2] !== '') fnam[1] += fnam[2].substr(0, 3);
                    await this.sendstr(`CREATE ${fnam[1]}\rA\r`, 300);
                    await this.sendstr(await loadFile(path, true), 10, 5, true);
                    await this.sendstr('`LE\r');
                }
                break;
            case 'test': // run MAINDEC tests
                if (parms.length < 2) { console.error('missing name'); break; }
                this.emu.CPU.cpu.reset(); // clear all CPU flags
                switch (parms[1]) {
                    case 'ascii': // print ASCII example
await this.exec('m 200 1607 6046 6041 5202 2207 5200 7402 7600');
await this.exec('m 7600 240 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1');
await this.exec('m 7640   1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1');
this.exec('g 200');
                        break;
                    case 'ascii_int': // print ASCII example using interrupt
await this.exec('m 0 201 2022 7410 7402 3017 7004 3020 1422 6046');
await this.exec('m 11 7300 1020 7010 1017 6001 5400 1 0 0 7577');
await this.exec('m 200 5010 7004 2021 5202 5201');
await this.exec('m 7600 240 241 242 243 244 245 246 247 250 251 252 253 254 255 256 257');
await this.exec('m 7620 260 261 262 263 264 265 266 267 270 271 272 273 274 275 276 277');
await this.exec('m 7640 300 301 302 303 304 305 306 307 310 311 312 313 314 315 316 317');
await this.exec('m 7660 320 321 322 323 324 325 326 327 330 331 332 333 334 335 336 337');
this.exec('g 200');
                        break;
                    case 'd0ab':
await this.exec('tape ../MAINDEC-8E-D0AB-pb.bpt'); await this.exec('x pc 200 sr 7777'); this.exec('g');
                        break;
                    case 'd0bb':
await this.exec('tape ../MAINDEC-8E-D0BB-pb.bpt'); await this.exec('x pc 200'); this.exec('g');
                        break;
                    case 'd0gc':
await this.exec('tape ../MAINDEC-8E-D0GC-pb.bpt'); await this.exec('x pc 200 if 0'); this.exec('g');
                        break;
                    case 'd0fc':
await this.exec('tape ../MAINDEC-8E-D0FC-pb.bpt'); await this.exec('x pc 200 if 0');
await this.exec('m 1 5001 2 3 0 0 202 547 7 0 0 7401 3607 3 2421 5116 5141 0 0');   // broken tape
await this.exec('m 23 0 0 4 400 200 100 0 257 201 206 413 1014 600 4441 614 15 ' +  // restore
                '7640 5426 1036 3165 7604 30');                                     // from listing
await this.exec('m 51 7440 5055 4164 3022 7604 27 7640 5065 4164 3021 1021 4151 ' +
                '7604 26 7640 5075 4164 3002');
await this.exec('m 73 1002 4151 7240 1002 3011 1016 3411 1017 3411 1020 3411 1022 ' +
                '3421 1022 3023 1023 7001');
await this.exec('m 114 3024 5407 7604 7004 7710 5132 1421 7041 1024 7640 5433 1421 ' +
                '7650 5433 7604 25 7650');
await this.exec('m 135 5047 7001 1023 5111 7604 7004 7710 5047 1421 7640 5434 5047 ' +
                '0 7510 5160 1003 7700');
await this.exec('m 156 5551 5165 1006 7700 5165 5551 0 1014 7104 7430 1015 3014 ' +
                '1014 5564 1000 0');
await this.exec('m 200 5040 1340 3332 7040 3031 5210 1331 3332 1002 3011 1370 4342 ' +
                '1021 3011 1371 4342 1022');
await this.exec('m 221 3011 1372 4342 1023 3011 1373 4342 1421 3011 1374 4342 6002 ' +
                '1032 3011 1411 6046 6041');
await this.exec('m 242 5241 1013 7640 5237 6042 6001 7604 7700 7402 1031 7650 5047 ' +
                '3031 5132 306 240 0 0 0 0');
await this.exec('m 266 240 240 324 240 0 0 0 0 215 212 215 215 317 240 0 0 0 0'); this.exec('g');
                        break;
                    case 'd0cc':
await this.exec('tape ../MAINDEC-8E-D0CC-pb.bpt'); await this.exec('x pc 200 if 0 sr 0400');
await this.exec('m 1 5001 2 3');                                                    // broken tape
await this.exec('m 21 22 7777');                                                    // restore
await this.exec('m 41 37');                                                         // from listing
await this.exec('m 46 1600 1652 1133 1200 756 1157 1140 1657 1000 1031 0504 523 3000 ' +
                '3730 3017 3037 3027 3046');
await this.exec('m 70 7775 7776 7777 3512 410 552 240 260 261 6000 102 4000 2000 ' +
                '1000 400 200 100 40 20 10 4 2');
await this.exec('m 116 1 0 4000 1 2004 2043 2076 2200 2232 2270 2400 2436 2472 2600 ' +
                '2634 2667 1376 7001 5404');
await this.exec('m 141 5402 7070 2376 2000 2410 4000 4776 4410 5403 5401 4377 2004 ' +
                '5301 6007 7604 0106 7650');
await this.exec('m 162 5177 7240 170 3024 5567 202 7777 0 7 70 0 0 0 7410 5156 3024 ' +
                '3023 3035 7340 23 7421');
await this.exec('m 207 7040 24 7501');
await this.exec('m 364 7000'); // patch (ignore carry flag for MAINDEC addition simulator)
this.exec('g');
                        break;
                    case 'd1fb': // set for 8K extended memory (2 pages)
await this.exec('tape ../MAINDEC-8E-D1FB-pb.bpt'); await this.exec('x pc 200 sr 0002'); this.exec('g');
                        break;
                    case 'd1eb':
await this.exec('tape ../MAINDEC-08-D1EB-pb.bpt'); await this.exec('x pc 200'); this.exec('g');
                        break;
                    case 'd0db':
await this.exec('tape ../MAINDEC-8E-D0DB-pb.bpt'); await this.exec('x pc 200 if 0'); this.exec('g');
                        break;
                    case 'd0eb':
await this.exec('tape ../MAINDEC-8E-D0EB-pb.bpt'); await this.exec('x pc 200 if 0'); this.exec('g');
                        break;
                    case 'd0jc':
await this.exec('tape ../MAINDEC-8E-D0JC-pb.bpt'); await this.exec('x pc 200 if 0'); this.exec('g');
                        break;
                    case 'dhmca':
                        if (parms.length < 3) { console.error('missing TSE [0|1]'); break; }
await this.exec('tape ../MAINDEC-08-DHMCA-A-pb.bpt');
                        if (parms[2] | 0) {
await this.exec('tse 1'); await this.exec('x pc 200 sr 0001');
                        } else {
await this.exec('tse 0'); await this.exec('x pc 200 sr 4001');
                        } this.exec('g');
                        break;
                    default: console.error(`unknown test: ${parms[1]}`); break;
                }
                break;
            default: await super.handler(parms, cmd); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    await loadScript('pdp_8e.js');
    await loadScript('kc8_e.js');
    await loadScript('asr_33.js');
    const cores = +URL_OPTS.get('fields') ?? 0,
          mem = cores ? KM8_E(cores) : MM8_E(),  // memory
          cpu = new GenCpu12(mem),               // CPU (uses Cpu(memo) class)
          fp = await KC8_E(cpu, mem, 1),         // front panel
          kbd = await ASR_33(cpu, mem, 2),       // system console
          emu = new PDP8EEmu(cpu, mem),
          mon = new PDP8EMon(emu);
    console.info(`KK8-E processor with MM8-E[${cores + 1}] memory${cores ? ' and KM8-E extension' : ''}`);
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
