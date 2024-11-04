'use strict';

let con, cono, confs, confs2,
    wfname = null, wfdnme, wfdrv, wfdate; // work file full name, name, drive and date

async function cpm(scr) {                 // default version
    return await cpm22(scr);
}

async function cpm22(scr) {
    return await cpm_init(scr, 0);
}

async function cpm30(scr) {
    return await cpm_init(scr, 1);
}

async function mpm(scr) {
    return await cpm_init(scr, 2);
}

// switch CPU:
//     monitor command
//         cpu 0 - 8080
//         cpu 1 - Z80
//     or URL parameter
//         cpu_type=
async function cpm_init(scr, version) {   // CP[MP]/M init
    let urlparams = '?mem_name=cpm_memo', // support CPU switching by command or URL
        urlcpu = URL_OPTS.get('cpu_type');
    if (urlcpu !== null)
        urlparams += `&cpu_type=${urlcpu}`;
    const mod = await defaultHW(scr, new URLSearchParams(urlparams)),
          memo = mod.memo, cmd = mod.cmd,
          nm = cpuName(CPUTYPE),
    getDisk = (pms, n, er, fg) => {       // disk IO command helper
        if (pms.length < n) { console.error(er); return; }
        const dn = pi(pms[1], false);
        if (dn >= CPM_DRIVES.length) { console.error(`invalid drive num: ${dn}`); return; }
        if (!fg) return dn;
        const dd = CPM_DRIVES[dn];
        if (dd === undefined || dd === null) { console.error(`invalid drive: ${dn}`); return; }
        return dd;
    };
    if (CPUTYPE > 1)
        throw new Error(`invalid CPU: ${nm}`);
    switch (version) {
        case 0:
            mod.info = `CP/M 2.2, ${nm}, VT-100, 64K memory, 4 FDC (8" IBM SD)`;
            break;
        case 1:
            mod.info = `CP/M 3.0, ${nm}, VT-100, 160K memory, 4 FDC (8" IBM SD)`;
            break;
        default:
            mod.info = `MP/M II 2.0, ${nm}, VT-100, 400K memory, 4 FDC (8" IBM SD), 2 HDC (4M), 1 HDC (512M)`;
            break;
    }
    mod.cmd = async (command, parms) => { // intercept command processor
        switch (command) {
            case 'tests':                 // add interrupt test
                console.log('name: interrupt, CPU test ', console.NB);
                return cmd(command, parms);
            case 'test':                  // interrupt test
                if (parms[1] === 'interrupt') {
                    loadHex(await loadFile('cpm/int_test.hex', true), 0);
                    hardware.toggleDisplay();
                    CPU.reset();
                    memo.output(0x1b, 1); // start timer
                    CPU.setPC((CPUTYPE === 0) ? 0x95 : 0x90); run();
                    memo.output(0x1b, 0); // stop timer
                    break;
                }
                return cmd(command, parms);
            case 'disk':                  // insert disk
                const disk_num = getDisk(parms, 3, 'missing: drv fname|size', false);
                if (disk_num === undefined) break;
                const disk_fn = parms[2],
                      disk_img = isNaN(disk_fn) ? await CPMDisk(disk_fn) : await CPMDisk(null, +disk_fn);
                CPM_DRIVES[disk_num] = disk_img;
                console.log(disk_img.drive.length);
                break;
            case 'dump':                  // save disk
                const d_drive = getDisk(parms, 2, 'missing: drv', true);
                if (d_drive === undefined) break;
                downloadFile('drive.img', d_drive.drive);
                break;
            case 'read':                  // read file
                const r_drive = getDisk(parms, 3, 'missing: drv fname', true);
                if (r_drive === undefined) break;
                let r_fn;
                const r_buf = r_drive.diskRW(r_fn = parms[2]);
                if (r_buf !== null)
                    downloadFile(r_fn.toUpperCase(), r_buf);
                else
                    console.log(`file ${r_fn} not found or empty`);
                break;
            case 'write':                 // write file
                const w_drive = getDisk(parms, 3, 'missing: drv fname [R/O=0]', true);
                if (w_drive === undefined) break;
                let w_fn, w_idx, w_nn;
                const hndl = await preLoadFile(w_fn = parms[2]),
                      w_buf = new Uint8Array(await hndl.arrayBuffer());
                w_nn = ((w_idx = w_fn.lastIndexOf('/')) >= 0) ? w_fn.substring(w_idx + 1) : w_fn;
                w_drive.diskRW(w_nn, w_buf);
                console.log(w_buf.length);
                if (parms.length > 3 && parms[3] === '1') { // set R/O working file
                    wfname = w_fn; wfdnme = w_nn;
                    wfdrv = pi(parms[1], false);
                    wfdate = hndl.headers.get('Last-Modified');
                }
                break;
            case 'basic':                 // start 8080 MS Basic
                memo.reset(); HLT_STOP = true;
                loadHex(await loadFile('cpm/basic.hex', true), 0);
                hardware.toggleDisplay();
                CPU.reset(); CPU.setPC(0x1000); run();
                break;
            case 'on':                    // start emulator (false - do not load disks)
            case 'onfs':                  // run full screen with soft keyboard
                if (parms[1] !== 'false') switch (version) {
                    case 0:
                        CPM_DRIVES[0] = await CPMDisk('cpm/cpma.cpm');
                        CPM_DRIVES[1] = await CPMDisk('cpm/cpmb_turbo.cpm');
                        break;
                    case 1:
                        CPM_DRIVES[0] = await CPMDisk('cpm/cpm3a.cpm');
                        CPM_DRIVES[1] = await CPMDisk('cpm/cpm3b.cpm');
                        break;
                    default:
                        CPM_DRIVES[0] = await CPMDisk('cpm/mpma.cpm');
                        CPM_DRIVES[1] = await CPMDisk('cpm/mpmb.cpm');
                        CPM_DRIVES[2] = await CPMDisk(null, 256256);
                        break;
                }
                memo.reset();
                if (version > 0)
                    memo.bank(0);       // bank 0 must be active
                HLT_STOP = version < 2; // no stop on HALT (MP/M is interrupt based)
                let boot_err;
                if ((boot_err = CPM_DRIVES[0].transfer(0, 1, 0x0000, true, memo)) !== 0)
                    console.error(`boot error: ${boot_err}`);
                else {
                    if (command === 'on') hardware.toggleDisplay();
                    else {
                        con = confs;
                        showFS();
                    }
                    CPU.reset(); run();
                }
                break;
            case 'printer':               // download printer device output
                downloadFile('printer.txt', memo.printer());
                break;
            case 'tape':                  // mount tape to tape reader device
                if (version === 2) return false;
                if (parms.length < 2) {
                    console.error('missing: file [adr len]');
                    break;
                }
                let tl2; // true - transfer binary file as hex file
                const tdata = await loadFile(parms[1], !(tl2 = parms.length > 2)),
                      haddr = tl2 ? pi(parms[2]) : 0x100,              // binary file address
                      hlen = (parms.length > 3) ? pi(parms[3]) : 0x20; // hex file line length
                memo.tape(tl2 ? toIntelHex(tdata, haddr, hlen) : tdata);
                break;
            case 'puncher':               // download tape puncher device output
                if (version === 2) return false;
                downloadFile('puncher.txt', memo.puncher());
                break;
            case 'bank':                  // get/set active memory bank
                if (version === 0) return false;
                if (parms.length < 2)
                    console.log(memo.bank());
                else
                    memo.bank(pi(parms[1], false));
                break;
            case 'ccopy': console.log(memo.ccopy(parms[1])); break;
            case 'console': console.log(memo.console()); break;
            default: return cmd(command, parms);
        }
        return true;
    };
    const elem = document.getElementById('scrfs'),
          style = getComputedStyle(elem),
          COLORS = [
              style.getPropertyValue('background-color'),
              '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500',
              style.getPropertyValue('color'),
              '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'
          ];
    confs = await VT_100(elem, {COLORS});
    const cnv2 = document.createElement('canvas');        // second canvas element
    cnv2.className = 'scrfs'; cnv2.style.display = 'none';
    document.getElementById('runtime').insertBefore(cnv2, elem);
    confs2 = await VT_100(cnv2, {COLORS});                // second console
    mod.resetFS = () => {
        const clrs = [
            0, style.getPropertyValue('background-color'),
            7, style.getPropertyValue('color')
        ];
        confs.setColors(clrs);
        confs2.setColors(clrs);
    };
    mod.exitFS = () => con = cono;
    const origkbdfs = mod.keyboardFS(confs),              // first kbd handler
          secdkbdfs = mod.keyboardFS(confs2),             // first kbd handler and switch button
          conkey = document.getElementsByClassName('section right')[0].childNodes[2];
    conkey.className = 'key i'; conkey.innerHTML = '&#10112;';
    let kbdhandler = origkbdfs;
    mod.keyboardFS = (shft, ctrl, alt, txt) => {
        switch (txt) {
            case '\u2780':
                conkey.innerHTML = '&#10113;';
                elem.style.display = 'none'; cnv2.style.display = 'block';
                kbdhandler = secdkbdfs;
                break;
            case '\u2781':
                conkey.innerHTML = '&#10112;';
                cnv2.style.display = 'none'; elem.style.display = 'block';
                kbdhandler = origkbdfs;
                break;
            default: kbdhandler(shft, ctrl, alt, txt); break;
        }
    };
    return mod;
}

