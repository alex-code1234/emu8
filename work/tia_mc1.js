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

// Speaker interface
async function Speaker(volume = 0.03, filter = [15000, 50, 0.1], canvas = null) {
    function constructor() {                            // AudioWorkletProcessor constructor
        _super();                                       // super call, fixed during class generation
        this.ticks = [];                                // data buffer
        this.value = 0.5;                               // sample value 50%
        this.sample = 48000.0 / 2000000.0;              // sampling ratio (48kHz - audio, 2MHz - CPU)
        this.prevCycle = 0;
        this.port.onmessage = e => {                    // message handler
            const data = e.data;
            for (let i = 0, length = data.length; i < length; i++) { // preprocess data
                const cycle = data[i];                               // calc audio half wave length
                let hwlen = Math.round((cycle - this.prevCycle) * this.sample) | 0;
                if (hwlen < 1) hwlen = 1; else if (hwlen > 1024) hwlen = 1024;
                this.ticks.push(hwlen);                              // save in buffer
                this.prevCycle = cycle;                              // remember cycle
            }
        };
    }
    function process(inps, outs, parms) {               // AudioWorkletProcessor process method
        const out = outs[0][0];                         // mono output
        let i = 0;
        while (i < out.length) {                        // fill in outputs
            if (this.ticks.length === 0) {                           // no data in buffer
                out[i++] = 0;                                        // no signal
                continue;
            }
            let cnt = this.ticks[0];                    // number of samples
            while (cnt-- > 0) {
                out[i++] = this.value;                               // output signal
                if (i >= out.length) break;                          // finished samples buffer
            }
            if (cnt > 0) {                              // samples batch not done
                this.ticks[0] = cnt;                    // remember rest
                break;
            }
            this.ticks.shift();                         // remove processed data
            this.value = -this.value;                   // switch value sign for second half
        }
        return true;
    }
    if (!(await navigator.mediaDevices.getUserMedia({'audio': true})))
        return null;                                    // audio disabled, no speaker
    const p1 = ('' + constructor).substring(9).replace('_super', 'super'),
          p2 = ('' + process).substring(9),
          p3 = 'registerProcessor("audio-speaker", AP);',
          blob = new Blob([
              `class AP extends AudioWorkletProcessor {${p1}${p2}} ${p3}`
          ], {type: 'text/javascript'}),                // AudioWorkletProcessor code
          url = URL.createObjectURL(blob),
          cntx = new AudioContext();                    // audio context
    await cntx.audioWorklet.addModule(url);             // register AudioWorkletProcessor
    let graph = null, points, ctx2,                     // audio visualization
        prevBit = 0, buff = [];
    const proc = new AudioWorkletNode(cntx, 'audio-speaker'), // AudioWorkletProcessor node
          gain = cntx.createGain(),                     // speaker volume node
    start = async () => {                               // start audio
        await cntx.resume(); if (graph) draw();
    },
    stop = async () => {                                // stop audio
        await cntx.suspend();
    },
    destroy = async () => {                             // free resources
        await cntx.close(); URL.revokeObjectURL(url);
    },
    tick = (bit, cycles) => {                           // speaker interface, prepare audio
        if (bit ^ prevBit) {                            // bit changed, process
            buff.push(cycles);                          // save data
            if (buff.length === 1) queueMicrotask(() => {
                proc.port.postMessage(buff);
                buff.length = 0;
            });
        }
        prevBit = bit;                                  // remember bit
    },
    setPointAttrs = (wdt, bgd, fgd) => {                // set canvas attributes
        ctx2.lineWidth = wdt; ctx2.fillStyle = bgd; ctx2.strokeStyle = fgd;
    },
    drawPoints = (pts, clear) => {                      // update canvas
        const length = pts.length,
              width = ctx2.canvas.width, height = ctx2.canvas.height,
              height2 = (height / 2) | 0, width2 = width / length;
        if (clear) ctx2.fillRect(0, 0, width, height);  // clear view
        let x = 0;
        ctx2.beginPath();                               // draw points
        for (let i = 0; i < length; i++) {
            const y = ((pts[i] / 128.0) * height2) | 0;
            if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
            x += width2;
        }
        ctx2.lineTo(width, height2);
        ctx2.stroke();
    },
    draw = () => {                                      // update audio visualization
        if (cntx.state !== 'running') return;           // audio not active, no update
        graph.getByteTimeDomainData(points);            // get data from analyser node
        drawPoints(points, true);
        requestAnimationFrame(draw);                    // schedule next update
    };
    stop();                                             // initially suspended
    gain.connect(cntx.destination);                     // connect audio nodes
    let middle = gain;
    if (canvas) {                                       // visualization requested
        graph = cntx.createAnalyser();                  // create analyser node
        points = new Uint8Array(graph.frequencyBinCount); // and data buffer
        graph.connect(middle); middle = graph;          // include into node chain
        if (typeof canvas === 'string') canvas = document.getElementById(canvas);
        ctx2 = canvas.getContext('2d');
        setPointAttrs(2, '#000000', '#008000');         // set draw parameters
    }
    if (filter) {                                       // create hi-lo-q filter
        const flt = cntx.createBiquadFilter();
        flt.frequency.value = filter[0]; flt.type = 'lowpass'; flt.Q.value = filter[2];
        flt.connect(middle);
        const flt2 = cntx.createBiquadFilter();
        flt2.frequency.value = filter[1]; flt2.type = 'highpass'; flt2.Q.value = filter[2];
        flt2.connect(flt); middle = flt2;
    }
    proc.connect(middle);
    gain.gain.value = volume;                           // set audio volume
    return {start, stop, destroy, tick, setPointAttrs, drawPoints};
}

