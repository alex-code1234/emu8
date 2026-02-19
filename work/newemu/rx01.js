'use strict';

function RX01dev(CPU) { // RX8E/RX01 disk drive
    let ie = 0, flags = 0,                       // IE bit and flags
        intf = 0, err = 0, errst = 0,            // interface, error code and error status
        cmd = 0, maint = 0, bit8 = 0,            // command, maint. mode and 8-bit transfer flag
        drv = 0, trk = 0, sec = 0,               // drive, track and sector
        part = 0, count = 0;                     // transfer part and count
    const DSK = [null, null], BUF = new Uint8Array(128), mmm = ArrMemo(BUF),
          cpu = CPU.cpu, regs = cpu.regs,
          busy = [null],                         // UI busy flag updater fnc(drv, busy)
    status = () => [ie, flags],
    reset = () => process(7),
    process = num => {
        if (busy[0] !== null) busy[0](drv, 1);   // set busy flag
        switch (num) {
            case 0: // SEL
                console.warn('drive select not implemented');
                break;
            case 1: // LCD
                const tmp = regs[AC] & 0o7777; regs[AC] &= 0o10000;
                cmd = tmp >> 1 & 0o7; maint = tmp & 0o200; bit8 = tmp & 0o100;
                drv = (tmp & 0o20) ? 1 : 0;
                if (maint) flags = 0o7;
                else switch (cmd) {
                    case 0: // fill buffer
                    case 2: // write sector
                    case 3: // read sector
                    case 6: // write deleted data
                        part = 0; flags |= 4;
                        break;
                    case 1: // empty buffer
                        empty12();
                        break;
                    case 4: // nop
                        errst &= 0o303;     // turn off Init Done bit
                        part = 0; count = 0;
                        done();
                        break;
                    case 5: // read status
                        if (DSK[drv] === null) {
                            err = 0o110; flags |= 2;
                            done();
                        }
                        else if (sec === 1) {
                            errst |= 0o200; // turn on Drv Rdy bit
                            errst &= 0o303; // turn off Init Done bit
                            done();
                        }
                        break;
                    case 7: // read error register
                        part = 0; count = 0;
                        done();
                        intf = err;         // reset interface reg to error
                        break;
                }
                break;
            case 2: // XDR
                if (maint) regs[AC] |= intf & 0o7777;
                else switch (cmd) {
                    case 0: // fill buffer
                        intf = regs[AC] & 0o7777;
                        if (part) {
                            BUF[count++] |= (intf & 0o7400) >> 8;
                            BUF[count++] = intf & 0o0377;
                            part = 0;
                        } else {
                            BUF[count++] = (intf & 0o7760) >> 4;
                            BUF[count] = (intf & 0o0017) << 4;
                            part = 1;
                        }
                        if (count < 96) flags |= 4;
                        else {
                            for (; count < 128; count++) BUF[count] = BUF[96];
                            part = 0; count = 0;
                            done();
                        }
                        break;
                    case 1: // empty buffer
                        regs[AC] = (regs[AC] & 0o10000) | (intf & 0o7777);
                        empty12();
                        break;
                    case 2: // write sector
                    case 3: // read sector
                        intf = regs[AC] & 0o7777;
                        if (part === 0) { sec = intf & 0o177; flags |= 4; part = 1; }
                        else {
                            part = 0; count = 0;
                            trk = intf & 0o377;
                            if (trk < 0 || trk > 76) { err = 0o40; flags |= 2; }
                            else if (sec < 1 || sec > 26) { err = 0o70; flags |= 2; }
                            else if (DSK[drv] === null) { err = 0o110; flags |= 2; }
                            else {
                                err = 0;
                                DSK[drv].transfer(trk, sec, 0, mmm, cmd === 3);
                            }
                            done();
                        }
                        break;
                    case 4: // nop
                    case 5: // read status
                    case 7: // read error register
                        regs[AC] |= intf & 0o7777;
                        break;
                    case 6: // write deleted data
                        console.warn('write deleted not implemented');
                        break;
                }
                break;
            case 3: // STR
                if (flags & 4) {
                    regs[PC] = regs[PC] + 1 & 0o7777;
                    if (maint === 0) flags &= ~4;
                }
                break;
            case 4: // SER
                if (flags & 2) {
                    regs[PC] = regs[PC] + 1 & 0o7777;
                    if (maint === 0) flags &= ~2;
                }
                break;
            case 5: // SDN
                if (flags & 1) {
                    regs[PC] = regs[PC] + 1 & 0o7777;
                    if (maint === 0) {
                        if (ie) cpu.setInterrupt(~2);
                        flags &= ~1;
                    }
                }
                break;
            case 6: // INTR
                if (ie && flags & 1) cpu.setInterrupt(~2);
                ie = regs[AC] & 1;
                if (ie && flags & 1) cpu.setInterrupt(2);
                break;
            case 7: // INIT
                intf = 0; err = 0; errst = 0;
                cmd = 0; maint = 0; bit8 = 0;
                drv = 0; trk = 1; sec = 1;
                part = 0; count = 0;
                if (ie) cpu.setInterrupt(~2);
                ie = 0; flags = 0;
                if (DSK[drv] === null) { err = 0o110; flags |= 2; }
                else DSK[drv].transfer(trk, sec, 0, mmm, true);
                done();
                break;
        }
        if (busy[0] !== null) busy[0](drv, 0);   // clear busy flag
    },
    done = () => {
        flags |= 1; intf = errst; if (ie) cpu.setInterrupt(2);
    },
    empty12 = () => {
        if (count < 96) {
            if (part) {
                intf = ((BUF[count++] & 0o17) << 8) | BUF[count++];
                part = 0;
            } else {
                intf = (BUF[count++] << 4) | (BUF[count] >> 4);
                part = 1;
            }
            flags |= 4;
        } else {
            part = 0; count = 0;
            done();
        }
    },
    res = {
        status, reset, process, busy,
        'setDsk': (drv, img) => {                // set drive image
            if (img === null) DSK[drv] = null;
            else {
                DSK[drv] = Disk(77, 26, 128, 1, 0x10000, null); // empty disk
                if (img.length > 0) {
                    if (img.length !== 256256) throw new Error(`disk image error: ${img.length}`);
                    DSK[drv].drive.set(img, 0);
                }
            }
            reset();
        },
        'getDsk': drv => DSK[drv]?.drive         // get drive image
    };
    reset();
    cpu.devices.set(0o75, res);
    cpu.asm.set(0o6751, 'LCD');  cpu.asm.set(0o6752, 'XDR');
    cpu.asm.set(0o6753, 'STR');  cpu.asm.set(0o6754, 'SER'); cpu.asm.set(0o6755, 'SDN');
    cpu.asm.set(0o6756, 'INTR'); cpu.asm.set(0o6757, 'INIT');
    return res;
}

