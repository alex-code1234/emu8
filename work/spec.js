'use strict';

// SPEC.ROM:
//     c000 - loader  (mk1989-04), start c000
//     c800 - monitor (mk1988-09)
// loderun.bin - load at 0000, start 0000 (game)
// 4 colors - mk1988_07.png
//            white[00xxxxxx] red[01xxxxxx] green[10xxxxxx] blue[11xxxxxx]
// 8 colors - mk1990-08
// test.i80 - test RAM, keyboard and 4-color video (mk1991-12), load at d400, start d400
// MX - http://xn----7sbombne2agmgm0c.xn--p1ai/index8.html
// https://github.com/alemorf/retro_computers/tree/master/Specialist
// http://www.nedopc.org/forum/viewtopic.php?t=9541&start=60
// https://zx-pk.ru/archive/index.php/t-29118.html

async function SpecCon(cdecode = cb => [0xffeeeeee, 0xff202020]) {          // color decode fnc: clr => [fg, bg]
    let vram = null, cram = null;
    const pxlen = 384 * 256,
          voffs = ((384 / 8 | 0) - 1) * 256,
    con = await VT_100('scr', {
        COLORS: [
            '#282828', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', green,
            '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'
        ],
        FONT_G0: 'CP437', FONT_WIDTH: 12, FONT_HEIGHT: 16, SCR_WIDTH: 64, SCR_HEIGHT: 32
    }),
    gmon = GMonitor(con.canvas, 384, 256, pixs => {
        let i = 0, j = 0x9000, k = 0;
        while (i < pxlen) {
            const vb = vram[j + k],
                  [f, b] = cdecode((cram !== null) ? cram[j + k - 0x9000] : null);
            for (let m = 0x80; m !== 0; m >>>= 1) pixs[i++] = (vb & m) ? f : b;
            k += 256;
            if (k > voffs) { k = 0; j++; }
        }
        return true;
    }, 20);
    return {...con, ...gmon, 'setMemo': v => { vram = v.ram; cram = v.cram ?? null; }};
}

class SpecCpu extends GenCpu {
    constructor(con, memo) {
        super(memo, 0);
        con.setMemo(memo);                                                  // link con and memo
        this.con = con;
        this.spk = memo.speaker;
        if (memo.pit) {                                                     // setup PIT update
            const origStep = memo.CPU.cpu.step.bind(memo.CPU.cpu),
                  pitCntrs = memo.pit.counters;
            memo.CPU.cpu.step = () => {                                     // override CPU step
                pitCntrs[0].tick(); pitCntrs[1].tick();                     // PIT clock 2MHz / ~[cycles per instr]
                return origStep();
            };
        }
    }
    async runHz(freq) {                                                     // freq (Hz)
        const frameRate = (1.0 / 60.0) * 1000.0,                            // animation frame rate in ms
              rate = (1.0 / freq) * 1000.0,                                 // requested rate in ms
              maxCycles = frameRate / rate | 0;                             // target cycles
        this.RUN = true;
        let print = true, res, cycles = this.cpu.cycles + maxCycles, time, currCycles = maxCycles;
        do {
            time = performance.now();
            while (this.cpu.cycles < cycles) {
                try { res = this.cpu.step(); }
                catch(exc) {
                    console.error(exc);
                    this.RUN = false;
                    break;
                }
                if (!res || (this.STOP >= 0 && this.cpu.getPC() === this.STOP)) {
                    if (res) { console.info('STOP'); this.STOP = -1; }
                    else if (!this.HLT_STOP) break;
                    else console.info('HALT');
                    this.RUN = false;
                    print = false;
                    break;
                }
                if (!this.RUN) break;
            }
            time = performance.now() - time;
            currCycles = (time > frameRate) ? (frameRate - (time - frameRate)) / rate | 0 : maxCycles;
            cycles += currCycles;
            await (new Promise((resolve, reject) => requestAnimationFrame(resolve)));
        } while (this.RUN);
        if (print) console.info('stopped', `${(currCycles / frameRate / 1000.0).toFixed(2)}MHz`);
    }
    async run() {
        this.con.start();
        if (this.spk) this.spk.start();
        await super.run();
        if (this.spk) this.spk.stop();
        this.con.stop();
    }
}

