'use strict';

let MACHINE = 0; // 0 - IBM PC 5150, 1 - IBM PC 5160

let DIP_SWITCH1 = '01001001';   // IBM_PC 5150 switch (no 8087, CGA 80x25, 2 floppy)
let DIP_SWITCH2 = '10110000';   // IBM PC 5150 memory setting (640 Kb)
let DIP_SWITCH_XT = '01001001'; // IBM PC 5160 switch (no test loop, no 8087, CGA 80x25, 2 floppy)

// DMA controller
function Intel8237() {
    const addr = [0, 0, 0, 0];
    const cnt = [0, 0, 0, 0];
    const flipflop = [false, false, false, false];

    function isConnected(port) {
        return port >= 0x00 && port < 0x20;
    }

    function portIn(w, port) {
        let chan;
        switch (port) {
        case 0x00: // ADDR0
        case 0x02: // ADDR1
        case 0x04: // ADDR2
        case 0x06: // ADDR3
            chan = port / 2;
            if (!flipflop[chan]) {
                flipflop[chan] = true;
                return addr[chan] & 0xff;
            } else {
                flipflop[chan] = false;
                return addr[chan] >>> 8 & 0xff;
            }
        case 0x01: // CNT0
        case 0x03: // CNT1
        case 0x05: // CNT2
        case 0x07: // CNT3
            chan = (port - 1) / 2;
            if (!flipflop[chan]) {
                flipflop[chan] = true;
                return cnt[chan] & 0xff;
            } else {
                flipflop[chan] = false;
                return cnt[chan] >>> 8 & 0xff;
            }
        case 0x08: // status (XT only)
            let result = 0x00;
            if (cnt[0] === 0xffff) result |= 0x01;
            if (cnt[1] === 0xffff) result |= 0x02;
            if (cnt[2] === 0xffff) result |= 0x04;
            if (cnt[3] === 0xffff) result |= 0x08;
            return result;
        }
        return 0;
    }

    function portOut(w, port, val) {
        let chan;
        switch (port) {
        case 0x00: // ADDR0
        case 0x02: // ADDR1
        case 0x04: // ADDR2
        case 0x06: // ADDR3
            chan = port / 2;
            if (!flipflop[chan]) {
                flipflop[chan] = true;
                addr[chan] = addr[chan] & 0xff00 | val;
            } else {
                flipflop[chan] = false;
                addr[chan] = val << 8 | addr[chan] & 0xff;
            }
            break;
        case 0x01: // CNT0
        case 0x03: // CNT1
        case 0x05: // CNT2
        case 0x07: // CNT3
            chan = (port - 1) / 2;
            if (!flipflop[chan]) {
                flipflop[chan] = true;
                cnt[chan] = cnt[chan] & 0xff00 | val;
            } else {
                flipflop[chan] = false;
                cnt[chan] = val << 8 | cnt[chan] & 0xff;
            }
            break;
        }
    }

    return {
        addr,
        cnt,
        isConnected,
        portIn,
        portOut
    };
}

