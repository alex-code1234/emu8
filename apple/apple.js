'use strict';

async function apple(scr) {               // default version
    return await aII(scr);
}

class Macros {
    constructor() {
        this.macros = {};
        this.flag = null;
    }
    process(line, asm, idx) {
        const items = line.trim().split(/[ ,\t]+/), item = items[0];
        if (item === 'MACRO') return this.processDefs(items.slice(1));
        const def = this.macros[item];
        if (def) return this.processParms(item, def, items.slice(1), asm, idx);
        return line;
    }
    processDefs(items) {
        this.macros[items[0]] = items.slice(1);
        return null;
    }
    processParms(name, def, parms, asm, idx) {
        if (def[0] === 'flag') return this.processFlag(name, parms);
        let res = '       .B  ';
        if (def.length === 1) res += this.fmtCode(def[0]);
        else {
            const prm = parms[0], sym = prm.charAt(0);
            try {
                if (sym === '$') res += this.fmtCode(def[0]);
                else if (sym === 'r') res += this.fmtCode(def[1]);
                else throw '';
            } catch(e) {
                if (e === '') throw new Error(`${name}: invalid parameter ${prm}`);
                throw new Error(`${name}: invalid code (${e.message})`);
            }
        }
        if (this.flag !== null) {
            asm.splice(++idx, 0, `       .B  $${this.flag.toString(16).padStart(2, '0')}`);
            this.flag = null;
        }
        for (let i = 0, n = parms.length; i < n; i++) {
            const prm = parms[i], sym = prm.charAt(0);
            try { switch (sym) {
                case '$': asm.splice(++idx, 0,
                    `       .W  $${pi(prm.substr(1)).toString(16).padStart(4, '0')}`); break;
                case 'r': asm.splice(++idx, 0,
                    `       .B  $${(pi(prm.substr(1), false) << 1).toString(16).padStart(2, '0')}`); break;
                case '+': asm.splice(++idx, 0,
                    `       .B  $${pi(prm.substr(1), false).toString(16).padStart(2, '0')}`); break;
                case '-': asm.splice(++idx, 0,
                    `       .B  $${(-pi(prm.substr(1), false) & 0xff).toString(16).padStart(2, '0')}`); break;
                case '"': asm.splice(++idx, 0,
                    `       .S  '${prm.substr(1, prm.length - 2)}'`);
                    asm.splice(++idx, 0, `       .B  $00`); break;
                default: asm.splice(++idx, 0,
                    `       .B  $${(-(pi(prm, false) << 1) & 0xff).toString(16).padStart(2, '0')}`); break;
            }} catch {
                throw new Error(`${name}: invalid parameter ${prm}`);
            }
        }
        return res;
    }
    processFlag(name, parms) {
        const prm = parms[0];
        try {
            if (!prm.startsWith('r')) throw '';
            this.flag = pi(prm.substr(1), false) << 1;
        } catch {
            throw new Error(`${name}: invalid parameter ${prm}`);
        }
        return null;
    }
    fmtCode(code) {
        code = pi(code, false);
        if (this.flag !== null) code |= 0x80;
        return '$' + code.toString(16).padStart(2, '0');
    }
}

// in monitor:
//     F000R - Krusader
//     9000R - A1 assembler
//     E000R - BASIC cold start
//     E2B3R - BASIC warm start
// in BASIC:
//     ^n : g ff00 - exit to Woz monitor
// A1A90.BIN - https://www.sbprojects.net/projects/apple1/a1asm.php
// apple1.rom - WozMon + Basic + Krusader 1.3 - https://github.com/st3fan/krusader
async function aI(scr) {                  // apple I
    const mod = await defaultHW(scr, new URLSearchParams('?cpu_type=2&mem_name=aImemo')),
          memo = mod.memo, cmd = mod.cmd, con = memo.con;
    mod.info = 'Apple I, 64K memory';     // update info
    mod.cmd = async (command, parms) => { // intercept command processor
        let tmp, idx, len, tmp2;
        switch (command) {
            case 'on':                    // ON button
                loadBin(await loadFile('apple/apple1.rom', false), 0xe000);
                loadBin(await loadFile('apple/A1A90.BIN', false), 0x9000);
                hardware.toggleDisplay(); con.print('^[32m');
                CPU.reset(); CPU.setPC(0xff00); run();
                break;
            case 'clear':                 // CLEAR button
            case 'reset':                 // RESET button
                con.print('^[2J');
                if (command === 'reset') { memo.init = true; CPU.setPC(0xff00); }
                run();
                break;
            case 'asm':                   // Krusader 1.3 assembler
                if (parms.length < 2) { console.error('missing: fn'); break; }
                let asm = await loadFile(parms[1], true),
                    kbbf = 'F000R\rN\r';  // start editor (from monitor)
                asm = asm.split(/[\r\n]+/);
                idx = 0; tmp2 = true;     // convert to Krusader asm
                const macros = new Macros();
                while (idx < asm.length) {
                    tmp = asm[idx];       // remove [; comment...] and empty lines
                    if ((len = tmp.indexOf(';')) >= 0) tmp = tmp.substr(0, len).trimEnd();
                    if (tmp.trim() === '') { asm.splice(idx, 1); continue; }
                    const items = tmp.replace(/\s+\:\s+/g, '\n ').split(/[\r\n]+/);
                    if (items.length > 1) { tmp = items[0]; asm.splice(idx + 1, 0, ...items.slice(1)); }
                    tmp = macros.process(tmp, asm, idx);
                    if (tmp === null) { asm.splice(idx, 1); continue; }
                    tmp = tmp.toUpperCase().split(/[ \t]+/);
                    if (tmp.length > 3) { console.error(`syntax: ${asm[idx]}`); tmp2 = false; break; }
                    asm[idx++] = tmp.join(' ');
                }
                if (tmp2) {
                    kbbf += asm.join('\r') + '\r';
                    kbbf += '\x1BA\r$\r'; // stop editor, assemble and exit to monitor
                    con.kbd.push(...[...kbbf].map(c => c.charCodeAt(0))); run();
                }
                break;
            default: return cmd(command, parms);
        }
        return true;
    };
    con.setColors([0, '#282828', 2, '#00cc66']);
    con.setWidth(40);                     // apple I screen width
    return mod;
}

