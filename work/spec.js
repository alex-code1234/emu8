'use strict';

async function SpecCon() {
    let vram = null;
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
            const vb = vram[j + k];
            for (let m = 0x80; m !== 0; m >>= 1)
                pixs[i++] = (vb & m) ? 0xffffffff : 0x000000ff;
            k += 256;
            if (k > voffs) { k = 0; j++; }
        }
        return true;
    }, 20);
    con.canvas.canvas.style.backgroundColor = '#202020';                    // show canvas after theme change
    return {...con, ...gmon, 'setMemo': v => vram = v.ram};
}

class SpecCpu extends GenCpu {
    constructor(con, memo) {
        super(memo, 0);
        con.setMemo(memo);
        this.con = con;
    }
    async run() {
        this.con.start();
        await super.run();
        this.con.stop();
    }
}

class SpecKbd extends Kbd {
    constructor(con, mon) {
        super(con, mon);
        mon.emu.memo.keybrd = this;
        this.p = new Uint8Array([0xff, 0xfe, 0x0f, 0x00]);
        this.cnt = 0;
        this.enabledAC = false; this.enabledB = false;
        this.tapeEnabled = false; this.tape = []; this.tapePos = 0; this.tapeFixed = false;
    }
    kbdHandler(txt, soft) {
        if (soft && this.monitor.emu.CPU.RUN) switch (txt) {
            case 'Home':   this.processKey(200); break;
            case '\u2191': this.processKey(201); break;
            case '\u2193': this.processKey(202); break;
            case 'Tab':    this.processKey(203); break;
            case 'Esc':    this.processKey(204); break;
            case '\u2190': this.processKey(205); break;
            case 'Insert': this.processKey(206); break;
            case '\u2192': this.processKey(207); break;
            default:
                if (txt.length > 1 && txt.charAt(0) === 'F') this.processKey(txt.substring(1) | 0);
                else super.kbdHandler(txt, soft);
                break;
        }
    }
    setKey() {
        if (this.con.kbd.length === 0) this.p.set([0b11111111, 0b11111110, 0b00001111], 0);
        else {
            const key = this.con.kbd.shift();
            let shift = false;
            switch (key) {
                case 0:   this.p.set([0b11111111, 0b11111100, 0b00001111], 0); break; // НР
                case 1:   this.p.set([0b11111111, 0b01111110, 0b00000111], 0); break; // F1    F
                case 2:   this.p.set([0b11111111, 0b01111110, 0b00001011], 0); break; // F2    HELP
                case 3:   this.p.set([0b11111111, 0b01111110, 0b00001101], 0); break; // F3    NEW
                case 4:   this.p.set([0b11111111, 0b01111110, 0b00001110], 0); break; // F4    LOAD
                case 5:   this.p.set([0b01111111, 0b01111110, 0b00001111], 0); break; // F5    SAVE
                case 6:   this.p.set([0b10111111, 0b01111110, 0b00001111], 0); break; // F6    RUN
                case 7:   this.p.set([0b11011111, 0b01111110, 0b00001111], 0); break; // F7    STOP
                case 8:   this.p.set([0b11101111, 0b01111110, 0b00001111], 0); break; // F8    CONT
                case 9:   this.p.set([0b11110111, 0b01111110, 0b00001111], 0); break; // F9    EDIT
                case 10:  this.p.set([0b11111011, 0b01111110, 0b00001111], 0); break; // F10   СФ
                case 11:  this.p.set([0b11111101, 0b01111110, 0b00001111], 0); break; // F11   ТФ
                case 12:  this.p.set([0b11111110, 0b01111110, 0b00001111], 0); break; // F12   СТР
                case 13:  this.p.set([0b11111110, 0b11111010, 0b00001111], 0); break; // ВК
                case 32:  this.p.set([0b11011111, 0b11111010, 0b00001111], 0); break; // Space
                case 60:  shift = true;
                case 44:  this.p.set([0b11111011, 0b11110110, 0b00001111], 0); break; // ,     <
                case 61:  shift = true;
                case 45:  this.p.set([0b11111110, 0b10111110, 0b00001111], 0); break; // -     =
                case 62:  shift = true;
                case 46:  this.p.set([0b11111110, 0b11101110, 0b00001111], 0); break; // .     >
                case 63:  shift = true;
                case 47:  this.p.set([0b11111101, 0b11110110, 0b00001111], 0); break; // /     ?
                case 48:  this.p.set([0b11111101, 0b10111110, 0b00001111], 0); break; // 0
                case 33:  shift = true;
                case 49:  this.p.set([0b11111111, 0b10111110, 0b00001011], 0); break; // 1     !
                case 34:  shift = true;
                case 50:  this.p.set([0b11111111, 0b10111110, 0b00001101], 0); break; // 2     "
                case 35:  shift = true;
                case 51:  this.p.set([0b11111111, 0b10111110, 0b00001110], 0); break; // 3     #
                case 36:  shift = true;
                case 52:  this.p.set([0b01111111, 0b10111110, 0b00001111], 0); break; // 4     $
                case 37:  shift = true;
                case 53:  this.p.set([0b10111111, 0b10111110, 0b00001111], 0); break; // 5     %
                case 38:  shift = true;
                case 54:  this.p.set([0b11011111, 0b10111110, 0b00001111], 0); break; // 6     &
                case 39:  shift = true;
                case 55:  this.p.set([0b11101111, 0b10111110, 0b00001111], 0); break; // 7     '
                case 40:  shift = true;
                case 56:  this.p.set([0b11110111, 0b10111110, 0b00001111], 0); break; // 8     (
                case 41:  shift = true;
                case 57:  this.p.set([0b11111011, 0b10111110, 0b00001111], 0); break; // 9     )
                case 42:  shift = true;
                case 58:  this.p.set([0b11111110, 0b11011110, 0b00001111], 0); break; // :     *
                case 43:  shift = true;
                case 59:  this.p.set([0b11111111, 0b10111110, 0b00000111], 0); break; // ;     +
                case 64:  this.p.set([0b11110111, 0b11110110, 0b00001111], 0); break; // @     Ю
                case 65:  this.p.set([0b11111111, 0b11101110, 0b00001110], 0); break; // A     А
                case 66:  this.p.set([0b11101111, 0b11110110, 0b00001111], 0); break; // B     Б
                case 67:  this.p.set([0b11111111, 0b11011110, 0b00001011], 0); break; // C     Ц
                case 68:  this.p.set([0b11110111, 0b11101110, 0b00001111], 0); break; // D     Д
                case 69:  this.p.set([0b01111111, 0b11011110, 0b00001111], 0); break; // E     Е
                case 70:  this.p.set([0b11111111, 0b11101110, 0b00000111], 0); break; // F     Ф
                case 71:  this.p.set([0b11011111, 0b11011110, 0b00001111], 0); break; // G     Г
                case 72:  this.p.set([0b11111101, 0b11011110, 0b00001111], 0); break; // H     Х
                case 73:  this.p.set([0b01111111, 0b11110110, 0b00001111], 0); break; // I     И
                case 74:  this.p.set([0b11111111, 0b11011110, 0b00000111], 0); break; // J     Й
                case 75:  this.p.set([0b11111111, 0b11011110, 0b00001110], 0); break; // K     К
                case 76:  this.p.set([0b11101111, 0b11101110, 0b00001111], 0); break; // L     Л
                case 77:  this.p.set([0b11111111, 0b11110110, 0b00001110], 0); break; // M     М
                case 78:  this.p.set([0b10111111, 0b11011110, 0b00001111], 0); break; // N     Н
                case 79:  this.p.set([0b11011111, 0b11101110, 0b00001111], 0); break; // O     О
                case 80:  this.p.set([0b01111111, 0b11101110, 0b00001111], 0); break; // P     П
                case 81:  this.p.set([0b11111111, 0b11110110, 0b00000111], 0); break; // Q     Я
                case 82:  this.p.set([0b10111111, 0b11101110, 0b00001111], 0); break; // R     Р
                case 83:  this.p.set([0b11111111, 0b11110110, 0b00001101], 0); break; // S     С
                case 84:  this.p.set([0b10111111, 0b11110110, 0b00001111], 0); break; // T     Т
                case 85:  this.p.set([0b11111111, 0b11011110, 0b00001101], 0); break; // U     У
                case 86:  this.p.set([0b11111011, 0b11101110, 0b00001111], 0); break; // V     Ж
                case 87:  this.p.set([0b11111111, 0b11101110, 0b00001101], 0); break; // W     В
                case 88:  this.p.set([0b11011111, 0b11110110, 0b00001111], 0); break; // X     Ь
                case 89:  this.p.set([0b11111111, 0b11101110, 0b00001011], 0); break; // Y     Ы
                case 90:  this.p.set([0b11111011, 0b11011110, 0b00001111], 0); break; // Z     З
                case 91:  this.p.set([0b11101111, 0b11011110, 0b00001111], 0); break; // [     Ш
                case 92:  this.p.set([0b11111101, 0b11101110, 0b00001111], 0); break; // \     Э
                case 93:  this.p.set([0b11110111, 0b11011110, 0b00001111], 0); break; // ]     Щ
                case 94:  this.p.set([0b11111111, 0b11110110, 0b00001011], 0); break; // ^     Ч
                case 95:  this.p.set([0b11111110, 0b11110110, 0b00001111], 0); break; // _     Ъ     ЗБ
                case 96:  this.p.set([0b11111111, 0b11111010, 0b00000111], 0); break; // Р/Л         [ ` ]
                case 126: this.p.set([0b11111101, 0b11111010, 0b00001111], 0); break; // ПС          [ ~ ]
                case 200: this.p.set([0b11111111, 0b11111010, 0b00001011], 0); break; // Home
                case 201: this.p.set([0b11111111, 0b11111010, 0b00001101], 0); break; // ↑
                case 202: this.p.set([0b11111111, 0b11111010, 0b00001110], 0); break; // ↓
                case 203: this.p.set([0b01111111, 0b11111010, 0b00001111], 0); break; // Tab
                case 204: this.p.set([0b10111111, 0b11111010, 0b00001111], 0); break; // АР2         [ Esc ]
                case 205: this.p.set([0b11101111, 0b11111010, 0b00001111], 0); break; // ←
                case 206: this.p.set([0b11110111, 0b11111010, 0b00001111], 0); break; // ПВТ
                case 207: this.p.set([0b11111011, 0b11111010, 0b00001111], 0); break; // →
            }
            if (shift) this.p[1] &= ~2;
        }
    }
    read(a) {
        switch (a) {
            case 0:
                if (!this.enabledAC) return 0x00;
                return this.p[0];
            case 1:
                if (!this.enabledB) return 0x00;
                this.cnt++;
                if (this.cnt > 2) {
                    this.cnt = 0; this.setKey();
                }
                if (this.tapeEnabled && this.tapePos < this.tape.length) {
                    if (this.tape[this.tapePos++]) this.p[1] |= 0x01;
                    else this.p[1] &= 0xfe;
                    if (this.tapeFixed) this.tapeFixed = false;
                    else if (this.tapePos > 0 && this.tapePos % 16 === 1) { // byte read finished
                        this.tapePos--; this.tapeFixed = true;              // compensate extra read in
                    }                                                       // ROM 0xc377 (tape read byte)
                }
                return this.p[1];
            case 2:
                if (!this.enabledAC) return 0x00;
                return this.p[2];
            case 3: return this.p[3];
        }
    }
    write(a, v) {
        if (a === 3) {
            this.p[3] = v;
            if (v === 0x82) { this.enabledB = true; this.enabledAC = false; } else
            if (v === 0x91) { this.enabledAC = true; this.enabledB = false; } else
            if ((v & 0x0a) === 0x0a) ; else                                 // sound (inverted)
            if ((v & 0x0c) === 0x0c) ; else                                 // rus/lat diod (inverted)
            if ((v & 0x0e) === 0x0e) this.tape.push((v & 0x01) ? 0 : 1);    // write bit to tape (inverted)
        }
    }
}

