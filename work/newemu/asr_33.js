'use strict';

function Term_Device(                  // console IO device
        cpu,                           // cpu reference
        ready,                         // function(), returns device ready flag
        transfer,                      // function([AC]), outputs AC or returns value if input
        ie,                            // [ie], shared interrupt enabled flag
        clear_ac,                      // true for input device, false for output device
        mask_ac = 0o7777,              // input value mask
        int_bit = 1) {                 // interrupt request bit
    let flag = 0, kbuf = 0;            // ready flag and keyboard buffer
    const regs = cpu.regs,
    setFlag = value => {
        flag = value;
        if (ie[0]) cpu.setInterrupt(flag ? int_bit : ~int_bit);
    },
    status = () => [ie[0], flag],
    reset = () => { ie[0] = 1; setFlag(0); },
    process = num => {
        if (num === 0) setFlag(clear_ac ? 0 : 1);
        else if (num === 0o5) {
            if (clear_ac) ie[0] = regs[AC] & 0o1;
            else if (ie[0] && flag) regs[PC] = regs[PC] + 1 & 0o7777;
        } else {
            if (num & 1) {
                if (clear_ac && ready()) setFlag(1);
                if (flag) regs[PC] = regs[PC] + 1 & 0o7777;
            }
            if (num & 2) { setFlag(0); if (clear_ac) regs[AC] &= 0o10000; }
            if (num & 4)
                if (clear_ac) {
                    if (kbuf === 0) kbuf = transfer(); // fill keyboard buffer
                    regs[AC] |= kbuf & mask_ac;
                } else {
                    transfer(regs[AC]); setFlag(1);
                }
            if (clear_ac && num & 2) kbuf = 0;         // clear keyboard buffer
        }
    };
    ie[0] = 1;
    return {status, reset, process, setFlag};
}

function initTerm(cpu, ka, con) {
    const ta = ka + 1,             // terminal and keyboard device address
          ie = [0],                // shared interrupt flag
          ptr_ptp = [0o200, null], // PTR mask for paper tape reader and PTP output for puncher
    devkbd = Term_Device(cpu,      // keyboard device
        () => con.kbd.length > 0,                    // kbd ready
        () => (con.kbd.shift() & 0xff) | ptr_ptp[0], // kbd get
        ie, true, 0o377, 1                           // 8bit
    ),
    devcon = Term_Device(cpu,      // terminal device
        () => true,                                  // con ready
        ac => {                                      // con put
            con.display(ac & 0x7f);
            if (ptr_ptp[1] !== null) ptr_ptp[1] += String.fromCharCode(ac & 0x7f);
        },
        ie, false, undefined, 1
    );
    cpu.devices.set(ka, devkbd);   // register input device
    cpu.devices.set(ta, devcon);   // register output device
    cpu.asm.set(0b110000000000 | ka << 3, 'KCF'); cpu.asm.set(0b110000000001 | ka << 3, 'KSF');
    cpu.asm.set(0b110000000010 | ka << 3, 'KCC'); cpu.asm.set(0b110000000100 | ka << 3, 'KRS');
    cpu.asm.set(0b110000000101 | ka << 3, 'KIE'); cpu.asm.set(0b110000000110 | ka << 3, 'KRB');
    cpu.asm.set(0b110000000000 | ta << 3, 'SPF'); cpu.asm.set(0b110000000001 | ta << 3, 'TSF');
    cpu.asm.set(0b110000000010 | ta << 3, 'TCF'); cpu.asm.set(0b110000000100 | ta << 3, 'TPC');
    cpu.asm.set(0b110000000101 | ta << 3, 'SPI'); cpu.asm.set(0b110000000110 | ta << 3, 'TLS');
    return [ptr_ptp, devkbd, devcon];
}

class ASR33 extends SoftKbd {
    constructor(cpu, ka, kbd_elem, con, con_elem) {
        super(kbd_elem, con, con_elem);
        const [ptr_ptp, devkbd, devcon] = initTerm(cpu, ka, con);
        this.ptr_ptp = ptr_ptp; // ASR-33 paper tape reader and puncher
        this.devkbd = devkbd;
        this.devcon = devcon;
    }
    trnCtrls(txt) {
        let res = super.trnCtrls(txt);
        if (res === 0) res = (txt === 'CTRL') ? 3 : (txt === 'SHIFT') ? 2 : 0;
        return res;
    }
    translateKey(e, soft) {
        if (e.key.length > 2) switch (e.key) {
            case 'ESC': return 27;
            case 'LINEFEED': return 10;
            case 'RE-TURN': return 13;
            case 'RUBOUT': return 128;
            case 'X-ONQ': return this.fs_ctrl ? 17 : this.fs_shift ? null : 81;
            case 'X-OFFS': return this.fs_ctrl ? 19 : this.fs_shift ? null : 83;
            case 'BELLG': return this.fs_ctrl ? 7 : this.fs_shift ? null : 71;
            default: console.warn(`unknown key: ${e.key}`); break;
        }
        const val = super.translateKey(e, soft);
        return (val !== null && val >= 97 && val <= 122) ? val - 32 : val; // convert to uppercase
    }
    processKey(val) {
        super.processKey(val);
        this.devkbd.setFlag(1);        // set IRQ
    }
}

