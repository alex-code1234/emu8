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
// 30..37 Foreground Colors (black,  blue,   green,   cyan,   red,   magenta,   brown,  l_gray)
// 40..47 Background Colors (d_gray, l_blue, l_green, l_cyan, l_red, l_magenta, yellow, white)
async function VT_100(screen, {
    COLORS = [
        '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
        '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'
    ],
    FONT_WIDTH = 9, FONT_HEIGHT = 16, FONT_OFFSET = 4,
    SCR_WIDTH = 80, SCR_HEIGHT = 25,
    FONT_G0 = 'CP437', FONT_G1 = null, AA = false        // anti alias
} = {}) {
    if (typeof screen === 'string')
        screen = document.getElementById(screen);
    const canvas = screen.getContext('2d'),
          keys = [],                                     // keyboard buffer
          ps = [],                                       // vt100 ESC parameters
    toRGB = c => {
        if (c.charAt(0) === '#')
            return [+`0x${c.substr(1, 2)}`, +`0x${c.substr(3, 2)}`, +`0x${c.substr(5, 2)}`];
        return c.substr(4, c.length - 5).split(',').map(e => +e.trim());
    };
    let inesc = false, esc = '',                         // vt100 ESC sequences
        x = 0, y = 0,                                    // vt100 cursor
        fi = 7, bi = 0,                                  // vt100 color indexes
        f = COLORS[fi], b = COLORS[bi], bright = false,  // vt100 colors
        ff = toRGB(f), bb = toRGB(b),                    // vt100 RGB colors
        sx, sy, sfi, sbi, sbright, inprms = false,       // vt100 parameters
        cv = true,                                       // cursor visibility
        chsize = FONT_WIDTH * FONT_HEIGHT,               // char bitmap size
        font, font0, font1 = null;                       // font bitmaps
    const cursor = () => {
        if (!cv) return;
        let cx, cy, i = 0;
        const chr = canvas.getImageData(cx = x * FONT_WIDTH,
              cy = y * FONT_HEIGHT, FONT_WIDTH, FONT_HEIGHT),
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
            const copy = canvas.getImageData(0, FONT_HEIGHT, screen.width,
                    screen.height - FONT_HEIGHT);
            canvas.putImageData(copy, 0, 0);
            clearScr(0, screen.height - FONT_HEIGHT, screen.width, FONT_HEIGHT);
        }
    },
    cout = ccode => {
        const cx = x * FONT_WIDTH, cy = y * FONT_HEIGHT,
              img = canvas.getImageData(cx, cy, FONT_WIDTH, FONT_HEIGHT),
              dat = img.data;
        let midx = ccode * chsize, i = 0;
        while (i < dat.length) {
            const c = font[midx++] ? ff : bb;
            dat[i++] = c[0];
            dat[i++] = c[1];
            dat[i++] = c[2];
            i++;
        }
        canvas.putImageData(img, cx, cy);
    },
    outChar = ccode => {
        cout(ccode);
        if (cv) {
            x++;
            if (x >= SCR_WIDTH) { x = 0; newLine(); }
            cursor();
        }
    },
    clearScr = (x = 0, y = 0, w = screen.width, h = screen.height) => {
        b = COLORS[0];
        bb = toRGB(b);
        canvas.fillStyle = b;
        canvas.fillRect(x, y, w, h);
    },
    numcode = num => {
        const str = num.toString(), res = [];
        for (let i = 0, n = str.length; i < n; i++)
            res.push(str.charCodeAt(i) & 0xff);
        return res;
    },
    chrn = chr => chr.charCodeAt(0),
    processEsc = chr => {
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
                ff = toRGB(f); bb = toRGB(b);
                break;
            case '[u': cursor(); x = sx; y = sy; cursor(); break;
            case '[A': cursor(); y -= ps[0] ? ps[0] | 0 : 1; if (y < 0) y = 0; cursor(); break;
            case '[B':
                cursor(); y += ps[0] ? ps[0] | 0 : 1; if (y >= SCR_HEIGHT) y = SCR_HEIGHT - 1;
                cursor();
                break;
            case '[C':
                cursor(); x += ps[0] ? ps[0] | 0 : 1; if (x >= SCR_WIDTH) x = SCR_WIDTH - 1;
                cursor();
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
                    case '1': clearScr(0, 0, screen.width, (y + 1) * FONT_HEIGHT); cursor();
                    break;
                    case '2': clearScr(); x = 0; y = 0; cursor(); break;
                    default:
                        clearScr(0, t1 = y * FONT_HEIGHT, screen.width, screen.height - t1);
                        cursor();
                        break;
                }
                break;
            case '[K':
                let t2;
                switch (ps[0]) {
                    case '1':
                        clearScr(0, y * FONT_HEIGHT, (x + 1) * FONT_WIDTH, FONT_HEIGHT); cursor();
                        break;
                    case '2':
                        clearScr(0, y * FONT_HEIGHT, screen.width, FONT_HEIGHT); cursor();
                        break;
                    default:
                        clearScr(t2 = x * FONT_WIDTH, y * FONT_HEIGHT, screen.width - t2,
                                FONT_HEIGHT);
                        cursor();
                        break;
                }
                break;
            case '[m':
                for (let i = 0, n = ps.length; i < n; i++) {
                    let num = pi(ps[i], false);
                    if (num === 0) {
                        fi = 7; bi = 0; f = COLORS[fi]; b = COLORS[bi]; bright = false;
                        ff = toRGB(f); bb = toRGB(b);
                    }
                    else if (num === 1 && bi < 8) {
                        fi += 8; bi += 8; f = COLORS[fi]; b = COLORS[bi]; bright = true;
                        ff = toRGB(f); bb = toRGB(b);
                    }
                    else if (num === 2 && bi >= 8) {
                        fi -= 8; bi -= 8; f = COLORS[fi]; b = COLORS[bi]; bright = false;
                        ff = toRGB(f); bb = toRGB(b);
                    }
                    else if (num >= 30 && num <= 37) {
                        num -= 30; if (bright) num += 8; fi = num; f = COLORS[fi];
                        ff = toRGB(f);
                    }
                    else if (num >= 40 && num <= 47) {
                        num -= 40; if (bright) num += 8; bi = num; b = COLORS[bi];
                        bb = toRGB(b);
                    }
                }
                break;
            case '[n':
                if (ps[0] === '6')
                    keys.push(27, chrn('['), ...numcode(y + 1), chrn(';'), ...numcode(x + 1),
                            chrn('R'));
                else {
                    inesc = false; esc = '';
                    throw new Error(`unknown ESC index: ${ps[0]}`);
                }
                break;
            case '(': font = font0; break;
            case ')': if (font1 !== null) font = font1; break;
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
    display = ccode => {
        switch (ccode) {
            case 0x08: cursor(); if (x > 0) x--; cursor(); break;
            case 0x0a: cursor(); newLine(); cursor(); break;
            case 0x0d: cursor(); x = 0; cursor(); break;
            case 0x1b: inesc = true; break;
            default:
                if (inesc) processEsc(String.fromCharCode(ccode)); else outChar(ccode);
                break;
        }
    },
    loadFont = async (fname, debug = false) => {
        const fmasks = new Uint8Array(chsize * 256),
              fnt = `${FONT_HEIGHT}px ${fname}`,
              style = getComputedStyle(screen),
              orig_width = style.width, orig_height = style.height;
        await document.fonts.load(fnt);
        screen.width = FONT_WIDTH * SCR_WIDTH; screen.height = FONT_HEIGHT * SCR_HEIGHT;
        screen.style.width = `${screen.width}px`; screen.style.height = `${screen.height}px`;
        canvas.font = fnt;
        canvas.fillStyle = '#000000';
        canvas.fillRect(0, 0, screen.width, screen.height);
        canvas.fillStyle = '#ffffff';
        let x = FONT_WIDTH, y = FONT_HEIGHT, midx = chsize;
        for (let i = 1; i < 256; i++) {
            canvas.fillText(String.fromCharCode(i), x, y - FONT_OFFSET);
            const d = canvas.getImageData(x, y - FONT_HEIGHT, FONT_WIDTH, FONT_HEIGHT).data;
            for (let k = 0, j = 0; j < chsize; k += 4, j++) {
                const dr = d[k], dg = d[k + 1], db = d[k + 2], da = d[k + 3],
                      dot = (dr > 100 && dg > 100 && db > 100 && da > 100) ? 1 : 0;
                fmasks[midx++] = dot;
            }
            x += FONT_WIDTH;
            if (x >= screen.width) {
                x = 0; y += FONT_HEIGHT;
            }
        }
        if (debug) for (let i = 0; i < 256; i++) {
            let midx = i * chsize, bitmap, sm = 1 << FONT_WIDTH - 1;
            console.log(i.toString(16).padStart(2, '0'));
            for (let j = 0; j < FONT_HEIGHT; j++) {
                bitmap = 0;
                for (let k = 0; k < FONT_WIDTH; k++) {
                    const mask = fmasks[midx++];
                    bitmap |= (mask ? sm : 0) >> k;
                }
                console.log(bitmap.toString(2).padStart(FONT_WIDTH, '0'));
            }
        }
        screen.style.width = orig_width; screen.style.height = orig_height;
        return fmasks;
    },
    setWidth = (cols, rows) => {
        SCR_WIDTH = cols;
        if (rows !== undefined) SCR_HEIGHT = rows;
        screen.width = FONT_WIDTH * SCR_WIDTH; screen.height = FONT_HEIGHT * SCR_HEIGHT;
        clearScr(); cursor();
    },
    setColors = (clrs) => {
        for (let i = 0, n = clrs.length - 2; i <= n; i += 2)
            COLORS[clrs[i]] = clrs[i + 1];
        x = 0; y = 0; fi = 7; bi = 0; f = COLORS[fi]; b = COLORS[bi]; bright = false;
        ff = toRGB(f); bb = toRGB(b);
        clearScr(); cursor();
    };
    if (!AA) {
        screen.style.imageRendering = 'pixelated';
        canvas.imageSmoothingEnabled = false;
    }
    font0 = await loadFont(FONT_G0);
    if (FONT_G1 !== null) font1 = await loadFont(FONT_G1);
    font = font0;
    clearScr(); cursor();
    return {
        display,
        'kbd': keys,
        'toggle': () => screen.style.display = (screen.style.display !== 'inline-block') ?
                'inline-block' : 'none',
        setWidth,
        setColors,
        'xy': (xx, yy) => { x = xx; y = yy; },
        'print': str => {
            str = str                                    // string conversion:
                    .replaceAll('^', '\x1b')             // ^ to ESC
                    .replaceAll('_', ' ')                // _ to space
                    .replaceAll('~', '\r\n');            // ~ to CRLF
            for (let i = 0, n = str.length; i < n; i++)
                display(str.charCodeAt(i) & 0xff);
        },
        canvas,
        'output': (xx, yy, fg, bg, ccode) => {           // direct output
            x = xx; y = yy;
            f = COLORS[fg]; b = COLORS[bg];
            ff = toRGB(f); bb = toRGB(b);
            cout(ccode);
        },
        loadFont
    };
}

// graphic monitor emulation
// canvas        - context2d to use, view size specified for the element
// width, height - actual graphic resolution
// draw          - function(pixels), pixels - uint32 array width x height
// rate          - screen refresh rate frames/sec
function GMonitor(canvas, width, height, draw, rate = 24) {
    const elem = canvas.canvas;
    elem.style.width = elem.width + 'px';   // requested view size
    elem.style.height = elem.height + 'px'; // specified for canvas element
    elem.width = width;                     // actual resolution
    elem.height = height;
    const idata = canvas.getImageData(0, 0, width, height),
          pixs = new Uint32Array(idata.data.buffer),
          frameRate = 1000.0 / rate,
    render = nts => {
        if (!running) return;
        requestAnimationFrame(render);
        const elapsed = nts - ts;
        if (elapsed >= frameRate) {
            ts = nts - elapsed % frameRate;
            if (draw(pixs))
                canvas.putImageData(idata, 0, 0);
        }
    },
    start = () => {                         // start rendering
        running = true;
        requestAnimationFrame(render);
    },
    stop = () => running = false;           // stop rendering
    let ts = 0, running;
    return {start, stop};
}
