'use strict';

function segments(draw) {
    const dimtime = 100;
    let enabled = false, column = null, row = null,
        lastrows = [null, null, null, null, null, null],
        updts = [null, null, null, null, null, null];
    function drw(num, val, clear = true) {
        if (clear) { column = null; row = null; }
        if (lastrows[num] !== val) {
            lastrows[num] = val;
            draw(num, val);
        }
    }
    const res = {
        'enable': v => enabled = v,
        'column': v => {
            if (!enabled) return;
            column = v; updts[column] = Date.now();
            if (row !== null) drw(column, row);
        },
        'rows': v => {
            if (!enabled) return;
            row = v;
            if (column !== null) drw(column, row);
        },
        'update': () => {
            const now = Date.now();
            for (let i = 0; i < 6; i++)
                if (now - updts[i] >= dimtime && lastrows[i] !== 0) drw(i, 0, false);
            setTimeout(res.update, dimtime);
        }
    };
    return res;
}

function timer6530(irq) {
    let div = 1, currdiv = 1, acc = 0, count = 0xff, passed = false, int = undefined;
    return {
        'reset': (n, v, inter) => {
            div = n; currdiv = n; acc = 0; count = v; passed = false; int = inter;
        },
        'count': inter => {
            if (passed) currdiv = div; else int = inter;
            return count & 0xff;
        },
        'status': () => passed ? 0x80 : 0x00,
        'update': () => {
            acc += 4; // one step is ~ 4 CPU cycles
            if (acc >= currdiv) {
                acc = 0; count--;
                if (count <= 0) {
                    currdiv = 1; passed = true; count = 0xff;
                    if (int) irq();
                    int = undefined;
                }
            }
        }
    };
}

function audio() {
    let memo,
        count = 0, data = 0, bits = 0,
        media = '',
        enabled = false, state = -1, byte = [], pulses = [], idx,
        debug = false;
    const res = {
        'record': v => {
            if (!v) res.bit(1);
            count = 0; data = 0; bits = 0;
        },
        'bit': v => {
            if (v === 0) count++;
            else if (count > 0) {
                v = (count > 12) ? 1 : 0;
                if (v === 1) data |= 0x01 << bits;
                bits++;
                if (bits >= 8) {
                    media += String.fromCharCode(data);
                    data = 0; bits = 0;
                }
                count = 0;
            }
        },
        'media': v => (v === undefined) ? media : media = v,
        'playback': v => {
            if (v) { state = 0; count = 0; }
            enabled = v;
        },
        'play': () => {
            if (!enabled || (memo.ram[0x1742] & 0x20) !== 0x00) return;
            switch (state) {
                case 0:
                    if (count >= media.length) { enabled = false; break; }
                    data = media.charCodeAt(count++);
                    byte.length = 0;
                    for (let mask = 0x01; mask <= 0x80; mask <<= 1) byte.push(data & mask);
                    bits = 0;
                case 1:
                    if (bits > 7) { state = 0; break; }
                    pulses.length = 0;
                    if (byte[bits++] === 0) pulses.push(100, 470);
                    else pulses.push(470, 200);
                    idx = 0;
                case 2:
                    if (idx >= pulses.length) { state = 1; break; }
                    const sig = memo.ram[0x1742];
                    memo.ram[0x1742] = (idx % 2 === 0) ? sig | 0x80 : sig & 0x7f;
                    state = 3;
                case 3:
                    if (pulses[idx]-- <= 0) { idx++; state = 2; }
                    break;
            }
            if (debug) cycles++;
        },
        'enabled': () => enabled,
        'debug': v => (v === undefined) ? debug : debug = v,
        'setmemo': m => memo = m
    };
    return res;
}

function kim1keypad(stop, reset) {
    let lastKey;
    return {
        'lastKey': () => lastKey,
        'k1key': key => {
            if (key !== undefined) lastKey = key;
            else {
                switch (lastKey) {
                    case 0x15: stop(); break;
                    case 0x16: reset(); break;
                }
                setTimeout(() => lastKey = undefined, 1);
            }
        }
    };
}

