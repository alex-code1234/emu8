'use strict';

// SPEC.ROM:
//     c000 - loader  (mk1989-04), start c000
//     c800 - monitor (mk1988-09)
// loderun.bin - load at 0000, start 0000 (game)
// 4 colors - mk1988_07.png
//            white[00xxxxxx] red[01xxxxxx] green[10xxxxxx] blue[11xxxxxx]
// 8 colors - mk1990-08
// test.i80 - test RAM, keyboard and 4-color video (mk1991-12), load at d400, start d400
// MX - 

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
    }
    async run() {
        this.con.start();
        await super.run();
        this.con.stop();
    }
}

// Intel 8255 PPI
// onread(num)     - read port num; returns port value
// onwrite(num)    - write port num
// onwritebit(bit) - write bit of C port
function Intel8255(onread = null, onwrite = null, onwritebit = null, readCW = 0x00) {
    const ports = new Uint8Array([0, 0, 0, 0x9b]),
    doread = (num, mask = null) => {
        const val = onread ? onread(num) : ports[num];
        return mask ? val & mask : val;
    },
    dowrite = (num, val, half = 0) => {
        if (half === 0) ports[num] = val; else
        if (half === 1) ports[num] = (ports[num] & 0xf0) | (val & 0x0f); else
        ports[num] = (ports[num] & 0x0f) | (val & 0xf0);
        if (onwrite) onwrite(num);
    },
    read = num => {
        switch (num) {
            case 0: return ((ports[3] & 0xf0) === 0x90) ? doread(num) : 0x00;
            case 1: return ((ports[3] & 0x86) === 0x82) ? doread(num) : 0x00;
            case 2:
                const cw = ports[3];
                if ((cw & 0xed) === 0x89) return doread(num);
                if ((cw & 0xe8) === 0x88) return doread(num, 0xf0);
                if ((cw & 0x85) === 0x81) return doread(num, 0x0f);
                return 0x00;
            case 3: return isNaN(readCW) ? ports[3] : readCW;
        }
    },
    write = (num, val) => {
        switch (num) {
            case 0: if ((ports[3] & 0xf0) === 0x80) dowrite(num, val); break;
            case 1: if ((ports[3] & 0x86) === 0x80) dowrite(num, val); break;
            case 2:
                const cw = ports[3];
                if ((cw & 0xed) === 0x80) dowrite(num, val); else
                if ((cw & 0xe8) === 0x80) dowrite(num, val, 2); else
                if ((cw & 0x85) === 0x80) dowrite(num, val, 1);
                break;
            case 3:
                const mode = val & 0x80;
                if (mode) {
                    ports[3] = val;
                    write(0, 0x00); write(1, 0x00); write(2, 0x00);
                } else {
                    const bitnum = (val & 0x0e) >>> 1, bit = val & 0x01;
                    if (bit) ports[2] |= 0x01 << bitnum; else
                    ports[2] &= ~(0x01 << bitnum);
                    if (onwritebit) onwritebit(bitnum, bit);
                }
                break;
        }
    };
    return {read, write, ports};
}

// Intel 8253 PIT
// onout(num) - output num activated
function Intel8253(onout = null) {
    function Counter(idx) {
        let latch = null, armed = false, activate = false, reads = 0, mode = 0, format = 0, tmp;
        const values = new Uint16Array(2),
        setup = val => {
            tmp = (val & 0x30) >>> 4;
            if (tmp === 0) latch = values[1];
            else {
                latch = null; armed = false; activate = false; reads = 0;
                mode = (val & 0x0e) >>> 1;
                format = tmp;
            }
        },
        read = () => {
            if (latch !== null) { tmp = latch; latch = null; return tmp; }
            switch (format) {
                case 1: return values[1] & 0xff;
                case 2: return values[1] >>> 8 & 0xff;
                case 3:
                    tmp = reads ? values[1] >>> 8 & 0xff : values[1] & 0xff;
                    reads++; if (reads > 1) reads = 0;
                    return tmp;
            }
        },
        write = val => {
            switch (format) {
                case 1: values[0] = (values[0] & 0xff00) | (val & 0xff); break;
                case 2: values[0] = (values[0] & 0x00ff) | (val & 0xff) << 8; break;
                case 3:
                    if (reads) values[0] = (values[0] & 0x00ff) | (val & 0xff) << 8;
                    else values[0] = (values[0] & 0xff00) | (val & 0xff);
                    reads++; if (reads > 1) reads = 0;
                    break;
            }
            if (format < 3 || reads === 0) {
                switch (mode) {
                    case 1: case 5: return;                                 // not supported
                    case 2: case 6: values[0]--; break;
                    case 3: case 7: values[0] /= 2; break;
                }
                latch = null; armed = true; activate = true; values[1] = values[0];
            }
        },
        tick = () => {
            if (!armed || --values[1] !== 0) return;
            if (onout && activate) onout(idx);
            switch (mode) {
                case 0: activate = false; break;
                case 2: case 3: case 6: case 7: values[1] = values[0]; break;
                case 4: armed = false; break;
            }
        };
        return {setup, read, write, tick};
    }
    const counters = [Counter(0), Counter(1), Counter(2)],
    read = num => {
        if (num === 3) return 0x00;
        return counters[num].read();
    },
    write = (num, val) => {
        if (num === 3) counters[(val & 0xc0) >>> 6].setup(val);
        else counters[num].write(val);
    };
    return {read, write, counters};
}