// Speaker interface
async function Speaker(volume = 0.03, filter = true, canvas = null) {
    function constructor() {                                         // AudioWorkletProcessor constructor
        _super();                                                    // super call, fixed during class generation
        this.ticks = [];                                             // data buffer
        this.value = 0.5;                                            // sample value 50%
        this.sample = 48000.0 / 2000000.0;                           // sampling ratio (48kHz - audio, 2MHz - CPU)
        this.prevCycle = 0;
        this.port.onmessage = e => {                                 // message handler
            const data = e.data, length = data.length;
            for (let i = 0; i < length; i++) {                       // preprocess data
                const cycle = data[i];                               // calc audio half wave length in 1..1024 range
                let hwlen = Math.round((cycle - this.prevCycle) * this.sample) | 0;
                if (hwlen < 1) hwlen = 1; else if (hwlen > 1024) hwlen = 1024;
                this.ticks.push(hwlen);                              // save in buffer
                this.prevCycle = cycle;                              // remember cycle
            }
        };
    }
    function process(inps, outs, parms) {                            // AudioWorkletProcessor process method
        const out = outs[0][0];                                      // mono output
        let i = 0;
        while (i < out.length) {                                     // fill in outputs
            if (this.ticks.length === 0) {                           // no data in buffer
                out[i++] = 0;                                        // no signal
                continue;
            }
            let cnt = this.ticks[0];                                 // number of samples
            while (cnt-- > 0) {
                out[i++] = this.value;                               // output signal
                if (i >= out.length) break;                          // finished samples buffer
            }
            if (cnt > 0) {                                           // samples batch not done
                this.ticks[0] = cnt;                                 // remember rest
                break;
            }
            this.ticks.shift();                                      // remove processed data
            this.value = -this.value;                                // switch value sign for second half
        }
        return true;                                                 // keep alive
    }
    if (!(await navigator.mediaDevices.getUserMedia({'audio': true})))
        return null;                                                 // audio disabled, no speaker
    const p1 = ('' + constructor).substring(9).replace('_super', 'super'), p2 = ('' + process).substring(9),
          code = `class AP extends AudioWorkletProcessor {${p1}${p2}}registerProcessor('audio-speaker', AP);`,
          blob = new Blob([code], {type: 'text/javascript'}),        // AudioWorkletProcessor code
          cntx = new AudioContext();                                 // audio context
    let url = URL.createObjectURL(blob), prevBit = 0,                // AudioWorkletProcessor data
        buff = [], bckg = null,                                      // data buffer for AudioWorkletProcessor
        graph = null, points, ctx2;                                  // audio visualization
    await cntx.audioWorklet.addModule(url);                          // register AudioWorkletProcessor
    const proc = new AudioWorkletNode(cntx, 'audio-speaker'),        // AudioWorkletProcessor node
          gain = cntx.createGain(),                                  // speaker volume node
    timer = () => {                                                  // timer func
        proc.port.postMessage(buff);                                 // send data buffer
        bckg = null; buff = [];                                      // prepare next transfer
    },
    tick = (bit, cycles) => {                                        // speaker interface, prepare audio data
        if (bit ^ prevBit) {                                         // bit changed, process
            buff.push(cycles);                                       // save data
            if (bckg !== null) clearTimeout(bckg);                   // re-schedule timeout
            bckg = setTimeout(timer, 2);                             // send in 2ms (~2.6ms audio processor cycle)
        }
        prevBit = bit;                                               // remember bit
    },
    start = () => { cntx.resume(); if (graph) draw(); },             // start audio
    stop = () => cntx.suspend(),                                     // stop audio
    destroy = () => { cntx.close(); URL.revokeObjectURL(url); },     // free resources
    setPointAttrs = (wdt, bgd, fgd) => {                             // set canvas attributes
        ctx2.lineWidth = wdt; ctx2.fillStyle = bgd; ctx2.strokeStyle = fgd;
    },
    drawPoints = (pts, clear) => {                                   // update canvas
        const length = pts.length,
              width = ctx2.canvas.width, height = ctx2.canvas.height,
              height2 = (height / 2) | 0, width2 = width / length;
        if (clear) ctx2.fillRect(0, 0, width, height);               // clear view
        let x = 0;
        ctx2.beginPath();                                            // draw points
        for (let i = 0; i < length; i++) {
            const y = ((pts[i] / 128.0) * height2) | 0;
            if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
            x += width2;
        }
        ctx2.lineTo(width, height2);
        ctx2.stroke();
    },
    draw = () => {                                                   // update audio visualization
        if (cntx.state !== 'running') return;                        // audio not active, no update
        graph.getByteTimeDomainData(points);                         // get data from analyser node
        drawPoints(points, true);
        requestAnimationFrame(draw);                                 // schedule next update
    };
    gain.connect(cntx.destination);                                  // connect audio nodes
    let middle = gain;
    if (canvas) {                                                    // visualization requested
        graph = cntx.createAnalyser();                               // create analyser node
        points = new Uint8Array(graph.frequencyBinCount);            // and data buffer
        graph.connect(middle); middle = graph;                       // include into node chain
        if (typeof canvas === 'string') canvas = document.getElementById(canvas);
        ctx2 = canvas.getContext('2d');
        setPointAttrs(2, '#000000', '#008000');                      // set draw parameters
    }
    if (filter) {                                                    // create hi-lo filter 50..15000
        const flt = cntx.createBiquadFilter();
        flt.frequency.value = 15000; flt.type = 'lowpass'; flt.Q.value = 0.1;
        flt.connect(middle);
        const flt2 = cntx.createBiquadFilter();
        flt2.frequency.value = 50; flt2.type = 'highpass'; flt2.Q.value = 0.1;
        flt2.connect(flt); middle = flt2;
    }
    proc.connect(middle);
    gain.gain.value = volume;                                        // set audio volume
    return {tick, start, stop, destroy, setPointAttrs, drawPoints};
}

