'use strict';

// VT-100 terminal
// COLORS: VGA                (default)
// FONT:   9x16  WIDTHxHEIGHT (default)
// SCR:    80x25 WIDTHxHEIGHT (default)
// supported ESC codes:
// Query Cursor Position <ESC>[6n                    returns <ESC>[{ROW};{COLUMN}R in kbd buffer
// Font Set G0           <ESC>(
// Font Set G1           <ESC>)
// Save Cursor           <ESC>[s
// Restore Cursor        <ESC>[u
// Save Cursor&Attrs     <ESC>7
// Restore Cursor&Attrs  <ESC>8
// Cursor Home           <ESC>[{{ROW=1};{COLUMN=1}}H
// Force Cursor Position <ESC>[{{ROW=1};{COLUMN=1}}f
// Cursor Up             <ESC>[{COUNT=1}A
// Cursor Down           <ESC>[{COUNT=1}B
// Cursor Forward        <ESC>[{COUNT=1}C
// Cursor Backward       <ESC>[{COUNT=1}D
// Erase End of Line     <ESC>[K
// Erase Start of Line   <ESC>[1K
// Erase Line            <ESC>[2K
// Erase Down            <ESC>[J
// Erase Up              <ESC>[1J
// Erase Screen          <ESC>[2J
// Show cursor (default) <ESC>[?25h
// Hide cursor           <ESC>[?25l
// Set Attribute Mode    <ESC>[{attr1};...;{attrn}m
// attributes:
// 0      Reset all attributes
// 1      Bright
// 2      Dim (default)
// 30..37 Foreground Colors (black, red, green, yellow, blue, magenta, cyan, white)
// 40..47 Background Colors (black, red, green, yellow, blue, magenta, cyan, white)
async function VT_100(screen, {
    COLORS = [
        '#000000', '#aa0000', '#00aa00', '#aa5500', '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
        '#000000', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff'
    ],
    FONT_WIDTH = 9, FONT_HEIGHT = 16, FONT_OFFSET = 12, SCR_WIDTH = 80, SCR_HEIGHT = 25,
    FONT_G0 = 'CP437', FONT_G1 = null
} = {}) {
    await document.fonts.load(`${FONT_HEIGHT}px ${FONT_G0}`); // force font loading
    if (FONT_G1 !== null)
        await document.fonts.load(`${FONT_HEIGHT}px ${FONT_G1}`);
    if (typeof screen === 'string')
        screen = document.getElementById(screen);
    const canvas = screen.getContext('2d'),
          keys = [],                                     // keyboard buffer
          ps = [],                                       // vt100 ESC parameters
          origWidth = SCR_WIDTH;                         // actual screen width (others will scale)
    let inesc = false, esc = '',                         // vt100 ESC sequences
        x = 0, y = 0,                                    // vt100 cursor
        fi = 7, bi = 0,                                  // vt100 color indexes
        f = COLORS[fi], b = COLORS[bi], bright = false,  // vt100 colors
        sx, sy, sfi, sbi, sbright, inprms = false,       // vt100 parameters
        cv = true;                                       // cursor visibility
    const cursor = () => {
        if (!cv) return;
        let cx, cy, i = 0;
        const chr = canvas.getImageData(cx = 5 + x * FONT_WIDTH,
              cy = 5 + y * FONT_HEIGHT, FONT_WIDTH, FONT_HEIGHT),
              data = chr.data;
        while (i < data.length) {
            data[i] = 255 - data[i++];
            data[i] = 255 - data[i++];
            data[i] = 255 - data[i++];
            i++;
        }
        canvas.putImageData(chr, cx, cy);
    },
    newLine = () => {
        y++;
        if (y >= SCR_HEIGHT) {
            y = SCR_HEIGHT - 1;
            const copy = canvas.getImageData(5, 5 + FONT_HEIGHT, screen.width - 10,
                    screen.height - FONT_HEIGHT - 10);
            canvas.putImageData(copy, 5, 5);
            clearScr(5, screen.height - FONT_HEIGHT - 5, screen.width - 10, FONT_HEIGHT);
        }
    },
    outChar = (chr) => {
        const cx = x * FONT_WIDTH + 5,
              cy = y * FONT_HEIGHT + 5;
        clearScr(cx, cy, FONT_WIDTH, FONT_HEIGHT);
        canvas.fillStyle = f;
        canvas.fillText(chr, cx, cy + FONT_OFFSET);
        if (cv) {
            x++;
            if (x >= SCR_WIDTH) { x = 0; newLine(); }
            cursor();
        }
    },
    clearScr = (x = 0, y = 0, w = screen.width, h = screen.height) => {
        canvas.fillStyle = b;
        canvas.fillRect(x, y, w, h);
    },
    numcode = (num) => {
        const str = num.toString(), res = [];
        for (let i = 0, n = str.length; i < n; i++)
            res.push(str.charCodeAt(i) & 0xff);
        return res;
    },
    chrn = (chr) => chr.charCodeAt(0),
    processEsc = (chr) => {
        if (inprms) {
            if ((chr >= '0' && chr <= '9') || chr === '?') {
                ps[ps.length - 1] += chr; return;
            }
            if (chr === ';') {
                ps.push(''); return;
            }
            inprms = false;
        }
        esc += chr;
        switch (esc) {
            case '[':  inprms = true; ps.length = 0; ps.push(''); return;
            case '7': sx = x; sy = y; sfi = fi; sbi = bi; sbright = bright; break;
            case '[s': sx = x; sy = y; break;
            case '8':
                cursor(); x = sx; y = sy; cursor();
                fi = sfi; bi = sbi; bright = sbright; f = COLORS[fi]; b = COLORS[bi];
                break;
            case '[u': cursor(); x = sx; y = sy; cursor(); break;
            case '[A': cursor(); y -= ps[0] ? ps[0] | 0 : 1; if (y < 0) y = 0; cursor(); break;
            case '[B':
                cursor(); y += ps[0] ? ps[0] | 0 : 1; if (y >= SCR_HEIGHT) y = SCR_HEIGHT - 1; cursor();
                break;
            case '[C':
                cursor(); x += ps[0] ? ps[0] | 0 : 1; if (x >= SCR_WIDTH) x = SCR_WIDTH - 1; cursor();
                break;
            case '[D': cursor(); x -= ps[0] ? ps[0] | 0 : 1; if (x < 0) x = 0; cursor(); break;
            case '[H':
            case '[f':
                let t0;
                cursor();
                x = ((t0 = ps[1]) === undefined) ? 0 : (t0 <= SCR_WIDTH) ? t0 - 1 : SCR_WIDTH - 1;
                y = ((t0 = ps[0]) === '') ? 0 : (t0 <= SCR_HEIGHT) ? t0 - 1 : SCR_HEIGHT - 1;
                cursor();
                break;
            case '[J':
                let t1;
                switch (ps[0]) {
                    case '1': clearScr(5, 5, screen.width - 10, (y + 1) * FONT_HEIGHT); cursor(); break;
                    case '2': clearScr(); x = 0; y = 0; cursor(); break;
                    default:
                        clearScr(5, t1 = 5 + y * FONT_HEIGHT, screen.width - 10, screen.height - 5 - t1);
                        cursor();
                        break;
                }
                break;
            case '[K':
                let t2;
                switch (ps[0]) {
                    case '1':
                        clearScr(5, 5 + y * FONT_HEIGHT, (x + 1) * FONT_WIDTH, FONT_HEIGHT); cursor();
                        break;
                    case '2':
                        clearScr(5, 5 + y * FONT_HEIGHT, screen.width - 10, FONT_HEIGHT); cursor();
                        break;
                    default:
                        clearScr(t2 = 5 + x * FONT_WIDTH, 5 + y * FONT_HEIGHT, screen.width - 5 - t2,
                                FONT_HEIGHT);
                        cursor();
                        break;
                }
                break;
            case '[m':
                for (let i = 0, n = ps.length; i < n; i++) {
                    let num = pi(ps[i], false);
                    if (num === 0) { fi = 7; bi = 0; f = COLORS[fi]; b = COLORS[bi]; bright = false; }
                    else if (num === 1 && bi < 8) {
                        fi += 8; bi += 8; f = COLORS[fi]; b = COLORS[bi]; bright = true;
                    }
                    else if (num === 2 && bi >= 8) {
                        fi -= 8; bi -= 8; f = COLORS[fi]; b = COLORS[bi]; bright = false;
                    }
                    else if (num >= 30 && num <= 37) {
                        num -= 30; if (bright) num += 8; fi = num; f = COLORS[fi];
                    }
                    else if (num >= 40 && num <= 47) {
                        num -= 40; if (bright) num += 8; bi = num; b = COLORS[bi];
                    }
                }
                break;
            case '[n':
                if (ps[0] === '6')
                    keys.push(27, chrn('['), ...numcode(y + 1), chrn(';'), ...numcode(x + 1), chrn('R'));
                else {
                    inesc = false; esc = '';
                    throw new Error(`unknown ESC index: ${ps[0]}`);
                }
                break;
            case '(':
                canvas.font = `${FONT_HEIGHT}px ${FONT_G0}`;
                break;
            case ')':
                if (FONT_G1 !== null)
                    canvas.font = `${FONT_HEIGHT}px ${FONT_G1}`;
                break;
            case '[h':
                if (ps[0] !== '?25') throw new Error(`unknown ESC: [${ps[0]}h`);
                if (!cv) { cv = true; cursor(); }
                break;
            case '[l':
                if (ps[0] !== '?25') throw new Error(`unknown ESC: [${ps[0]}l`);
                if (cv) { cursor(); cv = false; }
                break;
            default:
                inesc = false; let tmp = esc; esc = '';
                throw new Error(`unknown ESC: ${tmp}`);
        }
        inesc = false; esc = '';
    },
    display = (chr) => {
        switch (chr) {
            case 0x08: cursor(); if (x > 0) x--; cursor(); break;
            case 0x0a: cursor(); newLine(); cursor(); break;
            case 0x0d: cursor(); x = 0; cursor(); break;
            case 0x1b: inesc = true; break;
            default:
                chr = String.fromCharCode(chr);
                if (inesc) processEsc(chr); else outChar(chr);
                break;
        }
    },
    setWidth = (width) => {
        SCR_WIDTH = width; screen.width = FONT_WIDTH * width + 10;
        canvas.font = `${FONT_HEIGHT}px ${FONT_G0}`;
        let trn, mrg;
        if (width === origWidth) { trn = null; mrg = null; }
        else {
            let tmp = FONT_WIDTH * (origWidth - width);
            if (tmp > 0) tmp += 10; else tmp -= 5;
            trn = `scale(${origWidth / width}, 1)`; mrg = `${tmp / 2 | 0}px`;
        }
        screen.style.transform = trn; screen.style.marginLeft = mrg;
        clearScr(); cursor();
    },
    setColors = (clrs) => {
        for (let i = 0, n = clrs.length - 2; i <= n; i += 2)
            COLORS[i] = clrs[i + 1];
        x = 0; y = 0; fi = 7; bi = 0; f = COLORS[fi]; b = COLORS[bi]; bright = false;
        clearScr(); cursor();
    };
    screen.height = FONT_HEIGHT * SCR_HEIGHT + 10;
    setWidth(SCR_WIDTH);
    return {
        display,
        'kbd': keys,
        'toggle': () => screen.style.display = (screen.style.display !== 'inline-block') ?
                'inline-block' : 'none',
        setWidth,
        setColors,
        'xy': (xx, yy) => { x = xx; y = yy; },
        'print': (str) => {
            str = str                                    // string conversion:
                    .replaceAll('^', '\x1b')             // ^ to ESC
                    .replaceAll('_', ' ')                // _ to space
                    .replaceAll('~', '\r\n');            // ~ to CRLF
            for (let i = 0, n = str.length; i < n; i++)
                display(str.charCodeAt(i) & 0xff);
        },
        canvas,
        'output': (xx, yy, fg, bg, chr) => {             // direct output
            x = xx; y = yy;
            f = COLORS[fg]; b = COLORS[bg];
            const cx = x * FONT_WIDTH + 5,
                  cy = y * FONT_HEIGHT + 5;
            canvas.fillStyle = b;
            canvas.fillRect(cx, cy, FONT_WIDTH, FONT_HEIGHT);
            canvas.fillStyle = f;
            canvas.fillText(String.fromCharCode(chr), cx, cy + FONT_OFFSET);
        }
    };
}