// Programmable Interval Timer (PIT)
function Intel8253(_pic) {
    const pic = _pic;
    const count = [0, 0, 0];
    const value = [0, 0, 0];
    const latch = [0, 0, 0];
    const control = [0, 0, 0];
    const enabled = [false, false, false];
    const latched = [false, false, false];
    const output = [false, false, false];
    const toggle = [false, false, false];

    function isConnected(port) {
        return port >= 0x40 && port < 0x44;
    }

    function _output(sc, state) {
        if (!output[sc] && state) {
            switch (sc) {
            case 0: // TIMER 0
                pic.callIRQ(0);
                break;
            }
        }
        output[sc] = state;
    }

    function portIn(w, port) {
        const sc = port & 0b11;
        switch (sc) {
        case 0b00:
        case 0b01:
        case 0b10:
            const rl = control[sc] >>> 4 & 0b11;
            let val = count[sc];
            if (latched[sc]) {
                val = latch[sc];
                if (rl < 0b11 || !toggle[sc])
                    latched[sc] = false;
            }
            switch (rl) {
            case 0b01: // Read least significant byte only.
                return val & 0xff;
            case 0b10: // Read most significant byte only.
                return val >>> 8 & 0xff;
            case 0b11: // Read lsb first, then msb.
                if (!toggle[sc]) {
                    toggle[sc] = true;
                    return val & 0xff;
                } else {
                    toggle[sc] = false;
                    return val >>> 8 & 0xff;
                }
            }
        }
        return 0;
    }

    function portOut(w, port, val) {
        let sc = port & 0b11;
        switch (sc) {
        case 0b00:
        case 0b01:
        case 0b10: {
            const m = control[sc] >>> 1 & 0b111;
            const rl = control[sc] >>> 4 & 0b11;
            switch (rl) {
            case 0b01: // Load least significant byte only.
                value[sc] = value[sc] & 0xff00 | val;
                break;
            case 0b10: // Load most significant byte only.
                value[sc] = val << 8 | value[sc] & 0xff;
                break;
            case 0b11: // Load lsb first, then msb.
                if (!toggle[sc]) {
                    toggle[sc] = true;
                    value[sc] = value[sc] & 0xff00 | val;
                } else {
                    toggle[sc] = false;
                    value[sc] = val << 8 | value[sc] & 0xff;
                }
                break;
            }
            if (rl < 0b11 || !toggle[sc]) {
                count[sc] = value[sc];
                pic.clearIRQ(0); // BIOS fix (see pcjs)
                enabled[sc] = true;
                output[sc] = m == 0b10 || m == 0b11;
            }
            break;
        }
        case 0b11:
            sc = val >>> 6 & 0b11;
            if ((val >>> 4 & 0b11) == 0b00) {
                latch[sc] = count[sc];
                latched[sc] = true;
            } else {
                // Counter programming.
                control[sc] = val & 0xffff;
                pic.clearIRQ(0); // BIOS fix (see pcjs)
            }
            break;
        }
    }

    function tick() {
        for (let sc = 0b00; sc < 0b11; ++sc)
            if (enabled[sc])
                switch (control[sc] >>> 1 & 0b111) {
                case 0b00:
                    count[sc] = --count[sc] & 0xffff;
                    if (count[sc] == 0)
                        _output(sc, true);
                    break;
                case 0b10:
                    count[sc] = --count[sc] & 0xffff;
                    if (count[sc] == 1) {
                        count[sc] = value[sc];
                        _output(sc, false);
                    } else
                        _output(sc, true);
                    break;
                case 0b11:
                    if ((count[sc] & 0b1) == 0b1) {
                        if (output[sc])
                            count[sc] = count[sc] - 1 & 0xffff;
                        else
                            count[sc] = count[sc] - 3 & 0xffff;
                    } else
                        count[sc] = count[sc] - 2 & 0xffff;
                    if (count[sc] == 0) {
                        count[sc] = value[sc];
                        _output(sc, !output[sc]);
                    }
                    break;
                }
    }

    return {
        isConnected,
        portIn,
        portOut,
        tick
    };
}