function SpecKbd(mx = false) {
    const ports = new Uint8Array([0xff, 0xff, 0xff, 0]),
    checkKey = txt => {
        if (mx) switch (txt) {
            case 'АР2':    return [0xff, 0x7f, 0xf7]; // АР2
            case 'КОИ':    return [0xff, 0x7f, 0xfb]; // КОИ
            case 'F1':     return [0xff, 0x7f, 0xfd]; // F1
            case 'F2':     return [0xff, 0x7f, 0xfe]; // F2
            case 'F3':     return [0x7f, 0x7f, 0xff]; // F3
            case 'F4':     return [0xbf, 0x7f, 0xff]; // F4
            case 'F5':     return [0xdf, 0x7f, 0xff]; // F5
            case 'F6':     return [0xef, 0x7f, 0xff]; // F6
            case 'F7':     return [0xf7, 0x7f, 0xff]; // F7
            case 'F8':     return [0xfb, 0x7f, 0xff]; // F8
            case 'F9':     return [0xfd, 0x7f, 0xff]; // F9
            case 'СТР':    return [0xfe, 0x7f, 0xff]; // СТР
        } else switch (txt) {
            case 'F1':     return [0xff, 0x7f, 0xf7]; // F1    F
            case 'F2':     return [0xff, 0x7f, 0xfb]; // F2    HELP
            case 'F3':     return [0xff, 0x7f, 0xfd]; // F3    NEW
            case 'F4':     return [0xff, 0x7f, 0xfe]; // F4    LOAD
            case 'F5':     return [0x7f, 0x7f, 0xff]; // F5    SAVE
            case 'F6':     return [0xbf, 0x7f, 0xff]; // F6    RUN
            case 'F7':     return [0xdf, 0x7f, 0xff]; // F7    STOP
            case 'F8':     return [0xef, 0x7f, 0xff]; // F8    CONT
            case 'F9':     return [0xf7, 0x7f, 0xff]; // F9    EDIT
            case '\u25a0': return [0xfb, 0x7f, 0xff]; // F10   СФ
            case '\u25a1': return [0xfd, 0x7f, 0xff]; // F11   ТФ
            case '\u2341': return [0xfe, 0x7f, 0xff]; // F12   СТР
            case 'АР2':    return [0xbf, 0xfb, 0xff]; // АР2
        }
        switch (txt) {
            case 'НР':     return [0xff, 0xfd, 0xff]; // НР
            case 'ВК':     return [0xfe, 0xfb, 0xff]; // ВК
            case '':       return [0xdf, 0xfb, 0xff]; // Space
            case ',<':     return [0xfb, 0xf7, 0xff]; // ,     <
            case '-=':     return [0xfe, 0xbf, 0xff]; // -     =
            case '.>':     return [0xfe, 0xef, 0xff]; // .     >
            case '/?':     return [0xfd, 0xf7, 0xff]; // /     ?
            case '0':      return [0xfd, 0xbf, 0xff]; // 0
            case '1!':     return [0xff, 0xbf, 0xfb]; // 1     !
            case '2"':     return [0xff, 0xbf, 0xfd]; // 2     "
            case '3#':     return [0xff, 0xbf, 0xfe]; // 3     #
            case '4$':     return [0x7f, 0xbf, 0xff]; // 4     $
            case '5%':     return [0xbf, 0xbf, 0xff]; // 5     %
            case '6&':     return [0xdf, 0xbf, 0xff]; // 6     &
            case '7\'':    return [0xef, 0xbf, 0xff]; // 7     '
            case '8(':     return [0xf7, 0xbf, 0xff]; // 8     (
            case '9)':     return [0xfb, 0xbf, 0xff]; // 9     )
            case ':*':     return [0xfe, 0xdf, 0xff]; // :     *
            case ';+':     return [0xff, 0xbf, 0xf7]; // ;     +
            case '@Ю':     return [0xf7, 0xf7, 0xff]; // @     Ю
            case 'AА':     return [0xff, 0xef, 0xfe]; // A     А
            case 'BБ':     return [0xef, 0xf7, 0xff]; // B     Б
            case 'CЦ':     return [0xff, 0xdf, 0xfb]; // C     Ц
            case 'DД':     return [0xf7, 0xef, 0xff]; // D     Д
            case 'EЕ':     return [0x7f, 0xdf, 0xff]; // E     Е
            case 'FФ':     return [0xff, 0xef, 0xf7]; // F     Ф
            case 'GГ':     return [0xdf, 0xdf, 0xff]; // G     Г
            case 'HХ':     return [0xfd, 0xdf, 0xff]; // H     Х
            case 'IИ':     return [0x7f, 0xf7, 0xff]; // I     И
            case 'JЙ':     return [0xff, 0xdf, 0xf7]; // J     Й
            case 'KК':     return [0xff, 0xdf, 0xfe]; // K     К
            case 'LЛ':     return [0xef, 0xef, 0xff]; // L     Л
            case 'MМ':     return [0xff, 0xf7, 0xfe]; // M     М
            case 'NН':     return [0xbf, 0xdf, 0xff]; // N     Н
            case 'OО':     return [0xdf, 0xef, 0xff]; // O     О
            case 'PП':     return [0x7f, 0xef, 0xff]; // P     П
            case 'QЯ':     return [0xff, 0xf7, 0xf7]; // Q     Я
            case 'RР':     return [0xbf, 0xef, 0xff]; // R     Р
            case 'SС':     return [0xff, 0xf7, 0xfd]; // S     С
            case 'TТ':     return [0xbf, 0xf7, 0xff]; // T     Т
            case 'UУ':     return [0xff, 0xdf, 0xfd]; // U     У
            case 'VЖ':     return [0xfb, 0xef, 0xff]; // V     Ж
            case 'WВ':     return [0xff, 0xef, 0xfd]; // W     В
            case 'XЬ':     return [0xdf, 0xf7, 0xff]; // X     Ь
            case 'YЫ':     return [0xff, 0xef, 0xfb]; // Y     Ы
            case 'ZЗ':     return [0xfb, 0xdf, 0xff]; // Z     З
            case '[Ш':     return [0xef, 0xdf, 0xff]; // [     Ш
            case '\\Э':    return [0xfd, 0xef, 0xff]; // \     Э
            case ']Щ':     return [0xf7, 0xdf, 0xff]; // ]     Щ
            case '^Ч':     return [0xff, 0xf7, 0xfb]; // ^     Ч
            case '_Ъ':     return [0xfe, 0xf7, 0xff]; // _     Ъ     ЗБ
            case 'Р/Л':    return [0xff, 0xfb, 0xf7]; // Р/Л
            case 'ПС':     return [0xfd, 0xfb, 0xff]; // ПС
            case '\u21d6': return [0xff, 0xfb, 0xfb]; // Home
            case '\u2191': return [0xff, 0xfb, 0xfd]; // ↑
            case '\u2193': return [0xff, 0xfb, 0xfe]; // ↓
            case 'ТАБ':    return [0x7f, 0xfb, 0xff]; // Tab
            case '\u2190': return [0xef, 0xfb, 0xff]; // ←
            case 'ПВ':     return [0xf7, 0xfb, 0xff]; // ПВТ
            case '\u2192': return [0xfb, 0xfb, 0xff]; // →
            default: return [0xff, 0xff, 0xff];
        }
    },
    update = (txt, down) => {
        const key = checkKey(txt);
        ports[3] = down ? 1 : 0;
        for (let i = 0; i < 3; i++)
            if (down) ports[i] &= key[i]; else ports[i] |= ~key[i];
    };
    const s1 = mx ?
'1,АР2  1,КОИ      1,F1       1,F2       1,F3   1,F4   1,F5     1,F6 1,F7 1,F8       1,F9       1,СТР' :
'1,F1   1,F2       1,F3       1,F4       1,F5   1,F6   1,F7     1,F8 1,F9 [1,\u25a0] [1,\u25a1] [1,\u2341]',
          s2 = mx ?
'4,\u0020' :
'1,АР2  1,\u0020';
    SoftKeyboard(`sec
3      ${s1} 2
3      1,;..+ 1,1..!     1,2.."     1,3..#     1,4..$ 1,5..% 1,6..&   1,7..'     1,8..(  1,9..)     1,0     1,-..=
4      1,J..Й 1,C..Ц     1,U..У     1,K..К     1,E..Е 1,N..Н 1,G..Г   1,[..Ш     1,]..Щ  1,Z..З     1,H..Х  1,:..*
5      1,F..Ф 1,Y..Ы     1,W..В     1,A..А     1,P..П 1,R..Р 1,O..О   1,L..Л     1,D..Д  1,V..Ж     1,\\..Э 1,...>
3 3    1,Q..Я 1,^..Ч     1,S..С     1,M..М     1,I..И 1,T..Т 1,X..Ь   1,B..Б     1,@..Ю  1,,..<     1,/..?  1,_..Ъ
3 3,НР 1,Р/Л  [1,\u21d6] [1,\u2191] [1,\u2193] 1,ТАБ  ${s2} [1,\u2190] 1,ПВ    [1,\u2192] 1,ПС    1,ВК`,
    update);
    return {ports};
}

