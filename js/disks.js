'use strict';

function Disk(cyls, sects, sect_size, heads = 1, top_dma, skew = null) {
    const drive = new Uint8Array(cyls * sects * heads * sect_size),
    transfer = (cyl, sec, dma, mem, read, count = 1, head = 0) => {
        if (dma + count * sect_size > top_dma) return read ? 5 : 6;  // read(5) or write(6) error
        for (let i = 0; i < count; i++) {
            if (cyl >= cyls || head >= heads) return 2;              // cylinder or head(2) error
            if (sec > sects) return 3;                               // sector(3) error
            let addr = ((cyl * heads + head) * sects + (skew ? skew[sec - 1] : sec) - 1) * sect_size;
            for (let j = 0; j < sect_size; j++)
                if (read) mem.wr(dma++, drive[addr++]);
                else drive[addr++] = mem.rd(dma++);
            if (++sec > sects) {
                head++; sec = 1;
                if (head >= heads) { cyl++; head = 0; }
            }
        }
        return 0;                                                    // no(0) errors
    };
    drive.fill(0xe5);                                                // empty image
    return {
        drive,
        transfer
    };
}

async function CPMDisk(fname, size) {
    const img = fname ? await loadFile(fname, false) : null;
    if (img) size = img.length;
    let cyls, sects;
    switch (size) {
        case 256256: cyls = 77; sects = 26; break;                   // 8" IBM SD
        case 4177920: cyls = 255; sects = 128; break;                // 4Mb harddisk
        case 536870912: cyls = 256; sects = 16384; break;            // 512Mb harddisk
        default: throw new Error(`disk image error: ${size}`);
    }
    const disk = Disk(cyls, sects, 128, undefined, 0x10000),
    // direct access to disk
    SKEW = [1, 7, 13, 19, 25, 5, 11, 17, 23, 3, 9, 15, 21, 2, 8, 14, 20, 26, 6, 12, 18, 24, 4, 10, 16, 22],
    DIRS = (sects === 26) ? 64 : (sects === 128) ? 1024 : 8192,
    BLKS = (sects === 26) ? 8 : (sects === 128) ? 16 : 128,
    diskBlock = (num, data = null) => {                              // read block (8 sectors)
        num = num * BLKS;            // first block absolute sector
        if (sects === 26) num += 52; // 2 tracks reserved for 8" IBM SD
        let read;
        if (read = data === null)
            data = new Uint8Array(128 * BLKS);
        let sec = num % sects,       // actual sector - 1
            trk = (num / sects) | 0; // actual track
        for (let i = 0; i < BLKS; i++) {
            disk.transfer(trk, (sects === 26) ? SKEW[sec] : sec + 1, i * 128,
                    {'rd': (i) => data[i], 'wr': (i, v) => data[i] = v}, read);
            if (++sec >= sects) { trk++; sec = 0; }
        }
        return data;
    },
    diskToDir = f => {                                               // file name to directory entry
        let t;
        return f.toUpperCase().replace('.', ''.padStart((t = f.indexOf('.')) < 0 ? 0 : 8 - t, ' ')).padEnd(11, ' ');
    },
    diskFromDir = (ds, entry) => {                                   // file name from directory entry
        return String.fromCharCode(...ds.slice(entry + 1, entry + 12));
    },
    diskDirsIter = fnc => {                                          // directory iterator
        let entry = 0;
        for (let i = 0; i < DIRS; i++) {
            if (!fnc(entry)) break;
            entry += 32;
        }
    },
    diskAvail = (total, start, used) => {                            // available blocks
        const all = [];
        for (let i = start; i < total; i++) all.push(i);
        return all.filter(x => !used.includes(x));
    },
    diskRW = (name, data = null) => {                                // direct disk IO
        const sz = 32 * DIRS, bs = 128 * BLKS, buf = new Uint8Array(sz);
        for (let i = 0, n = sz / bs | 0, offs = 0; i < n; i++, offs += bs)
            buf.set(diskBlock(i), offs);             // read dirs block
        name = diskToDir(name);
        if (data === null) {                                         // read file
            data = [];
            let scts = 0;                            // total sectors
            diskDirsIter(entry => {                  // scan directories
                if (buf[entry] === 0x00 && diskFromDir(buf, entry) === name) {
                    const recs = buf[entry + 15];
                    scts += recs;                    // add total sectors
                    for (let i = 0; i < 16; i++) {
                        let al = buf[entry + 16 + i];
                        if (sects > 26) {            // 2 bytes block numbers
                            i++;                     // get high byte
                            al = buf[entry + 16 + i] << 8 | al;
                        }
                        if (al === 0x00) break;      // not used, report EOF
                        data.push(...diskBlock(al)); // save file block
                    }
                    if (recs < 0x80) return false;   // last extent (dir entry)
                }
                return true;                         // continue scan
            });
            if (data.length === 0) return null;      // file not found or empty
            data.length = scts * 128;                // adjust length
            const clean_data = new Uint8Array(data.length);
            clean_data.set(data, 0);
            return clean_data;
        } else {                                                     // write file
            const used_blocks = [],                  // find used blocks
                  free_dirs = [];                    // and free dir entries
            diskDirsIter(async entry => {            // scan directories
                if (buf[entry] === 0x00)             // used directory entry
                    if (diskFromDir(buf, entry) === name)
                        free_dirs.unshift(entry);    // existing file, overwrite
                    else
                        for (let i = 0; i < 16; i++) {
                            const al = buf[entry + 16 + i];
                            if (sects > 26) {        // 2 bytes block numbers
                                i++;                 // get high byte
                                al = buf[entry + 16 + i] << 8 | al;
                            }
                            if (al !== 0x00)
                                used_blocks.push(al); // save used block
                        }
                else
                    free_dirs.push(entry);           // save free dir
                return true;
            });
            let tot, len = data.length,
                scts = len / 128 | 0,                // total sectors
                fill = len % 128;                    // used space in last sector
            if (fill !== 0) scts++;
            let blocks = scts / BLKS | 0;            // total blocks
            if (scts % 8 !== 0) blocks++;
            if (blocks > (tot = disk.drive.length / bs | 0) - used_blocks.length)
                throw new Error('disk is full');
            let dirs = scts / 0x80 | 0;              // total dir entries
            if (scts % 0x80 !== 0) dirs++;
            if (dirs > free_dirs.length)
                throw new Error('directory is full');
            const avail_blocks = diskAvail(tot, sz / bs | 0, used_blocks),
                  extc = (sects > 26) ? 8 : 16;      // extent blocks count
            let idx = 0,                             // data offset
                dir_idx = -1,                        // free dirs index
                dir,                                 // current dir entry
                al_idx = 0,                          // available blocks index
                al_offs;                             // current al offset
            for (let i = 0; i < blocks; i++) {       // save blocks
                if (i % extc === 0) {                // next extent
                    if (dir_idx >= 0) {
                        buf[dir + 15] = 0x80;        // prev directory RC
                        scts -= extc * BLKS;         // adjust remaining sectors
                    }
                    dir = free_dirs[++dir_idx];      // next directory entry
                    buf[dir] = 0x00;                 // mark as used
                    for (let j = 0; j < 11; j++)     // set file name
                        buf[dir + 1 + j] = name.charCodeAt(j);
                    buf[dir + 12] = dir_idx % 32 & 0xff;       // set extent
                    buf[dir + 14] = (dir_idx / 32 | 0) & 0xff; // and S2
                    al_offs = 0;                     // reset allocations offset
                }
                const al = avail_blocks[al_idx++];   // next available block
                let dbuf;
                if (i < blocks - 1)
                    dbuf = data.slice(idx, idx + bs);
                else {                               // last block
                    dbuf = new Uint8Array(bs);       // adjust length
                    const rest = data.slice(idx);
                    dbuf.set(rest, 0);
                    buf[dir + 15] = scts;            // set directory RC
                    if (fill > 0) {
                        let offs = rest.length;
                        for (let j = 0, n = 128 - fill; j < n; j++)
                            dbuf[offs++] = 0x1a;     // fill gap
                    }
                }
                diskBlock(al, dbuf);                 // save block
                idx += bs;
                buf[dir + 16 + al_offs++] = al & 0xff; // save allocation
                if (sects > 26)                      // set high byte
                    buf[dir + 16 + al_offs++] = al >>> 8 & 0xff;
            }
            while (al_offs <= 15)                    // for last dir
                buf[dir + 16 + al_offs++] = 0x00;    // clear remaining allocations
            for (let i = 0, n = sz / bs | 0, offs = 0; i < n; i++, offs += bs)
                diskBlock(i, buf.slice(offs, offs + bs)); // save dirs
        }
    };
    // CPMDisk code
    if (img) disk.drive.set(img, 0);
    return {
        'drive': disk.drive,
        'transfer': (cyl, sec, dma, read, mem, count = 1) => disk.transfer(cyl, sec, dma, mem, read, count),
        diskRW
    };
}