// Programmable Peripheral Interface (PPI)
function Intel8255(_pic) {
    const KBD_INIT_DELAY_MS = 250;
    const CLK2_TIMER_FLIP_CNT = 60;

    const pic = _pic;
    const ports = [0, 0, null, 0];
    let timer = 0;

    function getDIPSwitch(sw) {
        let b = 0, bit = 1;
        for (let i = 0; i < 8; i++) {
            if (sw.charAt(i) === '0')
                b |= bit;
            bit <<= 1;
        }
        return b;
    }

    function isConnected(port) {
        return port >= 0x60 && port < 0x64;
    }

    function keyTyped(scanCode) {
        ports[0] = scanCode;
        pic.callIRQ(1);
    }

    function portIn(w, port) {
        const ind = port & 0b11;
        switch (ind) {
            case 0:
                if (MACHINE === 0 && ports[1] & 0x80)
                    return getDIPSwitch(DIP_SWITCH1);
                if (ports[0] === 0x0fff) {
                    ports[0] = 0;
                    return 0xaa;
                }
                break;
            case 2:
                let res = 0, bit = (MACHINE === 0) ? 0x04 : 0x08;
                const ctrl = ports[1];
                if (ctrl & bit)
                    res |= (MACHINE === 0) ?
                            getDIPSwitch(DIP_SWITCH2) & 0x0f :
                            (getDIPSwitch(DIP_SWITCH_XT) >>> 4) & 0x0f;
                else
                    res |= (MACHINE === 0) ?
                            (getDIPSwitch(DIP_SWITCH2) >>> 4) & 0x01 :
                            getDIPSwitch(DIP_SWITCH_XT) & 0x0f;
                if (ctrl & 0x01)
                    if (ctrl & 0x02)
                        res |= 0x20;
                    else {
                        if ((timer % CLK2_TIMER_FLIP_CNT) === 0)
                            res |= 0x10;
                        timer++;
                    }
                else if (timer !== 0)
                    timer = 0;
                return res;
        }
        return ports[ind];
    }

    function portOut(w, port, val) {
        const ind = port & 0b11;
        ports[ind] = val;
        if (ind === 1) {
            if ((val & 0x40) === 0)
                setTimeout(() => keyTyped(0x0fff), KBD_INIT_DELAY_MS);
            if ((val & 0x80) > 0)
                pic.clearIRQ(1);
        }
    }

    return {
        isConnected,
        keyTyped,
        portIn,
        portOut
    };
}

// Programmable Interrupt Controller (PIC)
function Intel8259() {
    let imr = 0, ___imr = 0, irr = 0, isr = 0;
    const icw = [0, 0, 0, 0];
    let icwStep = 0, status_read = 0x0a;

    function callIRQ(line) {
        irr |= 1 << line;
    }

    function clearIRQ(line) {
        irr &= ~(1 << line);
    }

    function hasInt() {
        return (irr & ~___imr) > 0;
    }

    function isConnected(port) {
        return port == 0x20 || port == 0x21;
    }

    function nextInt() {
        const bits = irr & ~___imr;
        for (let i = 0; i < 8; ++i)
            if ((bits >>> i & 0b1) > 0) {
                irr ^= 1 << i;
                isr |= 1 << i;
                return icw[1] + i;
            }
        return 0;
    }

    function portIn(w, port) {
        switch (port) {
        case 0x20:
            return (MACHINE !== 0 && status_read === 0x0b) ? isr : irr;
        case 0x21:
            return imr;
        }
        return 0;
    }

    function portOut(w, port, val) {
        switch (port) {
        case 0x20:
            if ((val & 0x10) > 0) {
                imr = 0;
                if (icwStep > 0)
                    icwStep = 0;
                icw[icwStep++] = val;
            }
            if ((val & 0x20) > 0) // EOI
                for (let i = 0; i < 8; ++i)
                    if ((isr >>> i & 0b1) > 0)
                        isr ^= 1 << i;
            status_read = val & 0x0f;
            break;
        case 0x21:
            if (icwStep == 1) {
                icw[icwStep++] = val;
                if ((icw[0] & 0x02) > 0)
                    ++icwStep;
            } else if (icwStep < 4)
                icw[icwStep++] = val;
            else {
                imr = val;
                if (val === 0) // BIOS fix (see pcjs)
                    setTimeout(0, () => ___imr = val);
                else
                    ___imr = val;
            }
            break;
        }
    }

    return {
        callIRQ,
        clearIRQ,
        hasInt,
        isConnected,
        nextInt,
        portIn,
        portOut
    };
}

