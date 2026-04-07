'use strict';

function Terminal() {
    const kbd = [],
    display = v => {
        const chr = String.fromCharCode(v);
        if (enabled) console.log(chr, console.NB);
        else str += chr;
    },
    send = async (txt, chk = null, tmo = 100) => {
        if (chk) enabled = false;
        txt = txt.toUpperCase();
        for (let i = 0, n = txt.length; i < n; i++) kbd.push(txt.charCodeAt(i));
        if (txt.length > 0) devkbd.setFlag(1);
        if (chk) {
            let count = 0, match = 0;
            while (true) {
                if (str.endsWith(chk)) { match++; if (match > 3) break; }
                else if (match > 0) match = 0;
                count++; if (count > tmo) break;
                await delay(100);
            }
            enabled = true;
            const res = str;
            str = '';
            if (count > tmo) throw new Error(res);
            return res;
        }
        return null;
    },
    setDevKbd = dev => devkbd = dev;
    let enabled = true, str = '', devkbd;
    return {kbd, display, send, setDevKbd};
}

function RX01fs(emu) {
    const BUF = new Uint8Array(128), mmm = ArrMemo(BUF),
          DSK = Disk(77, 26, 128, 1, 0x10000, null),
    toBUF = data12 => {
        let i = 0, count = 0, part = 0;
        while (count < 96) {
            const intf = data12[i++];
            if (part) {
                BUF[count++] |= (intf & 0o7400) >> 8;
                BUF[count++] = intf & 0o0377;
                part = 0;
            } else {
                BUF[count++] = (intf & 0o7760) >> 4;
                BUF[count] = (intf & 0o0017) << 4;
                part = 1;
            }
        }
        for (; count < 128; count++) BUF[count] = BUF[96];
    },
    fromBUF = () => {
        const data12 = [];
        let i = 0, count = 0, part = 0;
        while (count < 96)
            if (part) {
                data12.push(((BUF[count++] & 0o17) << 8) | BUF[count++]);
                part = 0;
            } else {
                data12.push((BUF[count++] << 4) | (BUF[count] >> 4));
                part = 1;
            }
        return data12;
    },
    blockTS = (num, interleave = 2, skew = 0) => {
        const ts = [],
              n4 = num * 4;
        for (let i = 0; i < 4; i++) {
            const s_tot = n4 + i,
                  trk = (s_tot / 26 | 0) + 1,
                  pos = s_tot % 26;
            let ilv = pos * interleave;
            if (ilv >= 26) ilv -= 25;
            const sec = (ilv + skew * (trk - 1)) % 26 + 1;
            ts.push([trk, sec]);
        }
        return ts;
    },
    block12 = (num, data12) => {
        const res = data12 ? undefined : [],
              ts = blockTS(num);
        let offs = 0;
        for (let i = 0; i < 4; i++) {
            const [trk, sec] = ts[i];
            if (data12) {
                toBUF(data12.slice(offs, offs + 64));
                offs += 64;
            }
            const err = DSK.transfer(trk, sec, 0, mmm, !data12);
            if (err) throw new Error(`disk error: ${err}`);
            if (!data12) res.push(...fromBUF());
        }
        return res;
    },
    fromDir = data12 => {
        const entries = [];
        let begin = data12[1],
            ofs = 5;
        if (data12[5] === 0) {
            begin += ~(data12[6] - 1) & 0o7777;
            ofs += 2;
        }
        while (ofs < 256) {
            const name = (emu.to6bitASCII(data12[ofs++]) +
                          emu.to6bitASCII(data12[ofs++]) +
                          emu.to6bitASCII(data12[ofs++]) + '.' +
                          emu.to6bitASCII(data12[ofs++]))
                      .replaceAll('@', ''),
                  date = data12[ofs++],
                  size = ~(data12[ofs++] - 1) & 0o7777;
            entries.push({name, date, size, begin});
            begin += size;
            let tmp = data12[ofs];
            if (tmp === 0) {
                ofs++;
                tmp = data12[ofs++];
                if (tmp === 0o7777) break;
                begin += ~(tmp - 1) & 0o7777;
            }
            else if (tmp === 0o5752 && data12[ofs + 1] === 0o3047) break;
        }
        return {'head0': data12[0], 'begin': data12[1], 'head3': data12[3], entries};
    },
    toDir = dir => {
        const data12 = new Array(0o400),
        toNeg = v => (~v + 1) & 0o7777,
        chrs = '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_ !"#$%&\'()*+,-./0123456789:;<=>?',
        to2Ch = s => {
            const p = s.indexOf('.'),
            to12 = c2 => chrs.indexOf(c2.charAt(0)) << 6 | chrs.indexOf(c2.charAt(1));
            if (p <= 0) throw new Error(`invalid file name: ${s}`);
            let name = s.substring(0, p), ext = s.substring(p + 1);
            while (name.length < 6) name += '@';
            while (ext.length < 2) ext += '@';
            data12[idx++] = to12(name.substring(0, 2));
            data12[idx++] = to12(name.substring(2, 4));
            data12[idx++] = to12(name.substring(4, 6));
            data12[idx++] = to12(ext);
        };
        let begin = dir.begin, idx = 5;
        data12[1] = begin; data12[2] = 0o0000; data12[4] = 0o7777;
        for (let i = 0, n = dir.entries.length; i < n; i++) {
            const entry = dir.entries[i];
            if (entry.begin !== begin) {
                const diff = entry.begin - begin;
                data12[idx++] = 0o0000; data12[idx++] = toNeg(diff);
                begin += diff
            }
            to2Ch(entry.name);
            data12[idx++] = entry.date;
            data12[idx++] = toNeg(entry.size);
            begin += entry.size;
        }
        data12[idx++] = 0o0000; data12[idx++] = 0o7777;
        let count = 1;
        while (idx < 0o0400) data12[idx++] = (count++ % 2) ? 0o5752 : 0o3047;
        data12[0] = dir.head0; data12[3] = dir.head3;
        return data12;
    },
    fromTxt = data12 => {
        let s = '', tmp;
        for (let i = 0, n = data12.length; i < n; i++) {
            const wrd = data12[i];
            s += String.fromCharCode(wrd & 0x7f);
            if (i % 2 === 0) tmp = wrd & 0x700;
            else s += String.fromCharCode(tmp >> 4 | (wrd & 0xf00) >> 8);
        }
        return s.replaceAll('\r\n\n', '\n').replaceAll('\0', '').replaceAll('\u001a', '');
    },
    toTxt = txt => {
        txt = txt.toUpperCase().replaceAll('\n', '\r\n\n') + '\u001a';
        while ((txt.length % 3) !== 0) txt += '\0';
        const n = txt.length, data12 = [];
        for (let i = 0; i < n; i += 3) {
            const c1 = txt.charCodeAt(i) | 0o200,
                  c2 = txt.charCodeAt(i + 1) | 0o200,
                  c3 = txt.charCodeAt(i + 2) | 0o200;
            data12.push(((c3 << 4) & 0xf00) | (c1 & 0xff));
            data12.push(((c3 << 8) & 0xf00) | (c2 & 0xff));
        }
        while ((data12.length % 256) !== 0) data12.push(0o0000);
        return data12;
    },
    read = fn => {
        fn = fn.toUpperCase();
        for (const entry of fromDir(block12(1)).entries)
            if (fn === entry.name) {
                const res = [];
                for (let i = entry.begin, n = i + entry.size; i < n; i++)
                    res.push(...block12(i));
                return res;
            }
        throw new Error(`not found: ${fn}`);
    },
    write = (fn, data12) => {
        fn = fn.toUpperCase();
        const BMAX = 494, EMAX = 32, dleng = data12.length,
              dir = fromDir(block12(1)), size = dleng / 256,
              len = dir.entries.length;
        let entry, gap = true,
            eidx = dir.entries.findIndex(e => e.name.toUpperCase() === fn);
        if (eidx < 0) { // new file, find gap
            if (len >= EMAX) throw new Error('directory full');
            entry = {'name': fn, 'date': 0, size};
        } else {        // modified file
            entry = dir.entries[eidx];
            if (entry.size >= size) gap = false; // update in place
            else dir.entries.splice(eidx, 1);    // find gap
            entry.size = size;
        }
        if (gap) {      // find gap to fit new/modified entry
            let begin = dir.begin, idx = 0, found = false;
            while (idx < len) {
                const ent = dir.entries[idx];
                if (ent.begin !== begin) {
                    const diff = ent.begin - begin;
                    if (diff >= entry.size) { found = true; break; }
                    begin += diff
                }
                begin += ent.size;
                idx++;
            }
            entry.begin = begin;
            if (found) dir.entries.splice(idx, 0, entry);
            else dir.entries.push(entry);
        }
        if (entry.begin + entry.size > BMAX) throw new Error('disk full');
        block12(1, toDir(dir)); // save directory
        let blk = entry.begin; eidx = 0;
        while (eidx < dleng) {  // save file
            block12(blk++, data12.slice(eidx, eidx + 256));
            eidx += 256;
        }
    };
    return {DSK, read, write, fromTxt, toTxt, block12, fromDir};
}