// Touch screen keyboard
// layout         - layout descriptor:
//     sec\n
//     row\n
//     ...
//     sec\n
//     row\n
//     ...
//     sec - section descriptor (max 2, first is left side, second is right side)
//     row - row descriptor (max 6):
//         key key key ...
//     key - key descriptor (max 30 for left side, 6 for right side):
//         [ [ ]spc[,lbl][ ] ] (no spaces, enclosed in [] if icon)
//     spc - 1,2,3,4,5 or 20 key span
//     lbl - key face, can be lbl1..lbl2
// kbd(txt, down) - keyboard handler; txt - key text, down - key down (true) / key up (false)
function SoftKeyboard(layout, kbd, kbdElem = document.getElementsByClassName('keyboard')[0]) {
    let tmp, s = '', i = 0;
    const data = layout.split('\n'), n = data.length,
    key = val => {
        let icon = false;
        if (val.charAt(0) === '[' && val.charAt(val.length - 1) === ']') {
            icon = true; val = val.substring(1, val.length - 1);
        }
        const prms = val.split(',');
        let m = prms.length;
        if (m === 3 && prms[1].length === 0) {
            prms[2] = ',' + prms[2]; prms.splice(1, 1); m--;                // special case <,,>
        }
        if (m < 1 || m > 2) throw new Error(`invalid key: ${val} at: ${i - 1}`);
        tmp = prms[0].trim() | 0;
        if (isNaN(tmp)) throw new Error(`expected span number in: ${val} at ${i - 1}`);
        if ([1, 2, 3, 4, 5, 20].indexOf(tmp) < 0) throw new Error(`invalid span value in: ${val} at ${i - 1}`);
        if (m === 1)
            if (tmp === 1) throw new Error(`invalid span value for empty key at: ${i - 1}`);
            else s += `<div class='sp${tmp}'></div>`;
        else {
            const lbls = prms[1].split('..');
            if (lbls.length === 2 && lbls[0].length === 0 & lbls[1].charAt(0) === '.') {
                lbls[0] = '.'; lbls[1] = lbls[1].substring(1);              // special case <...>
            }
            if (lbls.length > 2) throw new Error(`invalid label in ${val} at ${i - 1}`);
            s += `<div class='key${(tmp > 1) ? ' sp' + tmp : ''}${icon ? ' i' : ''}'>`;
            if (lbls.length === 1) s += lbls[0];
            else s += `<span>${lbls[0]}</span><span>${lbls[1]}</span>`;
            s += '</div>';
        }
    },
    row = () => {
        if (i >= n) return;
        const rowdata = data[i++].match(/\S+/g) ?? [];
        for (let j = 0, m = rowdata.length; j < m; j++) key(rowdata[j]);
    },
    section = left => {
        if (i >= n) return;
        if (data[i] !== 'sec') throw new Error(`missing section at: ${i}`);
        i++;
        s += `<div class='section ${left ? 'left' : 'right'}'>`;
        for (let j = 0; j < 6; j++) row();
        s += '</div>';
    },
    generate = () => {
        section(true);
        section(false);
    },
    handler = (e, down) => {
        const elem = (e.target.tagName.toUpperCase() === 'SPAN') ? e.target.parentNode : e.target;
        elem.style.borderColor = down ? 'var(--keypressed)' : 'var(--onbackground)';
        kbd(elem.innerText.replace('\n', ''), down);
        return false;
    };
    kbdElem.ontouchstart = e => handler(e, true);
    kbdElem.ontouchend = e => handler(e, false);
    generate();
    kbdElem.innerHTML = s;
}