async function aImemo(con) {              // apple I system IO
    const ram = new Uint8Array(0x10000), result = {};
    result.init = true;                   // console in init mode, no output
    result.con = con;                     // save console ref
    result.rd = a => {
        if (a === 0xd011) return (con.kbd.length > 0) ? 0x80 : 0x00;
        if (a === 0xd010) return con.kbd.shift();
        return ram[a];
    };
    result.wr = (a, v) => {
        if (a === 0xd012) {
            if (result.init) {            // console init byte, skip
                result.init = false; return;
            }
            v &= 0x7f; con.display(v);
            if (v === 0x0d)               // auto LF after CR
                con.display(0x0a);
        };
        ram[a] = v;
    };
    result.key = v => {                   // set keyboard preview to convert to uppercase
        if (v >= 0x61 && v <= 0x7a) v -= 0x20; return v | 0x80;
    };
    return result;
}

// in monitor:
//     C08B, E000G - switch to loaded BASIC
//     C089, E000G - switch to ROM BASIC
//     ^B : enter  - BASIC cold start
//     ^C : enter  - BASIC warm start
// in BASIC:
//     PR#6     - activate diskII for AppleII (20 rom), auto activated for AppleII+ (2e rom)
//     CALL-151 - exit to monitor
// AppleII  is AppleII with language card +16K
// AppleII+ is AppleIIe with 80 columns +64K card (80 colums not supported)
async function aII(scr) {                 // apple II
    const mod = await defaultHW(scr, new URLSearchParams('?cpu_type=2&mem_name=aIImemo')),
          memo = mod.memo, cmd = mod.cmd, con = memo.con;
    mod.info = 'Apple II, 64K memory';    // update info
    mod.cmd = async (command, parms) => { // intercept command processor
        let tmp;
        switch (command) {
            case 'on':                    // ON button
                if (parms.length < 2) {
                    loadBin(await loadFile('apple/apple20.rom', false), 0xd000); memo.cursor = 96;
                } else if ((tmp = parms[1]) === 'e') {
                    loadBin(await loadFile('apple/apple2e.rom', false), 0xc000); memo.cursor = 127;
                } else {
                    console.error(`invalid model: ${tmp}`); break;
                }
                memo.diskII = await AppleDisk();                                   // disk II
                loadBin(await loadFile('apple/disk2_16.bin', false), 0xc600);      // disk II interface
                memo.SLOTS[6] = memo.diskII.slot;                                  // in 6th slot
                await memo.diskII.load(0, 'apple/dos3_3.dsk');
//ucsd/vi/disks/AP4001E.do - UCSD IV
//ucsd/pascal1.dsk         - UCSD II
//loadBin([0x8d, 0xf4, 0xfd, 0x60], 0xfdf0); // monitor patch
                hardware.toggleDisplay();
                CPU.reset(); run();
                break;
            default: return cmd(command, parms);
        }
        return true;
    };
    con.print('^[?25l');                  // hide cursor
    con.setWidth(40);                     // apple II screen width
    return mod;
}

