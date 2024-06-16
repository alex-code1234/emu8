'use strict';

async function orion(scr) {
    const origLoadBin = loadBin; // override loadBin for banked memory
    loadBin = (data, start) => {
        const origwr = memo.wr;
        memo.wr = memo.bwr;
        try { return origLoadBin(data, start); }
        finally { memo.wr = origwr; }
    };
    return await o128(scr);
}

function loadROM(data) {
    loadBin(data, 0x10000);
}

async function loadDisk(fname, num = null) {
    const disk = await ODIDisk(fname);
    if (num !== null) {
        num = +num;
        if (num < 0 || num >= memo.disks.length) num = null;
    }
    if (num === null) memo.disks.push(disk);
    else memo.disks[num] = disk;
}

async function o128(scr) {
    const mod = await defaultHW(scr, new URLSearchParams('?cpu_type=0&mem_name=o128memo&kbd_name=o128keyboard')),
          memo = mod.memo, cmd = mod.cmd, con = memo.con;
    mod.info = `Orion-128 (8080), 256K memory, 1M ROM disk, FDC, color screen`;
    mod.cmd = async (command, parms) => {
        switch (command) {
            case 'on':
                // MON.ROM       - Monitor with R command to load from ROM disk (broken char-set and screen width)
                // BIOS.ROM      - Monitor with auto-loading from ROM disk
                // ROMDISK.ROM   - ORDOS ROM disk
                // ROMDISK.BIN   - DSDOS ROM disk 3.9
                // ROMDSK512.BIN - DSDOS ROM disk 3.9 512K
                if (parms.length < 2 || parms[1] !== 'false') {
                    loadBin(await loadFile('orion128/BIOS.ROM', false), 0xf800);
                    loadROM(await loadFile('roms/ROMDISK.ROM', false));
                    await loadDisk('roms/disk1.odi');
                }
                hardware.toggleDisplay();
                CPU.reset(); CPU.setRegisters(['x', 'pc', 'f800']); run();
                break;
            case 'escs': // override escs to control console
            case 'test': // override test to display results
                con.print('^[?25h'); // show cursor
                let origoutput = null;
                if (command === 'test') {
                    origoutput = memo.output;
                    memo.output = (p, v) => { if (p === 0x00) con.display(v & 0xff); };
                }
                try { await cmd(command, parms); }
                finally {
                    if (origoutput !== null) memo.output = origoutput;
                    con.print('^[?25l');
                }
                break;
            case 'ro':   // load ROM disk
                if (parms.length < 2) console.error('missing: fname');
                else loadROM(await loadFile(parms[1], false));
                break;
            case 'bank': // switch memory bank
                if (parms.length > 1) memo.bank(pi(parms[1]));
                console.log(memo.bank());
                break;
            case 'rd':   // insert or replace disk
                if (parms.length < 2) console.error('missing: fname [0..3]');
                else await loadDisk(parms[1], parms[2]);
                break;
            default: return cmd(command, parms);
        }
        return true;
    };
    con.print('^[?25l'); // hide cursor
    return mod;
}

