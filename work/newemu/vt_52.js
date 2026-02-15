'use strict';

class VT52 extends SoftKbd {
    constructor(cpu, ka, kbd_elem, con, con_elem) {
        super(kbd_elem, con, con_elem);
        const [ptr_ptp, devkbd, devcon] = initTerm(cpu, ka, con);
        // no paper tape reader and puncher
        this.devkbd = devkbd;
        this.devcon = devcon;
    }
    trnCtrls(txt) {
        let res = super.trnCtrls(txt);
        if (res === 0)
            res = (txt === 'CTRL') ? 3 : (txt === 'SHIFT') ? 2 : (txt === 'CAPSLOCK') ? 1 : 0;
        return res;
    }
    translateKey(e, soft) {
        if (soft && e.key.length > 2) switch (e.key) {
            case 'ESC': return 27;
            case 'TAB': return 9;
            case 'RETURN': return 13;
            case 'TAB8': return this.fs_shift ? 9 : 56;
            case 'DEL\u2191': return this.fs_shift ? 128 : 5;
            case 'BKS\u2190': return this.fs_shift ? 8 : 19;
            default: console.warn(`unknown key: ${e.key}`); break;
        }
        return super.translateKey(e, soft);
    }
    processKey(val) {
        super.processKey(val);
        this.devkbd.setFlag(1); // set IRQ
    }
}