// pre-compiled drives
const CPM_DRIVES = [          // available in:
    null, // A: (8" IBM SD)      CP/M 2.2, CP/M 3.0, MP/M
    null, // B: (8" IBM SD)      CP/M 2.2, CP/M 3.0, MP/M
    null, // C: (8" IBM SD)      CP/M 2.2, CP/M 3.0, MP/M
    null, // D: (8" IBM SD)      CP/M 2.2, CP/M 3.0, MP/M
    null, // none
    null, // none
    null, // none
    null, // none
    null, // I: (4Mb harddisk)                       MP/M
    null, // J: (4Mb harddisk)                       MP/M
    null, // K: (4Mb harddisk)
    null, // L: (4Mb harddisk)
    null, // none
    null, // none
    null, // none
    null  // P: (512Mb harddisk)                     MP/M
];

async function cpm_memo(tmp) {            // CPM system memory and IO
    con = cono = tmp;
    await loadScript('js/disks.js'); // use disks
    const ram = new Uint8Array(65536),
          SEG = 49152, rams = [new Uint8Array(SEG), ram],
          datetime = () => {
              let date; // temp = (date - (8 years) + (1 day)) / day
              return [date = new Date(), ((date.getTime() - 252442799999 + 86400000) / 86400000) | 0];
          };
    let dskstat = 0, iocount = 0, drv = 0, trk = 0, sec = 0, dma = 0,
        printer = '', tape = '', tapepos = 0, puncher = '',
        TIMER_RUN = false,
        bank = 1, clkcmd = 0, [clkdata, clktemp] = datetime(),
        sconsole = '', ccopy = false;
    const timer10 = async (value) => {
        if (value !== 1) { TIMER_RUN = false; return; }
        else if (TIMER_RUN) return;
        TIMER_RUN = true;
        CPU.setInterrupt(7); // one time for interrupt test
        while (TIMER_RUN) {
            await delay(100);
            if (CPU.RUN)
                CPU.setInterrupt(7);
        }
    },
    result = {
        'rd': a => (bank == 1 || a >= SEG) ? ram[a] : rams[bank][a],
        'wr': (a, v) => {
            if (bank == 1 || a >= SEG) ram[a] = v;
            else rams[bank][a] = v;
        },
        'input': p => {
            switch (p) {
                case 0x00: return (con.kbd.length > 0) ? 0xff : 0x00;                   // console status
                case 0x01: return (con.kbd.length > 0) ? con.kbd.shift() & 0x7f : 0x00; // console data
                case 0x02: return 0x1a;                                                 // printer status
                case 0x04: return 0xff;                                                 // auxilary status
                case 0x05:                                                              // paper tape (aux)
                    return (tapepos >= tape.length) ? 0x1a : tape.charCodeAt(tapepos++) & 0xff;
                case 0x0a: return drv;                                                  // fdc drive
                case 0x0b: return trk;                                                  // fdc track
                case 0x0c: return sec & 0x00ff;                                         // fdc sector low
                case 0x0d: return (iocount === 0) ? 0xff : 0x00;                        // fdc command
                case 0x0e: return dskstat;                                              // fdc status
                case 0x0f: return dma & 0x00ff;                                         // dma address low
                case 0x10: return (dma & 0xff00) >>> 8;                                 // dma address high
                case 0x11: return (sec & 0xff00) >>> 8;                                 // fdc sector high
                case 0x1a:                                                              // clock data
                    let res;
                    switch (clkcmd) {
                        case 0:                                    // sec
                            [clkdata, clktemp] = datetime();
                            res = clkdata.getSeconds();
                            break;
                        case 1: res = clkdata.getMinutes(); break; // min
                        case 2: res = clkdata.getHours(); break;   // hrs
                        case 3: return clktemp & 0xff;             // days low
                        case 4: return (clktemp >>> 8) & 0xff;     // days high
                        default: return 0x1a; // CTRL-Z to simulate EOF
                    }
                    const tens = (res / 10) | 0,
                          units = (res % 10) | 0;
                    return (tens << 4) | units;
                case 0x28: return (confs2.kbd.length > 0) ? 0x03 : 0x02;                // console 1 status
                case 0x29: return (confs2.kbd.length > 0) ? confs2.kbd.shift() & 0x7f : 0x02;
                case 0x2a: return 0x00;                                                 // console 2 status
                case 0x2c: return 0x00;                                                 // console 3 status
                case 0x2e: return 0x00;                                                 // console 4 status
                default: throw new Error(`unknown input port: ${p.toString(16).padStart(2, '0')}`);
            }
        },
        'output': (p, v) => {
            switch (p) {
                case 0x00:                                                              // tests data
                    if (v === 0x0a) { console.log(); break; }
                    else if (v === 0x0d) break;
                    console.log(String.fromCharCode(v), console.NB);
                    break;
                case 0x01:                                                              // console data
                    con.display(v & 0xff);
                    if (ccopy) sconsole += String.fromCharCode(v & 0xff);               // keep screen data
                    break;
                case 0x03: printer += String.fromCharCode(v); break;                    // printer data
                case 0x04: if (v & 0x01) tapepos = 0; break;                            // rewind tape (aux)
                case 0x05: puncher += String.fromCharCode(v); break;                    // paper puncher (aux)
                case 0x0a: drv = v & 0xff; break;                                       // fdc drive
                case 0x0b: trk = v & 0xff; break;                                       // fdc track
                case 0x0c: sec = (sec & 0xff00) | (v & 0xff); break;                    // fdc sector low
                case 0x0d:                                                              // fdc command
                    if (v !== 0 && v !== 1)
                        dskstat = 7; // illegal command
                    else {
                        iocount++;
                        (async () => {
                            try {
                                const dd = CPM_DRIVES[drv];
                                if (dd === null || dd === undefined)
                                    dskstat = 1; // illegal drive
                                else {
                                    if (wfname !== null && wfdrv === drv &&      // work file set
                                            v === 0 && trk === 2 && sec === 1) { // resd first DIR sector
                                        const hndl = await preLoadFile(wfname);  // check modified time
                                        if (hndl.headers.get('Last-Modified') > wfdate)
                                            dd.diskRW(wfdnme, new Uint8Array(await hndl.arrayBuffer()));
                                    }
                                    dskstat = dd.transfer(trk, sec, dma, v === 0, result);
                                }
                            } catch(e) {
                                console.error(e.message + '\n', e.stack);
                            }
                            iocount--;
                        })();
                    }
                    break;
                case 0x0f: dma = (dma & 0xff00) | (v & 0xff); break;                    // dma address low
                case 0x10: dma = (dma & 0x00ff) | ((v & 0xff) << 8); break;             // dma address high
                case 0x11: sec = (sec & 0x00ff) | ((v & 0xff) << 8); break;             // fdc sector high
                case 0x14:                                                              // mmu init
                    if (v > 8)
                        throw new Error(`invalid memory banks: ${v}`);
                    while (v-- > 2)
                        rams.push(new Uint8Array(SEG));
                    break;
                case 0x15:                                                              // mmu select
                    if (v >= rams.length)
                        throw new Error(`invalid memory bank: ${v}`);
                    bank = v & 0xff;
                    break;
                case 0x19: clkcmd = v & 0xff; break;                                    // clock command
                case 0x1b: timer10(v); break;                                           // 10ms interrupt timer
                case 0x29: confs2.display(v & 0xff); break;
                case 0xdd: GSX(con, v); break;                                          // GSX support
                default: throw new Error(`unknown output port: ${p.toString(16).padStart(2, '0')}`);
            }
        },
        'tape': (value) => { tape = value; tapepos = 0; },
        'printer': () => printer,
        'puncher': () => puncher,
        'bank': (value) => {
            if (value === undefined)
                return bank;
            if (value >= rams.length)
                throw new Error(`invalid memory bank: ${value}`);
            bank = value;
        },
        'ccopy': flag => {
            if (flag !== undefined) ccopy = flag === 'true';
            sconsole = '';
            return ccopy;
        },
        'console': () => sconsole,
        'reset': () => {
            timer10(0); // stop timer
            ram.fill(0x00);
            rams.length = 2; rams[0].fill(0x00);
            dskstat = 0; iocount = 0; drv = 0; trk = 0; sec = 0; dma = 0;
            printer = ''; tape = ''; tapepos = 0; puncher = '';
            bank = 1; clkcmd = 0; [clkdata, clktemp] = datetime();
            sconsole = '';
        }
    };
    return result;
}