async function o128memo(con) {
    const ram = new Uint8Array(0x10000),
          ram1 = new Uint8Array(0xf000),
          ram2 = new Uint8Array(0xf000),
          ram3 = new Uint8Array(0xf000),
          rom = new Uint8Array(0x100000), // ROM disk 1M
          wd1793 = WD1793(),              // WD1793
          result = {};
    let bank = 0,
        rom_addr = 0,                     // ROM access address
        rom_addr_high = 0,                // ROM access address high byte
        cmod = 0, scrAdr = 0xc000;
    result.con = con;
    result.rd = a => {
        if (a >= 0xf000) {
            if (a >= 0xf400 && a < 0xf800) switch (a) {
                case 0xf400: return con.kbd.kscn;
                case 0xf401: return con.kbd.translateKey();
                case 0xf402: return con.kbd.kmod;
                case 0xf500: return rom[rom_addr_high << 16 | rom_addr];
                case 0xf700: case 0xf701: case 0xf702: case 0xf703:
                case 0xf710: case 0xf711: case 0xf712: case 0xf713:
                    return wd1793.read(a & 0x03);
                default: return 0x00;
            }
            return ram[a];
        }
        else switch (bank) {
            case 0: return ram[a];
            case 1: return ram1[a];
            case 2: return ram2[a];
            case 3: return ram3[a];
            default: return 0x00;
        }
    };
    result.wr = (a, v) => {
        if (a >= 0xf000) {
            if (a < 0xf400) ram[a] = v;
            else if (a >= 0xf400 && a < 0xf800) switch (a) {
                case 0xf400: con.kbd.kscn = v; break;
                case 0xf501: rom_addr = v; break;
                case 0xf502: rom_addr = v << 8 | rom_addr; break;
                case 0xf700: case 0xf701: case 0xf702: case 0xf703:
                case 0xf710: case 0xf711: case 0xf712: case 0xf713:
                    wd1793.write(a & 0x03, v); break;
                case 0xf704: case 0xf714: case 0xf708:
                case 0xf720: wd1793.write(0xf720 & 0x23, v); break;
            }
            else if (a >= 0xf800 && a < 0xf900) cmod = v & 0x07;
            else if (a >= 0xf900 && a < 0xfa00) bank = v & 0x03;
            else if (a >= 0xfa00 && a < 0xfb00) switch (v & 0x03) {
                case 0: scrAdr = 0xc000; break;
                case 1: scrAdr = 0x8000; break;
                case 2: scrAdr = 0x4000; break;
                case 3: scrAdr = 0x0000; break;
            }
            else if (a >= 0xfe00 && a < 0xff00) rom_addr_high = v;
        }
        else switch (bank) {
            case 0: ram[a] = v; break;
            case 1: ram1[a] = v; break;
            case 2: ram2[a] = v; break;
            case 3: ram3[a] = v; break;
        }
    };
    result.bwr = (a, v) => { // banked write for loading
        if (a > 0xffff) rom[a - 0x10000] = v;
        else switch (bank) {
            case 0: ram[a] = v; break;
            case 1: ram1[a] = v; break;
            case 2: ram2[a] = v; break;
            case 3: ram3[a] = v; break;
        }
    };
    result.input = p => result.rd(p << 8 | p);
    result.output = (p, v) => result.wr(p << 8 | p, v);
    result.bank = num => (num === undefined) ? bank : bank = num & 0x03;
    result.disks = wd1793.disks;
    const canvas = con.canvas, scx = 1.9, scy = 1.9;
    canvas.canvas.width = 384 * scx;
    canvas.canvas.height = 256 * scy;
    let grun = true,     // graphic monitor state
        currcmod,        // current graphic mode
        data,            // active data loading func
        color,           // active color detection func
        paloffs,         // color index offset for graphic mode 4 and 5
        val, col,        // data and color values
        fg, bg,          // current foreground and background colors
        adr;             // current memory address
    const d01 = () => val = ram[adr++],
          c0167 = mask => (val & mask) ? fg : bg,
    d45 = () => { col = ram1[adr]; val = ram[adr++]; },
    c45 = mask => {
        const num = ((val & mask) ? 0x10 : 0x00) | ((col & mask) ? 0x01 : 0x00);
        return Screen_4_table[num + paloffs];
    },
    d67 = () => {
        col = ram1[adr]; val = ram[adr++];
        fg = Screen_16_table[col & 0x0f]; bg = Screen_16_table[col >> 4];
    },
    draw = pixs => {     // update graphic monitor
        let xstart = 0, x, y, pre;
        adr = scrAdr;
        if (currcmod !== cmod) {
            switch (cmod) {
                case 1:  // monochrome palette 2
                    fg = Screen_16_table[15]; bg = Screen_16_table[9];
                    data = d01; color = c0167; break;
                case 4:  // 4 colors palette 1
                    paloffs = 0; data = d45; color = c45; break;
                case 5:  // 4 colors palette 2
                    paloffs = 4; data = d45; color = c45; break;
                case 6:  // 16 colors per 8 pixels
                case 7: data = d67; color = c0167; break;
                default: // monochrome palette 1
                    fg = Screen_16_table[2]; bg = Screen_16_table[0];
                    data = d01; color = c0167; break;
            }
            currcmod = cmod;
        }
        for (let i = 0; i < 48; i++) {
            y = 0;
            for (let j = 0; j < 256; j++) {
                x = xstart; pre = 384 * y;
                data();
                for (let b = 0x80; b > 0; b >>= 1)
                    pixs[pre + x++] = color(b);
                y++;
            }
            xstart += 8;
        }
    };
    const gmon = GMonitor(canvas, 384, 256, draw),
          ctoggle = con.toggle;
    con.toggle = () => { // override to start/stop graphic monitor
        ctoggle();
        if (grun) gmon.start(); else gmon.stop();
        grun = !grun;
    };
    return result;
}