class TIA_MC1MemIO {
    constructor(con, spk) {
        this.con = con;
        this.type = 0;
        this.CPU = null;
        this.rom = new Uint8Array(0x2000 * 7);
        this.ram = new Uint8Array(0x2000);
        this.vsync = 0x80; this.cycles = 0;
        this.spk = spk;
        this.pit = Intel8253(this.pitOut.bind(this));
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
        if (p >= 0xc0 && p <= 0xc3) this.pit.write(p - 0xc0, v);
        else this.con.pupdate(p, v);
    }
    pitOut(num) {
        
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

class TIA_MC1Cpu extends GenCpu {
    constructor(memo) {
        super(memo, 0);
        this.CPU_INSTR_CNT = 2348;
        const oldstep = this.cpu.step.bind(this.cpu),
              pitCntrs = memo.pit.counters;
        this.cpu.step = function() {
            const res = oldstep();
            memo.sync(this.cycles);
            
            return res;
        };
        this.spk = memo.spk;
    }
    async run() {
        if (this.spk) await this.spk.start();
        await super.run();
        if (this.spk) await this.spk.stop();
    }
}

class TIA_MC1Kbd extends Kbd {
    constructor(con, mon) {
        SoftKeyboard(`sec
4 4                    [1,&#8593;]                4 2
1,A 1,B   2   [1,&#8592;]   2   [1,&#8594;]   2   1,T
4 4                    [1,&#8595;]            4   1,C
        `);
        document.documentElement.style.setProperty('--key_size', '52px');
        super(con, mon, undefined, true);
        const sect = this.kbdElem.childNodes[0].style;
        sect.setProperty('grid-template-columns', 'repeat(16, 26px)');
        sect.setProperty('grid-template-rows', 'repeat(3, 38.235px)');
        this.kbdElem.style.setProperty('width', '488.8px');
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
    await loadScript('../emu/github/emu8/js/hrdwr8.js');
    const con = TIA_MC1Screen('scr', 640, 640, 256, 256, true),
          spk = await Speaker(undefined, undefined, undefined),
          mem = new TIA_MC1MemIO(con, spk),
          cpu = new TIA_MC1Cpu(mem),
          emu = new Emulator(cpu, mem, 0),
          mon = new TIA_MC1Monitor(emu),
          kbd = new TIA_MC1Kbd(con, mon);
await mon.exec('load tiamc1/esp32/data/konek_');
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