// CRT Controller (CRTC for MDA and CGA adapters)
function Motorola6845() {
    let index = 0;
    const registers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let retrace = 0;

    function getRegister(index) {
        return registers[index];
    }

    function isConnected(port) {
        return (port >= 0x3b0 && port < 0x3bc) || (port >= 0x3d0 && port < 0x3dd);
    }

    function portIn(w, port) {
        switch (port) {
            case 0x3b4:
            case 0x3d4:
                return index;
            case 0x3b5:
            case 0x3d5: // Register read
                return registers[index];
            case 0x3ba:
            case 0x3da: // Status (read only)
                retrace = ++retrace % 4;
                switch (retrace) {
                    case 0:  // VR started and HR started
                        return 9;
                    case 1:  // VR ended and HR ended
                        return 0;
                    case 2:  // VR started and HR ended
                        return 8;
                    default: // VR ended and HR started
                        return 1;
                }
        }
        throw new Error(`6845: ${port.toString(16).padStart(4, '0')}`);
    }

    function portOut(w, port, val) {
        switch (port) {
            case 0x3b4:
            case 0x3d4: // Index (write only)
                index = val;
                if (index > 0x11)
                    throw new Error(`6845 index: ${index.toString(16).padStart(2, '0')}`);
                break;
            case 0x3b5:
            case 0x3d5: // Register write
                registers[index] = val;
                break;
            case 0x3b8:
            case 0x3d8:
            case 0x3b9:
            case 0x3d9:
                break;
            default:
                throw new Error(`6845: ${port.toString(16).padStart(4, '0')} <- ${val.toString(16).padStart(2, '0')}`);
        }
    }

    return {
        getRegister,
        isConnected,
        portIn,
        portOut
    };
}