function PDP8(mon, trm) {
    const BOOT = [0o6755, 0o5022, 0o7126, 0o1060, 0o6751, 0o7201, 0o4053, 0o4053,
                  0o7104, 0o6755, 0o5054, 0o6754, 0o7450, 0o7610, 0o5046, 0o7402,
                  0o7402, 0o7402, 0o7402, 0o7402, 0o6751, 0o4053, 0o3002, 0o2050,
                  0o5047, 0o0000, 0o6753, 0o5033, 0o6752, 0o5453, 0o7004, 0o6030],
          emu = mon.emu,
    loadPAL = str => { // load PAL listing
        const mem = emu.memo, regs = mem.CPU.cpu.regs, MAXMEM = 32768, sif = regs[IF],
              data = str.split('\n'),
        wm = (a, v) => { regs[IF] = a >> 12; mem.wr(a & 0o7777, v); };
        let ma, vv;
        for (let i = 0, n = data.length; i < n; i++) {
            const s = data[i];
            if (s.length < 11) continue;
            try {
                ma = pi(s.substring(0, 5));
                vv = pi(s.substring(7, 11));
            } catch {
                continue;
            }
            wm(ma, vv);
        }
        regs[IF] = sif;
    },
    currAddr = () => {
        const regs = emu.CPU.cpu.regs;
        return `${fmt(regs[IF], 1)}${fmt(regs[PC], 4)} `;
    },
    memset = (addr, data12) => {
        for (let i = 0, n = data12.length; i < n; i++) emu.memo.wr(addr++, data12[i]);
    },
    regset = () => {
        for (let i = 0, n = coreR.length; i < n; i++) emu.CPU.cpu.regs[i] = coreR[i];
    },
    init = async () => {
        memset(0o0022, BOOT);
        emu.CPU.cpu.reset(); emu.CPU.cpu.regs[PC] = 0o0022;
        emu.CPU.run(); await trm.send('', '.'); emu.stop();        // boot
        coreM = emu.saveCore(); coreR = emu.CPU.cpu.regs.slice(0); // save core
    },
    compile = async fn => {
        if (coreM === null) throw new Error('not initialized');
        const idx = fn.indexOf('.');
        if (idx >= 0) fn = fn.substring(0, idx);
        emu.loadCore(coreM); regset();
        emu.CPU.run();
        let res = await trm.send(`pal8 ${fn},${fn}<${fn}/h\r`, '.');
        emu.stop();
        console.log(res);
    },
    debug = code => {
        loadPAL(code);
        emu.CPU.cpu.reset(); emu.CPU.cpu.regs[PC] = 0o0200;
        return currAddr();
    },
    step = async (stop = null) => {
        if (stop) {
            mon.prepareStop(stop);
            await emu.CPU.run();
        }
        else emu.CPU.cpu.step();
        return currAddr();
    },
    status = () => emu.CPU.cpu.cpuStatus();
    let coreM = null, coreR;
    return {init, compile, debug, step, status};
}

