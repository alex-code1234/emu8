'use strict';

// OS-8 compilers

function Terminal() {     // automated screen/keyboard interface
    const kbd = [],
    display = v => {                               // capture screen output
        const chr = String.fromCharCode(v);
        if (enabled) console.log(chr, console.NB);
        else str += chr;
    },
    send = async (txt, chk = null, tmo = 100) => { // send keyboard command
        if (chk) enabled = false;
        txt = txt.toUpperCase();
        for (let i = 0, n = txt.length; i < n; i++) kbd.push(txt.charCodeAt(i));
        if (txt.length > 0) devkbd.setFlag(1);
        if (chk) { // check response
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

function RX01fs(emu) {    // direct access to RX01 file system
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

function OS8(emu, trm) {  // OS-8 emulator
    const BOOT = [0o6755, 0o5022, 0o7126, 0o1060, 0o6751, 0o7201, 0o4053, 0o4053,
                  0o7104, 0o6755, 0o5054, 0o6754, 0o7450, 0o7610, 0o5046, 0o7402,
                  0o7402, 0o7402, 0o7402, 0o7402, 0o6751, 0o4053, 0o3002, 0o2050,
                  0o5047, 0o0000, 0o6753, 0o5033, 0o6752, 0o5453, 0o7004, 0o6030],
    memset = (addr, data12) => {
        for (let i = 0, n = data12.length; i < n; i++) emu.memo.wr(addr++, data12[i]);
    },
    regset = () => {
        for (let i = 0, n = coreR.length; i < n; i++) emu.CPU.cpu.regs[i] = coreR[i];
    },
    init = async () => { // initialze
        memset(0o0022, BOOT);
        emu.CPU.cpu.reset(); emu.CPU.cpu.regs[PC] = 0o0022;
        emu.CPU.run(); await trm.send('', '.'); emu.stop();        // boot
        coreM = emu.saveCore(); coreR = emu.CPU.cpu.regs.slice(0); // save core
    },
    run = async cmd => { // execute command
        if (coreM === null) throw new Error('not initialized');
        emu.loadCore(coreM); regset();
        emu.CPU.run();
        const res = await trm.send(`${cmd}\r`, '.');
        emu.stop();
        return res;
    };
    let coreM = null, coreR;
    return {init, run};
}

async function initCOMP(disk_img) {
    await Promise.all([
        loadScript('js/disks.js'), loadScript('pdp8/rx01.js'), loadScript('pdp8/asr_33.js')
    ]);
    const mem = KM8_E(1),
          cpu = new GenCpu12(mem),
          rx8 = RX01dev(cpu),
          trm = Terminal(),
          asr = initTerm(cpu.cpu, 0o03, trm),
          emu = new PDP8EEmu(cpu, mem),
          rx01 = RX01fs(emu),
          os8 = OS8(emu, trm),
    write = (fn, dat, txt = true) => {
        rx01.write(fn, txt ? rx01.toTxt(dat) : dat);
        rx8.setDsk(0, rx01.DSK.drive);
    },
    read = (fn, txt = true) => {
        const dat = rx01.read(fn);
        return txt ? rx01.fromTxt(dat) : dat;
    },
    compile = async cmd => {
        const res = await os8.run(cmd);
        rx01.DSK.drive.set(rx8.getDsk(0), 0);
        return res;
    };
    trm.setDevKbd(asr[1]);
    rx8.setDsk(0, await loadFile(disk_img, false));
    await os8.init();
    rx01.DSK.drive.set(rx8.getDsk(0), 0);
    return {write, read, compile};
}
