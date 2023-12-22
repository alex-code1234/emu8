// https://web.archive.org/web/20191231192845/http://users.telenet.be/kim1-6502/
// https://web.archive.org/web/20191123062706/http://www.ittybittycomputers.com/ittybitty/tinybasic/
// http://retro.hansotten.nl/6502-sbc/kim-1-manuals-and-software/kim-1-software/tiny-basic/
// https://github.com/maksimKorzh/KIM-1/tree/main
// https://github.com/wutka/kim1-emulator
'use strict';

async function kim(scr) {                 // default version
    return await kim1(scr);
}

async function kim1(scr) {                // KIM-1
//    CPU_INSTR_CNT = 3000; // set for first book examples
    const mod = await defaultHW(scr, new URLSearchParams(
            '?cpu_type=2&mem=kim1/kim&mem_name=kim_memo&mon=js/monitor&mon_name=kim_con&kbd_name=kim_keys')),
          memo = mod.memo, cmd = mod.cmd, con = memo.con,
          testPrg1 = [0x02,0x03,0x18,0xa5,0x00,0x65,0x01,0x85,0xfa,0xa9,0x00,0x85,0xfb,0x4c,0x4f,0x1c],
          tapeData = [0xab,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f],
          zeroData = [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
          clockPrg = [0xA2,0xEA,0xCA,0xA5,0x60,0x85,0xFb,0xA5,0x61,0x85,0xFA,0xA5,0x62,0x85,0xF9,0x86,
                      0x63,0x84,0x64,0x20,0x1F,0x1F,0xA6,0x63,0xA4,0x64,0xE0,0x00,0xd0,0xE4,0xF8,0x38,
                      0xA9,0x00,0x65,0x62,0x85,0x62,0xd8,0xC9,0x60,0xd0,0xd5,0xF8,0x38,0xA9,0x00,0x85,
                      0x62,0x65,0x61,0x85,0x61,0xd8,0xC9,0x60,0xd0,0xC6,0xF8,0x38,0xA9,0x00,0x85,0x62,
                      0x85,0x61,0x65,0x60,0x85,0x60,0xd8,0xC9,0x13,0xd0,0xb5,0xA9,0x01,0x85,0x60,0xC9,
                      0x01,0xF0,0xAD,0x20,0x5C,0x18],
          frstBook = [
              `0200: 20 1F 1F 20 6A 1F C5 60 F0 F6 85 60 C9 0A 90 29
               0210: C9 13 F0 18 C9 12 D0 E8 F8 18 A2 FD B5 FC 75 65
               0220: 95 FC 95 65 E8 30 F5 86 61 D8 10 D4 A9 00 85 61
               0230: A2 02 95 F9 CA 10 FB 30 C7 A4 61 D0 0F E6 61 48
               0240: A2 02 B5 F9 95 62 94 F9 CA 10 F7 68 0A 0A 0A 0A
               0250: A2 04 0A 26 F9 26 FA 26 FB CA D0 F6 F0 A2`,     // addition
              `0200: A9 00 85 F9 85 FA 85 FB A2 06 BD CE 02 95 E2 CA
               0210: 10 F8 A5 E8 49 FF 85 E8 A2 05 20 48 02 20 97 02
               0220: CA D0 F7 20 40 1F 20 6A 1F C9 15 10 E5 C9 00 F0
               0230: 06 C9 03 F0 0A D0 DB 06 E7 A9 40 C5 E7 D0 D3 46
               0240: E7 D0 CF 38 26 E7 D0 CA A9 7F 8D 41 17 A9 09 8D
               0250: 42 17 A9 20 85 E0 A0 02 A9 00 85 E1 B1 E2 25 E0
               0260: F0 07 A5 E1 19 E4 00 85 E1 88 10 F0 A5 E1 C4 E8
               0270: D0 08 A4 E0 C4 E7 D0 02 09 08 8D 40 17 A9 30 8D
               0280: 06 17 AD 07 17 F0 FB A9 00 8D 40 17 EE 42 17 EE
               0290: 42 17 46 E0 D0 C0 60 C6 E9 D0 1A A9 30 85 E9 8A
               02A0: 48 A2 FD F8 38 B5 FC 69 00 95 FC E8 D0 F7 D8 68
               02B0: AA E6 E2 A5 E2 C9 30 F0 09 A0 00 A5 E7 31 E2 D0
               02C0: 07 60 A9 00 85 E2 F0 F1 20 1F 1F 4C C8 02 D5 02
               02D0: 08 40 01 04 FF 00 00 00 04 00 08 00 06 12 00 11
               02E0: 00 05 00 2C 00 16 00 29 00 16 00 2B 00 26 00 19
               02F0: 00 17 00 38 00 2E 00 09 00 1B 00 24 00 15 00 39
               0300: 00 0D 00 21 00 10 00 00
               02D5: 00 00 00 04 00 08 00 06 12 00 11 00 05 00 2C 00
               02E5: 16 00 29 00 16 00 2B 00 26 00 19 00 17 00 38 00
               02F5: 2E 00 09 00 1B 00 24 00 15 00 39 00 0D 00 21 00
               0305: 10 00 00`,                                      // asteroid
              `0200: A2 33 8A 95 40 CA 10 FA A2 02 BD BB 03 95 75 CA
               0210: 10 F8 AD 04 17 85 80 D8 A6 76 E0 09 B0 34 A0 D8
               0220: 20 57 03 A0 33 84 76 20 30 03 38 A5 81 65 82 65
               0230: 85 85 80 A2 04 B5 80 95 81 CA 10 F9 29 3F C9 34
               0240: B0 E5 AA B9 40 00 48 B5 40 99 40 00 68 95 40 88
               0250: 10 D5 A0 DE 20 57 03 A5 77 20 A6 03 20 30 03 C9
               0260: 0A B0 F9 AA 86 79 CA 30 F3 E4 77 B0 EF A2 0B A9
               0270: 00 95 90 CA 10 FB 20 78 03 20 8F 03 20 78 03 20
               0280: 64 03 86 7A 20 28 03 20 30 03 AA CA 30 11 E4 96
               0290: D0 F5 20 78 03 C9 22 B0 40 E0 05 F0 53 D0 E8 A5
               02A0: 95 48 A2 00 20 0F 03 A2 04 A9 00 95 90 CA 10 FB
               02B0: 68 85 95 A6 7A 20 6D 03 20 92 03 20 28 03 A5 9A
               02C0: C9 22 B0 29 65 9B A6 91 D0 18 C9 22 90 02 A5 9A
               02D0: C9 17 B0 2C 20 8F 03 D0 E2 20 28 03 20 55 03 20
               02E0: 28 03 A5 77 F8 38 E5 79 85 77 4C 17 02 20 55 03
               02F0: 20 28 03 A5 77 F8 18 65 79 A0 99 90 01 98 D0 E8
               0300: A2 03 20 0F 03 A5 9A C5 97 F0 DF B0 D5 90 E4 B5
               0310: 97 F8 18 75 98 C9 22 B0 02 95 97 D8 B5 97 48 A0
               0320: E2 20 57 03 68 20 A6 03 A0 01 20 30 03 c8 D0 FA
               0330: 84 7F A0 13 A2 05 A9 7F 8D 41 17 B5 90   8C   42   17
               0340:    8D   40   17   E6 7B D0 FC 88 88 CA 10 EF 20 40 1F 20  ;fixed STA SAD STA SBD sequence
               0350: 6A 1F A4 7F 60 A0 E6 84 74 A0 05 B1 74 99 90 00
               0360: 88 10 F8 60 A6 76 C6 76 B5 40 4A 4A AA 18 D0 01
               0370: 38 BD BE 03 BC CB 03 60 20 64 03 E6 96 A6 96 94
               0380: 8F A0 10 90 02 84 98 18 F8 65 97 85 97 D8 60 20
               0390: 64 03 C6 99 A6 99 94 96 A0 10 90 02 84 9B 18 F8
               03A0: 65 9A 85 9A D8 60 48 4A 4A 4A 4A A8 B9 E7 1F 85
               03B0: 94 68 29 0F A8 B9 E7 1F 85 95 60 03 00 20 01 02
               03C0: 03 04 05 06 07 08 09 10 10 10 10 F7 DB CF E6 ED
               03D0: FD 87 FF EF F1 F1 F1 F1 ED F6 BE F1 F1 B8 FC F9
               03E0: F8 D3 F8 DC F8 C0 FC BE ED 87 F9 DE`,           // black jack
              `0200: A9 00 85 FB A9 21 85 F9 20 1F 1F 20 6A 1F C9 04
               0210: 10 F6 C9 00 F0 F2 85 FB F8 38 A5 F9 E5 FB 85 F9
               0220: 20 FE 1E D0 FB A9 08 85 EE A9 FF 8D 07 17 20 1F
               0230: 1F 2C 07 17 10 F8 A5 EE C6 EE D0 ED C6 F9 A5 F9
               0240: 29 10 4A 4A 4A 18 65 F9 E6 F9 29 03 D0 02 A9 01
               0250: AE 44 17 E0 A0 50 02 A9 02 85 FA A5 F9 38 E5 FA
               0260: 85 F9 C9 01 F0 04 30 10 50 9E A9 DE 85 FB A9 AD
               0270: 85 FA 20 1F 1F 18 90 FA A9 5A 85 FB A9 FE 85 FA
               0280: A9 00 85 F9 F0 EC`,                             // black match
              `0200: a9 60 8d fa 17 a9 03 8d fb 17 4c c0 03
               0300: 20 6A 1F C9 01 D0 0D 20 1F 1F 20 6A 1F C9 01 D0
               0310: 03 4C 05 1C 60
               0320: A5 82 D0 29 A5 81 38 E5 83 10 24 A5 80 D0 06 A9
               0330: 1E 85 70 D0 0A A9 01 C5 80 D0 14 A9 28 85 70 A9
               0340: 01 8D 03 17 EE 02 17 A5 70 AA CA 10 FD 30 DC 60
               0360: 48 8A 48 98 48 A9 83 8D 04 17 2c 07 17 10 FB E6
               0370: 80 A9 04 C5 80 D0 38 A9 00 85 80 18 F8 A5 81 69
               0380: 01 85 81 C9 60 D0 28 A9 00 85 81 A5 82 18 69 01
               0390: 85 82 C9 60 D0 19 A9 00 85 82 A5 83 18 69 01 85
               03A0: 83 C9 12 D0 02 E6 84 C9 13 D0 04 A9 01 85 83 D8
               03B0: A9 F4 8D 0F 17 68 A8 68 AA 68 40
               03C0: A9 00 85 80 A9 F4 8D 0F 17 A5 81 85 F9 A5 82 85
               03D0: FA A5 83 85 FB 20 1F 1F 20 00 03 20 20 03 EA EA
               03E0: EA EA EA EA EA EA EA EA EA EA EA EA EA EA EA EA
               03F0: EA EA EA EA EA EA EA EA EA EA EA EA 4c C9 03`,  // clock (uses interrupt)
              `0200: A2 0D 86 6E A9 00 95 60 CA 10 FB A2 0B B5 60 D0
               0210: 3B CA 10 F9 E6 6D A5 6C F0 09 C6 6D C6 6E D0 03
               0220: 4C 25 19 AD   06   17 4A 4A 4A 4A 4A C9 06 90 02 29  ;fixed timer for better RNG
               0230: 03 18 AA 69 0A 85 6F BD A4 02 85 70 A9 02 85 71
               0240: A0 05 B1 70 99 66 00 88 10 F8 84 6C A2 05 B5 66
               0250: D0 13 CA 10 F9 20 40 1F 20 6A 1F C5 6F D0 06 A5
               0260: 6C 10 02 E6 6C C6 72 D0 1E A9 20 85 72 A5 6C 30
               0270: 0D A2 0A B5 5A 95 5B CA D0 F9 86 5A F0 09 A2 F0
               0280: B5 6C 95 6B E8 30 F9 A9 7F 8D 41 17 A0 13 A2 05
               0290: B5 60 8D 40 17 8C 42 17 E6 73 D0 FC 88 88 CA 10
               02A0: EF 4C 0B 02 AA B0 B6 BC C2 C8 08 00 00 00 00 00
               02B0: 01 61 61 40 00 00 61 51 47 01 00 00 63 58 4E 00
               02C0: 00 00 71 1D 41 1F 01 00 63 58 4C 40 00 00`,     // farmer Brown
              `0200: F8 A5 E0 38 69 00 A2 01 C9 99 D0 01 8A 85 E0 20
               0210: 40 1F D0 ED D8 A9 99 85 FB A9 00 85 FA A2 A0 86
               0220: F9 86 E1 20 1F 1F 20 6A 1F C9 13 F0 D3 C5 E2 F0
               0230: F2 85 E2 C9 0A F0 10 B0 EA 0A 0A 0A 0A A2 03 0A
               0240: 26 F9 CA 10 FA 30 DC A5 F9 C5 E0 90 06 C5 FB B0
               0250: D2 85 FB A6 E0 E4 F9 90 08 A6 FA E4 F9 B0 C4 85
               0260: FA A6 E1 E8 E0 AA F0 B5 D0 B5`,                 // hi lo
              `0200: A9 00 85 F9 85 FA 85 FB 20 1F 1F 20 6A 1F C9 04
               0210: D0 03 4C 64 1C C9 02 F0 E7 C9 01 D0 EB A9 9C 8D
               0220: 06 17 20 1F 1F AD 07 17 F0 FB 8D 00 1C A9 9C 8D
               0230: 06 17 18 F8 A5 F9 69 01 85 F9 A5 FA 69 00 85 FA
               0240: C9 60 D0 0B A9 00 85 FA A5 FB 18 69 01 85 FB D8
               0250: 20 6A 1F C9 00 D0 CB F0 AF`,                    // timer
              `0200: a9 7f 8d 41 17 a9 ed a0 11 8d 40 17 8c 42 17 e6
               0210: 7b d0 fc 4c 05 02`                              // segment test
          ],
          wozmon = `
              :20B00000D8A2FF9AA9E18539A9B1853A208CB2A91BC908F011C91BF003C81017A95C200FCE
              :20B02000B1207BB2A0018830F8A920200FB1A908200FB1205DB2C9603002295F99000320B9
              :20B040000FB1C90DD0CBA0FFA900AA0A8537C8B90003C90DF0CBC92E90F4F0F0C93AF0EBB9
              :20B06000C952F031C94CF036863486358436B900034930C90A90066988C9FA90110A0A0A19
              :20B080000AA2040A26342635CAD0F8C8D0E0C436D0124C0FB0209BB04C0FB06C30002021FD
              :20B0A000B14C0FB02437500DA5348132E632D09FE6334C4FB0A537C92EF029A202B5339598
              :20B0C00031952FCAD0F7D012207BB2A53120FCB0A53020FCB0A93A200FB1A920200FB1A16B
              :20B0E0003020FCB08637A530C534A531E535B0C2E630D002E631A530290F10CA484A4A4A5B
              :20B100004A2005B168290F0930C93A90026906853998853AA539297F20A01EA53AA8A53954
              :20B1200060A9FA8539A9B1853A208CB2A000843A205DB2990003C8C91BF067C90DD0F1A074
              :20B14000FFC8B90003C93AD0F8C8A200863920BEB18538186539853920BEB18533186539BB
              :20B16000853920BEB185321865398539A92E200FB120BEB1C901F02A186539853920BEB12A
              :20B1800081321865398539E632D002E633C638D0EC20BEB1A000186539F095A901853A4CAC
              :20B1A00030B1A53AF00CA9338539A9B2853A208CB260A9188539A9B2853A208CB260B90051
              :20B1C000034930C90A900269080A0A0A0A8534C8B900034930C90A90026908290F0534C830
              :20B1E000600D0A57656C636F6D6520746F2065576F7A20312E30500D0A000D0A537461727D
              :20B200007420496E74656C20486578205472616E736665722E0D0A000D0A496E74656C207C
              :20B2200048657820496D706F72746564204F4B2E0D0A000D0A496E74656C204865782045C9
              :20B240006E636F756E746572656420436865636B73756D204572726F722E0D0A0098853A9E
              :20B26000AD421729FE8D4217205A1E8539AD421709018D4217A53AA8A5396098853AA90D9D
              :1EB2800020A01EA90A20A01EA53AA860A000B139F00B20A01EE639D0F3E63AD0EF60D6`;
    mod.info = 'KIM-1, 64K memory';       // update info
    mod.cmd = async (command, parms) => { // intercept command processor
        switch (command) {
            case 'tty':                   // TTY on/off
                if (parms.length < 2) { console.error('missing: enable [1|0]'); break; }
                console.log(serial.enabled(parms[1] === '1'));
                break;
            case 'ptr':                   // paper tape reader load tape
                if (parms.length < 2) { console.error('missing: fn'); break; }
                const pt = await loadFile(parms[1], true);
                serial.media().length = 0;
                for (let i = 0, n = pt.length; i < n; i++) {
                    const code = pt.charCodeAt(i);
                    serial.media().push(code);
                }
                break;
            case 'ptp':                   // paper tape puncher load tape
                if (parms.length < 2) { console.error('missing: fn'); break; }
                serial.fn(parms[1]);
                break;
            case '.':
                switch (pi(parms[1])) {
                    case 1: loadBin(testPrg1, 0x0000); break; // first program
                    case 2:                                   // audio tape program write
                        memo.wr(0x00f1, 0x00);                        // required
                        loadBin(tapeData, 0x0000);                    // data to write
                        memo.wr(0x17f5, 0x00); memo.wr(0x17f6, 0x00); // start address
                        memo.wr(0x17f7, 0x10); memo.wr(0x17f8, 0x00); // end address
                        memo.wr(0x17f9, 0x01);                        // record ID (1 - fe)
                        await monitor('g');
                        // [1] [8] [0] [0] [GO]                       // type to start
                        break;
                    case 3: console.log(tape.media()); break; // view tape
                    case 4: // audio tape program read
                        memo.wr(0x00f1, 0x00);                        // required
                        loadBin(zeroData, 0x0000);                    // clear data to read
                        memo.wr(0x17f9, 0x01);                        // record ID (1 - fe)
                        setTimeout(() => tape.playback(true), 15000); // start audio in 15 sec
                        await monitor('g');
                        // [1] [8] [7] [3] [GO]                       // type (before 15 sec past) to start
                        break;
                    case 5:                                   // audio signal test
                        tape.media(String.fromCharCode(0x16));
                        tape.playback(true); memo.ram[0x1742] = 0x07; // enable audio in
                        tape.debug(true);                             // tape updates cycles
                        while (tape.enabled()) tape.play();           // play tape
                        tape.debug(false);                            // CPU updates cycles
                        memo.ram[0x1742] = 0x27;                      // disable audio in
                        break;
                    case 6:                                   // clock program
                        loadBin(clockPrg, 0x0200);
                        await monitor('g 200');
                        break;
                    case 7:                                   // first book code
                        if (parms.length < 3) {
                            console.log('0 - addition   1 - asteroid       2 - black jack   3 - black match');
                            console.log('4 - clock      5 - farmer Brown   6 - hi lo        7 - timer');
                            console.log('8 - segment test');
                            break;
                        }
                        loadHex(frstBook[pi(parms[2], false)], 0x0200);
                        await monitor('g 200');
                        break;
                    case 8:                                   // apple-I Woz monitor
                        loadHex(wozmon, 0);
                        await monitor('g b000');
                        break;
                    default: throw new Error(`invalid parameter: ${parms[1]}`);
                }
                break;
            default: return cmd(command, parms);
        }
        return true;
    };
    memo.scope = () => cycles;            // add oscilloscope
    ssettings.addr = 0x1742;              // 6530-3 B port
    return mod;
}

async function kim_con(scr) {             // KIM-1 display
    if (typeof scr === 'string')
        scr = document.getElementById(scr);
    const stl = document.createElement('style');
    stl.type = 'text/css';
    stl.innerHTML = `.btn {
        position:absolute;width:16px;height:16px;background-color:transparent;border-width:1px;border-color:#595959;
    }`;
    document.head.appendChild(stl);
    scr.style = 'position:absolute;left:237px;top:283px;width:117px;height:32px;display:inline-block;';
    const div = document.createElement('div');
    div.innerHTML = `<img style='position:absolute;left:0px;top:35px;width:384px;height:512px;'/>
        <button onmousedown='k1key(0x13);' onmouseup='k1key();' class='btn' style='left:258px;top:366px;'></button>
        <button onmousedown='k1key(0x15);' onmouseup='k1key();' class='btn' style='left:280px;top:366px;'></button>
        <button onmousedown='k1key(0x16);' onmouseup='k1key();' class='btn' style='left:303px;top:366px;'></button>
        <button onmousedown='k1key(0x10);' onmouseup='k1key();' class='btn' style='left:258px;top:388px;'></button>
        <button onmousedown='k1key(0x11);' onmouseup='k1key();' class='btn' style='left:280px;top:388px;'></button>
        <button onmousedown='k1key(0x14);' onmouseup='k1key();' class='btn' style='left:303px;top:388px;'></button>
        <button onmousedown='k1key(0x12);' onmouseup='k1key();' class='btn' style='left:325px;top:388px;'></button>
        <button onmousedown='k1key(0x0c);' onmouseup='k1key();' class='btn' style='left:258px;top:410px;'></button>
        <button onmousedown='k1key(0x0d);' onmouseup='k1key();' class='btn' style='left:280px;top:410px;'></button>
        <button onmousedown='k1key(0x0e);' onmouseup='k1key();' class='btn' style='left:303px;top:410px;'></button>
        <button onmousedown='k1key(0x0f);' onmouseup='k1key();' class='btn' style='left:325px;top:410px;'></button>
        <button onmousedown='k1key(0x08);' onmouseup='k1key();' class='btn' style='left:258px;top:433px;'></button>
        <button onmousedown='k1key(0x09);' onmouseup='k1key();' class='btn' style='left:281px;top:433px;'></button>
        <button onmousedown='k1key(0x0a);' onmouseup='k1key();' class='btn' style='left:303px;top:433px;'></button>
        <button onmousedown='k1key(0x0b);' onmouseup='k1key();' class='btn' style='left:326px;top:433px;'></button>
        <button onmousedown='k1key(0x04);' onmouseup='k1key();' class='btn' style='left:259px;top:455px;'></button>
        <button onmousedown='k1key(0x05);' onmouseup='k1key();' class='btn' style='left:281px;top:455px;'></button>
        <button onmousedown='k1key(0x06);' onmouseup='k1key();' class='btn' style='left:304px;top:455px;'></button>
        <button onmousedown='k1key(0x07);' onmouseup='k1key();' class='btn' style='left:326px;top:455px;'></button>
        <button onmousedown='k1key(0x00);' onmouseup='k1key();' class='btn' style='left:259px;top:477px;'></button>
        <button onmousedown='k1key(0x01);' onmouseup='k1key();' class='btn' style='left:281px;top:477px;'></button>
        <button onmousedown='k1key(0x02);' onmouseup='k1key();' class='btn' style='left:304px;top:477px;'></button>
        <button onmousedown='k1key(0x03);' onmouseup='k1key();' class='btn' style='left:326px;top:477px;'></button>
        <canvas style='position:absolute;left:384px;top:55px;display:none;'></canvas>`;
    document.body.insertBefore(div, scr);
    document.getElementById('log').style = 'position:absolute;top:515px;';
    const ctx = scr.getContext('2d');
    ctx.lineWidth = 7;
    const img = div.childNodes[0];
    await loadImage('kim1/KIM-1.jpg', img);
    ctx.drawImage(img, 474, 516, 234, 64, 0, 0, scr.width, scr.height);
    const sgoffs = [[0, 0], [49, 1], [97, 0], [145, 0], [208, 2], [257, 2]],
          sgs = [                         // segments (begin, end)
              [16, 46, 31, 46],           // 0         0
              [32, 46, 29, 73],           // 1      5     1
              [29, 75, 26, 102],          // 2         6
              [10, 102, 25, 102],         // 3      4     2
              [11, 75, 8, 102],           // 4         3
              [14, 46, 11, 73],           // 5
              [13, 74, 28, 74]            // 6
          ],
          drwsg = (n, s) => {
              const o = sgoffs[n], sg = sgs[s];
              ctx.moveTo(sg[0] + o[0], sg[1] + o[1]);
              ctx.lineTo(sg[2] + o[0], sg[3] + o[1]);
          },
          draw = (n, segcolor, segbackgrnd, v) => {
              let mask = 0x01, curr = null;
              for (let i = 0; i < 7; i++, mask <<= 1) {
                  const color = (v & mask) ? segcolor : segbackgrnd;
                  if (color !== curr) {
                      if (curr !== null) ctx.stroke();
                      curr = color; ctx.strokeStyle = color;
                      ctx.beginPath();
                  }
                  drwsg(n, i);
              }
              ctx.stroke();
          },
    con = {                               // console
        'print': str => console.log(str),
        draw
    };
    segs = segments(con);
    segs.update();                        // start updating segments
    serial = tty(await VT_100(div.childNodes[div.childNodes.length - 1], {
        SCR_WIDTH: 40, SCR_HEIGHT: 24     // TTY screen
    }));
    return {
        con,
        'toggleDisplay': () => true       // stub, not used
    };
}

async function kim_memo(con) {            // KIM-1 system memory and IO
    const ram = new Uint8Array(0x10000),
          keys = [0xbf, 0xdf, 0xef, 0xf7, 0xfb, 0xfd, 0xfe];
    return {
        con, ram,
        'rd': a => {
            switch (a) {
                case 0x1706: return i6530_3.count();
                case 0x1707: return i6530_3.status();
                case 0x170e: return i6530_3.count(true);
                case 0x1740:
                    switch (ram[0x1742] >> 1 & 0x0f) {
                        case 0: return (lastKey <= 6) ? keys[lastKey] : 0xff;
                        case 1: return (lastKey >= 7 && lastKey <= 13) ? keys[lastKey - 7] : 0xff;
                        case 2: return (lastKey >= 14 && lastKey <= 20) ? keys[lastKey - 14] : 0xff;
                        case 3: return serial.key();
                        default: return 0x80;
                    }
                case 0x1742: serial.read(); return ram[a];
                case 0x1746: return i6530_2.count();
                case 0x1747: return i6530_2.status();
                default: return ram[a];
            }
        },
        'wr': (a, v) => {
            switch (a) {
                case 0x1704: i6530_3.reset(1, v); ram[a] = v; break;
                case 0x1705: i6530_3.reset(8, v); ram[a] = v; break;
                case 0x1706: i6530_3.reset(64, v); ram[a] = v; break;
                case 0x1707: i6530_3.reset(1024, v); ram[a] = v; break;
                case 0x170c: i6530_3.reset(1, v, true); ram[a] = v; break;
                case 0x170d: i6530_3.reset(8, v, true); ram[a] = v; break;
                case 0x170e: i6530_3.reset(64, v, true); ram[a] = v; break;
                case 0x170f: i6530_3.reset(1024, v, true); ram[a] = v; break;
                case 0x1740: segs.rows(v); ram[a] = v; break;
                case 0x1741: segs.enable(v === 0x7f); ram[a] = v; break;
                case 0x1742:
                    if (ram[0x1743] === 0xbf && v & 0x80 !== 0) tape.bit((ram[0x1744] > 180) ? 0 : 1);
                    ram[a] = v;
                    serial.write(v & 0x01);
                    if (v >= 0x09 && v <= 0x13) segs.column(v - 0x09 >> 1);
                    break;
                case 0x1743:
                    if (ram[0x1743] !== 0xbf && v === 0xbf) tape.record(true);
                    else if (ram[0x1743] === 0xbf && v !== 0xbf) tape.record(false);
                    ram[a] = v;
                    break;
                case 0x1744: i6530_2.reset(1, v); ram[a] = v; break;
                case 0x1745: i6530_2.reset(8, v); ram[a] = v; break;
                case 0x1746: i6530_2.reset(64, v); ram[a] = v; break;
                case 0x1747: i6530_2.reset(1024, v); ram[a] = v; break;
                default:
                    if (a !== 0xfff9) ram[a] = v; // RAM stop (used by TinyBasic to detect top memory)
                    break;
            }
        },
        'clear': () => ram.fill(0x00)
    };
}

function timer6530() {
    let div = 1, currdiv = 1, acc = 0, count = 0xff, passed = false, int = undefined;
    return {
        'reset': (n, v, inter) => {
            div = n; currdiv = n; acc = 0; count = v; passed = false; int = inter;
        },
        'count': (inter) => {
            if (passed) currdiv = div;
            else int = inter;
            return count & 0xff;
        },
        'status': () => passed ? 0x80 : 0x00,
        'update': () => {
            acc += 4; // one step is ~ 4 CPU cycles
            if (acc >= currdiv) {
                acc = 0; count--;
                if (count <= 0) {
                    currdiv = 1; passed = true; count = 0xff;
                    if (int && CPU.RUN) CPU.setInterrupt(0); // PB7 (A-15) connected to NMI (E-6)
                    int = undefined;
                }
            }
        }
    };
}

function audio() {
    let count = 0, data = 0, bits = 0,
        media = '',
        enabled = false, state = -1, byte = [], pulses = [], idx,
        debug = false;
    const res = {
        'record': v => {
            if (!v) res.bit(1);
            count = 0; data = 0; bits = 0;
        },
        'bit': v => {
            if (v === 0) count++;
            else if (count > 0) {
                v = (count > 12) ? 1 : 0;
                if (v === 1) data |= 0x01 << bits;
                bits++;
                if (bits >= 8) {
                    media += String.fromCharCode(data);
                    data = 0; bits = 0;
                }
                count = 0;
            }
        },
        'media': v => (v === undefined) ? media : media = v,
        'playback': v => {
            if (v) {
                state = 0; count = 0;
            }
            enabled = v;
        },
        'play': () => {
            if (!enabled || (memo.ram[0x1742] & 0x20) !== 0x00) return;
            switch (state) {
                case 0:
                    if (count >= media.length) { enabled = false; break; }
                    data = media.charCodeAt(count++);
                    byte.length = 0;
                    for (let mask = 0x01; mask <= 0x80; mask <<= 1)
                        byte.push(data & mask);
                    bits = 0;
                case 1:
                    if (bits > 7) { state = 0; break; }
                    pulses.length = 0;
                    if (byte[bits++] === 0) pulses.push(100, 470);
                    else pulses.push(470, 200);
                    idx = 0;
                case 2:
                    if (idx >= pulses.length) { state = 1; break; }
                    const sig = memo.ram[0x1742];
                    memo.ram[0x1742] = (idx % 2 === 0) ? sig | 0x80 : sig & 0x7f;
                    state = 3;
                case 3:
                    if (pulses[idx]-- <= 0) { idx++; state = 2; }
                    break;
            }
            if (debug) cycles++;
        },
        'enabled': () => enabled,
        'debug': v => (v === undefined) ? debug : debug = v
    };
    return res;
}

function tty(con) {
    let enabled = false, fn, media,
        sending, ready, count, byte,
        state = 0, current, bits;
    const res = {
        'enabled': v => {
            if (v !== undefined && enabled !== v) {
                enabled = v;
                if (enabled) res.reset();
                con.toggle();
            }
            return enabled;
        },
        'read': () => { if (enabled && sending) ready = true; },
        'write': v => {
            if (!enabled) return;
            if (sending) {
                if (ready) {
                    if (count === 8) {
                        if (byte !== 0) {
                            con.display(byte);
                            if (fn) {
                                media += String.fromCharCode(byte);
                                const ln = media.length; // check for XOFF
                                if (ln > 10 && media.substr(ln - 11, 3) === ';00') {
                                    if (media.startsWith('\r\n')) media = media.substr(2, ln);
                                    downloadFile(fn, media); fn = undefined;
                                }
                            }
                        }
                        sending = false;
                    }
                    byte = (byte >> 1 & 0x7f) | v << 7;
                    count++; ready = false;
                }
            }
            else if (v === 0) { sending = true; ready = false; count = 0; byte = 0; }
        },
        'key': v => {
            if (!enabled) return 0xff;
            if (v === undefined) switch (state) {
                case 0: state = 1; return 0x01;
                case 1: state = 2; return 0x00;
                case 2:
                    sending = false; // reading, reset sending flag
                    if (con.kbd.length === 0) return 0x80;
                    current = con.kbd.shift(); bits = 0; state = 3;
                    return 0x00;
                case 3:
                    if (bits > 6) state = 2;
                    return (current & 0x01 << bits++) ? 0x80 : 0x00;
            } else {
                con.kbd.push(v);
                if ((memo.ram[0x1742] & 0x21) === 0x01)
                    con.display(v);  // HW echo 
            }
        },
        'media': () => con.kbd,
        'fn': v => { fn = v; media = ''; },
        'reset': () => {
            con.kbd.length = 0;
            sending = false; ready = false; count = 0; byte = 0;
            state = 0; current = 0; bits = 0;
        }
    };
    return res;
}

function segments(con) {
    const segcolor = '#ff2c0f', segbackgrnd = '#383838',
          dimtime = 50, updtime = 200;
    function segment(num) {
        let row = 0, zero = false, curr = null, dim = 0, off = false, upd = 0;
        return {
            'row': v => {
                if (v === 0) zero = true; else row = v;
                dim = Date.now(); off = false;
            },
            'update': now => {
                if (now - dim >= dimtime && !off) { off = true; row = 0; zero = false; }
                if (now - upd >= updtime) {
                    upd = now;
                    if (curr !== row) { curr = row; con.draw(num, segcolor, segbackgrnd, row); }
                }
                else if (zero) { row = 0; zero = false; }
            }
        };
    }
    let enabled = false, column = 0;
    const sgms = [segment(0), segment(1), segment(2), segment(3), segment(4), segment(5)],
    res = {
        'enable': v => enabled = v,
        'column': v => {
            if (!enabled) return;
            column = v;
        },
        'rows': v => {
            if (!enabled) return;
            sgms[column].row(v);
        },
        'update': () => {
            const now = Date.now();
            for (let i = 0; i < 6; i++) sgms[i].update(now);
            setTimeout(res.update, dimtime);
        }
    };
    return res;
}

let cycles = 0, initialized = false, lastKey, serial, segs;

const i6530_2 = timer6530(), i6530_3 = timer6530(), tape = audio();

function k1key(key) {
    if (key !== undefined)
        lastKey = key;
    else {
        switch (lastKey) {
            case 0x15:                    // stop
                if (initialized && CPU.RUN)
                    CPU.setInterrupt(0);
                break;
            case 0x16:                    // reset
                CPU.RUN = false;          // stop CPU
                serial.reset(); tape.playback(false);
                (async () => {
                    if (!initialized) {   // inject timers update
                        const original = CPU.step;
                        CPU.step = () => {
                            const result = original();
                            i6530_2.update(); i6530_3.update();
                            tape.play();
                            cycles++;
                            return result;
                        };
                    }
                    memo.clear();
                    loadBin(await loadFile('kim1/KIM-1_65302.bin', false), 0x1c00);
                    memo.wr(0x1c2b, 0x00); // !!!fix default TTY delay
                    loadBin(await loadFile('kim1/KIM-1_65303.bin', false), 0x1800);
                    memo.wr(0xfffa, memo.rd(0x1ffa)); memo.wr(0xfffb, memo.rd(0x1ffb)); // NMI to memory extension
                    memo.wr(0xfffc, memo.rd(0x1ffc)); memo.wr(0xfffd, memo.rd(0x1ffd)); // RST to memory extension
                    memo.wr(0xfffe, memo.rd(0x1ffe)); memo.wr(0xffff, memo.rd(0x1fff)); // IRQ to memory extension
                    memo.wr(0x17fa, 0x00); memo.wr(0x17fb, 0x1c); // NMI redirect to use stop button
                    memo.wr(0x17fe, 0x00); memo.wr(0x17ff, 0x1c); // IRQ redirect
                    CPU.reset(); run();
                    initialized = true;
                })();
                break;
        }
        setTimeout(() => lastKey = undefined, 1);
    }
}

async function kim_keys(con, memo) {      // used with TTY
    return {
        'keyboard': async (key, code, value) => {
            if (value === null) return;
            switch (code) {
                case 8: serial.key(0x7f); return;
                case 13: serial.key(0x0d); return;
                case 229: serial.key(value.toUpperCase().charCodeAt(0)); return;
            }
        }
    };
}