function Control(cntnr, mon) {
    addStyle(`
.control {
    position: absolute; top: 0px; right: 0px; z-order: 500;
    background-color: var(--surface); padding: 5px;
}
.command.button:active {
    background-color: #eeeeee80;
}
.command.flt { float: left; }
.command.button.mrg { margin-left: 5px; }
#contnt {
    width: 100%; margin-top: 3px; font-size: 16px;
}
    `);
    const div = document.createElement('div'),
    debcom = async (cmd, txt = '') => {
        await mon.exec(`${cmd} ${txt}`);
        const lg = console._log;
        console._log = document.getElementById('contnt');
        try {
            console.clear();
            await mon.exec('status');
        } finally {
            console._log = lg;
        }
    };
    div.className = 'control surface';
    div.innerHTML = `
<span class="command button" style="float: right;" id="con_mode">&#10063;</span>
<div style="width: 100%; display: none;">
<span class="command button flt" id="con_stop">&#8856;</span><br/><br/>
<input type="text" class="command flt" id="con_stpv" value=""/>
<span class="command button flt mrg" id="con_over">&#8631;</span>
<span class="command button flt mrg" id="con_step">&#8628;</span><br/><br/>
<pre id="contnt"></pre>
</div>
    `;
    cntnr.appendChild(div);
    document.getElementById('con_mode').onclick = e => {
        if (e.target.innerHTML === '\u2190') {
            e.target.innerHTML = '&#10063;';
            e.target.parentNode.querySelector('div').style.display = 'none';
            mon.exec('quit');
        } else {
            if (!mon.debugging && mon.prg) {
                e.target.innerHTML = '&#8592;';
                e.target.parentNode.querySelector('div').style.display = 'block';
            }
            debcom('debug');
        }
    };
    document.getElementById('con_stop').onclick = e => debcom('stop');
    document.getElementById('con_over').onclick = e => {
        const inp = document.getElementById('con_stpv'),
              txt = inp.value;
        inp.value = '';
        debcom('step', txt);
    };
    document.getElementById('con_step').onclick = e => debcom('step');
}