class SpecMemIO extends MemIO {
    constructor(con) {
        super(con, 0, false);
        this.keybrd = null;
    }
    rd(a) {
        if ((a & 0xf800) === 0xf800) return this.keybrd.read(a & 0x03);
        return this.ram[a];
    }
    wr(a, v) {
        if ((a & 0xf800) === 0xf800) this.keybrd.write(a & 0x03, v); else
        if (this.CPU.RUN && a > 0xbfff) return; else
        this.ram[a] = v;
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
                    downloadFile('tape.bts', new Uint8Array(this.emu.memo.keybrd.tape));
                    this.emu.memo.keybrd.tape.length = 0;
                    break;
                }
                let prm;
                if ((prm = parms[1]) === 'on' || prm === 'off') {
                    this.emu.memo.keybrd.tapeEnabled = prm === 'on';
                    console.log(this.emu.memo.keybrd.tapeEnabled);
                    break;
                }
                if (prm === 'reset') {
                    const pos = (parms.length > 2) ? pi(parms[2], false) : 0;
                    this.emu.memo.keybrd.tapePos = pos;
                    console.log(this.emu.memo.keybrd.tapePos);
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
                    while (i < this.emu.memo.keybrd.tape.length) {
                        val = 0;
                        for (let j = 0; j < 8; j++) {
                            const b1 = this.emu.memo.keybrd.tape[i++],
                                  b2 = this.emu.memo.keybrd.tape[i++];
                            val |= (b1 === 0 && b2 === 1) ? 1 : 0;
                            if (j < 7) val <<= 1;
                        }
                        if (val === 0x00) cnt++;
                        else out();
                    }
                    out(); if (s.length > 0) console.log(s);
                    console.log(`position: ${this.emu.memo.keybrd.tapePos}`);
                    console.log(this.emu.memo.keybrd.tape.slice(prm = this.emu.memo.keybrd.tapePos, prm + 16));
                    break;
                }
                this.emu.memo.keybrd.tape.length = 0;
                this.emu.memo.keybrd.tapeEnabled = false;
                this.emu.memo.keybrd.tapePos = 0;
                const hndl = await preLoadFile(prm);
                this.emu.memo.keybrd.tape.push(...new Uint8Array(await hndl.arrayBuffer()));
                console.log(this.emu.memo.keybrd.tape.length);
                break;
            default: await super.handler(parms, cmd); break;
        }
    }
}

async function main() {
    await loadScript('../emu/github/emu8/js/js8080.js');
    const con = await SpecCon(),
          mem = new SpecMemIO(con),
          cpu = new SpecCpu(con, mem),
          emu = new Emulator(cpu, mem, 0),
          mon = new SpecMonitor(emu),
          kbd = new SpecKbd(con, mon);
    await mon.exec('r c000 SPEC.ROM');
    mon.exec('g c000');
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