class SpecMemIO extends MemIO {
    constructor(con, speaker = null, kbd = [0xff, 0xff, 0xff, 0], ramdisks = 0, colors = 2, onepage = false) {
        super(con, 0, false);
//this.cycles = 0;
        this.colors = colors;
        if (colors > 2) {
            this.cram = new Uint8Array(0x3000); this.cval = 0;
        }
        if (ramdisks > 0) {
            this.rom = new Uint8Array(0xc000);
            this.ramdsks = [this.ram];
            for (let i = 0; i < ramdisks; i++)
                this.ramdsks.push(new Uint8Array(0xffc0));
            this.romEnabled = true;
            this.ramPage = 0;
            this.rd = this.rd_mx;
            this.wr = this.wr_mx;
            this.fdc = WD1793();
            this.pit = Intel8253(this.pitOut.bind(this), 0xff);
            this.pitBit = 0;
            this.pitEnable = false;
        }
        this.tapeEnabled = false; this.tape = []; this.tapePos = 0; this.tapeFixed = false;
        this.ppi = Intel8255(this.ppiRd.bind(this), this.ppiWr.bind(this), this.ppiWrB.bind(this));
        this.speaker = speaker;
        this.kbd = kbd;
        this.onepage = onepage;
    }
    rd(a) {
        if ((a & 0xf800) === 0xf800) return this.ppi.read(a & 0x03);
        return this.ram[a];
    }
    wr(a, v) {
        if ((a & 0xf800) === 0xf800) this.ppi.write(a & 0x03, v); else
        if (this.CPU.RUN && a > 0xbfff) return; else
        this.ram[a] = v;
        if (this.cram && a >= 0x9000) this.cram[a - 0x9000] = this.cval;
    }
    rd_mx(a) {
        if (a < 0xc000) {
            if (this.romEnabled) return this.rom[a];
            return (this.ramPage < this.ramdsks.length) ? this.ramdsks[this.ramPage][a] : 0x00;
        }
        if (a < 0xffc0)
            return (this.ramPage < this.ramdsks.length) ? this.ramdsks[this.ramPage][a] : 0x00;
        if (a < 0xffe0) return this.ram[a];
        if (a < 0xffe4) return this.ppi.read(a & 0x03);
        if (a < 0xffe8) return 0x00;
        if (a < 0xffec) return this.fdc.read(a & 0x03);
        if (a < 0xfff0) return this.pit.read(a & 0x03);
        if (a < 0xfff4) return 0x00;
        return this.ram[a];
    }
    wr_mx(a, v) {
        if (a < 0xc000)
            if (this.romEnabled) { if (!this.CPU.RUN) this.rom[a] = v; } else {
                if (this.ramPage < this.ramdsks.length) this.ramdsks[this.ramPage][a] = v;
                if (this.cram && a >= 0x9000 && this.ramPage === 0) this.cram[a - 0x9000] = this.cval;
            } else
        if (a < 0xffc0) {
            if (this.ramPage < this.ramdsks.length) this.ramdsks[this.ramPage][a] = v;
        } else
        if (a < 0xffe0) this.ram[a] = v; else
        if (a < 0xffe4) this.ppi.write(a & 0x03, v); else
        if (a < 0xffe8) ; else
        if (a < 0xffec) this.fdc.write(a & 0x03, v); else
        if (a < 0xfff0) {
            if (a === 0xffee) this.pitEnable = true;
//this.cycles = this.CPU.cpu.cycles;
            this.pit.write(a & 0x03, v);
        } else
        if (a < 0xfff4) {
            const num = a & 0x03
            if (num === 2) this.fdc.write(4, (v & 0x01) | 0x10); else
            if (num === 3) this.fdc.write(4, (v & 0x01) | 0x02);
        } else {
            if (a === 0xfff8) { if (this.colors === 16) this.cval = v; } else // 4-bit + 4-bit color
            if (a === 0xfffc) { this.romEnabled = false; this.ramPage = 0; } else
            if (a === 0xfffd) this.ramPage = this.onepage ? 1 : (v & 0x07) + 1; else
            if (a === 0xfffe) this.romEnabled = true;
            this.ram[a] = v;
        }
    }
    ppiRd(num) {
        const [p0, p1, p2] = this.ppi.ports,
              [k0, k1, k2, down] = this.kbd;
        switch (num) {
            case 0:                                                         // port A
                if (down && p1 !== 0 && (p1 & k1) !== p1)                   // port B set, compare with key
                    return 0xff;                                            // no match, reset bits
                return k0;
            case 1:                                                         // port B
                let tapeBit = 0xfe;                                         // tape bit 0
                if (this.tapeEnabled && this.tapePos < this.tape.length) {
                    if (this.tape[this.tapePos++]) tapeBit |= 0x01;         // tape bit 1
                    if (this.tapeFixed) this.tapeFixed = false;
                    else if (this.tapePos > 0 && this.tapePos % 16 === 1) { // byte read finished
                        this.tapePos--; this.tapeFixed = true;              // compensate extra read in
                    }                                                       // ROM 0xc377 (tape read byte)
                }
                if (down && ((p0 !== 0 && (p0 & k0) !== k0) ||
                        ((p2 & 0x0f) !== 0 && (p2 & k2) !== (k2 & 0x0f))))  // port A or Cl set, compare with key
                    return (k1 | ~0x02) & tapeBit;                          // no match, reset bits except НР
                return k1 & tapeBit;
            case 2:                                                         // port C
                if (down && p1 !== 0 && (p1 & k1) !== p1)                   // port B set, compare with key
                    return 0xff;                                            // no match, reset bits
                return k2;
        }
    }
    ppiWr(num) {
        if (num === 2) {
            if (this.colors === 4) this.cval = this.ppi.ports[2] >>> 6;     // 2-bit color
            else if (this.colors === 8) {                                   // 3-bit color
                const pC = this.ppi.ports[2];
                this.cval = (pC >>> 5 & 0x06) | (pC >>> 4 & 0x01);
            }
            if (this.speaker) this.speaker.tick((this.ppi.ports[2] & 0x20) ? 1 : 0, this.CPU.cpu.cycles);
        }
    }
    ppiWrB(bit) {
        if (bit === 7 && this.tapeEnabled)                                  // write bit to tape (inverted)
            this.tape.push((this.ppi.ports[2] & 0x80) ? 0 : 1);
        else if (bit === 5 && this.speaker)                                 // speaker
            this.speaker.tick((this.ppi.ports[2] & 0x20) ? 1 : 0, this.CPU.cpu.cycles);
    }
    pitOut(num) {
        switch (num) {
            case 0:
                if (this.pitEnable) {
//for (let i = 0; i < 4; i++) {
                    this.pitBit = this.pitBit ? 0 : 1;
                    this.speaker.tick(this.pitBit, this.CPU.cpu.cycles);
//this.speaker.tick(this.pitBit, this.cycles += 1000);
//}
                }
                break;
            case 1: 
//for (let i = 0; i < 4; i++) {
            this.pit.counters[2].tick(); 
//}
            break;
            case 2: this.pitEnable = false; break;
        }
    }
    state() {
        return {
            'rdisks': this.ramdsks ? this.ramdsks.length - 1 : 0, 'colors': this.colors,
            'romEnabled': this.romEnabled, 'ramPage': this.ramPage,
            'ppi': this.ppi?.ports, 'pit': this.pit?.counters.map(c => c.state())
        };
    }
}