const Screen_16_table = [
    0xff000000, 0xffff0000, 0xff008000, 0xffd1ce00, 0xff0000ff, 0xff800080, 0xff2a2aa5, 0xffd3d3d3,
    0xff000000, 0xffe6d8ad, 0xff90ee90, 0xffd0e040, 0xffcbc0ff, 0xffdb7093, 0xff00ffff, 0xffffffff
],
Screen_4_table = [
    0xff000000, 0xff0000ff, 0xff008000, 0xffff0000, 0xff000000, 0xffcbc0ff, 0xff90ee90, 0xffe6d8ad
],
Keyboard_key_table = {
      5: [ 0xFE, 0xFE ], // \\   ctrl+h
      6: [ 0xFE, 0xFD ], // CTP  ctrl+e
      1: [ 0xFE, 0xFB ], // AP2  ctrl+a
     16: [ 0xFE, 0xF7 ], // F1   ctrl+1
     17: [ 0xFE, 0xEF ], // F2   ctrl+2
     18: [ 0xFE, 0xDF ], // F3   ctrl+3
     27: [ 0xFE, 0xBF ], // F4   ctrl+4
     20: [ 0xFD, 0xFE ], // TAB  ctrl+t
     12: [ 0xFD, 0xFD ], // PS   ctrl+l
     13: [ 0xFD, 0xFB ], // BK
    127: [ 0xFD, 0xF7 ], // ZB
      3: [ 0xFD, 0xEF ], // <-
     23: [ 0xFD, 0xDF ], // UP   ctrl+w
      4: [ 0xFD, 0xBF ], // ->
     26: [ 0xFD, 0x7F ], // DOWN ctrl+z
     48: [ 0xFB, 0xFE ], // 0
     49: [ 0xFB, 0xFD ], // 1
     50: [ 0xFB, 0xFB ], // 2
     51: [ 0xFB, 0xF7 ], // 3
     52: [ 0xFB, 0xEF ], // 4
     53: [ 0xFB, 0xDF ], // 5
     54: [ 0xFB, 0xBF ], // 6
     55: [ 0xFB, 0x7F ], // 7
     56: [ 0xF7, 0xFE ], // 8
     57: [ 0xF7, 0xFD ], // 9
     58: [ 0xF7, 0xFB ], // :
     59: [ 0xF7, 0xF7 ], // ;
     44: [ 0xF7, 0xEF ], // ,
     45: [ 0xF7, 0xDF ], // -
     46: [ 0xF7, 0xBF ], // .
     47: [ 0xF7, 0x7F ], // /
     33: [ 0xFB, 0xFD, 0xDF ], // !
     34: [ 0xFB, 0xFB, 0xDF ], // "
     35: [ 0xFB, 0xF7, 0xDF ], // #
     36: [ 0xFB, 0xEF, 0xDF ], // $
     37: [ 0xFB, 0xDF, 0xDF ], // %
     38: [ 0xFB, 0xBF, 0xDF ], // &
     39: [ 0xFB, 0x7F, 0xDF ], // '
     40: [ 0xF7, 0xFE, 0xDF ], // (
     41: [ 0xF7, 0xFD, 0xDF ], // )
     42: [ 0xF7, 0xFB, 0xDF ], // *
     43: [ 0xF7, 0xF7, 0xDF ], // +
     60: [ 0xF7, 0xEF, 0xDF ], // <
     61: [ 0xF7, 0xDF, 0xDF ], // =
     62: [ 0xF7, 0xBF, 0xDF ], // >
     63: [ 0xF7, 0x7F, 0xDF ], // ?
     64: [ 0xEF, 0xFE ], // @
     65: [ 0xEF, 0xFD ], // A
     66: [ 0xEF, 0xFB ], // B
     67: [ 0xEF, 0xF7 ], // C
     68: [ 0xEF, 0xEF ], // D
     69: [ 0xEF, 0xDF ], // E
     70: [ 0xEF, 0xBF ], // F
     71: [ 0xEF, 0x7F ], // G
     72: [ 0xDF, 0xFE ], // H
     73: [ 0xDF, 0xFD ], // I
     74: [ 0xDF, 0xFB ], // J
     75: [ 0xDF, 0xF7 ], // K
     76: [ 0xDF, 0xEF ], // L
     77: [ 0xDF, 0xDF ], // M
     78: [ 0xDF, 0xBF ], // N
     79: [ 0xDF, 0x7F ], // O
     80: [ 0xBF, 0xFE ], // P
     81: [ 0xBF, 0xFD ], // Q
     82: [ 0xBF, 0xFB ], // R
     83: [ 0xBF, 0xF7 ], // S
     84: [ 0xBF, 0xEF ], // T
     85: [ 0xBF, 0xDF ], // U
     86: [ 0xBF, 0xBF ], // V
     87: [ 0xBF, 0x7F ], // W
     88: [ 0x7F, 0xFE ], // X
     89: [ 0x7F, 0xFD ], // Y
     90: [ 0x7F, 0xFB ], // Z
     91: [ 0x7F, 0xF7 ], // [
     92: [ 0x7F, 0xEF ], // \
     93: [ 0x7F, 0xDF ], // ]
     94: [ 0x7F, 0xBF ], // ^
     32: [ 0x7F, 0x7F ], // SPC
     97: [ 0xEF, 0xFD, 0xDF ], // a
     98: [ 0xEF, 0xFB, 0xDF ], // b
     99: [ 0xEF, 0xF7, 0xDF ], // c
    100: [ 0xEF, 0xEF, 0xDF ], // d
    101: [ 0xEF, 0xDF, 0xDF ], // e
    102: [ 0xEF, 0xBF, 0xDF ], // f
    103: [ 0xEF, 0x7F, 0xDF ], // g
    104: [ 0xDF, 0xFE, 0xDF ], // h
    105: [ 0xDF, 0xFD, 0xDF ], // i
    106: [ 0xDF, 0xFB, 0xDF ], // j
    107: [ 0xDF, 0xF7, 0xDF ], // k
    108: [ 0xDF, 0xEF, 0xDF ], // l
    109: [ 0xDF, 0xDF, 0xDF ], // m
    110: [ 0xDF, 0xBF, 0xDF ], // n
    111: [ 0xDF, 0x7F, 0xDF ], // o
    112: [ 0xBF, 0xFE, 0xDF ], // p
    113: [ 0xBF, 0xFD, 0xDF ], // q
    114: [ 0xBF, 0xFB, 0xDF ], // r
    115: [ 0xBF, 0xF7, 0xDF ], // s
    116: [ 0xBF, 0xEF, 0xDF ], // t
    117: [ 0xBF, 0xDF, 0xDF ], // u
    118: [ 0xBF, 0xBF, 0xDF ], // v
    119: [ 0xBF, 0x7F, 0xDF ], // w
    120: [ 0x7F, 0xFE, 0xDF ], // x
    121: [ 0x7F, 0xFD, 0xDF ], // y
    122: [ 0x7F, 0xFB, 0xDF ], // z
    124: [ 0x00, 0xFF, 0x7F ]  // rus/lat |
};