class IDEMon extends Monitor {
    constructor(emu, editor, rx8, trm) {
        super(emu);
        this.editor = editor;
        this.mon12 = new Monitor12(emu);
        this.rx8 = rx8;
        this.rx01 = RX01fs(emu);
        this.pdp8 = PDP8(this.mon12, trm);
        this.prg = undefined; this.debugging = false;
    }
    async handler(parms, cmd) {
        let tmp;
        try { switch (cmd) {
            case 'disk':
                if (parms.length < 2) {
                    downloadFile('rx01.img', this.rx01.DSK.drive);
                    break;
                }
                this.rx8.setDsk(0, await loadFile(parms[1], false));
                await this.pdp8.init();
                this.rx01.DSK.drive.set(this.rx8.getDsk(0), 0);
                break;
            case 'dir':
                console.log('Name       Start      Size');
                console.log('--------------------------')
                tmp = '';
                console.log(this.rx01.fromDir(this.rx01.block12(1)).entries.reduce(
                    (acc, e) => acc +
                        e.name.padEnd(10, ' ') + '   ' +
                        e.begin.toString().padStart(3, '0') + '       ' +
                        e.size.toString().padStart(3, '0') + '\n',
                    tmp));
                break;
            case 'upload':
                if (parms.length < 2) { console.error('expected fname'); break; }
                tmp = await loadFile(parms[1], true);
                const fnam = parms[1].match(/([^/]+?)(\.[^.]*$|$)/);
                if (fnam === null || fnam.length < 3) {
                    console.error(`invalid fname: ${parms[1]}`); break;
                }
                tmp = tmp.replaceAll('\r\n', '\n');
                this.rx01.write(fnam[1] + fnam[2].substr(0, 3), this.rx01.toTxt(tmp));
                this.rx8.setDsk(0, this.rx01.DSK.drive);
                break;
            case 'download':
                if (parms.length < 2) { console.error('expected fname'); break; }
                downloadFile(parms[1], this.rx01.fromTxt(this.rx01.read(parms[1])));
                break;
            case 'read':
                if (parms.length < 2) { console.error('expected fname'); break; }
                this.editor.setText(this.rx01.fromTxt(this.rx01.read(parms[1])));
                this.prg = parms[1];
                break;
            case 'write':
                if (this.prg === undefined) { console.error('no program'); break; }
                this.rx01.write(this.prg, this.rx01.toTxt(this.editor.getText()));
                this.rx8.setDsk(0, this.rx01.DSK.drive);
                break;
            case 'comp':
                if (this.prg === undefined) { console.error('no program'); break; }
                await this.pdp8.compile(this.prg);
                this.rx01.DSK.drive.set(this.rx8.getDsk(0), 0);
                break;
            case 'debug':
                if (this.debugging) { console.error('debugging'); break; }
                if (this.prg === undefined) { console.error('no program'); break; }
                tmp = this.prg.substring(0, this.prg.indexOf('.'));
                tmp = this.rx01.read(tmp + '.ls');
                this.editor.setEditing(false);
                tmp = this.rx01.fromTxt(tmp);
                this.editor.setText(tmp);
                this.editor.setLine(this.pdp8.debug(tmp));
                this.debugging = true;
                break;
            case 'step':
                if (!this.debugging) { console.error('not debugging'); break; }
                this.editor.setLine(await this.pdp8.step(parms[1]));
                break;
            case 'status':
                console.log(this.pdp8.status().replaceAll('|', '\n'));
                break;
            case 'quit':
                if (!this.debugging) { console.error('not debugging'); break; }
                this.editor.setEditing(true);
                this.editor.setText(this.rx01.fromTxt(this.rx01.read(this.prg)));
                this.debugging = false;
                break;
            case 'stop': case 'd': case 'x': case 'l': case 'cls':
                await this.mon12.handler(parms, cmd);
                break;
            default: console.error(`unknown command: ${cmd}`); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    document.querySelector('.tab:nth-of-type(2)').remove(); // remove SYSTEM tab
    document.getElementById('sys_tab').remove();
    document.getElementById('system').remove();
    await Promise.all([
        loadScript('../../js/disks.js'),
        loadScript('pdp_8e.js'), loadScript('rx01.js'), loadScript('asr_33.js'),
        loadScript('emu.js'),
        loadScript('editor.js')
    ]);
    const tabNum = document.getElementsByClassName('tab-content').length,
          editor = await Editor(tabNum),
          mem = KM8_E(1),
          cpu = new GenCpu12(mem),
          rx8 = RX01dev(cpu),
          trm = Terminal(),
          asr = initTerm(cpu.cpu, 0o03, trm),
          emu = new PDP8EEmu(cpu, mem),
          mon = new IDEMon(emu, editor, rx8, trm),
          pnlSel = `div.tabbed div.tab-content:nth-of-type(${tabNum + 1}) div`,
          pnl = Control(document.querySelector(pnlSel), mon);
    trm.setDevKbd(asr[1]);
    term.setPrompt('> ');
    while (true) await mon.exec(await term.prompt());
}