class SpecMonitor extends Monitor {
    constructor(emu, debug_height, logger) {
        super(emu, debug_height, logger);
    }
    async handler(parms, cmd) {
        switch (cmd) {
            case 'tape':
                if (parms.length < 2) {
                    downloadFile('tape.bts', new Uint8Array(this.emu.memo.tape));
                    this.emu.memo.tape.length = 0;
                    break;
                }
                let prm;
                if ((prm = parms[1]) === 'on' || prm === 'off') {
                    this.emu.memo.tapeEnabled = prm === 'on';
                    console.log(this.emu.memo.tapeEnabled);
                    break;
                }
                if (prm === 'reset') {
                    const pos = (parms.length > 2) ? pi(parms[2], false) : 0;
                    this.emu.memo.tapePos = pos;
                    console.log(this.emu.memo.tapePos);
                    break;
                }
                if (prm === 'view') {
                    let i = 0, cnt = 0, s = '', val;
                    const add = v => {
                        s += `${fmt(v, 2)} `;
                        if (s.length > 47) { console.log(s); s = ''; }
                    },
                    out = () => {
                        if (cnt > 1) {
                            if (s.length > 0) { console.log(s); s = ''; }
                            console.log(`00[${cnt}]`, (val !== 0x00) ? fmt(val, 2) : ''); cnt = 0;
                        } else {
                            if (cnt > 0) { add(0); cnt = 0; }
                            if (val !== 0x00) add(val);
                        }
                    };
                    while (i < this.emu.memo.tape.length) {
                        val = 0;
                        for (let j = 0; j < 8; j++) {
                            const b1 = this.emu.memo.tape[i++],
                                  b2 = this.emu.memo.tape[i++];
                            val |= (b1 === 0 && b2 === 1) ? 1 : 0;
                            if (j < 7) val <<= 1;
                        }
                        if (val === 0x00) cnt++;
                        else out();
                    }
                    out(); if (s.length > 0) console.log(s);
                    console.log(`position: ${this.emu.memo.tapePos}`);
                    console.log(this.emu.memo.tape.slice(prm = this.emu.memo.tapePos, prm + 16));
                    break;
                }
                this.emu.memo.tape.length = 0;
                this.emu.memo.tapeEnabled = false;
                this.emu.memo.tapePos = 0;
                const hndl = await preLoadFile(prm);
                this.emu.memo.tape.push(...new Uint8Array(await hndl.arrayBuffer()));
                console.log(this.emu.memo.tape.length);
                break;
//case 'ttt':
//this.emu.loadBin(
//new Uint8Array(await (await preLoadFile('xtree.rks')).arrayBuffer()).slice(4),
//0x0000
//);
//break;
            case 'state':
                console.log(this.emu.memo.state());
                console.log(this.emu.memo.fdc?.state());
                break;
            default: await super.handler(parms, cmd); break;
        }
    }
}