function memIO(i6530_2, i6530_3, segs, k1kp) {
    const ram = new Uint8Array(0x10000),
          keys = [0xbf, 0xdf, 0xef, 0xf7, 0xfb, 0xfd, 0xfe],
          tape = audio();
    const res = {
        ram, tape,
        'rd': a => {
            switch (a) {
                case 0x1706: return i6530_3.count();
                case 0x1707: return i6530_3.status();
                case 0x170e: return i6530_3.count(true);
                case 0x1740:
                    const key = k1kp.lastKey();
                    switch (ram[0x1742] >> 1 & 0x0f) {
                        case 0: return (key <= 6) ? keys[key] : 0xff;
                        case 1: return (key >= 7 && key <= 13) ? keys[key - 7] : 0xff;
                        case 2: return (key >= 14 && key <= 20) ? keys[key - 14] : 0xff;
                        case 3: return 0xff;
                        default: return 0x80;
                    }
                case 0x1742: return ram[a];
                case 0x1746: return i6530_2.count();
                case 0x1747: return i6530_2.status();
                default: return ram[a];
            }
        },
        'wr': (a, v) => {
            switch (a) {
                case 0x1704: i6530_3.reset(1, v); ram[a] = v; break;
                case 0x1705: i6530_3.reset(8, v); ram[a] = v; break;
                case 0x1706: i6530_3.reset(64, v); ram[a] = v; break;
                case 0x1707: i6530_3.reset(1024, v); ram[a] = v; break;
                case 0x170c: i6530_3.reset(1, v, true); ram[a] = v; break;
                case 0x170d: i6530_3.reset(8, v, true); ram[a] = v; break;
                case 0x170e: i6530_3.reset(64, v, true); ram[a] = v; break;
                case 0x170f: i6530_3.reset(1024, v, true); ram[a] = v; break;
                case 0x1740: segs.rows(v); ram[a] = v; break;
                case 0x1741: segs.enable(v === 0x7f); ram[a] = v; break;
                case 0x1742:
                    if (ram[0x1743] === 0xbf && v & 0x80 !== 0) tape.bit((ram[0x1744] > 180) ? 0 : 1);
                    ram[a] = v;
                    if (v >= 0x09 && v <= 0x13) segs.column(v - 0x09 >> 1);
                    break;
                case 0x1743:
                    if (ram[0x1743] !== 0xbf && v === 0xbf) tape.record(true);
                    else if (ram[0x1743] === 0xbf && v !== 0xbf) tape.record(false);
                    ram[a] = v;
                    break;
                case 0x1744: i6530_2.reset(1, v); ram[a] = v; break;
                case 0x1745: i6530_2.reset(8, v); ram[a] = v; break;
                case 0x1746: i6530_2.reset(64, v); ram[a] = v; break;
                case 0x1747: i6530_2.reset(1024, v); ram[a] = v; break;
                default:
                    if (a !== 0xfff9) ram[a] = v; // RAM stop (used by TinyBasic to detect top memory)
                    break;
            }
        },
        'clear': () => ram.fill(0x00),
        'scope': () => cycles                     // add oscilloscope
    };
    tape.setmemo(res);
    return res;
}