async function aIImemo(con) {             // apple II system IO
    await loadScript('js/disks.js');      // use disks
    const ram = new Uint8Array(0x10000), result = {},
          ram1 = new Uint8Array(0x1000), ram2 = new Uint8Array(0x1000), ram3 = new Uint8Array(0x2000),
          SLOTS = [undefined, null, null, null, null, null, null, null];
    let key_pressed = false, keycode = 0x00,
        BSRBANK2 = 0x00, BSRREADRAM = 0x00, BSRWRITERAM = 0x00,
        INTCXROM = 0x80, SLOTC3ROM = 0x00, ROMRead = null;
    result.SLOTS = SLOTS;
    result.rd = a => {
        if (a >= 0xc000 && a <= 0xc0ff) switch (a) {
            case 0xc000: return keycode;
            case 0xc010: keycode &= 0x7f; return key_pressed ? 0x80 : 0x00;
            case 0xc011: return BSRBANK2;
            case 0xc012: return BSRREADRAM;
            case 0xc015: return INTCXROM;
            case 0xc017: return SLOTC3ROM;
            case 0xc080:
            case 0xc084: BSRBANK2 = 0x80; BSRREADRAM = 0x80; BSRWRITERAM = 0x00; return 0x00;
            case 0xc081:
            case 0xc085: BSRBANK2 = 0x80; BSRREADRAM = 0x00; if (BSRWRITERAM < 0x80) BSRWRITERAM += 0x40; return 0x00;
            case 0xc082:
            case 0xc086: BSRBANK2 = 0x80; BSRREADRAM = 0x00; BSRWRITERAM = 0x00; return 0x00;
            case 0xc083:
            case 0xc087: BSRBANK2 = 0x80; BSRREADRAM = 0x80; if (BSRWRITERAM < 0x80) BSRWRITERAM += 0x40; return 0x00;
            case 0xc088:
            case 0xc08c: BSRBANK2 = 0x00; BSRREADRAM = 0x80; BSRWRITERAM = 0x00; return 0x00;
            case 0xc089:
            case 0xc08d: BSRBANK2 = 0x00; BSRREADRAM = 0x00; if (BSRWRITERAM < 0x80) BSRWRITERAM += 0x40; return 0x00;
            case 0xc08a:
            case 0xc08e: BSRBANK2 = 0x00; BSRREADRAM = 0x00; BSRWRITERAM = 0x00; return 0x00;
            case 0xc08b:
            case 0xc08f: BSRBANK2 = 0x00; BSRREADRAM = 0x80; if (BSRWRITERAM < 0x80) BSRWRITERAM += 0x40; return 0x00;
            default:
                const b = a - 0xc080, i = b / 0x10 | 0, n = b % 0x10, s = SLOTS[i];
                return s ? s.ramRead(n) : ram[a];
        }
        if (a >= 0xc100) {
            if (a <= 0xcfff) {
                if (INTCXROM >= 0x80) return ram[a];
                if (a === 0xcfff) { const b = ROMRead(a); ROMRead = null; return b; }
                if (a >= 0xc800) return ROMRead(a);
                const i = (a >>> 8) - 0xc1;
                if (i === 3 && SLOTC3ROM === 0x00) return ram[a];
                const s = SLOTS[i];
                if (ROMRead === null) ROMRead = s.romRead;
                return s.slotRead(a);
            }
            if (BSRREADRAM >= 0x80) {
                if (a >= 0xe000) return ram3[a - 0xe000];
                if (a >= 0xd000) return (BSRBANK2 === 0x00) ? ram1[a - 0xd000] : ram2[a - 0xd000];
            }
        }
        return ram[a];
    };
    result.wr = (a, v) => {
        if (a >= 0xc000 && a <= 0xc0ff) switch (a) {
            case 0xc006: INTCXROM = 0x00; ROMRead = adr => ram[adr]; return;
            case 0xc007: INTCXROM = 0x80; ROMRead = null; return;
            case 0xc00a: if (INTCXROM === 0x00) SLOTC3ROM = 0x00; return;
            case 0xc00b: if (INTCXROM === 0x00) SLOTC3ROM = 0x80; return;
            case 0xc010: keycode &= 0x7f; return;
            default:
                if (a >= 0xc090) {
                    const b = a - 0xc080, i = b / 0x10 | 0, n = b % 0x10, s = SLOTS[i];
                    if (s) { s.ramWrite(n, v); return; }
                }
                ram[a] = v; return;
        }
        if (a === 0xcfff) { ROMRead = null; return; }
        if (a >= 0xd000 && BSRWRITERAM >= 0x80) {
            if (a >= 0xe000) ram3[a - 0xe000] = v;
            else if (BSRBANK2 === 0x00) ram1[a - 0xd000] = v; else ram2[a - 0xd000] = v;
            return;
        }
/*
        // patched monitor
        if (a === 0xfdf4) {
            v &= 0x7f; con.display(v);
            if (v === 0x0d) con.display(0x0a);
            return;
        }
*/
        // video page 1
        if (a >= 0x400 && a < 0x800 && v !== 0) {
            const col = (a & 0x7f) % 40,
                  row = a - col >> 2 & 0x18 | a >> 7 & 0x07;
            if (col < 40 && row < 24) {
                con.xy(col, row);
                let vv = v & 0x7f;
                if (vv === result.cursor) // cursor character
                    vv = 178;
                con.display(vv);
                if (vv === 0x0d)          // auto LF
                    con.display(0x0a);
            }
        }

        ram[a] = v;
    };
    result.con = con;                     // save console ref
    result.key = v => {                   // set keyboard preview to convert to uppercase
        key_pressed = v === null; if (key_pressed) return;
        if (v >= 0x61 && v <= 0x7a) v -= 0x20; keycode = v | 0x80;
        return null;                      // escape keyboard buffer
    };
    return result;
}