async function main() {
    await loadScript('../emu/github/emu8/js/js8080.js');
    await loadScript('../emu/github/emu8/js/hrdwr8.js');
    const clrs04 = [0xffeeeeee, 0xff2020ff, 0xff20ff20, 0xffff2020],
          cf04 = cb => [clrs04[cb], 0xff202020],
          clrs08 = [0xffeeeeee, 0xff3fd0f4, 0xff8a4476, 0xff2020ff, 0xffd5b37f, 0xff20ff20, 0xffff2020, 0xff202020],
          cf08 = cb => [clrs08[cb], 0xff202020],
          clrs16 = [0xff202020, 0xffff2020, 0xff20ff20, 0xffaaaa20, 0xff2020ff, 0xff8a4476, 0xff0090b4, 0xffeeeeee,
                    0xff505050, 0xffd5b37f, 0xff90ee90, 0xffffffb0, 0xffcbc0ff, 0xffff9fcf, 0xff3fd0f4, 0xffffffff],
          cf16 = cb => [clrs16[cb >>> 4], clrs16[cb & 0x0f]];
    const con = await SpecCon(/*cf16*/),
          kbd = SpecKbd(/*true*/),
          spk = await Speaker(undefined, undefined),
          mem = new SpecMemIO(con, /*spk*/null, kbd.ports/*, 8, 16*/),
          cpu = new SpecCpu(con, mem),
          emu = new Emulator(cpu, mem, 0),
          mon = new SpecMonitor(emu);
    await mon.exec('r c000 SPEC.ROM');
//await mon.exec('m 100 3e 91 32 03 ff 3e fb 32 01 ff 3a 02 ff 2f e6 03 47 3a 00 ff 2f e6 34 b0 c9 ' +
//                     'cd 00 01 21 00 00 22 fc 8f cd 15 c8 c3 19 01'); // G119
//    await mon.exec('r 0 loderun.bin');
    mon.exec('g c000');
//await mon.exec('r d400 spec_mx/test.i80');
//await mon.exec('m dad4 40'); await mon.exec('m daeb 80'); await mon.exec('m daf5 c0'); await mon.exec('m dafc 00');
//mon.exec('g d400');
//await mon.exec('r 0 spec_mx/Specimx.rom');
//await mon.exec('r 0 spec_mx/nc.rom');
//await mon.exec('r 0 spec_mx/nc_orig.rom');
//mem.fdc.Disk[1] = new Uint8Array(await (await preLoadFile('spec_mx/bst_mx0.odi')).arrayBuffer());
//mem.fdc.Disk[0] = new Uint8Array(await (await preLoadFile('spec_mx/lafans2.odi')).arrayBuffer());
//mon.exec('g 0');
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
