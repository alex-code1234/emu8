'use strict';

const console = {
    _log: null,
    _strarr: (arr) => {
        let res = '[';
        for (let i = 0; i < arr.length; i++) {
            const item = arr[i];
            res += (Array.isArray(item) || ArrayBuffer.isView(item)) ?
                    console._strarr(item) :
                    console._strobj(item);
            if (i < arr.length - 1)
                res += ',';
        }
        res += ']';
        return res;
    },
    _strobj: (obj) => {
        if (obj === null || obj === undefined || typeof obj !== 'object' ||
                obj.toString !== Object.prototype.toString)
            return obj;
        const cache = new Set();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value))
                    return; // circular reference, ignore
                cache.add(value);
            }
            return value;
        });
    },
    _logwrapper: (color, bgcolor = null) => {
        return (...args) => {
            if (console._log === null)
                console._log = document.getElementById('log');
            const length = console._log.innerHTML.length;
            console.log(...args);
            const bg = (bgcolor === null) ? '' : ` background-color: ${bgcolor};`;
            console._log.innerHTML = console._log.innerHTML.substr(0, length) +
                    `<span style="color: ${color};${bg}">` +
                    console._log.innerHTML.substr(length,
                            console._log.innerHTML.length).replaceAll(' ', '&nbsp;') +
                    '</span>';
        };
    },
    CLEAR: [],
    DELIMITER: ' ',
    NB: [], // no break, must be last parameter
    log: (...args) => {
        if (console._log === null)
            console._log = document.getElementById('log');
        let length = args.length, lf = true;
        if (length > 0) {
            if (args[length - 1] === console.NB) {
                lf = false;
                length--;
            }
            for (let i = 0; i < length; i++) {
                let data = args[i];
                if (data === console.CLEAR) {
                    console._log.innerHTML = '';
                    continue;
                }
                data = (Array.isArray(data) || ArrayBuffer.isView(data)) ?
                        console._strarr(data) :
                        console._strobj(data);
                console._log.innerHTML += data;
                if (i < length - 1)
                    console._log.innerHTML += console.DELIMITER;
            }
        }
        if (lf)
            console._log.innerHTML += '<br/>';
    },
    assert: (exp, em, sm = null) => (!exp) ? console.error(em) : console.info(sm ? sm : em),
    clear: () => console.log(console.CLEAR)
};
console.warn = console._logwrapper('yellow');
console.error = console._logwrapper('red');
console.info = console._logwrapper('green');
console.open = function(x, y, w, h, fg = null, bckg = null) {
    const wnd = document.createElement('div');
    x = (x > 0.0 && x <= 1.0) ? (x * 100 | 0) + '%' : x + 'px';
    y = (y > 0.0 && y <= 1.0) ? (y * 100 | 0) + '%' : y + 'px';
    w = (w > 0.0 && w <= 1.0) ? (w * 100 | 0) + '%' : w + 'px';
    h = (h > 0.0 && h <= 1.0) ? (h * 100 | 0) + '%' : h + 'px';
    wnd.setAttribute('style', `position:absolute;left:${x};top:${y};width:${w};height:${h};overflow:auto;`);
    wnd.className = 'log_wnd';
    return [
        document.body.appendChild(wnd),
        (function() {
            const log = (fg === null) ? console.log : console._logwrapper(fg, bckg);
            return function(...args) {
                const temp = console._log;
                console._log = wnd;
                log(...args);
                console._log = temp;
            };
        })()
    ];
};
console.close = function(wnd) {
    document.body.removeChild(Array.isArray(wnd) ? wnd[0] : wnd);
};
console.hide = function(wnd) {
    (Array.isArray(wnd) ? wnd[0] : wnd).style.display = 'none';
};
console.show = function(wnd) {
    (Array.isArray(wnd) ? wnd[0] : wnd).style.display = 'block';
};