const GSX_COLORS = ['#000000', '#aa0000', '#00aa00', '#0000aa', '#00aaaa', '#aaaa55', '#aa00aa', '#ffffff'],
      GSX_LSTYLS = [[], [5, 5], [1, 2], [5, 2, 1, 2]],
      GSX_MARKRS = ['.', '+', '*', 'O', 'X'],
      geti = (arr, i) => {
          const ind = (i - 1) * 2;
          return memo.rd(arr + ind) | memo.rd(arr + ind + 1) << 8;
      },
      seti = (arr, i, d) => {
          const ind = (i - 1) * 2;
          memo.wr(arr + ind, d & 0xff);
          memo.wr(arr + ind + 1, d >>> 8 & 0xff);
      },
      crosshairs = (cnv, x, y) => {
          if (GSX_msX !== undefined)
              cnv.putImageData(GSX_data, GSX_msX - 5, GSX_msY - 5);
          GSX_msX = x; GSX_msY = y;
          if (GSX_msX !== undefined) {
              if (GSX_msX < 6) GSX_msX = 6; else if (GSX_msX > 713) GSX_msX = 713;
              if (GSX_msY < 6) GSX_msY = 6; else if (GSX_msY > 393) GSX_msY = 393;
              GSX_data = cnv.getImageData(GSX_msX - 5, GSX_msY - 5, 10, 10);
              cnv.strokeStyle = '#888888'; cnv.setLineDash([]); cnv.lineWidth = 1;
              cnv.beginPath();
              cnv.moveTo(GSX_msX - 5, GSX_msY); cnv.lineTo(GSX_msX + 5, GSX_msY);
              cnv.moveTo(GSX_msX, GSX_msY - 5); cnv.lineTo(GSX_msX, GSX_msY + 5);
              cnv.stroke();
          }
      };