// Floppy Disk Controller (FDC for up to 4 single/double density drives)
function Intel8272(_dma, _pic) {
    const dma = _dma;
    const pic = _pic;
    let regStatus, regDataArray, regDataIndex, regDataTotal, regOutput, regInput, regControl;
    let iDrive, bDrive, bHead, drive;

    const aCmdInfo = {
        0x02: {cbReq: 9, cbRes: 7 /*READ_TRACK*/},
        0x03: {cbReq: 3, cbRes: 0 /*SPECIFY*/},
        0x04: {cbReq: 2, cbRes: 1 /*SENSE_DRIVE*/},
        0x05: {cbReq: 9, cbRes: 7 /*WRITE_DATA*/},
        0x06: {cbReq: 9, cbRes: 7 /*READ_DATA*/},
        0x07: {cbReq: 2, cbRes: 0 /*RECALIBRATE*/},
        0x08: {cbReq: 1, cbRes: 2 /*SENSE_INT*/},
        0x0a: {cbReq: 2, cbRes: 7 /*READ_ID*/},
        0x0d: {cbReq: 6, cbRes: 7 /*FORMAT*/},
        0x0f: {cbReq: 3, cbRes: 0 /*SEEK*/}
    };

    const aDrives = [
        {nHeads: 1, nCylinders: 40, nSectors: 8},
        {nHeads: 1, nCylinders: 40, nSectors: 8},
        {nHeads: 1, nCylinders: 40, nSectors: 8},
        {nHeads: 1, nCylinders: 40, nSectors: 8}
    ];

    function init() {
        iDrive = 0;
        regStatus = 0x80;
        regDataArray = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        regDataIndex = 0;
        regDataTotal = 0;
        regOutput = 0;
        regInput = 0;
        regControl = 0;
        for (let i = 0; i < aDrives.length; i++) {
            const drive = aDrives[i];
            drive.bHead = drive.bCylinder = drive.bCylinderSeek = 0;
            drive.resCode = 0x000000c0;
        }
    }

    function popParms() {
        bDrive = regDataArray[regDataIndex++];
        bHead = (bDrive >> 2) & 0x1;
        iDrive = bDrive & 0x03;
        drive = aDrives[iDrive];
    }

    function doCmd(bCmd, bCmdMasked) {
        let fIRQ = false;
        regDataIndex = 1;
        let c;
        switch (bCmdMasked) {
            case 0x07: /*RECALIBRATE*/
                popParms();
                drive.bCylinder = drive.bCylinderSeek = 0;
                drive.resCode = 0x00000020 | 0x10000000;
                regDataIndex = regDataTotal = 0;
                fIRQ = true;
                break;
            case 0x08: /*SENSE_INT*/
                drive = aDrives[iDrive];
                drive.bHead = 0;
                regDataIndex = regDataTotal = 0;
                regDataArray[regDataTotal++] = iDrive | (drive.bHead << 2) | (drive.resCode & 0x000000ff);
                regDataArray[regDataTotal++] = drive.bCylinder;
                iDrive = (iDrive + 1) & 0x03;
                break;
            case 0x0f: /*SEEK*/
                popParms();
                drive.bHead = bHead;
                c = regDataArray[regDataIndex++];
                drive.bCylinder += c - drive.bCylinderSeek;
                if (drive.bCylinder < 0)
                    drive.bCylinder = 0;
                if (drive.bCylinder >= drive.nCylinders)
                    drive.bCylinder = drive.nCylinders - 1;
                drive.bCylinderSeek = c;
                drive.resCode = 0x00000020;
                if (!drive.bCylinder)
                    drive.resCode |= 0x10000000;
                regDataIndex = regDataTotal = 0;
                fIRQ = true;
                break;
        }
        if (regDataTotal > 0)
            regStatus |= (0x40 | 0x10);
        if (drive && fIRQ && !(drive.resCode & 0x00000008))
            pic.callIRQ(0x06);
    }

    function isConnected(port) {
        return port >= 0x3f0 && port < 0x3f8;
    }

    function portOut(w, port, bOut) {
        switch (port) {
            case 0x3f2:
                if (!(bOut & 0x04))
                    init();
                else if (!(regOutput & 0x04))
                    pic.callIRQ(0x06);
                regOutput = bOut;
                break;
            case 0x3f5:
                if (regDataTotal < regDataArray.length)
                    regDataArray[regDataTotal++] = bOut;
                let bCmd = regDataArray[0];
                let bCmdMasked = bCmd & 0x1f;
                const info = aCmdInfo[bCmdMasked];
                if (info !== undefined && regDataTotal >= info.cbReq)
                    doCmd(bCmd, bCmdMasked);
                break;
            case 0x3f7:
                regControl  = bOut;
                break;
        }
    }

    function portIn(w, port) {
        let bIn;
        switch (port) {
            case 0x3f1:
                return 0x50;
            case 0x3f4:
                return regStatus;
            case 0x3f5:
                bIn = 0;
                if (regDataIndex < regDataTotal)
                    bIn = regDataArray[regDataIndex];
                if (regOutput & 0x08)
                    pic.clearIRQ(0x06);
                if (++regDataIndex >= regDataTotal) {
                    regStatus &= ~(0x40 | 0x10);
                    regDataIndex = regDataTotal = 0;
                }
                return bIn;
            case 0x3f7:
                bIn = regInput;
                regInput &= ~0x80;
                return bIn;
        }
        return 0;
    }

    init();
    return {
        isConnected,
        portIn,
        portOut
    };
}

// EMS memory (Lo-tech 2MB card)
// page_mgr - function(start_address, end_address, write_fnc, read_fnc)
function EMS(page_mgr) {
    const ems_memory = new Uint8Array(0x200000),
          ems_base = 0xe0000,
          page_selectors = [0, 0, 0, 0];

    function isConnected(port) {
        return port >= 0x260 && port < 0x264;
    }

    function portIn(w, port) {
        return 0xff;
    }

    function portOut(w, port, bOut) {
        page_selectors[port - 0x260 & 3] = bOut;
    }

    function ph_addr(addr) {
        const frame_addr = addr - ems_base,
              page_addr = frame_addr & 0x3fff,
              selector = page_selectors[(frame_addr >>> 14) & 3];
        return selector * 0x4000 + page_addr;
    }

    function write(addr, val) {
        ems_memory[ph_addr(addr)] = val;
    }

    function read(addr) {
        return ems_memory[ph_addr(addr)];
    }

    page_mgr(ems_base, ems_base + 0x10000, write, read);
    return {
        isConnected,
        portIn,
        portOut
    };
}

