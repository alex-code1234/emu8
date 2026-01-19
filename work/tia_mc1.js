'use strict';

// https://habr.com/ru/companies/ruvds/articles/835628/
// https://github.com/mamedev/mame/blob/master/src/mame/ussr/tiamc1_v.cpp

const g_v = [1.2071, 0.9971, 0.9259, 0.7159, 0.4912, 0.2812, 0.2100, 0.0000],
      r_v = [1.5937, 1.3125, 1.1562, 0.8750, 0.7187, 0.4375, 0.2812, 0.0000],
      b_v = [1.3523, 0.8750, 0.4773, 0.0000];

function TIA_MC1Screen(screen, scr_w, scr_h, tile_w, tile_h, AA) {
    if (typeof screen === 'string') screen = document.getElementById(screen);
    screen.style.width = `${scr_w}px`; screen.style.height = `${scr_h}px`;
    screen.width = tile_w; screen.height = tile_h;
    const canvas = screen.getContext('2d'),
          idata = canvas.getImageData(0, 0, tile_w, tile_h),
          pixs = new Uint32Array(idata.data.buffer),
          palet = [], cols = new Uint32Array(16),
          rom = new Uint8Array(256 * 16 * 16),
          vram = new Uint8Array(0x800 * 5),
          cvr = new Uint8Array(256 * 8 * 8),
          spry = new Uint8Array(16), sprx = new Uint8Array(16),
          sprn = new Uint8Array(16), spra = new Uint8Array(16),
    load = roms => {
        const [p0, p1, p2, p3] = roms;
        let a = 0;
        for (let i = 0; i < 256; i++)
            for (let j = 0; j < 16; j++) {
                const n = (i << 4) + j, n1 = n | 0x1000;
                for (let m = 0x80; m >= 0x01; m >>= 1) {
                    rom[a] = ((p0[n] & m) ? 1 : 0) | ((p1[n] & m) ? 2 : 0) |
                             ((p2[n] & m) ? 4 : 0) | ((p3[n] & m) ? 8 : 0);
                    rom[a + 8] = ((p0[n1] & m) ? 1 : 0) | ((p1[n1] & m) ? 2 : 0) |
                                 ((p2[n1] & m) ? 4 : 0) | ((p3[n1] & m) ? 8 : 0);
                    a++;
                }
                a += 8;
            }
    },
    sprite = (num, x, y, flipx, flipy) => {
        let n = num * 16 * 16,
            a = x + y * tile_w, da = tile_w - 16, ia = 1;
        if (flipy) { a += tile_w * 15; da = -(tile_w + 16); }
        if (flipx) { a += 15; ia = -1; da += 16 * 2; }
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 16; j++) {
                const cc = rom[n++];
                if (cc !== 15) pixs[a] = cols[cc];
                a += ia;
            }
            a += da;
        }
    },
    tupdate = () => {
        let a = 0, r = 0;
        for (let i = 0; i < 256; i++)
            for (let j = 0; j < 8; j++) {
                for (let m = 0x80; m >= 0x01; m >>= 1)
                    cvr[a++] = ((vram[r + 0x800] & m) ? 1 : 0) | ((vram[r + 0x1000] & m) ? 2 : 0) |
                               ((vram[r + 0x1800] & m) ? 4 : 0) | ((vram[r + 0x2000] & m) ? 8 : 0);
                r++;
            }
    },
    tile = (num, x, y) => {
        let n = num * 8 * 8,
            a = x + y * tile_w, da = tile_w - 8;
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++)
                pixs[a++] = cols[cvr[n++] | bmask];
            a += da;
        }
    },
    rupdate = (a, v) => {
        a &= 0x7ff;
        if ((vramb & 0x01) === 0) vram[a + 0x0000] = v;
        if ((vramb & 0x02) === 0) vram[a + 0x0800] = v;
        if ((vramb & 0x04) === 0) vram[a + 0x1000] = v;
        if ((vramb & 0x08) === 0) vram[a + 0x1800] = v;
        if ((vramb & 0x10) === 0) vram[a + 0x2000] = v;
        if ((vramb & 0x1e) !== 0x1e) chrgen_upd = true;
    },
    pupdate = (p, v) => {
        switch (p & 0xf0) {
            case 0x40: spry[p - 0x40] = v ^ 0xff; break;
            case 0x50: sprx[p - 0x50] = v ^ 0xff; break;
            case 0x60: sprn[p - 0x60] = v ^ 0xff; break;
            case 0x70: spra[p - 0x70] = v ^ 0xff; break;
            case 0xa0: cols[p - 0xa0] = palet[v ^ 0xff]; break;
            case 0xb0:
                switch (p) {
//                    case 0xbc: yoff = /*v ^ 0xff*/v; break;
//                    case 0xbd: xoff = 256 - (v - 4); break;
                    case 0xbe: vramb = v; break;
                    case 0xbf:
                        bmask = 0;
                        if (v & 0x01) bmask |= 0x01;
                        if (v & 0x04) bmask |= 0x02;
                        if (v & 0x10) bmask |= 0x04;
                        if (v & 0x40) bmask |= 0x08;
                        break;
                }
                break;
        }
    },
    render = () => {
        if (chrgen_upd) {
            chrgen_upd = false;
            tupdate();
        }
        let n = (vramb & 0x80) ? 0x0400 : 0x0000,
            y = yoff;
        for (let i = 0; i < 32; i++) {
            let x = xoff;
            for (let j = 0; j < 32; j++) {
                tile(vram[n++], x, y);
                x += 8;
            }
            y += 8;
        }
        for (let i = 0; i < 16; i++) {
            const a = spra[i];
            if (a & 0x01) sprite(sprn[i], sprx[i], spry[i], a & 0x08, a & 0x02);
        }
        canvas.putImageData(idata, 0, 0);
    };
    let vramb = 0, chrgen_upd = false, yoff = 0, xoff = 0, bmask = 0;
    if (!AA) {
        screen.style.imageRendering = 'pixelated';
        canvas.imageSmoothingEnabled = false;
    }
    for (let i = 0; i < 256; i++) {
        const ir = (i >> 3) & 7, ig = i & 7, ib = (i >> 6) & 3,
              r = ((255.0 * r_v[ir] / r_v[0]) | 0) & 255,
              g = ((255.0 * g_v[ig] / g_v[0]) | 0) & 255,
              b = ((255.0 * b_v[ib] / b_v[0]) | 0) & 255;
        palet.push(255 << 24 | b << 16 | g << 8 | r);
    }
    return {load, rupdate, pupdate, render};
}