let GSX_ver = true, GSX_state = 0, DE_prm = 0x00, GSX_msX, GSX_msY, GSX_step, GSX_data,
    GSX_pmtyp = 2, GSX_lstyl = 0, GSX_lwdth = 1, GSX_lcolr = 7, GSX_pmcolr = 7, GSX_txcolr = 7, GSX_ficolr = 7;
function GSX(con, v) {
    switch (GSX_state) {
        case 0: GSX_state++; DE_prm = v & 0xff; return;
        case 1: GSX_state = 0; DE_prm = v << 8 | DE_prm; break;
    }
    if (GSX_ver) {
        GSX_ver = false;
        con.print(
            '--------------------------------------------------~' +
            'GSX_driver_for_VT-100_ver._1.0~' +
            '--------------------------------------------------~'
        );
    }
    const contrl = geti(DE_prm, 1),
          intin = geti(DE_prm, 2), ptsin = geti(DE_prm, 3),
          intout = geti(DE_prm, 4), ptsout = geti(DE_prm, 5),
          op = geti(contrl, 1);
    switch (op) {
        case 1:                                        // open workstation
            GSX_pmtyp = geti(intin, 4) - 1;
            if (GSX_pmtyp < 0 || GSX_pmtyp > 4) GSX_pmtyp = 2;
            GSX_lstyl = geti(intin, 2) - 1;
            if (GSX_lstyl < 0 || GSX_lstyl > 3) GSX_lstyl = 0;
            GSX_lcolr = geti(intin, 3);
            if (GSX_lcolr < 0 || GSX_lcolr > 7) GSX_lcolr = 7;
            GSX_pmcolr = geti(intin, 5);
            if (GSX_pmcolr < 0 || GSX_pmcolr > 7) GSX_pmcolr = 7;
            GSX_txcolr = geti(intin, 7);
            if (GSX_txcolr < 0 || GSX_txcolr > 7) GSX_txcolr = 7;
            GSX_ficolr = geti(intin, 10);
            if (GSX_ficolr < 0 || GSX_ficolr > 7) GSX_ficolr = 7;
            GSX_lwdth = 1;
            seti(contrl, 3, 6);
            seti(contrl, 5, 45);
            seti(intout, 1, 720 - 1); seti(intout, 2, 400 - 1);
            seti(intout, 3, 1);
            seti(intout, 4, 350); seti(intout, 5, 350);
            seti(intout, 6, 1);
            seti(intout, 7, 4);
            seti(intout, 8, 3);
            seti(intout, 9, 5);
            seti(intout, 10, 1);
            seti(intout, 11, 1);
            seti(intout, 12, 0); seti(intout, 13, 0);
            seti(intout, 14, 8);
            seti(intout, 15, 0); for (let j = 16; j <= 35; j++) seti(intout, j, -1);
            seti(intout, 36, 1);
            seti(intout, 37, 0);
            seti(intout, 38, 1);
            seti(intout, 39, 0);
            seti(intout, 40, 8);
            seti(intout, 41, 1); seti(intout, 42, 0); seti(intout, 43, 0); seti(intout, 44, 0);
            seti(intout, 45, 2);
            seti(ptsout, 1, 0); seti(ptsout, 2, 16);
            seti(ptsout, 3, 0); seti(ptsout, 4, 16);
            seti(ptsout, 5, 1); seti(ptsout, 6, 0);
            seti(ptsout, 7, 3); seti(ptsout, 8, 0);
            seti(ptsout, 9, 0); seti(ptsout, 10, 16);
            seti(ptsout, 11, 0); seti(ptsout, 12, 16);
            GSX_msX = undefined; GSX_step = 50;
            return;
        case 2:                                        // close workstation
            con.canvas.globalCompositeOperation = 'source-over';
            con.print('^[?25h');
            break;
        case 3: con.print('^[2J'); break;              // clear workstation
        case 5:                                        // escape
            const escop = geti(contrl, 6);
            switch (escop) {
                case 1:                                // inquire addressable cells
                    seti(contrl, 5, 2);
                    seti(intout, 1, 25); seti(intout, 2, 80);
                    break;
                case 4: con.print('^[A'); break;       // cursor up
                case 5: con.print('^[B'); break;       // cursor down
                case 6: con.print('^[C'); break;       // cursor right
                case 7: con.print('^[D'); break;       // cursor left
                case 8: con.print('^[H'); break;       // cursor home
                case 9: con.print('^[J'); break;       // erase to end of screen
                case 10: con.print('^[K'); break;      // erase to end of line
                case 11:                               // direct cursor address
                    con.print(`^[${geti(intin, 1)};${geti(intin, 2)}f`);
                    break;
                case 12:                               // output text
                    let pst = '';
                    for (let j = 1, n = geti(contrl, 4); j <= n; j++)
                        pst += String.fromCharCode(geti(intin, j));
                    con.print(pst.replaceAll(' ', '_'));
                    break;
                case 13: con.print('^[30;47m'); break; // reverse video on
                case 14: con.print('^[37;40m'); break; // reverse video off
                case 16:                               // inquire tablet status
                    seti(contrl, 5, 1);
                    seti(intout, 1, 0);
                    break;
                case 18: con.print('^[?25h'); break;   // show cursor
                case 19: con.print('^[?25l'); break;   // hide cursor
            }
            break;
        case 6:                                        // polyline
            const plcnt = geti(contrl, 2) * 2;
            let plx1 = geti(ptsin, 1), ply1 = geti(ptsin, 2),
                plidx = 3;
            con.canvas.strokeStyle = GSX_COLORS[GSX_lcolr];
            con.canvas.lineWidth = GSX_lwdth;
            con.canvas.setLineDash(GSX_LSTYLS[GSX_lstyl]);
            con.canvas.fillStyle = con.canvas.strokeStyle;
            con.canvas.beginPath();
            con.canvas.moveTo(plx1, 399 - ply1);
            while (plidx <= plcnt) {
                const plx2 = geti(ptsin, plidx++), ply2 = geti(ptsin, plidx++);
                if (plx1 === plx2 && ply1 === ply2)
                    con.canvas.fillRect(plx1, 399 - ply1, GSX_lwdth, GSX_lwdth);
                else
                    con.canvas.lineTo(plx2, 399 - ply2);
                plx1 = plx2; ply1 = ply2;
            }
            con.canvas.stroke();
            break;
        case 7:                                        // polymarker
            const pmcnt = geti(contrl, 2) * 2,
                  pmtxt = GSX_MARKRS[GSX_pmtyp];
            let pmidx = 1;
            con.canvas.fillStyle = GSX_COLORS[GSX_pmcolr];
            while (pmidx <= pmcnt)
                con.canvas.fillText(pmtxt, geti(ptsin, pmidx++) - 4, 399 - geti(ptsin, pmidx++) + 5);
            break;
        case 8:                                        // text
            let gst = '';
            for (let j = 1, n = geti(contrl, 4); j <= n; j++)
                gst += String.fromCharCode(geti(intin, j));
            con.canvas.fillStyle = GSX_COLORS[GSX_txcolr];
            con.canvas.fillText(gst, geti(ptsin, 1), 399 - geti(ptsin, 2) - 2);
            break;
        case 9:                                        // filled area
            const facnt = geti(contrl, 2) * 2,
                  fax = geti(ptsin, 1), fay = 399 - geti(ptsin, 2);
            let faidx = 3;
            con.canvas.strokeStyle = GSX_COLORS[GSX_ficolr];
            con.canvas.lineWidth = 1;
            con.canvas.setLineDash([]);
            con.canvas.fillStyle = con.canvas.strokeStyle;
            con.canvas.beginPath();
            con.canvas.moveTo(fax, fay);
            while (faidx <= facnt)
                con.canvas.lineTo(geti(ptsin, faidx++), 399 - geti(ptsin, faidx++));
            con.canvas.lineTo(fax, fay);
            con.canvas.fill();
            break;
        case 10:                                       // cell array
            const cax1 = geti(ptsin, 1), cay1 = geti(ptsin, 2),
                  cax2 = geti(ptsin, 3), cay2 = geti(ptsin, 4),
                  caw = cax2 - cax1, cah = cay2 - cay1;
            con.canvas.strokeStyle = GSX_COLORS[GSX_lcolr];
            con.canvas.lineWidth = 1;
            con.canvas.setLineDash([]);
            con.canvas.beginPath();
            con.canvas.rect(cax1, 399 - cay2, caw, cah);
            con.canvas.stroke();
            break;
        case 11:                                       // generalized drawing primitive
            const gdp = geti(contrl, 6);
            switch (gdp) {
                case 1:                                // bar
                    const gdpx1 = geti(ptsin, 1), gdpy1 = geti(ptsin, 2),
                          gdpx2 = geti(ptsin, 3), gdpy2 = geti(ptsin, 4),
                          gdpw = gdpx2 - gdpx1, gdph = gdpy2 - gdpy1;
                    con.canvas.fillStyle = GSX_COLORS[GSX_ficolr];
                    con.canvas.fillRect(gdpx1, 399 - gdpy2, gdpw, gdph);
                    break;
                case 2:                                // arc
                    const arcsa = geti(intin, 1) * Math.PI / 1800.0,
                          arcea = geti(intin, 2) * Math.PI / 1800.0;
                    con.canvas.strokeStyle = GSX_COLORS[GSX_lcolr];
                    con.canvas.lineWidth = GSX_lwdth;
                    con.canvas.setLineDash(GSX_LSTYLS[GSX_lstyl]);
                    con.canvas.beginPath();
                    con.canvas.arc(geti(ptsin, 1), 399 - geti(ptsin, 2), geti(ptsin, 7), arcsa, arcea);
                    con.canvas.stroke();
                    break;
                case 3:                                // pie slice
                    const piex = geti(ptsin, 1), piey = 399 - geti(ptsin, 2),
                          piesa = geti(intin, 1) * Math.PI / 1800.0,
                          pieea = geti(intin, 2) * Math.PI / 1800.0;
                    con.canvas.fillStyle = GSX_COLORS[GSX_ficolr];
                    con.canvas.strokeStyle = con.canvas.fillStyle;
                    con.canvas.lineWidth = 1;
                    con.canvas.setLineDash([]);
                    con.canvas.beginPath();
                    con.canvas.moveTo(geti(ptsin, 3), 399 - geti(ptsin, 4));
                    con.canvas.lineTo(piex, piey);
                    con.canvas.lineTo(geti(ptsin, 5), 399 - geti(ptsin, 6));
                    con.canvas.arc(piex, piey, geti(ptsin, 7), piesa, pieea);
                    con.canvas.fill();
                    break;
                case 4:                                // circle
                    con.canvas.fillStyle = GSX_COLORS[GSX_ficolr];
                    con.canvas.beginPath();
                    con.canvas.arc(geti(ptsin, 1), 399 - geti(ptsin, 2), geti(ptsin, 5), 0, 2 * Math.PI);
                    con.canvas.fill();
                    break;
            }
            break;
        case 12:                                       // set character height
            con.canvas.font = `${geti(ptsin, 2)}px monospaced`;
            seti(contrl, 3, 2);
            seti(ptsout, 1, 7); seti(ptsout, 2, 14);
            seti(ptsout, 3, 9); seti(ptsout, 4, 16);
            return;
        case 13: seti(intout, 1, 0); break;            // set character up vector
        case 14:                                       // set color representation
            const scridx = geti(intin, 1),
                  scrr = geti(intin, 2), scrg = geti(intin, 3), scrb = geti(intin, 4);
            if (scridx >= 0 && scridx <= 7)
                GSX_COLORS[scridx] = '#' +
                        (scrr / 10.0 * 2.55 | 0).toString(16).padStart(2, '0') +
                        (scrg / 10.0 * 2.55 | 0).toString(16).padStart(2, '0') +
                        (scrb / 10.0 * 2.55 | 0).toString(16).padStart(2, '0');
            break;
        case 15:                                       // set polyline type
            GSX_lstyl = geti(intin, 1) - 1;
            if (GSX_lstyl < 0 || GSX_lstyl > 3)
                GSX_lstyl = 0;
            seti(intout, 1, GSX_lstyl + 1);
            break;
        case 16:                                       // set polyline width
            GSX_lwdth = geti(ptsin, 1);
            seti(contrl, 3, 1);
            seti(ptsout, 1, GSX_lwdth); seti(ptsout, 2, 0);
            return;
        case 17:                                       // set polyline color index
            GSX_lcolr = geti(intin, 1);
            if (GSX_lcolr < 0 || GSX_lcolr > 7)
                GSX_lcolr = 7;
            seti(intout, 1, GSX_lcolr);
            break;
        case 18:                                       // set polymarker type
            GSX_pmtyp = geti(intin, 1) - 1;
            if (GSX_pmtyp < 0 || GSX_pmtyp > 4)
                GSX_pmtyp = 2;
            seti(intout, 1, GSX_pmtyp + 1);
            break;
        case 19:                                       // set polymarker scale
            seti(contrl, 3, 1);
            seti(ptsout, 1, 0); seti(ptsout, 2, 14);
            return;
        case 20:                                       // set polymarker color index
            GSX_pmcolr = geti(intin, 1);
            if (GSX_pmcolr < 0 || GSX_pmcolr > 7)
                GSX_pmcolr = 7;
            seti(intout, 1, GSX_pmcolr);
            break;
        case 21: seti(intout, 1, 0); break;            // set font
        case 22:                                       // set text color index
            GSX_txcolr = geti(intin, 1);
            if (GSX_txcolr < 0 || GSX_txcolr > 7)
                GSX_txcolr = 7;
            seti(intout, 1, GSX_txcolr);
            break;
        case 23: seti(intout, 1, 1); break;            // set interior fill style
        case 25:                                       // set fill color index
            GSX_ficolr = geti(intin, 1);
            if (GSX_ficolr < 0 || GSX_ficolr > 7)
                GSX_ficolr = 7;
            seti(intout, 1, GSX_ficolr);
            break;
        case 28:                                       // input locator position
            if (GSX_msX === undefined)
                crosshairs(con.canvas, geti(ptsin, 1) + 5, 399 - geti(ptsin, 2) + 5);
            if (con.kbd.length > 0) {
                const key = con.kbd.shift();
                switch (key) {                         // graphic cursor
                    case 9: crosshairs(con.canvas, 13, 13); break;                                   // TAB   - step home
                    case 13:                                                                         // CR    - DONE
                    case 32:                                                                         // space - PICK
                        seti(contrl, 5, 1); seti(intout, 1, (key === 13) ? 33 : 32);
                        seti(contrl, 3, 1); seti(ptsout, 1, GSX_msX - 5); seti(ptsout, 2, 399 - GSX_msY - 5);
                        crosshairs(con.canvas);
                        return;
                    case 97: crosshairs(con.canvas, GSX_msX - GSX_step, GSX_msY); break;             // a - step left
                    case 113: GSX_step = GSX_step / 2 | 0; if (GSX_step === 0) GSX_step = 50; break; // q - step size
                    case 115: crosshairs(con.canvas, GSX_msX + GSX_step, GSX_msY); break;            // s - step right
                    case 119: crosshairs(con.canvas, GSX_msX, GSX_msY - GSX_step); break;            // w - step up
                    case 122: crosshairs(con.canvas, GSX_msX, GSX_msY + GSX_step); break;            // z - step down
                }
            }
            seti(contrl, 5, 0);
            break;
        case 32:                                       // set writing mode
            const wrm = geti(intin, 1);
            switch (wrm) {
                case 1: con.canvas.globalCompositeOperation = 'source-over'; break;
                case 2: con.canvas.globalCompositeOperation = 'source-in'; break;
                case 3: con.canvas.globalCompositeOperation = 'xor'; break;
                case 4: con.canvas.globalCompositeOperation = 'copy'; break;
            }
            seti(intout, 1, wrm);
            break;
        case 33: seti(intout, 1, 1); break;            // set input mode
    }
    seti(contrl, 3, 0);
}