function SpecKbd() {
    const ports = new Uint8Array([0xff, 0xff, 0xff, 0]),
    checkKey = txt => {
        switch (txt) {
            case 'НР':     return [0xff, 0xfd, 0xff]; // НР
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
            case 'АР2':    return [0xbf, 0xfb, 0xff]; // АР2
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
    SoftKeyboard(`sec
3      1,F1   1,F2       1,F3       1,F4       1,F5   1,F6   1,F7     1,F8 1,F9 [1,\u25a0] [1,\u25a1] [1,\u2341] 2
3      1,;..+ 1,1..!     1,2.."     1,3..#     1,4..$ 1,5..% 1,6..&   1,7..'     1,8..(  1,9..)     1,0     1,-..=
4      1,J..Й 1,C..Ц     1,U..У     1,K..К     1,E..Е 1,N..Н 1,G..Г   1,[..Ш     1,]..Щ  1,Z..З     1,H..Х  1,:..*
5      1,F..Ф 1,Y..Ы     1,W..В     1,A..А     1,P..П 1,R..Р 1,O..О   1,L..Л     1,D..Д  1,V..Ж     1,\\..Э 1,...>
3 3    1,Q..Я 1,^..Ч     1,S..С     1,M..М     1,I..И 1,T..Т 1,X..Ь   1,B..Б     1,@..Ю  1,,..<     1,/..?  1,_..Ъ
3 3,НР 1,Р/Л  [1,\u21d6] [1,\u2191] [1,\u2193] 1,ТАБ  1,АР2  1,\u0020 [1,\u2190] 1,ПВ    [1,\u2192] 1,ПС    1,ВК`,
    update);
    return {ports};
}

class SpecMemIO extends MemIO {
    constructor(con, ramdisks = 0, colors = 2) {
        super(con, 0, false);
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
        }
        this.tapeEnabled = false; this.tape = []; this.tapePos = 0; this.tapeFixed = false;
        this.ppi = Intel8255(this.ppiRd.bind(this), this.ppiWr.bind(this), this.ppiWrB.bind(this));
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
        return 0x00;
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
        if (a === 0xfff8) { if (this.colors === 16) this.cval = v; } else   // 16-bit color
        if (a === 0xfffc) { this.romEnabled = false; this.ramPage = 0; } else
        if (a === 0xfffd) this.ramPage = (v & 0x03) + 1; else
        if (a === 0xfffe) this.romEnabled = true;
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
                if (down && ((p0 !== 0 && (p0 & k0) !== p0) ||
                        ((p2 & 0x0f) !== 0 && (p2 & k2) !== p2)))           // port A or Cl set, compare with key
                    return (k1 | ~0x02) & tapeBit;                          // no match, reset bits except НР
                return k1 & tapeBit;
            case 2:                                                         // port C
                if (down && p1 !== 0 && (p1 & k1) !== p1)                   // port B set, compare with key
                    return 0xff;                                            // no match, reset bits
                return k2;
        }
    }
    ppiWr(num) {
        
    }
    ppiWrB(bit) {
        if (bit === 7 && this.tapeEnabled)                                  // write bit to tape (inverted)
            this.tape.push((this.ppi.ports[2] & 0x80) ? 0 : 1);
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
            case 'stop': this.emu.stop(); break;
            default: await super.handler(parms, cmd); break;
        }
    }
}

async function main() {
    await loadScript('../emu/github/emu8/js/js8080.js');
    const con = await SpecCon(),
          mem = new SpecMemIO(con, 0, 0),
          cpu = new SpecCpu(con, mem),
          emu = new Emulator(cpu, mem, 0),
          mon = new SpecMonitor(emu),
          kbd = SpecKbd();
    mem.kbd = kbd.ports;                                                    // link kbd and memo
//    await mon.exec('r c000 SPEC.ROM');
//await mon.exec('m 100 3e 91 32 03 ff 3e fb 32 01 ff 3a 02 ff 2f e6 03 47 3a 00 ff 2f e6 34 b0 c9 ' +
//                     'cd 00 01 21 00 00 22 fc 8f cd 15 c8 c3 19 01');
//    await mon.exec('r 0 loderun.bin');
//    mon.exec('g c000');
await mon.exec('r d400 spec_mx/test.i80');
mon.exec('g d400');
//await mon.exec('r 0 spec_mx/Specimx.rom');
//await mon.exec('r 0 spec_mx/nc.rom');
//mon.exec('g 0');
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