async function UCSDDisk(fname, size, vers = 4) {
    let img = fname ? await loadFile(fname, false) : null;
    if (img) size = img.length;
    if (size !== 256256) {
        if (!(fname && fname.endsWith('.vol'))) throw new Error(`disk image error: ${size}`);
        const tmp = new Uint8Array(256256);                          // load UCSD volume as disk, pad 00
        if (img.length > 252928) img = img.slice(0, 252928);         // cut image (256256 - 26 * 128)
        tmp.set(img, 3328);                                          // add 0-th track (26 * 128)
        img = tmp;
    }
    const disk = Disk(77, 26, 128, undefined, 0x10000, (vers === 4) ? undefined : [
        1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26
    ]);
    if (img) disk.drive.set(img, 0);
    return {
        'drive': disk.drive,
        'transfer': (cyl, sec, dma, read, mem, count = 1) => {
            if (sec === null) {                                      // transfer block
                count = 4;                                           // 4 sectors per block
                cyl = cyl * 4 + 26;                                  // 1 track reserved
                sec = cyl % 26 + 1;                                  // actual sector
                cyl = cyl / 26 | 0;                                  // actual track
            }
            return disk.transfer(cyl, sec, dma, mem, read, count);
        }
    };
}

async function DOSDisk(fname, size) {
    const img = fname ? await loadFile(fname, false) : null;
    if (img) size = img.length;
    let cyls, sects, heads;
    switch (size) {
        case 163840: cyls = 40; sects = 8; heads = 1; break;         // 160Kb
        case 368640: cyls = 40; sects = 9; heads = 2; break;         // 360Kb
        case 737280: cyls = 80; sects = 9; heads = 2; break;         // 720Kb
        case 1228800: cyls = 80; sects = 15; heads = 2; break;       // 1.2Mb
        case 1474560: cyls = 80; sects = 18; heads = 2; break;       // 1.44Mb
        case 10653696: cyls = 306; sects = 17; heads = 4; break;     // 10Mb harddisk
        default: throw new Error(`disk image error: ${size}`);
    }
    const disk = Disk(cyls, sects, 512, heads, 0x100000);
    if (img) disk.drive.set(img, 0);
    return {
        'drive': disk.drive,
        'transfer': (cyl, sec, head, dma, read, mem, count = 1) => {
            if (sec === null) {                                      // LBA address
                sec = cyl % sects + 1;                               // actual sector
                head = (cyl / sects | 0) % heads;                    // actual head
                cyl = cyl / (heads * sects) | 0;                     // actual cylinder
            }
            const result = disk.transfer(cyl, sec, dma, mem, read, count, head);
            switch (result) {                                        // translate result
                case 2:
                case 3: return 4;                                    // sector not found
                case 5:
                case 6: return 15;                                   // DMA out of range
                default: return result;
            }
        }
    };
}