async function o128keyboard(con, memo) {
    const kbd = {
        'keys': [],   // keyboard buffer
        'kscn': 0,    // keyboard scanline
        'kmod': 0xff, // keyboard modifiers (SS:0xDF US:0xBF RUS/LAT:7F)
        'key_delay': 0,
        'translateKey': () => {
            if (kbd.keys.length === 0) {
                if (kbd.kmod !== 0xff) kbd.kmod = 0xff;
                return 0xff;
            }
            const key = Keyboard_key_table[kbd.keys[0]], key0 = key[0];
            let ch = 0xff;
            if (key0 == 0x00 || key0 == kbd.kscn) {
                ch = key[1];
                if (key.length > 2) kbd.kmod = key[2];
                const delay = (key0 == 0x00) ? 9 : 1;
                kbd.key_delay++;
                if (kbd.key_delay > delay) {
                    kbd.key_delay = 0;
                    kbd.keys.shift();
                }
            }
            return ch;
        }
    };
    con.kbd = kbd;
    return {
        'keyboard': async (key, code, value) => {
            if (value === null) return;
            switch (code) {
                case 8: kbd.keys.push(127); break;
                case 13: kbd.keys.push(13); break;
                case 37: kbd.keys.push(3); break;
                case 39: kbd.keys.push(4); break;
                case 48: kbd.keys.push(16); break;
                case 49: kbd.keys.push(17); break;
                case 50: kbd.keys.push(18); break;
                case 51: kbd.keys.push(27); break;
                case 65: kbd.keys.push(1); break;
                case 69: kbd.keys.push(6); break;
                case 72: kbd.keys.push(5); break;
                case 76: kbd.keys.push(12); break;
                case 84: kbd.keys.push(20); break;
                case 87: kbd.keys.push(23); break;
                case 90: kbd.keys.push(26); break;
                case 229: kbd.keys.push(value.charCodeAt(0)); break;
            }
        }
    };
}