class TIA_MC1MemIO {
    constructor(con) {
        this.con = con;
        this.type = 0;
        this.CPU = null;
        this.rom = new Uint8Array(0x2000 * 7);
        this.ram = new Uint8Array(0x2000);
        this.vsync = 0x80; this.cycles = 0;
    }
    rd(a) {
        return (a < 0xe000) ? this.rom[a] : this.ram[a - 0xe000];
    }
    wr(a, v) {
        if (a >= 0xe000) this.ram[a - 0xe000] = v;
        else if (a >= 0xb000 && a < 0xb800) this.con.rupdate(a, v);
    }
    input(p) {
        switch (p) {
            case 0xd0: return this.kbd[0];
            case 0xd1: return this.kbd[1];
            case 0xd2: return this.kbd[2] | this.vsync;
        }
        return 0;
    }
    output(p, v) {
        this.con.pupdate(p, v);
    }
    load(planes, code) {
        this.con.load(planes);
        for (let i = 0; i < 7; i++) this.rom.set(code[i], i * 0x2000);
    }
    sync(ticks) {
        const diff = ticks - this.cycles;
        if (diff >= 35000) { // TIA88_TICKS_FRAME
            this.vsync = 0x80; this.cycles = ticks;
            this.con.render();
        }                    // TIA88_TICKS_VSYNC
        else if (diff >= 57 && this.vsync !== 0) this.vsync = 0;
    }
}

class TIA_MC1Kbd extends Kbd {
    constructor(con, mon) {
        SoftKeyboard(`sec
4 4 4                        [1,&#8593;]                    4 4 4 4
4       1,A 1,B 2   [1,&#8592;]   2   [1,&#8594;]   2   1,T   2 4 4
4 4 4                        [1,&#8595;]            4   1,C
        `);
        document.documentElement.style.setProperty('--key_size', '52px');
        super(con, mon, undefined, true);
        this.d = [0, 0, 0];
        this.monitor.emu.memo.kbd = this.d; // expose keyboard data
    }
    translateKey(e, soft, isDown) {
        switch (e.key) {
            case 'ArrowLeft':
            case '\u2190': if (isDown) this.d[0] |= 0x20; else this.d[0] &= 0xdf; break;
            case 'ArrowRight':
            case '\u2192': if (isDown) this.d[0] |= 0x02; else this.d[0] &= 0xfd; break;
            case 'ArrowUp':
            case '\u2191': if (isDown) this.d[1] |= 0x02; else this.d[1] &= 0xfd; break;
            case 'ArrowDown':
            case '\u2193': if (isDown) this.d[1] |= 0x20; else this.d[1] &= 0xdf; break;
            case 'A': if (isDown) this.d[2] |= 0x40; else this.d[2] &= 0xbf; break;
            case 'B': if (isDown) this.d[2] |= 0x20; else this.d[2] &= 0xdf; break;
            case 'T': if (isDown) this.d[1] |= 0x80; else this.d[1] &= 0x7f; break;
            case 'C': if (isDown) this.d[2] |= 0x10; else this.d[2] &= 0xef; break;
        }
        return null;
    }
}

class TIA_MC1Monitor extends Monitor {
    constructor(emu) {
        super(emu);
        this.colors = new Uint8Array(16);
    }
    async handler(parms, cmd) {
        try { switch (cmd) {
            case 'load':
                if (parms.length < 2) { console.error('missing fname'); break; }
                const planes = [], code = [];
                let idxs = '2356';
                for (let i = 0; i < 4; i++)
                    planes.push(await loadFile(`${parms[1]}a${idxs.charAt(i)}.bin`, false));
                idxs = '1234567';
                for (let i = 0; i < 7; i++)
                    try {
                        code.push(await loadFile(`${parms[1]}g${idxs.charAt(i)}.bin`, false));
                    } catch {
                        code.push(new Uint8Array(0x2000));
                    }
                this.emu.memo.load(planes, code);
                break;
            default: await super.handler(parms, cmd); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    await loadScript('../emu/github/emu8/js/js8080.js');
    const con = TIA_MC1Screen('scr', 640, 640, 256, 256, false),
          mem = new TIA_MC1MemIO(con),
          cpu = new GenCpu(mem, 0),
          emu = new Emulator(cpu, mem, 0),
          mon = new TIA_MC1Monitor(emu),
          kbd = new TIA_MC1Kbd(con, mon),
          oldstep = cpu.cpu.step.bind(cpu.cpu);
    cpu.cpu.step = function() {
        const res = oldstep();
        mem.sync(this.cycles);
        return res;
    };
    cpu.CPU_INSTR_CNT = 2348;
await mon.exec('load tiamc1/esp32/data/konek_');
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
