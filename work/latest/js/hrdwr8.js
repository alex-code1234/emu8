'use strict';

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
                if (val & 0x80) {
                    ports[3] = val;
                    write(0, 0x00); write(1, 0x00); write(2, 0x00);
                } else {
                    const bitnum = (val & 0x0e) >>> 1, cw = ports[3];
                    if ((cw & 0xed) === 0x80 || ((cw & 0xe8) === 0x80 && bitnum > 3) ||
                            ((cw & 0x85) === 0x80 && bitnum < 4)) {
                        const bit = val & 0x01;
                        if (bit) ports[2] |= 0x01 << bitnum;
                        else ports[2] &= ~(0x01 << bitnum);
                        if (onwritebit) onwritebit(bitnum, bit);
                    }
                }
                break;
        }
    };
    return {read, write, ports};
}

// Intel 8253 PIT
// onout(num) - output num activated
function Intel8253(onout = null, readCW = 0x00) {
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
                    case 3: case 7: values[0] = (values[0] / 2) | 0; break;
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
        },
        state = () => { return {mode, format, values}; };
        return {setup, read, write, tick, state};
    }
    const counters = [Counter(0), Counter(1), Counter(2)],
    read = num => {
        if (num === 3) return readCW;
        return counters[num].read();
    },
    write = (num, val) => {
        if (num === 3) counters[(val & 0xc0) >>> 6].setup(val);
        else counters[num].write(val);
    };
    return {read, write, counters};
}