async function ODIDisk(fname) {
    const img = fname ? await loadFile(fname, false) : null,
          cyls = 80, sects = 5, heads = 2, ssize = 1024,
          size = img ? img.length : cyls * sects * ssize * heads,
          data = new Uint8Array(size),
    seek = (trk, sect, head, len) => {
        if (trk < 0 || trk >= cyls || sect < 1 || sect > sects || head < 0 || head > 1)
            return [null, 0, 0];
        const idx = ((trk * heads + head) * sects + sect - 1) * ssize;
        return [data, idx, ssize * (len ? sects - sect + 1 : 1)];
    };
    if (size !== 819200)
        throw new Error(`disk image error: ${size}`);
    if (img) data.set(img, 0);
    return {seek};
}

function WD1793() {
    let cmd = 0xd0, disk = 0, side = 0, buf = null, idx = 0, len = 0, step = 0;
    const R = [0, 0, 0, 0], disks = [],
    read = num => {
        switch (num) {
            case 0x00:
                let a = R[0];
                if (disk >= disks.length) a |= 0x80;
                if (cmd < 0x80 || cmd & 0xf0 === 0xd0)
                    R[0] = (R[0] ^ 0x02) & (0x02 | 0x01 | 0x80 | 0x40 | 0x04);
                else
                    R[0] = R[0] & (0x01 | 0x80 | 0x40 | 0x02);
                return a;
                break;
            case 0x01: return R[1];
            case 0x02: return R[2];
            case 0x03:
                if (len) {
                    R[3] = buf[idx++];
                    if (--len) {
                        if (len % 1024 === 0) R[2]++;
                    }
                    else R[0] = R[0] & ~(0x01 | 0x02);
                }
                return R[3];
                break;
        }
        return 0xff;
    },
    write = (num, v) => {
        switch (num) {
            case 0x00:
                if (R[0] & 0x01 && v & 0xf0 !== 0xd0) break;
                cmd = v;
                switch (cmd & 0xf0) {
                    case 0x00:
                        R[1] = 0;
                        R[0] = 0x02 | 0x04 | ((v & 0x08) ? 0x20 : 0x00);
                        break;
                    case 0x10:
                        buf = null; idx = 0; len = 0; R[1] = R[3];
                        R[0] = 0x02 | (R[1] ? 0x00 : 0x04) | ((v & 0x08) ? 0x20 : 0x00);
                        break;
                    case 0x20: case 0x30: case 0x40:
                    case 0x50: case 0x60: case 0x70:
                        if (v & 0x40) step = v & 0x20; else v = (v & ~0x20) | step;
                        if (v & 0x20) { if (R[1]) R[1]--; } else R[1]++;
                        R[0] = 0x02 | (R[1] ? 0x00 : 0x04);
                        break;
                    case 0x80: case 0x90:
                    case 0xa0: case 0xb0:
                        [buf, idx, len] = (disk >= disks.length) ? [null, 0, 0] :
                                disks[disk].seek(R[1], R[2], side, v & 0x10);
                        R[0] = (buf === null) ? (R[0] & ~0x18) | 0x10 : R[0] | 0x01 | 0x02;
                        break;
                    case 0xc0:
                        [buf, idx, len] = (disk >= disks.length) ? [null, 0, 0] :
                                disks[disk].seek(R[1], 1, side);
                        if (buf === null) R[0] |= 0x10;
                        else {
                            buf = [R[1], side, 1, 3, 0xff, 0x00]; idx = 0; len = 6;
                            R[0] |= 0x01 | 0x02;
                        }
                        break;
                    case 0xd0:
                        buf = null; idx = 0; len = 0;
                        R[0] = (R[0] & 0x01) ? R[0] & ~0x01 : 0x02 | (R[1] ? 0x00 : 0x04);
                        break;
                    case 0xe0: break;
                    case 0xf0:
                        [buf, idx, len] = (disk >= disks.length) ? [null, 0, 0] :
                                disks[disk].seek(R[1], 1, 0);
                        if (buf === null) R[0] |= 0x10;
                        else {
                            const d = new Uint8Array(5 * 1024); d.fill(0xe5);
                            buf.set(d, idx);
                            [buf, idx, len] = disks[disk].seek(R[1], 1, 1);
                            buf.set(d, idx);
                        }
                        break;
                }
                break;
            case 0x01: if ((R[0] & 0x01) === 0) R[1] = v; break;
            case 0x02: if ((R[0] & 0x01) === 0) R[2] = v; break;
            case 0x03:
                if (len) {
                    buf[idx++] = v;
                    if (--len) {
                        if (len % 1024 === 0) R[2]++;
                    }
                    else R[0] = R[0] & ~(0x01 | 0x02);
                }
                R[3] = v;
                break;
            case 0x20:
                if ((R[0] & 0x01) === 0) { disk = v & 0x03; side = v >> 4 & 0x01 ^ 0x01; }
                break;
        }
    };
    return {read, write, disks};
}