function delay(ms) {
    return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

// convert string to number
// accepts seg:offs numbers
function pi(s16, hex = true) {
    const cln = s16.indexOf(':');
    if (cln > 0)
        return (pi(s16.substring(0, cln).trim(), hex) << 4) + pi(s16.substring(cln + 1).trim(), hex);
    const num = hex ? `0x${s16}` : s16;
    if (isNaN(num))
        throw new Error(`invalid ${hex ? 'hex' : 'num'}: ${s16}`);
    return +num;
}

async function loadFile(name, hex) {
    const cont = await fetch(name, {cache: 'no-store'});
    let data;
    if (hex) {
        data = await cont.text();
        if (data.startsWith('<!DOCTYPE '))
            throw new Error(`not found: ${name}`);
    } else {
        const buff = await cont.arrayBuffer();
        data = new Uint8Array(buff);
        if (Array.from(data.slice(0, 10)).map(x => String.fromCharCode(x)).join('') === '<!DOCTYPE ')
            throw new Error(`not found: ${name}`);
    }
    return data;
}

function loadImage(url, image = null) {
    return new Promise((resolve, reject) => {
        if (image === null)
            image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (e) => reject(new Error(`error loading: ${e.target.src}`));
        image.src = url;
    });
}

function downloadFile(name, data) {
    const blob = new Blob([data], {type: 'application/octet-stream'}),
          a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(blob);
    a.click();
}

function toIntelHex(data, addr = 0x100, rec_length = 0x20) {
    const uint = new Uint8Array(1);
    let s = '', sum, count, l = '';
    function dump() {
        if (l.length > 0) {
            uint[0] = sum + count + (addr >>> 8) + (addr & 0xff);
            uint[0] = ~uint[0] + 1;
            const slen = count.toString(16).toUpperCase().padStart(2, '0'),
                  chk = uint[0].toString(16).toUpperCase().padStart(2, '0');
            s += `:${slen}${addr.toString(16).toUpperCase().padStart(4, '0')}00${l}${chk}\n`;
            addr += count;
        }
    }
    for (let i = 0, n = data.length; i < n; i++) {
        if (i % rec_length === 0) {
            dump();
            sum = 0;
            count = 0;
            l = '';
        }
        const byte = data[i] & 0xff;
        l += byte.toString(16).toUpperCase().padStart(2, '0');
        sum += byte;
        count++;
    }
    dump();
    return s + ':00000001FF\n';
}

function cpuName(code) {
    return ['8080', 'Z80', '6502', '8086', '80186'][code];
}

function fmt(num, len = 2, base = 16) {
    return num.toString(base).padStart(len, '0');
}

const LOADED_SCRIPTS = {};

function loadScript(name) {
    if (name.indexOf('.') < 0) name += '.js';
    if (LOADED_SCRIPTS[name]) return Promise.resolve();
    const js = document.createElement('script');
    document.head.appendChild(js);
    js.type = 'text/javascript';
    return new Promise((resolve, reject) => {
        js.onload = () => { LOADED_SCRIPTS[name] = true; resolve(); };
        js.onerror = () => reject(new Error(`script ${name}: load error`));
        js.src = name;
    });
}

async function initModule(opts, name, defaults, ...prms) {
    let tmp = opts.get(name) ?? defaults[0];
    if (tmp)
        await loadScript(tmp);
    const fncn = opts.get(`${name}_name`) ?? defaults[1] ?? tmp,
          fnc = window[fncn];
    if (!fnc)
        throw new Error(`function ${fncn}: not found`);
    return await fnc(...prms);
}

function ArrMemo(arr) { return {'rd': a => arr[a], 'wr': (a, v) => arr[a] = v}; }

function oscilloscope(parent, time_fnc, {
    width = 1000,
    maxpoints = 1000,
    background = '#000000',
    configs = [{}]
} = {}) {
    const e = document.createElement('canvas'),
          ps = parent.currentStyle ?? getComputedStyle(parent);
    e.width = width; e.height = parseInt(ps.height) - 5; e.style.backgroundColor = ps.backgroundColor;
    parent.appendChild(e);
    const canvas = e.getContext('2d'),
          confs = [], points = [], times = [];
    let len, pulse;
    function init(cfgs) {
        confs.length = 0;
        len = cfgs.length;
        pulse = (e.height - len * 5 - 5) / len | 0;
        for (let i = 0; i < len; i++) {
            const cfg = {'mask': 0x80, 'color': '#90f9f0', 'width': 1, ...cfgs[i]};
            cfg.y = (5 + pulse) * (i + 1);
            confs.push(cfg);
        }
    }
    async function draw() {
        const length = points.length;
        if (length < 2) return;
        const xmin = times[0],
              xmax = times[length - 1],
              xsce = (e.width - 1) / (xmax - xmin),
              xs = [];
        canvas.clearRect(0, 0, e.width, e.height);
        for (let i = 0; i < len; i++) {
            const cfg = confs[i];
            canvas.strokeStyle = cfg.color;
            canvas.lineWidth = cfg.width;
            canvas.beginPath();
            let x, y, xn, yn;
            for (let j = 0; j < length; j++) {
                if (i > 0) xn = xs[j];
                else {
                    xn = (times[j] - xmin) * xsce | 0;
                    xs.push(xn);
                }
                yn = cfg.y - ((points[j] & cfg.mask) ? pulse : 0);
                if (j === 0) canvas.moveTo(xn, yn);
                else {
                    canvas.lineTo(xn, y);
                    if (yn !== y) canvas.lineTo(xn, yn);
                }
                x = xn; y = yn;
            }
            canvas.stroke();
        }
        await delay(100);
    }
    init(configs);
    return {
        'update': value => {
            if (times.length > maxpoints) {
                times.shift(); points.shift();
            }
            times.push(time_fnc());
            points.push(value);
            draw();
        },
        'clear': () => {
            times.length = 0; points.length = 0;
            canvas.clearRect(0, 0, e.width, e.height);
        },
        'set': cfgs => { init(cfgs); draw(); },
        'width': wdth => {
            if (wdth && width !== wdth) { width = wdth; e.width = width; draw(); }
            return width;
        },
        'points': pts => {
            if (pts && maxpoints !== pts) {
                maxpoints = pts;
                const diff = points.length - maxpoints;
                if (diff > 0) { times.splice(0, diff); points.splice(0, diff); draw(); }
            }
            return maxpoints;
        }
    };
}