const progs = [
    `0200: A2 33 8A 95 40 CA 10 FA A2 02 BD BB 03 95 75 CA
     0210: 10 F8 AD 04 17 85 80 D8 A6 76 E0 09 B0 34 A0 D8
     0220: 20 57 03 A0 33 84 76 20 30 03 38 A5 81 65 82 65
     0230: 85 85 80 A2 04 B5 80 95 81 CA 10 F9 29 3F C9 34
     0240: B0 E5 AA B9 40 00 48 B5 40 99 40 00 68 95 40 88
     0250: 10 D5 A0 DE 20 57 03 A5 77 20 A6 03 20 30 03 C9
     0260: 0A B0 F9 AA 86 79 CA 30 F3 E4 77 B0 EF A2 0B A9
     0270: 00 95 90 CA 10 FB 20 78 03 20 8F 03 20 78 03 20
     0280: 64 03 86 7A 20 28 03 20 30 03 AA CA 30 11 E4 96
     0290: D0 F5 20 78 03 C9 22 B0 40 E0 05 F0 53 D0 E8 A5
     02A0: 95 48 A2 00 20 0F 03 A2 04 A9 00 95 90 CA 10 FB
     02B0: 68 85 95 A6 7A 20 6D 03 20 92 03 20 28 03 A5 9A
     02C0: C9 22 B0 29 65 9B A6 91 D0 18 C9 22 90 02 A5 9A
     02D0: C9 17 B0 2C 20 8F 03 D0 E2 20 28 03 20 55 03 20
     02E0: 28 03 A5 77 F8 38 E5 79 85 77 4C 17 02 20 55 03
     02F0: 20 28 03 A5 77 F8 18 65 79 A0 99 90 01 98 D0 E8
     0300: A2 03 20 0F 03 A5 9A C5 97 F0 DF B0 D5 90 E4 B5
     0310: 97 F8 18 75 98 C9 22 B0 02 95 97 D8 B5 97 48 A0
     0320: E2 20 57 03 68 20 A6 03 A0 01 20 30 03 c8 D0 FA
     0330: 84 7F A0 13 A2 05 A9 7F 8D 41 17 B5 90 8D 40 17
     0340: 8C 42 17 E6 7B D0 FC 88 88 CA 10 EF 20 40 1F 20
     0350: 6A 1F A4 7F 60 A0 E6 84 74 A0 05 B1 74 99 90 00
     0360: 88 10 F8 60 A6 76 C6 76 B5 40 4A 4A AA 18 D0 01
     0370: 38 BD BE 03 BC CB 03 60 20 64 03 E6 96 A6 96 94
     0380: 8F A0 10 90 02 84 98 18 F8 65 97 85 97 D8 60 20
     0390: 64 03 C6 99 A6 99 94 96 A0 10 90 02 84 9B 18 F8
     03A0: 65 9A 85 9A D8 60 48 4A 4A 4A 4A A8 B9 E7 1F 85
     03B0: 94 68 29 0F A8 B9 E7 1F 85 95 60 03 00 20 01 02
     03C0: 03 04 05 06 07 08 09 10 10 10 10 F7 DB CF E6 ED
     03D0: FD 87 FF EF F1 F1 F1 F1 ED F6 BE F1 F1 B8 FC F9
     03E0: F8 D3 F8 DC F8 C0 FC BE ED 87 F9 DE`,      // black jack
    `0200: 20 1F 1F 20 6A 1F C5 60 F0 F6 85 60 C9 0A 90 29
     0210: C9 13 F0 18 C9 12 D0 E8 F8 18 A2 FD B5 FC 75 65
     0220: 95 FC 95 65 E8 30 F5 86 61 D8 10 D4 A9 00 85 61
     0230: A2 02 95 F9 CA 10 FB 30 C7 A4 61 D0 0F E6 61 48
     0240: A2 02 B5 F9 95 62 94 F9 CA 10 F7 68 0A 0A 0A 0A
     0250: A2 04 0A 26 F9 26 FA 26 FB CA D0 F6 F0 A2` // addition
];

class Kim1Monitor extends Monitor {
    constructor(emu) {
        super(emu);
    }
    async handler(parms, cmd) {
        switch (cmd) {
            case 'stop': this.emu.stop(); break;
            case 'bj': this.emu.loadHex(progs[0]); break;
            case 'ad': this.emu.loadHex(progs[1]); break;
            default: await super.handler(parms, cmd); break;
        }
    }
}

let k1key, cycles = 0;