async function RX01(cpu, memo, tab_ref, tab) {
    await loadScript('../../js/disks.js');
    let tmo = null;                   // timeout updater id
    const dev = RX01dev(cpu),         // monitored device
          leds = [],                  // device LEDs
    busy = (drv, flag) => {           // monitor drive activity
        if (!tab_ref.checked) return; // no update for inactive tab
        if (flag) {
            clearTimeout(tmo);
            const stl = leds[drv].style;
            if (stl.backgroundColor !== '#90ee90') stl.backgroundColor = '#90ee90';
            tmo = setTimeout(() => stl.backgroundColor = '', 100);
        }
    },
    update = () => {                  // monitor drive loading
        setTimeout(update, 500);
        if (!tab_ref.checked) return; // no update for inactive tab
        for (let i = 0; i < 2; i++) {
            const stl = leds[i].style;
            if (!dev.getDsk(i)) stl.backgroundColor = '#ff160c';
            else if (stl.backgroundColor === '#ff160c') stl.backgroundColor = '';
        }
    };
    addStyle(`.rxled { position: absolute; width: 1.75%; height: 2%; }`);
    const cont = getImageCont(await loadImage('rx01_img.jpg')),
    led = (left, top) => {
        const res = document.createElement('span');
        res.className = 'rxled'; res.style.left = `${left}%`; res.style.top = `${top}%`;
        cont.appendChild(res);
        leds.push(res);
    };
    led(45.5, 76); led(89.4, 76.5);
    tab.appendChild(cont);
    dev.busy[0] = busy; update();     // start monitoring
    return dev;
}