async function Disk_5_25(fname) {
    const img = fname ? await loadFile(fname, false) : null;
    if (img && img.length !== 143360) throw new Error(`disk image error: ${img.length}`);
    const disk = Disk(35, 16, 256, undefined, 0x10000);
    if (img) disk.drive.set(img, 0);
    return {
        'drive': disk.drive,
        'transfer': (cyl, sec, dma, read, mem, count = 1) => {
            if (sec === null) {                                      // transfer block
                count = 2;                                           // 2 sectors per block
                cyl = cyl * 2;                                       // no reserved tracks
                sec = cyl % 16 + 1;                                  // actual sector
                cyl = cyl / 16 | 0;                                  // actual track
            }
            else sec++;                                              // sectors numbered from 0
            return disk.transfer(cyl, sec, dma, mem, read, count);
        }
    };
}

async function AppleDisk(dos33 = true) {                             // Disk II (github.com/whscullin/apple2js)
    const DOP_SKEW = [0, 7, 14, 6, 13, 5, 12, 4, 11, 3, 10, 2, 9, 1, 8, 15],               // DOS 3.3 skew physical
          DOL_SKEW = [0, 13, 11, 9, 7, 5, 3, 1, 14, 12, 10, 8, 6, 4, 2, 15],               // DOS 3.3 skew logical
          POP_SKEW = [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15],               // ProDOS skew physical
          POL_SKEW = [0, 2, 4, 6, 8, 10, 12, 14, 1, 3, 5, 7, 9, 11, 13, 15],               // ProDOS skew logical
    toNIB = (data, secSkew) => {                                                           // drive to raw
        const sixTwo = [                                                                   // 6 2 byte encoding
            0x96, 0x97, 0x9a, 0x9b, 0x9d, 0x9e, 0x9f, 0xa6, 0xa7, 0xab, 0xac, 0xad, 0xae, 0xaf, 0xb2, 0xb3,
            0xb4, 0xb5, 0xb6, 0xb7, 0xb9, 0xba, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xcb, 0xcd, 0xce, 0xcf, 0xd3,
            0xd6, 0xd7, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xdf, 0xe5, 0xe6, 0xe7, 0xe9, 0xea, 0xeb, 0xec,
            0xed, 0xee, 0xef, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe, 0xff
        ],
        bytes = new Uint8Array(232960), prenib = new Uint8Array(342);
        let offs;
        const oddEven = b => { bytes[offs++] = 0xaa | b >> 1; bytes[offs++] = 0xaa | b; }; // sector headers encoding
        for (let track = 0; track < 35; track++) {
            offs = track * 6656;
            for (let sec = 0; sec < 16; sec++) {
                for (let i = 0; i < 20; i++) bytes[offs++] = 0xff;                         // sync bytes
                bytes[offs++] = 0xd5; bytes[offs++] = 0xaa; bytes[offs++] = 0x96;          // addr prologue
                oddEven(254); oddEven(track); oddEven(sec); oddEven(254 ^ track ^ sec);    // volume and checksum
                bytes[offs++] = 0xde; bytes[offs++] = 0xaa; bytes[offs++] = 0xeb;          // addr epilogue
                for (let i = 0; i < 20; i++) bytes[offs++] = 0xff;                         // sync bytes
                bytes[offs++] = 0xd5; bytes[offs++] = 0xaa; bytes[offs++] = 0xad;          // data prologue
                const doffs = secSkew[sec] * 256 + track * 4096;                           // pre-nibble
                for (let i = 0; i < 256; i++) {
                    const d8 = data[doffs + i]; prenib[i] = d8 >> 2;
                    if (i < 86) prenib[256 + 85 - i] = (d8 & 0x02) >> 1 | (d8 & 0x01) << 1;
                    else if (i < 172) prenib[256 + 171 - i] |= (d8 & 0x02) << 1 | (d8 & 0x01) << 3;
                    else prenib[256 + 257 - i] |= (d8 & 0x02) << 3 | (d8 & 0x01) << 5;
                    if (i < 2) prenib[257 - i] |= (d8 & 0x02) << 3 | (d8 & 0x01) << 5;
                }
                let prev = 0;                                                              // encode
                for (let i = 0; i < 86; i++) {
                    bytes[offs++] = sixTwo[prev ^ prenib[256 + 85 - i]]; prev = prenib[256 + 85 - i];
                }
                for (let i = 0; i < 256; i++) { bytes[offs++] = sixTwo[prev ^ prenib[i]]; prev = prenib[i]; }
                bytes[offs++] = sixTwo[prev];
                bytes[offs++] = 0xde; bytes[offs++] = 0xaa; bytes[offs++] = 0xeb;          // data epilogue
            }
            while (offs < (track + 1) * 6656) bytes[offs++] = 0xff;                        // fill sync bytes
        }
        return bytes;
    },
    fromNIB = (data, secSkew) => {                                                         // raw to drive
        const sixTwo = [                                                                   // 6 2 byte decoding
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x02, 0x03, 0x00, 0x04, 0x05, 0x06,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x08, 0x00, 0x00, 0x00, 0x09, 0x0A, 0x0B, 0x0C, 0x0D,
            0x00, 0x00, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x00, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1B, 0x00, 0x1C, 0x1D, 0x1E,
            0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x20, 0x21, 0x00, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x29, 0x2A, 0x2B, 0x00, 0x2C, 0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32,
            0x00, 0x00, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x00, 0x39, 0x3A, 0x3B, 0x3C, 0x3D, 0x3E, 0x3F
        ],
        bytes = new Uint8Array(143360), decodeA = new Uint8Array(343);
        for (let track = 0; track < 35; track++)
            for (let sec = 0; sec < 16; sec++) {
                const doffs = (track * 16 + sec) * 256;
                let offs = track * 6656 + secSkew[sec] * 403;
                offs += 57;                                                                // skip data header
                let last = 0, val, dj;
                for (let jdx = 0x55; jdx >= 0; jdx--) {
                    val = sixTwo[data[offs++] - 0x80] ^ last;
                    decodeA[jdx] = val; last = val;
                }
                for (let jdx = 0; jdx < 0x100; jdx++) {
                    val = sixTwo[data[offs++] - 0x80] ^ last;
                    bytes[doffs + jdx] = val; last = val;
                }
                const checkSum = sixTwo[data[offs++] - 0x80] ^ last;
                if (checkSum) throw new Error(`checksum error: ${last} [${checkSum ^ last}]`);
                for (let kdx = 0, jdx = 0x55; kdx < 0x100; kdx++) {
                    bytes[dj = doffs + kdx] <<= 1;
                    if ((decodeA[jdx] & 0x01) !== 0) bytes[dj] |= 0x01;
                    decodeA[jdx] >>= 1;
                    bytes[dj] <<= 1;
                    if ((decodeA[jdx] & 0x01) !== 0) bytes[dj] |= 0x01;
                    decodeA[jdx] >>= 1;
                    if (--jdx < 0) jdx = 0x55;
                }
            }
        return bytes;
    },
    PHASE_DELTA = [[0, 1, 2, -1], [-1, 0, 1, 2], [-2, -1, 0, 1], [1, -2, -1, 0]],
    access = (n, val) => {
        let result = 0;
        const readMode = val === undefined;
        switch (n) {
            case 0x01: case 0x03: case 0x05: case 0x07:
                if (on) {
                    track += PHASE_DELTA[phase][tmp = n / 2 | 0] * 2;
                    phase = tmp;
                    if (track < 0) track = 0;
                    else if (track > 35 * 4 - 1) track = 35 * 4 - 1;
                }
                break;
            case 0x08: on = false; break;
            case 0x09: on = true; break;
            case 0x0a: driveNo = 0; break;
            case 0x0b: driveNo = 1; break;
            case 0x0c:
                q6 = false;
                if (on && (skip || q7)) {
                    const diskBytes = diskNBytes[driveNo];
                    if (diskBytes === null) return 0xff;
                    if (head > 6656) head = 0;
                    if (q7) diskBytes[(track >> 2) * 6656 + head] = bus;
                    else latch = diskBytes[(track >> 2) * 6656 + head];
                    ++head;
                }
                else latch = 0;
                skip = ++skip % 2;
                break;
            case 0x0d:
                q6 = true;
                if (readMode && !q7) latch >>= 1;
                break;
            case 0x0e: q7 = false; break;
            case 0x0f: q7 = true; break;
        }
        if (readMode) {
            if ((n & 0x01) === 0) result = latch; else result = 0;
        }
        else bus = val;
        return result;
    },
    disks = [null, null],
    diskNBytes = [null, null],
    skewP = dos33 ? DOP_SKEW : POP_SKEW,
    skewL = dos33 ? DOL_SKEW : POL_SKEW,
    load = async (num, fname) => {
        const dsk = await Disk_5_25(fname);
        diskNBytes[num] = toNIB(dsk.drive, skewP);
        disks[num] = dsk;
    },
    save = num => disks[num].drive.set(fromNIB(diskNBytes[num], skewL), 0);
    let bus = 0, latch = 0, driveNo = 0, on = false, q6 = false, q7 = false,
        track = 0, phase = 0, readOnly = false, skip = 0, head = 0, tmp;
    return {
        disks,
        load,
        save,
        'slot': {                                                    // Disk II interface card
            'ramRead': n => access(n),
            'ramWrite': (n, v) => access(n, v)
        }
    };
}