// Floppy disk controller
function WD1793(Heads = 2, SecPerTrack = 5, SecSize = 1024) {
    let Drive = 0, Side = 0, LastS = 0, IRQ = 0, Wait = 0, Cmd = 0xd0, DPtr = 0, DLength = 0;
    const R = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x04 | 0x08]), // S_RESET | S_HALT
          Disk = [null, null], Track = [0, 0],
    read = num => {
        switch (num) {
            case 0: // WD1793_STATUS
                let res = R[0];
                if (Disk[Drive] === null) res |= 0x80;
                if (Cmd < 0x80 || Cmd == 0xd0)
                    R[0] = (R[0] ^ 0x02) & (0x02 | 0x01 | 0x80 | 0x40 | 0x04); else
                    R[0] &= 0x01 | 0x80 | 0x40 | 0x02;
                if ((R[0] & 0x01) && IRQ === 0x80) R[0] &= ~0x01;    // delay: reset busy bit
                return res;
            case 1: // WD1793_TRACK
            case 2: // WD1793_SECTOR
                return R[num];
            case 3: // WD1793_DATA
                if (DLength) {
                    R[3] = Disk[Drive][DPtr++];
                    if (--DLength) {
                        Wait = 255;
                        if (!(DLength & (SecSize - 1))) ++R[2];
                    } else {
                        R[0] &= ~0x02;                               // delay: busy bit
                        IRQ = 0x80;
                    }
                }
                else if ((Cmd & 0xf0) === 0xc0) {
                    switch (DPtr) {
                        case 0: R[3] = Track[Drive]; Wait = 255; break;
                        case 1: R[3] = Side; Wait = 255; break;
                        case 2: R[3] = R[2] ? R[2] : 1; Wait = 255; break;
                        case 3:
                            switch (SecSize) {
                                case 128: R[3] = 0; break;
                                case 256: R[3] = 1; break;
                                case 512: R[3] = 2; break;
                                default: R[3] = 3; break;
                            }
                            Wait = 255; break;
                        case 4: R[3] = 0x00; Wait = 255; break;
                        case 5:
                            R[3] = 0x00;
                            R[0] &= ~0x02;                           // delay: busy bit
                            IRQ = 0x80;
                            break;
                    }
                    DPtr++;
                }
                return R[3];
            case 4: // WD1793_READY
                if (Wait && !--Wait) {
                    DLength = 0;
                    R[0] = (R[0] & ~(0x02 | 0x01)) | 0x04;
                    IRQ = 0x80;
                }
                return IRQ;
            default:
                console.warn(`FDC: unknown port - ${num}`);
                return 0xff;
        }
    },
    write = (num, val) => {
        switch (num) {
            case 0: // WD1793_COMMAND
                IRQ = 0;
                if ((val & 0xf0) === 0xd0) {
                    DLength = 0;
                    Cmd = 0xd0;
                    if (R[0] & 0x01) R[0] &= ~0x01; else
                                     R[0] = (Track[Drive] ? 0 : 0x04) | 0x02;
                    if (val & 0x08) IRQ = 0x80;
                    break;
                }
                if (R[0] & 0x01) break;
                R[0] = 0x00;
                Cmd = val;
                switch (val & 0xf0) {
                    case 0x00: // RESTORE (seek track 0)
                        Track[Drive] = 0;
                        R[0] = 0x02 | 0x04 | ((val & 0x08) ? 0x20 : 0) | 0x01; // delay: busy bit
                        R[1] = 0;
                        IRQ = 0x80;
                        break;
                    case 0x10: // SEEK
                        DLength = 0;
                        Track[Drive] = R[3];
                        R[0] = 0x02 | (Track[Drive] ? 0 : 0x04) |              // delay: busy bit
                                ((val & 0x08) ? 0x20 : 0) | 0x01;
                        R[1] = Track[Drive];
                        IRQ = 0x80;
                        break;
                    case 0x20: // STEP
                    case 0x30: // STEP-AND-UPDATE
                    case 0x40: // STEP-IN
                    case 0x50: // STEP-IN-AND-UPDATE
                    case 0x60: // STEP-OUT
                    case 0x70: // STEP-OUT-AND-UPDATE
                        if (val & 0x40) LastS = val & 0x20; else val = (val & ~0x20) | LastS;
                        if (val & 0x20) { if (Track[Drive]) --Track[Drive]; } else ++Track[Drive];
                        if (val & 0x10) R[1] = Track[Drive];
                        R[0] = 0x02 | (Track[Drive] ? 0 : 0x04) | 0x01;        // delay: busy bit
                        IRQ = 0x80;
                        break;
                    case 0x80:
                    case 0x90: // READ-SECTORS
                    case 0xa0:
                    case 0xb0: // WRITE-SECTORS
                        R[0] &= ~0x04;                                         // reset tr0 bit
                        const sec = R[2] ? R[2] - 1 : 0;
                        DPtr = (Track[Drive] * SecPerTrack * Heads + SecPerTrack * Side + sec) *
                                SecSize;
                        if (Disk[Drive] === null || DPtr + SecSize > Disk[Drive].length) {
                            R[0] = (R[0] & ~0x18) | 0x10 | 0x01;               // delay: busy bit
                            if (Disk[Drive] === null) R[0] |= 0x80;
                            IRQ = 0x80;
                        } else {
                            DLength = SecSize * ((val & 0x10) ? SecPerTrack - sec : 1);
                            R[0] |= 0x01 | 0x02;
                            IRQ = 0x40;
                            Wait = 255;
                        }
                        break;
                    case 0xc0: // READ-ADDRESS
                        R[0] &= ~0x04;                                         // reset tr0 bit
                        DPtr = 0; DLength = 0;
                        R[0] |= 0x01 | 0x02;
                        IRQ = 0x40;
                        Wait = 255;
                        break;
                    case 0xe0: // READ-TRACK
                        break;
                    case 0xf0: // WRITE-TRACK (format)
                        R[0] &= ~0x04;                                         // reset tr0 bit
                        DPtr = Track[Drive] * SecPerTrack * Heads * SecSize;
                        if (Disk[Drive] === null ||
                                DPtr + SecSize * SecPerTrack * Heads > Disk[Drive].length) {
                            R[0] = (R[0] & ~0x18) | 0x10 | 0x01;               // delay: busy bit
                            if (Disk[Drive] === null) R[0] |= 0x80;
                            IRQ = 0x80;
                        } else {
                            R[0] |= 0x01 | 0x02;
                            IRQ = 0x80;
                            Disk[Drive].fill(0xe5, DPtr, DPtr + SecSize * SecPerTrack * Heads);
                        }
                        break;
                }
                break;
            case 1: // WD1793_TRACK
            case 2: // WD1793_SECTOR
                if (!(R[0] & 0x01)) R[num] = val;
                break;
            case 3: // WD1793_DATA
                if (DLength) {
                    Disk[Drive][DPtr++] = val;
                    if (--DLength) {
                        Wait = 255;
                        if (!(DLength & (SecSize - 1))) ++R[2];
                    } else {
                        R[0] &= ~0x02;                                         // delay: busy bit
                        IRQ = 0x80;
                    }
                }
                R[3] = val;
                break;
            case 4: // WD1793_SYSTEM
                if ((R[4] ^ val) & val & 0x04) {                     // S_RESET
                    R[0] = 0x00; R[1] = 0x00; R[2] = 0x00; R[3] = 0x00;
                    LastS = 0; IRQ = 0; Wait = 0; Cmd = 0xd0; DPtr = 0; DLength = 0;
                }
                if (val & 0x02)                                      // S_DRIVE
                    Drive = (val & 0x01) ? 1 : 0;
                if (Heads > 1 && (val & 0x10))                       // S_SIDE
                    Side = (val & 0x01) ? 1 : 0;
                R[4] = val;
                break;
            default:
                console.warn(`FDC: unknown port - ${num}, value - ${fmt(val, 2)}`);
                break;
        }
    },
    state = () => { return {Drive, Side, LastS, IRQ, Wait, Cmd, DPtr, DLength, R, Track}; };
    return {read, write, Disk, state};
}