function TxtMonitor(scr_elem, color, bckg, width, bellclr = null, buf = 10000, cursor = '■') {
    scr_elem.style.color = color; scr_elem.style.background = bckg;
    let saved = null, savedp,  // saved char and pos under cursor
        cur_pos = 0,           // current position in HTML
        line_len = 0,          // current line length
        html;                  // inner HTML buffer
    const str_len = width - 1, // max line length
          kbd = [],            // keyboard buffer
    bell = () => {
        if (bellclr === null) return;
        scr_elem.style.background = bellclr;
        setTimeout(() => scr_elem.style.background = bckg, 200);
    },
    newLine = force => {
        if (force) { html[cur_pos++] = '\n'; line_len = 0; }
        else {
            const n = cur_pos + width; // insert line preserving existing chars
            while (cur_pos <= n) outChar((html[cur_pos] ?? ' ').charCodeAt(0));
        }
    },
    carRetn = () => {
        while (cur_pos > 0 && html[cur_pos - 1] !== '\n') cur_pos--; // to line start
        line_len = 0;
    },
    outChar = ccode => {
        html[cur_pos++] = String.fromCharCode(ccode);
        if (line_len++ >= str_len) newLine(true);
    },
    display = ccode => {
        if (ccode === 0) return;
        if (ccode === 0x07) { bell(); return; }
        html = scr_elem.innerHTML
                .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
                .split('');
        if (cur_pos === html.length - 1) html.length--; // remove cursor
        if (saved !== null) html[savedp] = saved;       // restore char under cursor
        switch (ccode) {
            case 0x0a: newLine(false); break;
            case 0x0d: carRetn(); break;
            case 0x7f: ccode = 0x5c;                    // replase DEL with \
            default: outChar(ccode); break;
        }
        if (cur_pos < html.length) {                    // save char under cursor
            saved = html[cur_pos]; savedp = cur_pos;
        }
        else saved = null;
        html[cur_pos] = cursor;                         // set cursor
        if (html.length > buf) html = html.slice(width);
        scr_elem.innerHTML = html.join('')
                .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        scr_elem.scrollTop = scr_elem.scrollHeight;     // auto scroll
    };
    scr_elem.innerHTML = cursor;
    return {kbd, display};
}

async function ASR_33(cpu, memo, tnum, addr = 0o03) {
    let [scr_elem, kbd_elem, con_elem] = createUI(
            addTab(`asr33${addr}`, `ASR-33[${fmt(addr, 2)}]`, tnum),
            'asr', `asr${tnum}`, '45px', 26, 5, '20px', '704px', '480px', `
.smkey { font-size: 10px; }
.sp_asr { grid-column: span 8; }
.scr_asr { overflow: auto; font: bold 16px Courier; }
`, `
<div class='section sec_asr sec_asr_left'>
    <div class='sp'></div><div class='key key_asr'><span>!</span><span>1</span></div>
    <div class='key key_asr'><span>"</span><span>2</span></div>
    <div class='key key_asr'><span>#</span><span>3</span></div>
    <div class='key key_asr'><span>$</span><span>4</span></div>
    <div class='key key_asr'><span>%</span><span>5</span></div>
    <div class='key key_asr'><span>&</span><span>6</span></div>
    <div class='key key_asr'><span>'</span><span>7</span></div>
    <div class='key key_asr'><span>(</span><span>8</span></div>
    <div class='key key_asr'><span>)</span><span>9</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>0</span></div>
    <div class='key key_asr'><span>*</span><span>:</span></div>
    <div class='key key_asr'><span>=</span><span>-</span></div><div class='sp'></div>
    <div class='key key_asr smkey'>ESC</div>
    <div class='key key_asr'><span class='smkey'>X-ON</span><span>Q</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>W</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>E</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>R</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>T</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>Y</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>U</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>I</span></div>
    <div class='key key_asr'><span class='smkey'>\u2190</span><span>O</span></div>
    <div class='key key_asr'><span>@</span><span>P</span></div>
    <div class='key key_asr smkey'><span>LINE</span><span>FEED</span></div>
    <div class='key key_asr smkey'><span>RE-</span><span>TURN</span></div>
    <div class='key key_asr smkey kctrl'>CTRL</div>
    <div class='key key_asr'><span>&nbsp;</span><span>A</span></div>
    <div class='key key_asr'><span class='smkey'>X-OFF</span><span>S</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>D</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>F</span></div>
    <div class='key key_asr'><span class='smkey'>BELL</span><span>G</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>H</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>J</span></div>
    <div class='key key_asr'><span>[</span><span>K</span></div>
    <div class='key key_asr'><span>\\</span><span>L</span></div>
    <div class='key key_asr'><span>+</span><span>;</span></div>
    <div class='key key_asr smkey'><span>RUB</span><span>OUT</span></div><div class='sp2'></div>
    <div class='sp'></div><div class='key key_asr smkey kshft'>SHIFT</div>
    <div class='key key_asr'><span>&nbsp;</span><span>Z</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>X</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>C</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>V</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>B</span></div>
    <div class='key key_asr'><span class='smkey'>\u2191</span><span>N</span></div>
    <div class='key key_asr'><span>]</span><span>M</span></div>
    <div class='key key_asr'><span>&lt;</span><span>,</span></div>
    <div class='key key_asr'><span>&gt;</span><span>.</span></div>
    <div class='key key_asr'><span>?</span><span>/</span></div>
    <div class='key key_asr smkey kshft'>SHIFT</div><div class='sp'></div>
    <div class='sp5'></div><div class='sp4'></div><div class='key key_asr sp_asr'>&nbsp;</div>
</div>`);
    const elem = document.createElement('pre'); elem.id = scr_elem.id; elem.className = 'scr_asr';
    scr_elem.replaceWith(elem);
    const con = TxtMonitor(elem, '#3d3c3a', '#fffade', 72, '#ddfade');
    return new ASR33(cpu.cpu, addr, kbd_elem, con, con_elem);
}