async function main() {
    let loads = [
        loadImage('../kim1/KIM-1.jpg'), loadScript('../js/js6502.js'),
        loadFile('../kim1/KIM-1_65302.bin', false),
        loadFile('../kim1/KIM-1_65303.bin', false)
    ];
    const stl = document.createElement('style');
    stl.type = 'text/css';
    stl.innerHTML = `.btn {
        position:absolute;width:26px;height:26px;background-color:transparent;border-width:2px;border-color:#595959;}
        .cnv {position:absolute;left:496px;top:473px;width:189px;height:54px;display:inline-block;}`;
    document.head.appendChild(stl);
    const ui = addTab('tab3', 'ui'),
          offs = 100,                                                  // left offset
          width = 615;                                                 // scaled width
    ui.innerHTML = `<canvas width='${offs + width}px' height='820px'></canvas>
        <button onmousedown='k1key(0x13);' onmouseup='k1key();' class='btn' style='left:531px;top:590px;'></button>
        <button onmousedown='k1key(0x15);' onmouseup='k1key();' class='btn' style='left:567px;top:590px;'></button>
        <button onmousedown='k1key(0x16);' onmouseup='k1key();' class='btn' style='left:603px;top:590px;'></button>
        <button onmousedown='k1key(0x10);' onmouseup='k1key();' class='btn' style='left:531px;top:626px;'></button>
        <button onmousedown='k1key(0x11);' onmouseup='k1key();' class='btn' style='left:567px;top:626px;'></button>
        <button onmousedown='k1key(0x14);' onmouseup='k1key();' class='btn' style='left:603px;top:626px;'></button>
        <button onmousedown='k1key(0x12);' onmouseup='k1key();' class='btn' style='left:639px;top:626px;'></button>
        <button onmousedown='k1key(0x0c);' onmouseup='k1key();' class='btn' style='left:531px;top:662px;'></button>
        <button onmousedown='k1key(0x0d);' onmouseup='k1key();' class='btn' style='left:567px;top:662px;'></button>
        <button onmousedown='k1key(0x0e);' onmouseup='k1key();' class='btn' style='left:603px;top:662px;'></button>
        <button onmousedown='k1key(0x0f);' onmouseup='k1key();' class='btn' style='left:639px;top:662px;'></button>
        <button onmousedown='k1key(0x08);' onmouseup='k1key();' class='btn' style='left:531px;top:698px;'></button>
        <button onmousedown='k1key(0x09);' onmouseup='k1key();' class='btn' style='left:567px;top:698px;'></button>
        <button onmousedown='k1key(0x0a);' onmouseup='k1key();' class='btn' style='left:603px;top:698px;'></button>
        <button onmousedown='k1key(0x0b);' onmouseup='k1key();' class='btn' style='left:639px;top:698px;'></button>
        <button onmousedown='k1key(0x04);' onmouseup='k1key();' class='btn' style='left:531px;top:734px;'></button>
        <button onmousedown='k1key(0x05);' onmouseup='k1key();' class='btn' style='left:567px;top:734px;'></button>
        <button onmousedown='k1key(0x06);' onmouseup='k1key();' class='btn' style='left:603px;top:734px;'></button>
        <button onmousedown='k1key(0x07);' onmouseup='k1key();' class='btn' style='left:639px;top:734px;'></button>
        <button onmousedown='k1key(0x00);' onmouseup='k1key();' class='btn' style='left:531px;top:770px;'></button>
        <button onmousedown='k1key(0x01);' onmouseup='k1key();' class='btn' style='left:567px;top:770px;'></button>
        <button onmousedown='k1key(0x02);' onmouseup='k1key();' class='btn' style='left:603px;top:770px;'></button>
        <button onmousedown='k1key(0x03);' onmouseup='k1key();' class='btn' style='left:639px;top:770px;'></button>
        <canvas class='cnv'></canvas>`;
    loads = await Promise.all(loads);
    const img = ui.childNodes[0],                                      // scaled image
          ctx = img.getContext('2d'),
          bg = loads[0];                                               // 768 x 1024
    ctx.drawImage(bg, offs, 0, width, img.height);                     // draw scaled image with offset
    const clrdata = ctx.getImageData(0, 0, offs + 20, img.height),     // save connections background
          data = ctx.getImageData(offs, 0, width, img.height);         // process image background
    for (let i = 0, d = data.data, n = d.length; i < n; i += 4)
        if (d[i] >= 243 && d[i + 1] >= 243 && d[i + 2] >= 243)         // off white pixels
            d[i + 3] = 0;                                              // transparent
    ctx.putImageData(data, offs, 0);
    ctx.lineWidth = 3;                                                 // connect wire width
    const cnv = ui.childNodes[ui.childNodes.length - 1],               // 6-segment display
          dsp = cnv.getContext('2d'),
          sgoffs = [[3, 1], [50, 2], [98, 1], [146, 1], [209, 3], [258, 2]],
          sgs = [                                                      // segments (begin, end)
              [16, 46, 31, 46],                                        // 0         0
              [32, 46, 29, 73],                                        // 1      5     1
              [29, 75, 26, 102],                                       // 2         6
              [10, 102, 25, 102],                                      // 3      4     2
              [11, 75, 8, 102],                                        // 4         3
              [14, 46, 11, 73],                                        // 5
              [13, 74, 28, 74]                                         // 6
          ],
          draw = (n, v) => {
              let mask = 0x01, curr = null;
              for (let i = 0; i < 7; i++, mask <<= 1) {
                  const color = (v & mask) ? '#ff2c0f' : '#383838';
                  if (color !== curr) {
                      if (curr !== null) dsp.stroke();
                      curr = color; dsp.strokeStyle = color;
                      dsp.beginPath();
                  }
                  const o = sgoffs[n], sg = sgs[i];
                  dsp.moveTo(sg[0] + o[0], sg[1] + o[1]);
                  dsp.lineTo(sg[2] + o[0], sg[3] + o[1]);
              }
              dsp.stroke();
          },
          conY = c => {
              const LTs = ' ABCDEFHJKLMNPRSTUVWXYZ';
              let offs, mul, chr, num, side;
              if (c.charAt(0) === 'a') { offs = 510.5; mul = 10.8; }
              else { offs = 77.5; mul = 10.7; }
              chr = c.charAt(1);
              if (chr >= 'A' && chr <= 'Z') { num = LTs.indexOf(chr); side = 118; }
              else { num = pi(c.substr(1), false); side = 130; }
              return [side, offs + (num - 1) * mul];
          },
          connect = (c1, c2, dist, color) => {
              let offs
              ctx.strokeStyle = color;
              ctx.beginPath();
              const yc1 = conY(c1), yc2 = conY(c2);
              ctx.moveTo(yc1[0], yc1[1]); ctx.lineTo(dist, yc1[1]);
              ctx.lineTo(dist, yc2[1]); ctx.lineTo(yc2[0], yc2[1]);
              ctx.stroke();
          },
          clear = () => {
              ctx.putImageData(clrdata, 0, 0);
              ctx.putImageData(data, offs, 0);
          };
    dsp.lineWidth = 7;
    const segs = segments(draw);                                       // segments driver
    segs.update();                                                     // start updating segments
    connect('a15', 'e6', 50, '#4682b4');                               // A15 - E6 connection
    let initialized = false;
    const irq = () => cpu.RUN ? cpu.cpu.setInterrupt(0) : undefined,
          reset = () => {
              cpu.RUN = false;                                  // stop CPU
              memo.tape.playback(false);
              (async () => {
                  if (!initialized) {                           // inject timers update
                      const original = cpu.cpu.step;
                      cpu.cpu.step = () => {
                          const result = original();
                          i6530_2.update(); i6530_3.update();
                          memo.tape.play();
                          cycles++;
                          return result;
                      };
                      initialized = true;
                  }
                  memo.clear();
                  memo.ram.set(loads[2], 0x1c00);
                  memo.wr(0x1c2b, 0x00);                        // !!!fix default TTY delay
                  memo.ram.set([0xea, 0xea, 0xea], 0x1f50);     // !!!fix default display handling
                  memo.ram.set(loads[3], 0x1800);
                  memo.wr(0xfffa, memo.rd(0x1ffa)); memo.wr(0xfffb, memo.rd(0x1ffb)); // NMI to memory extension
                  memo.wr(0xfffc, memo.rd(0x1ffc)); memo.wr(0xfffd, memo.rd(0x1ffd)); // RST to memory extension
                  memo.wr(0xfffe, memo.rd(0x1ffe)); memo.wr(0xffff, memo.rd(0x1fff)); // IRQ to memory extension
                  memo.wr(0x17fa, 0x00); memo.wr(0x17fb, 0x1c); // NMI redirect to use stop button
                  memo.wr(0x17fe, 0x00); memo.wr(0x17ff, 0x1c); // IRQ redirect
                  cpu.cpu.reset(); cpu.run();
              })();
          },
          i6530_2 = timer6530(irq), i6530_3 = timer6530(irq),
          k1kp = kim1keypad(irq, reset),
          memo = memIO(i6530_2, i6530_3, segs, k1kp),
          cpu = new GenCpu(memo, 2),
          emu = new Emulator(cpu, memo, 2),
          mon = new Kim1Monitor(emu);
    k1key = k1kp.k1key;
//    connect('aV', 'a21', 50, '#5f9ea0'); // AV - A21 connection
//    serial.enabled(true);
//    const kbd = new TTY_Kbd(emu);
    term.setPrompt('> ');
    let input;
    while (true) {
        input = await term.prompt();
        input = input.trim();
        mon.exec(input);
    }
}