// _crtc - Motorola6845 reference
// page_mgr  - function(start_address, end_address, write_fnc, read_fnc)
// ram       - system memory reference
function EGA(_crtc, page_mgr, ram) {
    const crtc = _crtc;

    let index = 0, swaddr = 0, count = 0, prev = 0x00, test = 0, idx = 0,
        seq_index = 0, gcr_index = 0, vmode = 0, vpidx = 0;
    const registers = [0, 0, 0, 0, 0, 0, 0],
          seq = [0, 0, 0, 0, 0, 0],
          gcr = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    function getRegister(index) {
        return (index < 0x12) ? crtc.getRegister(index) : registers[index - 0x12];
    }

    function isConnected(port) {
        return port === 0x3c2 || crtc.isConnected(port) ||
                port === 0x3c4 || port === 0x3c5 || port === 0x3ce || port === 0x3cf;
    }

    function portIn(w, port) {
        switch (port) {
            case 0x3c2: // switches
                let res = 0b00000000;
                if (swaddr === 0 || swaddr === 3)
                    res |= 0b00010000;
                return res;
            case 0x3b5:
            case 0x3d5: // Register read
                if (index < 0x12)
                    return crtc.portIn(w, port);
                return registers[index - 0x12];
            case 0x3ba:
            case 0x3da:
                if (test < 2774) {
                    // IBM EGA initialization stub
                    test++;
                    if ((test >= 548 && test < 564) || test === 660) return 0x00;
                    if (test > 660 && test < 661 + 6 * 0x15e) {
                        if (idx > 5) idx = 0;
                        return [0x30,0x00,0x30,0x00,0x30,0x01][idx++];
                    }
                    if (test >= 2761 && test < 2769) return [0x39,0x00,0x30,0x00,0x30,0x00,0x30,0x00][test - 2761];
                    if (test === 2774) return 0x39;
                }
                let b = 0;
                if (count++ > 224) {
                    b |= 0x08 | 0x01;
                    if (count > 224 + 97)
                        count = 0;
                } else {
                    let d;
                    if ((d = count % 7) === 0 || d === 1)
                        b |= 0x01;
                }
                b |= ((prev & 0x30) ^ 0x30);
                prev = b;
                return b;
            default:
                return crtc.portIn(w, port);
        }
    }

    function portOut(w, port, val) {
        switch (port) {
            case 0x3c2: // switches
                swaddr = (val & 0b00001100) >>> 2;
                break;
            case 0x3b4:
            case 0x3d4: // Index (write only)
                index = val;
                if (index < 0x12)
                    crtc.portOut(w, port, val);
                else if (index > 0x18)
                    throw new Error(`EGA index: ${index.toString(16).padStart(2, '0')}`);
                break;
            case 0x3b5:
            case 0x3d5: // Register write
                if (index < 0x12)
                    crtc.portOut(w, port, val);
                else
                    registers[index - 0x12] = val;
                break;
            case 0x3ba:
            case 0x3da:
                break;
            case 0x3c4:
                seq_index = val & 0x07;
                if (seq_index > 5)
                    throw new Error(`EGA seq index: ${seq_index.toString(16).padStart(2, '0')}`);
                break;
            case 0x3c5:
                seq[seq_index] = val;
                break;
            case 0x3ce:
                gcr_index = val & 0x0f;
                if (gcr_index > 8)
                    throw new Error(`EGA gcr index: ${gcr_index.toString(16).padStart(2, '0')}`);
                break;
            case 0x3cf:
                gcr[gcr_index] = val;
                break;
            default:
                crtc.portOut(w, port, val);
                break;
        }
    }

    function reset() {
        index = 0; swaddr = 0; count = 0; prev = 0x00; test = 0; idx = 0;
        registers[0] = 0; registers[1] = 0; registers[2] = 0; registers[3] = 0;
        registers[4] = 0; registers[5] = 0; registers[6] = 0;
        seq_index = 0; seq[0] = 0; seq[1] = 0; seq[2] = 0; seq[3] = 0; seq[4] = 0; seq[5] = 0;
        gcr_index = 0; gcr[0] = 0; gcr[1] = 0; gcr[2] = 0; gcr[3] = 0; gcr[4] = 0;
        gcr[5] = 0; gcr[6] = 0; gcr[7] = 0; gcr[8] = 0;
    }

    function write(addr, val) {
        if (gcr[6] & 0x02) {
            // chained
            if (addr >= 0xa8000)
                return;
            if (seq[4] & 0x04) switch (seq[2] & 0x0f) {
                // sequential
                case 1: ram[addr] = val; break;
                case 2: ram[addr + 0x8000] = val; break;
                case 15:
                    if (vmode !== ram[0x449]) {
                        vpidx = 0;
                        vmode = ram[0x449];
                    }
                    ram[addr + 0x8000 * vpidx++] = val;
                    if (vpidx > 1)
                        vpidx = 0;
                    break;
            }
            else switch (seq[2] & 0x0f) {
                // odd-even
                case 1: if (!(addr & 0x00001)) ram[addr] = val; break;
                case 2: if (addr & 0x00001) ram[addr + 0x8000] = val; break;
                case 15:
                    if (vmode !== ram[0x449]) {
                        vpidx = 0;
                        vmode = ram[0x449];
                    }
                    if (addr & 0x00001 && vpidx & 0x01)
                        ram[addr + 0x8000 * vpidx] = val;
                    if (++vpidx > 1)
                        vpidx = 0;
                    break;
            }
        } else {
            // not chained
            if (addr >= 0xa4000)
                return;
            if (seq[4] & 0x04) switch (seq[2] & 0x0f) {
                // sequential
                case 1: ram[addr] = val; break;
                case 2: ram[addr + 0x4000] = val; break;
                case 4: ram[addr + 0x8000] = val; break;
                case 8: ram[addr + 0xc000] = val; break;
                case 15:
                    if (vmode !== ram[0x449]) {
                        vpidx = 0;
                        vmode = ram[0x449];
                    }
                    ram[addr + 0x4000 * vpidx++] = val;
                    if (vpidx > 3)
                        vpidx = 0;
                    break;
            }
            else switch (seq[2] & 0x0f) {
                // odd-even
                case 1: if (!(addr & 0x00001)) ram[addr] = val; break;
                case 2: if (addr & 0x00001) ram[addr + 0x4000] = val; break;
                case 4: if (!(addr & 0x00001)) ram[addr + 0x8000] = val; break;
                case 8: if (addr & 0x00001) ram[addr + 0xc000] = val; break;
                case 15:
                    if (vmode !== ram[0x449]) {
                        vpidx = 0;
                        vmode = ram[0x449];
                    }
                    if (addr & 0x00001 && vpidx & 0x01)
                        ram[addr + 0x4000 * vpidx] = val;
                    if (++vpidx > 3)
                        vpidx = 0;
                    break;
            }
        }
    }

    function read(addr) {
        if (gcr[6] & 0x02) {
            // chained
            if (addr >= 0xa8000)
                return 0x00;
            switch (gcr[4] & 0x03) {
                case 0: return ram[addr];
                case 1: return ram[addr + 0x8000];
                default: return 0x00;
            }
        } else {
            // not chained
            if (addr >= 0xa4000)
                return 0x00;
            switch (gcr[4] & 0x03) {
                case 0: return ram[addr];
                case 1: return ram[addr + 0x4000];
                case 2: return ram[addr + 0x8000];
                default: return ram[addr + 0xc000];
            }
        }
    }

    page_mgr(0xa0000, 0xb0000, write, read);
    return {
        getRegister,
        isConnected,
        portIn,
        portOut,
        reset,
        seq, gcr
    };
}