async function VT_52(cpu, memo, tnum, addr = 0o03) {
    await loadScript('asr_33.js'); // load dependencies
    const [scr_elem, kbd_elem, con_elem] = createUI(
            addTab(`vt52t${addr}`, `VT-52[${fmt(addr, 2)}]`, tnum, true),
            'vt52', `vt52${tnum}`, '36px', 40, 5, 'calc(36px / 10)', '800px', '480px', `
.sec_vt52_right { grid-template-columns: repeat(8, calc(36px / 2)); }
.key_red { background-color: #ff0000; color: #ffffff; }
.key_blue { background-color: #0000ff; color: #ffffff; }
.key_gold { background-color: #fff44f; color: #fff44f; }
.smkey2 { font-size: 9px; }
.sp_vt52 { grid-column: span 18; }
`, `
<div class='section sec_vt52 sec_vt52_left'>
    <div class='sp'></div>
    <div class='key key_vt52 key_red'>ESC</div>
    <div class='key key_vt52'><span>!</span><span>1</span></div>
    <div class='key key_vt52'><span>@</span><span>2</span></div>
    <div class='key key_vt52'><span>#</span><span>3</span></div>
    <div class='key key_vt52'><span>$</span><span>4</span></div>
    <div class='key key_vt52'><span>%</span><span>5</span></div>
    <div class='key key_vt52'><span>\u2191</span><span>6</span></div>
    <div class='key key_vt52'><span>&</span><span>7</span></div>
    <div class='key key_vt52'><span>*</span><span>8</span></div>
    <div class='key key_vt52'><span>(</span><span>9</span></div>
    <div class='key key_vt52'><span>)</span><span>0</span></div>
    <div class='key key_vt52'><span>_</span><span>-</span></div>
    <div class='key key_vt52'><span>+</span><span>=</span></div>
    <div class='sp5'></div>
    <div class='sp'></div>
    <div class='key key_vt52 key_blue sp3'>TAB</div>
    <div class='key key_vt52'>Q</div>
    <div class='key key_vt52'>W</div>
    <div class='key key_vt52'>E</div>
    <div class='key key_vt52'>R</div>
    <div class='key key_vt52'>T</div>
    <div class='key key_vt52'>Y</div>
    <div class='key key_vt52'>U</div>
    <div class='key key_vt52'>I</div>
    <div class='key key_vt52'>O</div>
    <div class='key key_vt52'>P</div>
    <div class='key key_vt52'><span>]</span><span>[</span></div>
    <div class='key key_vt52'>\\</div>
    <div class='sp4'></div>
    <div class='key key_vt52 key_red kctrl'>CTRL</div>
    <div class='key key_vt52 key_blue smkey2'><span>CAPS</span><span>LOCK</span></div>
    <div class='key key_vt52'>A</div>
    <div class='key key_vt52'>S</div>
    <div class='key key_vt52'>D</div>
    <div class='key key_vt52'>F</div>
    <div class='key key_vt52'>G</div>
    <div class='key key_vt52'>H</div>
    <div class='key key_vt52'>J</div>
    <div class='key key_vt52'>K</div>
    <div class='key key_vt52'>L</div>
    <div class='key key_vt52'><span>:</span><span>;</span></div>
    <div class='key key_vt52'><span>"</span><span>'</span></div>
    <div class='key key_vt52'><span>}</span><span>{</span></div>
    <div class='key key_vt52 key_blue sp4'>RETURN</div>
    <div class='sp2'></div>
    <div class='key key_vt52 key_blue sp3 kshft'>SHIFT</div>
    <div class='key key_vt52'>Z</div>
    <div class='key key_vt52'>X</div>
    <div class='key key_vt52'>C</div>
    <div class='key key_vt52'>V</div>
    <div class='key key_vt52'>B</div>
    <div class='key key_vt52'>N</div>
    <div class='key key_vt52'>M</div>
    <div class='key key_vt52'><span>&lt;</span><span>.</span></div>
    <div class='key key_vt52'><span>&gt;</span><span>,</span></div>
    <div class='key key_vt52'><span>?</span><span>/</span></div>
    <div class='key key_vt52 key_blue sp3 kshft'>SHIFT</div>
    <div class='sp4'></div>
    <div class='sp'></div><div class='sp5'></div>
    <div class='key key_vt52 key_blue sp_vt52'></div>
</div>
<div class='section sec_vt52 sec_vt52_right'>
    <div class='key key_vt52 key_gold'>GOLD</div>
    <div class='sp2'></div>
    <div class='sp2'></div>
    <div class='key key_vt52 key_red'><span class='smkey2'>DEL</span><span>&#8593;</span></div>
    <div class='key key_vt52 key_blue'>7</div>
    <div class='key key_vt52 key_blue'><span class='smkey2'>TAB</span><span>8</span></div>
    <div class='key key_vt52'>9</div>
    <div class='key key_vt52 key_red i'>&#8595;</div>
    <div class='key key_vt52 key_blue'>4</div>
    <div class='key key_vt52 key_blue'>5</div>
    <div class='key key_vt52'>6</div>
    <div class='key key_vt52 key_red i'>&#8594;</div>
    <div class='key key_vt52'>1</div>
    <div class='key key_vt52 key_blue'>2</div>
    <div class='key key_vt52'>3</div>
    <div class='key key_vt52 key_red'><span class='smkey2'>BKS</span><span>&#8592;</span></div>
    <div class='key key_vt52 sp4'>0</div>
    <div class='key key_vt52'>.</div>
    <div class='key key_vt52 key_blue'>ENT</div>
</div>`, 32),
    con = await createCon(scr_elem, blue, 'VT220', 80, 24),
    old_disp = con.display;
    let in_esc = false, in_pos = 0;
    con.display = ccode => {        // override to process VT52 esc codes
        if (ccode === 0x00) return; // invisible code NULL
        if (in_pos > 0) {           // cursor positioning sequence
            in_pos--;
            const str = (ccode - 31).toString();
            for (let i = 0, n = str.length; i < n; i++) old_disp(str.charCodeAt(i));
            ccode = (in_pos > 0) ? 0x3b : 0x66;
        }
        else switch (ccode) {       // regular call
            case 0x1b: in_esc = true; break;
            case 0x41: case 0x42: case 0x43: case 0x44: case 0x48: case 0x4a: case 0x4b:
                if (in_esc) { old_disp(0x5b); in_esc = false; }
                break;
            case 0x45:
                if (in_esc) { old_disp(0x5b); old_disp(0x32); ccode = 0x4a; in_esc = false; }
                break;
            case 0x59:
                if (in_esc) { ccode = 0x5b; in_pos = 2; in_esc = false; }
                break;
            case 0x5b: in_esc = false; break;
        }
        old_disp(ccode);
    };
    return new VT52(cpu.cpu, addr, kbd_elem, con, con_elem);
}
