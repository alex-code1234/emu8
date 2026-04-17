function N6502(read, write) {
    let PC = 0, A = 0, X = 0, Y = 0, S = 0,
        N = 0, Z = 0, C = 0, V = 0, I = 0, D = 0,
        irq = 0, nmi = 0, isHALT = 0,
        addr = 0, tmp = 0;
    const ops = [
        //0    1    2    3    4    5    6    7    8    9    A    B    C    D    E    F     /
        x00, x01, x02, x03, x04, x05, x06, x07, x08, x09, x0a, x0b, x0c, x0d, x0e, x0f, // 0
        x10, x11, x12, x13, x14, x15, x16, x17, x18, x19, x1a, x1b, x1c, x1d, x1e, x1f, // 1
        x20, x21, x22, x23, x24, x25, x26, x27, x28, x29, x2a, x2b, x2c, x2d, x2e, x2f, // 2
        x30, x31, x32, x33, x34, x35, x36, x37, x38, x39, x3a, x3b, x3c, x3d, x3e, x3f, // 3
        x40, x41, x42, x43, x44, x45, x46, x47, x48, x49, x4a, x4b, x4c, x4d, x4e, x4f, // 4
        x50, x51, x52, x53, x54, x55, x56, x57, x58, x59, x5a, x5b, x5c, x5d, x5e, x5f, // 5
        x60, x61, x62, x63, x64, x65, x66, x67, x68, x69, x6a, x6b, x6c, x6d, x6e, x6f, // 6
        x70, x71, x72, x73, x74, x75, x76, x77, x78, x79, x7a, x7b, x7c, x7d, x7e, x7f, // 7
        x80, x81, x82, x83, x84, x85, x86, x87, x88, x89, x8a, x8b, x8c, x8d, x8e, x8f, // 8
        x90, x91, x92, x93, x94, x95, x96, x97, x98, x99, x9a, x9b, x9c, x9d, x9e, x9f, // 9
        xa0, xa1, xa2, xa3, xa4, xa5, xa6, xa7, xa8, xa9, xaa, xab, xac, xad, xae, xaf, // A
        xb0, xb1, xb2, xb3, xb4, xb5, xb6, xb7, xb8, xb9, xba, xbb, xbc, xbd, xbe, xbf, // B
        xc0, xc1, xc2, xc3, xc4, xc5, xc6, xc7, xc8, xc9, xca, xcb, xcc, xcd, xce, xcf, // C
        xd0, xd1, xd2, xd3, xd4, xd5, xd6, xd7, xd8, xd9, xda, xdb, xdc, xdd, xde, xdf, // D
        xe0, xe1, xe2, xe3, xe4, xe5, xe6, xe7, xe8, xe9, xea, xeb, xec, xed, xee, xef, // E
        xf0, xf1, xf2, xf3, xf4, xf5, xf6, xf7, xf8, xf9, xfa, xfb, xfc, xfd, xfe, xff  // F
    ];
    function reset() {
        A = 0; X = 0; Y = 0; S = 0;
        N = 0; Z = 1; C = 0; V = 0; I = 1; D = 0;
        PC = read(0xfffd) << 8 | read(0xfffc); isHALT = 0;
    }
    function step() {
        ops[readPCinc()]();
        if (nmi) {
            nmi = 0;
            brk(0xfffa, 0);
        }
        else if (irq & I == 0) {
            irq = 0;
            brk(0xfffe, 0);
        }
        if (isHALT) { isHALT = 0; return false; }
        return true;
    }
    function reqint(level) {
        if (level)
            irq = 1;
        else
            nmi = 1;
        return true;
    }
    function readPCinc() {
        const opcode = read(PC);
        PC = PC + 1 & 0xffff;
        return opcode;
    }
    function izx() {
        const a = readPCinc() + X & 0xff;
        addr = read(a + 1) << 8 | read(a);
    }
    function izy() {
        const a = readPCinc(), paddr = read(a + 1 & 0xff) << 8 | read(a);
        addr = paddr + Y;
    }
    function ind() {
        let a = readPCinc();
        a = a | readPCinc() << 8;
        addr = read(a);
        addr = addr | read(a & 0xff00 | a + 1 & 0xff) << 8;
    }
    function zp() {
        addr = readPCinc();
    }
    function zpx() {
        addr = readPCinc() + X & 0xff;
    }
    function zpy() {
        addr = readPCinc() + Y & 0xff;
    }
    function imm() {
        addr = PC;
        PC = PC + 1 & 0xffff;
    }
    function abs() {
        addr = readPCinc() | readPCinc() << 8;
    }
    function abx() {
        const paddr = readPCinc() | readPCinc() << 8;
        addr = paddr + X;
    }
    function aby() {
        const paddr = readPCinc() | readPCinc() << 8;
        addr = paddr + Y;
    }
    function rel() {
        addr = readPCinc();
        if (addr & 0x80)
            addr = addr - 0x100;
        addr = addr + PC;
    }
    function rmw() {
        write(addr, tmp & 0xff);
    }
    function fnz(v) {
        if (v & 0xff)
            Z = 0;
        else
            Z = 1;
        if (v & 0x80)
            N = 1;
        else
            N = 0;
    }
    function fnzb(v) {
        fnz(v);
        if (v & 0x100)
            C = 0;
        else
            C = 1;
    }
    function fnzc(v) {
        fnz(v);
        if (v & 0x100)
            C = 1;
        else
            C = 0;
    }
    function branch(v) {
        if (v)
            PC = addr;
    }
    function kil() {
        PC = PC - 1 & 0xffff;
        isHALT = 1;
    }
    function adc_impl(v) {
        let al, ah, c = C, r = A + v + c;
        if (D) {
            al = (A & 0x0f) + (v & 0x0f) + c;
            if (al > 9)
                al = al + 6;
            ah = (A >> 4) + (v >> 4) + ((al > 15) ? 1 : 0);
            Z = ((r & 0xff) == 0) ? 1 : 0;
            N = ((ah & 8) != 0) ? 1 : 0;
            V = (((-1 ^ A ^ v) & (A ^ ah << 4) & 0x80) != 0) ? 1 : 0;
            if (ah > 9)
                ah = ah + 6;
            C = (ah > 15) ? 1 : 0;
            A = (ah << 4 | al & 15) & 0xff;
        } else {
            Z = ((r & 0xff) == 0) ? 1 : 0;
            N = ((r & 0x80) != 0) ? 1 : 0;
            V = (((-1 ^ A ^ v) & (A ^ r) & 0x80) != 0) ? 1 : 0;
            C = ((r & 0x100) != 0) ? 1 : 0;
            A = r & 0xff;
        }
    }
    function adc() { adc_impl(read(addr)); }
    function ahx() {
        tmp = (addr >> 8) + 1 & A & X;
        write(addr, tmp & 0xff);
    }
    function alr() {
        tmp = read(addr) & A;
        tmp = (tmp & 1) << 8 | tmp >> 1;
        fnzc(tmp);
        A = tmp & 0xff;
    }
    function anc() {
        and();
        C = ((A & 0x80) != 0) ? 1 : 0;
    }
    function and() {
        A = A & read(addr);
        fnz(A);
    }
    function arr() {
        tmp = read(addr) & A;
        let al = tmp & 0x0f,
            ah = tmp >> 4 & 0x0f;
        A = (C << 7 | tmp >> 1) & 0xff;
        if (D) {
            N = C;
            V = ((tmp ^ A) & 64) ? 1 : 0;
            Z = A ? 0 : 1;
            if (al + (al & 1) > 5)
                A = A & 0xf0 | A + 6 & 0xf;
            C = (ah + (ah & 1) > 5) ? 1 : 0;
            if (C)
                A = A + 0x60 & 0xff;
        } else {
            C = ((A & 0x40) != 0) ? 1 : 0;
            V = ((A >> 6 & 1 ^ A >> 5 & 1) != 0) ? 1 : 0;
            fnz(A);
        }
    }
    function asl() {
        tmp = read(addr) << 1;
        fnzc(tmp);
        tmp = tmp & 0xff;
    }
    function asla() {
        tmp = A << 1;
        fnzc(tmp);
        A = tmp & 0xff;
    }
    function bit() {
        tmp = read(addr);
        N = ((tmp & 0x80) != 0) ? 1 : 0;
        V = ((tmp & 0x40) != 0) ? 1 : 0;
        Z = ((tmp & A) == 0) ? 1 : 0;
    }
    function brk(adr, incr) {
        if (incr)
            PC = PC + 1 & 0xffff;
        write(S + 0x100, PC >> 8);
        S = S - 1 & 0xff;
        write(S + 0x100, PC & 0xff);
        S = S - 1 & 0xff;
        php(incr);
        I = 1;
        PC = read(adr + 1) << 8 | read(adr);
    }
    function bcc() { branch(C == 0); }
    function bcs() { branch(C == 1); }
    function beq() { branch(Z == 1); }
    function bne() { branch(Z == 0); }
    function bmi() { branch(N == 1); }
    function bpl() { branch(N == 0); }
    function bvc() { branch(V == 0); }
    function bvs() { branch(V == 1); }
    function clc() { C = 0; }
    function cld() { D = 0; }
    function cli() { I = 0; }
    function clv() { V = 0; }
    function cmp() { fnzb(A - read(addr)); }
    function cpx() { fnzb(X - read(addr)); }
    function cpy() { fnzb(Y - read(addr)); }
    function dcp() { tmp = read(addr) - 1 & 0xff; fnzb(A - tmp); }
    function dec() { tmp = read(addr) - 1 & 0xff; fnz(tmp); }
    function dex() { X = X - 1 & 0xff; fnz(X); }
    function dey() { Y = Y - 1 & 0xff; fnz(Y); }
    function eor() { A = A ^ read(addr); fnz(A); }
    function inc() { tmp = read(addr) + 1 & 0xff; fnz(tmp); }
    function inx() { X = X + 1 & 0xff; fnz(X); }
    function iny() { Y = Y + 1 & 0xff; fnz(Y); }
    function sbc_impl(v, c) {
        let al, ah, r = A - v - c;
        if (D) {
            al = (A & 0x0f) - (v & 0x0f) - c;
            if (al < 0)
                al = al - 6;
            ah = (A >> 4) - (v >> 4) - ((al < 0) ? 1 : 0);
            Z = ((r & 0xff) == 0) ? 1 : 0;
            N = ((r & 0x80) != 0) ? 1 : 0;
            V = (((A ^ v) & (A ^ r) & 0x80) != 0) ? 1 : 0;
            C = ((r & 0x100) != 0) ? 0 : 1;
            if (ah < 0)
                ah = ah - 6;
            A = (ah << 4 | al & 15) & 0xff;
        } else {
            Z = ((r & 0xff) == 0) ? 1 : 0;
            N = ((r & 0x80) != 0) ? 1 : 0;
            V = (((A ^ v) & (A ^ r) & 0x80) != 0) ? 1 : 0;
            C = ((r & 0x100) != 0) ? 0 : 1;
            A = r & 0xff;
        }
    }
    function isc() {
        tmp = read(addr) + 1 & 0xff;
        sbc_impl(tmp, 1 - (C ? 1 : 0));
    }
    function jmp() { PC = addr; }
    function jsr() {
        write(S + 0x100, PC - 1 >> 8);
        S = S - 1 & 0xff;
        write(S + 0x100, PC - 1 & 0xff);
        S = S - 1 & 0xff;
        PC = addr;
    }
    function las() {
        A = read(addr) & S;
        X = A;
        S = X;
        fnz(A);
    }
    function lax() {
        A = read(addr);
        X = A;
        fnz(A);
    }
    function lda() { A = read(addr); fnz(A); }
    function ldx() { X = read(addr); fnz(X); }
    function ldy() { Y = read(addr); fnz(Y); }
    function ora() { A = A | read(addr); fnz(A); }
    function rol() {
        tmp = read(addr) << 1 | C;
        fnzc(tmp);
        tmp = tmp & 0xff;
    }
    function rola() {
        A = A << 1 | C;
        fnzc(A);
        A = A & 0xff;
    }
    function rla() {
        tmp = read(addr) << 1 | C;
        if (tmp & 0x100)
            C = 1;
        else
            C = 0;
        A = A & tmp & 0xff;
        fnz(A);
    }
    function ror() {
        tmp = read(addr);
        tmp = (tmp & 1) << 8 | C << 7 | tmp >> 1;
        fnzc(tmp);
        tmp = tmp & 0xff;
    }
    function rora() {
        A = (A & 1) << 8 | C << 7 | A >> 1;
        fnzc(A);
        A = A & 0xff;
    }
    function rra() {
        let c;
        tmp = read(addr);
        if (tmp & 0x01)
            c = 1;
        else
            c = 0;
        tmp = C << 7 | tmp >> 1;
        C = c;
        adc_impl(tmp);
    }
    function lsr() {
        tmp = read(addr);
        tmp = (tmp & 1) << 8 | tmp >> 1;
        fnzc(tmp);
        tmp = tmp & 0xff;
    }
    function lsra() {
        tmp = (A & 1) << 8 | A >> 1;
        fnzc(tmp);
        A = tmp & 0xff;
    }
    function nop() { }
    function pha() {
        write(S + 0x100, A);
        S = S - 1 & 0xff;
    }
    function php(incr) {
        let v = N << 7;
        v = v | V << 6;
        v = v | 3 << 4;
        v = v | D << 3;
        v = v | I << 2;
        v = v | Z << 1;
        v = v | C;
        if (!incr)
            v &= ~0x10;
        write(S + 0x100, v);
        S = S - 1 & 0xff;
    }
    function pla() {
        S = S + 1 & 0xff;
        A = read(S + 0x100);
        fnz(A);
    }
    function plp() {
        S = S + 1 & 0xff;
        tmp = read(S + 0x100);
        N = ((tmp & 0x80) != 0) ? 1 : 0;
        V = ((tmp & 0x40) != 0) ? 1 : 0;
        D = ((tmp & 0x08) != 0) ? 1 : 0;
        I = ((tmp & 0x04) != 0) ? 1 : 0;
        Z = ((tmp & 0x02) != 0) ? 1 : 0;
        C = ((tmp & 0x01) != 0) ? 1 : 0;
    }
    function rti() {
        plp();
        S = S + 1 & 0xff;
        PC = read(S + 0x100);
        S = S + 1 & 0xff;
        PC = PC | read(S + 0x100) << 8;
    }
    function rts() {
        S = S + 1 & 0xff;
        PC = read(S + 0x100);
        S = S + 1 & 0xff;
        PC = PC | read(S + 0x100) << 8;
        PC = PC + 1;
    }
    function sbc() { sbc_impl(read(addr), 1 - C); }
    function sbx() {
        tmp = read(addr) - (A & X);
        fnzb(tmp);
        X = tmp & 0xff;
    }
    function sec() { C = 1; }
    function sed() { D = 1; }
    function sei() { I = 1; }
    function shs() {
        tmp = (addr >> 8) + 1 & A & X;
        write(addr, tmp & 0xff);
        S = tmp & 0xff;
    }
    function shx() {
        tmp = (addr >> 8) + 1 & X;
        write(addr, tmp & 0xff);
    }
    function shy() {
        tmp = (addr >> 8) + 1 & Y;
        write(addr, tmp & 0xff);
    }
    function slo() {
        tmp = read(addr) << 1;
        A = tmp | A;
        tmp = tmp & 0xff;
        fnzc(A);
        A = A & 0xff;
    }
    function sre() {
        let v = read(addr);
        tmp = (v & 1) << 8 | v >> 1;
        A = tmp ^ A;
        tmp = tmp & 0xff;
        fnzc(A);
        A = A & 0xff;
    }
    function sta() { write(addr, A); }
    function stx() { write(addr, X); }
    function sty() { write(addr, Y); }
    function tax() { X = A; fnz(X); }
    function tay() { Y = A; fnz(Y); }
    function tsx() { X = S; fnz(X); }
    function txa() { A = X; fnz(A); }
    function txs() { S = X; }
    function tya() { A = Y; fnz(A); }
    function sax() {
        X = (A & X) - read(addr);
        fnzb(X);
        X = X & 0xff;
    }
    function xaai() { A = A & X & read(addr); fnz(A); }
    function tas() {
        S = A & X;
        let v = addr >> 8 & 0x00ff;
        v = v + 1 & 0xff;
        write(addr, S & v);
    }
    function axs() { write(addr, A & X); }
    function x00() { brk(0xfffe, 1); }
    function x01() { izx(); ora(); }
    function x02() { kil(); }
    function x03() { izx(); slo(); rmw(); }
    function x04() { zp(); nop(); }
    function x05() { zp(); ora(); }
    function x06() { zp(); asl(); rmw(); }
    function x07() { zp(); slo(); rmw(); }
    function x08() { php(1); }
    function x09() { imm(); ora(); }
    function x0a() { asla(); }
    function x0b() { imm(); anc(); }
    function x0c() { abs(); nop(); }
    function x0d() { abs(); ora(); }
    function x0e() { abs(); asl(); rmw(); }
    function x0f() { abs(); slo(); rmw(); }
    function x10() { rel(); bpl(); }
    function x11() { izy(); ora(); }
    function x12() { kil(); }
    function x13() { izy(); slo(); rmw(); }
    function x14() { zpx(); nop(); }
    function x15() { zpx(); ora(); }
    function x16() { zpx(); asl(); rmw(); }
    function x17() { zpx(); slo(); rmw(); }
    function x18() { clc(); }
    function x19() { aby(); ora(); }
    function x1a() { nop(); }
    function x1b() { aby(); slo(); rmw(); }
    function x1c() { abx(); nop(); }
    function x1d() { abx(); ora(); }
    function x1e() { abx(); asl(); rmw(); }
    function x1f() { abx(); slo(); rmw(); }
    function x20() { abs(); jsr(); }
    function x21() { izx(); and(); }
    function x22() { kil(); }
    function x23() { izx(); rla(); rmw(); }
    function x24() { zp(); bit(); }
    function x25() { zp(); and(); }
    function x26() { zp(); rol(); rmw(); }
    function x27() { zp(); rla(); rmw(); }
    function x28() { plp(); }
    function x29() { imm(); and(); }
    function x2a() { rola(); }
    function x2b() { imm(); anc(); }
    function x2c() { abs(); bit(); }
    function x2d() { abs(); and(); }
    function x2e() { abs(); rol(); rmw(); }
    function x2f() { abs(); rla(); rmw(); }
    function x30() { rel(); bmi(); }
    function x31() { izy(); and(); }
    function x32() { kil(); }
    function x33() { izy(); rla(); rmw(); }
    function x34() { zpx(); nop(); }
    function x35() { zpx(); and(); }
    function x36() { zpx(); rol(); rmw(); }
    function x37() { zpx(); rla(); rmw(); }
    function x38() { sec(); }
    function x39() { aby(); and(); }
    function x3a() { nop(); }
    function x3b() { aby(); rla(); rmw(); }
    function x3c() { abx(); nop(); }
    function x3d() { abx(); and(); }
    function x3e() { abx(); rol(); rmw(); }
    function x3f() { abx(); rla(); rmw(); }
    function x40() { rti(); }
    function x41() { izx(); eor(); }
    function x42() { kil(); }
    function x43() { izx(); sre(); rmw(); }
    function x44() { zp(); nop(); }
    function x45() { zp(); eor(); }
    function x46() { zp(); lsr(); rmw(); }
    function x47() { zp(); sre(); rmw(); }
    function x48() { pha(); }
    function x49() { imm(); eor(); }
    function x4a() { lsra(); }
    function x4b() { imm(); alr(); }
    function x4c() { abs(); jmp(); }
    function x4d() { abs(); eor(); }
    function x4e() { abs(); lsr(); rmw(); }
    function x4f() { abs(); sre(); rmw(); }
    function x50() { rel(); bvc(); }
    function x51() { izy(); eor(); }
    function x52() { kil(); }
    function x53() { izy(); sre(); rmw(); }
    function x54() { zpx(); nop(); }
    function x55() { zpx(); eor(); }
    function x56() { zpx(); lsr(); rmw(); }
    function x57() { zpx(); sre(); rmw(); }
    function x58() { cli(); }
    function x59() { aby(); eor(); }
    function x5a() { nop(); }
    function x5b() { aby(); sre(); rmw(); }
    function x5c() { abx(); nop(); }
    function x5d() { abx(); eor(); }
    function x5e() { abx(); lsr(); rmw(); }
    function x5f() { abx(); sre(); rmw(); }
    function x60() { rts(); }
    function x61() { izx(); adc(); }
    function x62() { kil(); }
    function x63() { izx(); rra(); rmw(); }
    function x64() { zp(); nop(); }
    function x65() { zp(); adc(); }
    function x66() { zp(); ror(); rmw(); }
    function x67() { zp(); rra(); rmw(); }
    function x68() { pla(); }
    function x69() { imm(); adc(); }
    function x6a() { rora(); }
    function x6b() { imm(); arr(); }
    function x6c() { ind(); jmp(); }
    function x6d() { abs(); adc(); }
    function x6e() { abs(); ror(); rmw(); }
    function x6f() { abs(); rra(); rmw(); }
    function x70() { rel(); bvs(); }
    function x71() { izy(); adc(); }
    function x72() { kil(); }
    function x73() { izy(); rra(); rmw(); }
    function x74() { zpx(); nop(); }
    function x75() { zpx(); adc(); }
    function x76() { zpx(); ror(); rmw(); }
    function x77() { zpx(); rra(); rmw(); }
    function x78() { sei(); }
    function x79() { aby(); adc(); }
    function x7a() { nop(); }
    function x7b() { aby(); rra(); rmw(); }
    function x7c() { abx(); nop(); }
    function x7d() { abx(); adc(); }
    function x7e() { abx(); ror(); rmw(); }
    function x7f() { abx(); rra(); rmw(); }
    function x80() { imm(); nop(); }
    function x81() { izx(); sta(); }
    function x82() { imm(); nop(); }
    function x83() { izx(); axs(); }
    function x84() { zp(); sty(); }
    function x85() { zp(); sta(); }
    function x86() { zp(); stx(); }
    function x87() { zp(); axs(); }
    function x88() { dey(); }
    function x89() { imm(); nop(); }
    function x8a() { txa(); }
    function x8b() { imm(); xaai(); }
    function x8c() { abs(); sty(); }
    function x8d() { abs(); sta(); }
    function x8e() { abs(); stx(); }
    function x8f() { abs(); axs(); }
    function x90() { rel(); bcc(); }
    function x91() { izy(); sta(); }
    function x92() { kil(); }
    function x93() { izy(); ahx(); }
    function x94() { zpx(); sty(); }
    function x95() { zpx(); sta(); }
    function x96() { zpy(); stx(); }
    function x97() { zpy(); axs(); }
    function x98() { tya(); }
    function x99() { aby(); sta(); }
    function x9a() { txs(); }
    function x9b() { aby(); tas(); }
    function x9c() { abx(); shy(); }
    function x9d() { abx(); sta(); }
    function x9e() { aby(); shx(); }
    function x9f() { aby(); ahx(); }
    function xa0() { imm(); ldy(); }
    function xa1() { izx(); lda(); }
    function xa2() { imm(); ldx(); }
    function xa3() { izx(); lax(); }
    function xa4() { zp(); ldy(); }
    function xa5() { zp(); lda(); }
    function xa6() { zp(); ldx(); }
    function xa7() { zp(); lax(); }
    function xa8() { tay(); }
    function xa9() { imm(); lda(); }
    function xaa() { tax(); }
    function xab() { imm(); lax(); }
    function xac() { abs(); ldy(); }
    function xad() { abs(); lda(); }
    function xae() { abs(); ldx(); }
    function xaf() { abs(); lax(); }
    function xb0() { rel(); bcs(); }
    function xb1() { izy(); lda(); }
    function xb2() { kil(); }
    function xb3() { izy(); lax(); }
    function xb4() { zpx(); ldy(); }
    function xb5() { zpx(); lda(); }
    function xb6() { zpy(); ldx(); }
    function xb7() { zpy(); lax(); }
    function xb8() { clv(); }
    function xb9() { aby(); lda(); }
    function xba() { tsx(); }
    function xbb() { aby(); las(); }
    function xbc() { abx(); ldy(); }
    function xbd() { abx(); lda(); }
    function xbe() { aby(); ldx(); }
    function xbf() { aby(); lax(); }
    function xc0() { imm(); cpy(); }
    function xc1() { izx(); cmp(); }
    function xc2() { imm(); nop(); }
    function xc3() { izx(); dcp(); rmw(); }
    function xc4() { zp(); cpy(); }
    function xc5() { zp(); cmp(); }
    function xc6() { zp(); dec(); rmw(); }
    function xc7() { zp(); dcp(); rmw(); }
    function xc8() { iny(); }
    function xc9() { imm(); cmp(); }
    function xca() { dex(); }
    function xcb() { imm(); sax(); }
    function xcc() { abs(); cpy(); }
    function xcd() { abs(); cmp(); }
    function xce() { abs(); dec(); rmw(); }
    function xcf() { abs(); dcp(); rmw(); }
    function xd0() { rel(); bne(); }
    function xd1() { izy(); cmp(); }
    function xd2() { kil(); }
    function xd3() { izy(); dcp(); rmw(); }
    function xd4() { zpx(); nop(); }
    function xd5() { zpx(); cmp(); }
    function xd6() { zpx(); dec(); rmw(); }
    function xd7() { zpx(); dcp(); rmw(); }
    function xd8() { cld(); }
    function xd9() { aby(); cmp(); }
    function xda() { nop(); }
    function xdb() { aby(); dcp(); rmw(); }
    function xdc() { abx(); nop(); }
    function xdd() { abx(); cmp(); }
    function xde() { abx(); dec(); rmw(); }
    function xdf() { abx(); dcp(); rmw(); }
    function xe0() { imm(); cpx(); }
    function xe1() { izx(); sbc(); }
    function xe2() { imm(); nop(); }
    function xe3() { izx(); isc(); rmw(); }
    function xe4() { zp(); cpx(); }
    function xe5() { zp(); sbc(); }
    function xe6() { zp(); inc(); rmw(); }
    function xe7() { zp(); isc(); rmw(); }
    function xe8() { inx(); }
    function xe9() { imm(); sbc(); }
    function xea() { nop(); }
    function xeb() { imm(); sbc(); }
    function xec() { abs(); cpx(); }
    function xed() { abs(); sbc(); }
    function xee() { abs(); inc(); rmw(); }
    function xef() { abs(); isc(); rmw(); }
    function xf0() { rel(); beq(); }
    function xf1() { izy(); sbc(); }
    function xf2() { kil(); }
    function xf3() { izy(); isc(); rmw(); }
    function xf4() { zpx(); nop(); }
    function xf5() { zpx(); sbc(); }
    function xf6() { zpx(); inc(); rmw(); }
    function xf7() { zpx(); isc(); rmw(); }
    function xf8() { sed(); }
    function xf9() { aby(); sbc(); }
    function xfa() { nop(); }
    function xfb() { aby(); isc(); rmw(); }
    function xfc() { abx(); nop(); }
    function xfd() { abx(); sbc(); }
    function xfe() { abx(); inc(); rmw(); }
    function xff() { abx(); isc(); rmw(); }
    return {
        reset,
        step,
        'setInterrupt': reqint,
        'setRegisters': function(r) {
            var s = '';
            for (var i = 1; i < r.length; i += 2) {
                var reg = r[i].toLowerCase();
                var o = parseInt(r[i + 1], 16);
                switch (reg) {
                    case 'pc': PC = o & 0xffff; break;
                    case 'a': A = o & 0xff; break;
                    case 'x': X = o & 0xff; break;
                    case 'y': Y = o & 0xff; break;
                    case 'sp': S = o & 0xff; break;
                    case 'fn': N = o ? 1 : 0; break;
                    case 'fz': Z = o ? 1 : 0; break;
                    case 'fc': C = o ? 1 : 0; break;
                    case 'fv': V = o ? 1 : 0; break;
                    case 'fi': I = o ? 1 : 0; break;
                    case 'fd': D = o ? 1 : 0; break;
                    default: s += ' ' + reg; break;
                }
            }
            return (s.length > 0) ? 'unknown register(s): ' + s : s;
        },
        'cpuStatus': function() {
            var s = '';
            var v = A << 8 | (N << 7 | V << 6 | D << 3 | I << 2 | Z << 1 | C);
            s += 'AF:' + v.toString(16).padStart(4, '0');
            s += ' ' + (N ? 'n' : '.') + (Z ? 'z' : '.') + (C ? 'c' : '.') + (V ? 'v' : '.') +
                    (D ? 'd' : '.') + (I ? 'I' : '.');
            s += '|';
            v = X << 8 | Y;
            s += 'XY:' + v.toString(16).padStart(4, '0');
            s += ' SP:' + S.toString(16).padStart(2, '0');
            return s;
        },
        'setPC': function(v) {
            PC = v & 0xffff;
        },
        'getPC': function() {
            return PC;
        },
        'getSP': function() {
            return 0x100 + S;
        },
        'getA': function() {
            return A;
        }
    };
}
// 6502 assembler / disassembler
var OPS_6502 = [
    {mn:"BRK",am:"",nb:1,il:0,c1:7,c2:0},       // 00
    {mn:"ORA",am:"(aa,x)",nb:2,il:0,c1:6,c2:0}, // 01
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 02
    {mn:"SLO",am:"(aa,x)",nb:2,il:1,c1:8,c2:1}, // 03
    {mn:"NOP",am:"aa",nb:2,il:1,c1:3,c2:0},     // 04
    {mn:"ORA",am:"aa",nb:2,il:0,c1:3,c2:0},     // 05
    {mn:"ASL",am:"aa",nb:2,il:0,c1:5,c2:0},     // 06
    {mn:"SLO",am:"aa",nb:2,il:1,c1:5,c2:0},     // 07
    {mn:"PHP",am:"",nb:1,il:0,c1:3,c2:0},       // 08
    {mn:"ORA",am:"#aa",nb:2,il:0,c1:2,c2:0},    // 09
    {mn:"ASL",am:"",nb:1,il:0,c1:2,c2:0},       // 0A
    {mn:"ANC",am:"#aa",nb:2,il:1,c1:2,c2:0},    // 0B
    {mn:"NOP",am:"AAAA",nb:3,il:1,c1:4,c2:0},   // 0C
    {mn:"ORA",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // 0D
    {mn:"ASL",am:"AAAA",nb:3,il:0,c1:6,c2:0},   // 0E
    {mn:"SLO",am:"AAAA",nb:3,il:1,c1:6,c2:0},   // 0F
    {mn:"BPL",am:"branch",nb:2,il:0,c1:2,c2:2}, // 10
    {mn:"ORA",am:"(aa),y",nb:2,il:0,c1:5,c2:1}, // 11
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 12
    {mn:"SLO",am:"(aa),y",nb:2,il:1,c1:8,c2:1}, // 13
    {mn:"NOP",am:"aa,x",nb:2,il:1,c1:4,c2:0},   // 14
    {mn:"ORA",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // 15
    {mn:"ASL",am:"aa,x",nb:2,il:0,c1:6,c2:0},   // 16
    {mn:"SLO",am:"aa,x",nb:2,il:1,c1:6,c2:1},   // 17
    {mn:"CLC",am:"",nb:1,il:0,c1:2,c2:0},       // 18
    {mn:"ORA",am:"AAAA,y",nb:3,il:0,c1:4,c2:1}, // 19
    {mn:"NOP",am:"",nb:1,il:1,c1:0,c2:0},       // 1A
    {mn:"SLO",am:"AAAA,y",nb:3,il:1,c1:7,c2:1}, // 1B
    {mn:"NOP",am:"AAAA,x",nb:3,il:1,c1:4,c2:1}, // 1C
    {mn:"ORA",am:"AAAA,x",nb:3,il:0,c1:4,c2:1}, // 1D
    {mn:"ASL",am:"AAAA,x",nb:3,il:0,c1:7,c2:0}, // 1E
    {mn:"SLO",am:"AAAA,x",nb:3,il:1,c1:7,c2:1}, // 1F
    {mn:"JSR",am:"AAAA",nb:3,il:0,c1:6,c2:0},   // 20
    {mn:"AND",am:"(aa,x)",nb:2,il:0,c1:6,c2:0}, // 21
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 22
    {mn:"RLA",am:"(aa,x)",nb:2,il:1,c1:8,c2:1}, // 23
    {mn:"BIT",am:"aa",nb:2,il:0,c1:3,c2:0},     // 24
    {mn:"AND",am:"aa",nb:2,il:0,c1:3,c2:0},     // 25
    {mn:"ROL",am:"aa",nb:2,il:0,c1:5,c2:0},     // 26
    {mn:"RLA",am:"aa",nb:2,il:1,c1:5,c2:0},     // 27
    {mn:"PLP",am:"",nb:1,il:0,c1:4,c2:0},       // 28
    {mn:"AND",am:"#aa",nb:2,il:0,c1:2,c2:0},    // 29
    {mn:"ROL",am:"",nb:1,il:0,c1:2,c2:0},       // 2A
    {mn:"ANC",am:"#aa",nb:2,il:1,c1:2,c2:0},    // 2B
    {mn:"BIT",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // 2C
    {mn:"AND",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // 2D
    {mn:"ROL",am:"AAAA",nb:3,il:0,c1:6,c2:0},   // 2E
    {mn:"RLA",am:"AAAA",nb:3,il:1,c1:6,c2:0},   // 2F
    {mn:"BMI",am:"branch",nb:2,il:0,c1:2,c2:2}, // 30
    {mn:"AND",am:"(aa),y",nb:2,il:0,c1:5,c2:1}, // 31
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 32
    {mn:"RLA",am:"(aa),y",nb:2,il:1,c1:8,c2:1}, // 33
    {mn:"NOP",am:"aa,x",nb:2,il:1,c1:4,c2:0},   // 34
    {mn:"AND",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // 35
    {mn:"ROL",am:"aa,x",nb:2,il:0,c1:6,c2:0},   // 36
    {mn:"RLA",am:"aa,x",nb:2,il:1,c1:6,c2:1},   // 37
    {mn:"SEC",am:"",nb:1,il:0,c1:2,c2:0},       // 38
    {mn:"AND",am:"AAAA,y",nb:3,il:0,c1:4,c2:1}, // 39
    {mn:"NOP",am:"",nb:1,il:1,c1:0,c2:0},       // 3A
    {mn:"RLA",am:"AAAA,y",nb:3,il:1,c1:7,c2:1}, // 3B
    {mn:"NOP",am:"AAAA,x",nb:3,il:1,c1:4,c2:1}, // 3C
    {mn:"AND",am:"AAAA,x",nb:3,il:0,c1:4,c2:1}, // 3D
    {mn:"ROL",am:"AAAA,x",nb:3,il:0,c1:7,c2:0}, // 3E
    {mn:"RLA",am:"AAAA,x",nb:3,il:1,c1:7,c2:1}, // 3F
    {mn:"RTI",am:"",nb:1,il:0,c1:6,c2:0},       // 40
    {mn:"EOR",am:"(aa,x)",nb:2,il:0,c1:6,c2:0}, // 41
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 42
    {mn:"SRE",am:"(aa,x)",nb:2,il:1,c1:8,c2:1}, // 43
    {mn:"NOP",am:"aa",nb:2,il:1,c1:3,c2:0},     // 44
    {mn:"EOR",am:"aa",nb:2,il:0,c1:3,c2:0},     // 45
    {mn:"LSR",am:"aa",nb:2,il:0,c1:5,c2:0},     // 46
    {mn:"SRE",am:"aa",nb:2,il:1,c1:5,c2:0},     // 47
    {mn:"PHA",am:"",nb:1,il:0,c1:3,c2:0},       // 48
    {mn:"EOR",am:"#aa",nb:2,il:0,c1:2,c2:0},    // 49
    {mn:"LSR",am:"",nb:1,il:0,c1:2,c2:0},       // 4A
    {mn:"ASR",am:"#aa",nb:2,il:1,c1:2,c2:0},    // 4B
    {mn:"JMP",am:"AAAA",nb:3,il:0,c1:3,c2:0},   // 4C
    {mn:"EOR",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // 4D
    {mn:"LSR",am:"AAAA",nb:3,il:0,c1:6,c2:0},   // 4E
    {mn:"SRE",am:"AAAA",nb:3,il:1,c1:6,c2:0},   // 4F
    {mn:"BVC",am:"branch",nb:2,il:0,c1:2,c2:2}, // 50
    {mn:"EOR",am:"(aa),y",nb:2,il:0,c1:5,c2:1}, // 51
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 52
    {mn:"SRE",am:"(aa),y",nb:2,il:1,c1:8,c2:1}, // 53
    {mn:"NOP",am:"aa,x",nb:2,il:1,c1:4,c2:0},   // 54
    {mn:"EOR",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // 55
    {mn:"LSR",am:"aa,x",nb:2,il:0,c1:6,c2:0},   // 56
    {mn:"SRE",am:"aa,x",nb:2,il:1,c1:6,c2:1},   // 57
    {mn:"CLI",am:"",nb:1,il:0,c1:2,c2:0},       // 58
    {mn:"EOR",am:"AAAA,y",nb:3,il:0,c1:4,c2:1}, // 59
    {mn:"NOP",am:"",nb:1,il:1,c1:0,c2:0},       // 5A
    {mn:"SRE",am:"AAAA,y",nb:3,il:1,c1:7,c2:1}, // 5B
    {mn:"NOP",am:"AAAA,x",nb:3,il:1,c1:4,c2:1}, // 5C
    {mn:"EOR",am:"AAAA,x",nb:3,il:0,c1:4,c2:1}, // 5D
    {mn:"LSR",am:"AAAA,x",nb:3,il:0,c1:7,c2:0}, // 5E
    {mn:"SRE",am:"AAAA,x",nb:3,il:1,c1:7,c2:1}, // 5F
    {mn:"RTS",am:"",nb:1,il:0,c1:6,c2:0},       // 60
    {mn:"ADC",am:"(aa,x)",nb:2,il:0,c1:6,c2:0}, // 61
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 62
    {mn:"RRA",am:"(aa,x)",nb:2,il:1,c1:8,c2:1}, // 63
    {mn:"NOP",am:"aa",nb:2,il:1,c1:3,c2:0},     // 64
    {mn:"ADC",am:"aa",nb:2,il:0,c1:3,c2:0},     // 65
    {mn:"ROR",am:"aa",nb:2,il:0,c1:5,c2:0},     // 66
    {mn:"RRA",am:"aa",nb:2,il:1,c1:5,c2:0},     // 67
    {mn:"PLA",am:"",nb:1,il:0,c1:4,c2:0},       // 68
    {mn:"ADC",am:"#aa",nb:2,il:0,c1:2,c2:0},    // 69
    {mn:"ROR",am:"",nb:1,il:0,c1:2,c2:0},       // 6A
    {mn:"ARR",am:"#aa",nb:2,il:1,c1:2,c2:0},    // 6B
    {mn:"JMP",am:"(AAAA)",nb:3,il:0,c1:5,c2:0}, // 6C
    {mn:"ADC",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // 6D
    {mn:"ROR",am:"AAAA",nb:3,il:0,c1:6,c2:0},   // 6E
    {mn:"RRA",am:"AAAA",nb:3,il:1,c1:6,c2:0},   // 6F
    {mn:"BVS",am:"branch",nb:2,il:0,c1:2,c2:2}, // 70
    {mn:"ADC",am:"(aa),y",nb:2,il:0,c1:5,c2:1}, // 71
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 72
    {mn:"RRA",am:"(aa),y",nb:2,il:1,c1:8,c2:1}, // 73
    {mn:"NOP",am:"aa,x",nb:2,il:1,c1:4,c2:0},   // 74
    {mn:"ADC",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // 75
    {mn:"ROR",am:"aa,x",nb:2,il:0,c1:6,c2:0},   // 76
    {mn:"RRA",am:"aa,x",nb:2,il:1,c1:6,c2:1},   // 77
    {mn:"SEI",am:"",nb:1,il:0,c1:2,c2:0},       // 78
    {mn:"ADC",am:"AAAA,y",nb:3,il:0,c1:4,c2:1}, // 79
    {mn:"NOP",am:"",nb:1,il:1,c1:0,c2:0},       // 7A
    {mn:"RRA",am:"AAAA,y",nb:3,il:1,c1:7,c2:1}, // 7B
    {mn:"NOP",am:"AAAA,x",nb:3,il:1,c1:4,c2:1}, // 7C
    {mn:"ADC",am:"AAAA,x",nb:3,il:0,c1:4,c2:1}, // 7D
    {mn:"ROR",am:"AAAA,x",nb:3,il:0,c1:7,c2:0}, // 7E
    {mn:"RRA",am:"AAAA,x",nb:3,il:1,c1:7,c2:1}, // 7F
    {mn:"NOP",am:"#aa",nb:2,il:1,c1:0,c2:0},    // 80
    {mn:"STA",am:"(aa,x)",nb:2,il:0,c1:6,c2:0}, // 81
    {mn:"NOP",am:"#aa",nb:2,il:1,c1:0,c2:0},    // 82
    {mn:"AXS",am:"(aa,x)",nb:2,il:1,c1:6,c2:1}, // 83
    {mn:"STY",am:"aa",nb:2,il:0,c1:3,c2:0},     // 84
    {mn:"STA",am:"aa",nb:2,il:0,c1:3,c2:0},     // 85
    {mn:"STX",am:"aa",nb:2,il:0,c1:3,c2:0},     // 86
    {mn:"AXS",am:"aa",nb:2,il:1,c1:3,c2:0},     // 87
    {mn:"DEY",am:"",nb:1,il:0,c1:2,c2:0},       // 88
    {mn:"NOP",am:"#aa",nb:2,il:1,c1:0,c2:0},    // 89
    {mn:"TXA",am:"",nb:1,il:0,c1:2,c2:0},       // 8A
    {mn:"XAA",am:"#aa",nb:2,il:1,c1:0,c2:0},    // 8B
    {mn:"STY",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // 8C
    {mn:"STA",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // 8D
    {mn:"STX",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // 8E
    {mn:"AXS",am:"AAAA",nb:3,il:1,c1:4,c2:0},   // 8F
    {mn:"BCC",am:"branch",nb:2,il:0,c1:2,c2:2}, // 90
    {mn:"STA",am:"(aa),y",nb:2,il:0,c1:6,c2:0}, // 91
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // 92
    {mn:"SHA",am:"(aa),y",nb:2,il:1,c1:0,c2:0}, // 93
    {mn:"STY",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // 94
    {mn:"STA",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // 95
    {mn:"STX",am:"aa,y",nb:2,il:0,c1:4,c2:0},   // 96
    {mn:"AXS",am:"aa,y",nb:3,il:1,c1:4,c2:1},   // 97
    {mn:"TYA",am:"",nb:1,il:0,c1:2,c2:0},       // 98
    {mn:"STA",am:"AAAA,y",nb:3,il:0,c1:5,c2:0}, // 99
    {mn:"TXS",am:"",nb:1,il:0,c1:2,c2:0},       // 9A
    {mn:"TAS",am:"AAAA,y",nb:3,il:1,c1:0,c2:0}, // 9B
    {mn:"SHY",am:"AAAA,x",nb:3,il:1,c1:0,c2:0}, // 9C
    {mn:"STA",am:"AAAA,x",nb:3,il:0,c1:5,c2:0}, // 9D
    {mn:"SHX",am:"AAAA,y",nb:3,il:1,c1:0,c2:0}, // 9E
    {mn:"SHA",am:"AAAA,y",nb:3,il:1,c1:0,c2:0}, // 9F
    {mn:"LDY",am:"#aa",nb:2,il:0,c1:2,c2:0},    // A0
    {mn:"LDA",am:"(aa,x)",nb:2,il:0,c1:6,c2:0}, // A1
    {mn:"LDX",am:"#aa",nb:2,il:0,c1:2,c2:0},    // A2
    {mn:"LAX",am:"(aa,x)",nb:2,il:1,c1:6,c2:1}, // A3
    {mn:"LDY",am:"aa",nb:2,il:0,c1:3,c2:0},     // A4
    {mn:"LDA",am:"aa",nb:2,il:0,c1:3,c2:0},     // A5
    {mn:"LDX",am:"aa",nb:2,il:0,c1:3,c2:0},     // A6
    {mn:"LAX",am:"aa",nb:2,il:1,c1:3,c2:0},     // A7
    {mn:"TAY",am:"",nb:1,il:0,c1:2,c2:0},       // A8
    {mn:"LDA",am:"#aa",nb:2,il:0,c1:2,c2:0},    // A9
    {mn:"TAX",am:"",nb:1,il:0,c1:2,c2:0},       // AA
    {mn:"LXA",am:"#aa",nb:2,il:1,c1:0,c2:0},    // AB
    {mn:"LDY",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // AC
    {mn:"LDA",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // AD
    {mn:"LDX",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // AE
    {mn:"LAX",am:"AAAA",nb:3,il:1,c1:4,c2:0},   // AF
    {mn:"BCS",am:"branch",nb:2,il:0,c1:2,c2:2}, // B0
    {mn:"LDA",am:"(aa),y",nb:2,il:0,c1:5,c2:1}, // B1
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // B2
    {mn:"LAX",am:"(aa),y",nb:2,il:1,c1:5,c2:1}, // B3
    {mn:"LDY",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // B4
    {mn:"LDA",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // B5
    {mn:"LDX",am:"aa,y",nb:2,il:0,c1:4,c2:0},   // B6
    {mn:"LAX",am:"aa,y",nb:2,il:1,c1:4,c2:1},   // B7
    {mn:"CLV",am:"",nb:1,il:0,c1:2,c2:0},       // B8
    {mn:"LDA",am:"AAAA,y",nb:3,il:0,c1:4,c2:1}, // B9
    {mn:"TSX",am:"",nb:1,il:0,c1:2,c2:0},       // BA
    {mn:"LAS",am:"AAAA,y",nb:3,il:1,c1:0,c2:0}, // BB
    {mn:"LDY",am:"AAAA,x",nb:3,il:0,c1:4,c2:1}, // BC
    {mn:"LDA",am:"AAAA,x",nb:3,il:0,c1:4,c2:1}, // BD
    {mn:"LDX",am:"AAAA,y",nb:3,il:0,c1:4,c2:1}, // BE
    {mn:"LAX",am:"AAAA,y",nb:3,il:1,c1:4,c2:1}, // BF
    {mn:"CPY",am:"#aa",nb:2,il:0,c1:2,c2:0},    // C0
    {mn:"CMP",am:"(aa,x)",nb:2,il:0,c1:6,c2:0}, // C1
    {mn:"NOP",am:"#aa",nb:2,il:1,c1:0,c2:0},    // C2
    {mn:"DCP",am:"(aa,x)",nb:2,il:1,c1:8,c2:1}, // C3
    {mn:"CPY",am:"aa",nb:2,il:0,c1:3,c2:0},     // C4
    {mn:"CMP",am:"aa",nb:2,il:0,c1:3,c2:0},     // C5
    {mn:"DEC",am:"aa",nb:2,il:0,c1:5,c2:0},     // C6
    {mn:"DCP",am:"aa",nb:2,il:1,c1:5,c2:0},     // C7
    {mn:"INY",am:"",nb:1,il:0,c1:2,c2:0},       // C8
    {mn:"CMP",am:"#aa",nb:2,il:0,c1:2,c2:0},    // C9
    {mn:"DEX",am:"",nb:1,il:0,c1:2,c2:0},       // CA
    {mn:"SAX",am:"#aa",nb:2,il:1,c1:2,c2:0},    // CB
    {mn:"CPY",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // CC
    {mn:"CMP",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // CD
    {mn:"DEC",am:"AAAA",nb:3,il:0,c1:3,c2:0},   // CE
    {mn:"DCP",am:"AAAA",nb:3,il:1,c1:6,c2:0},   // CF
    {mn:"BNE",am:"branch",nb:2,il:0,c1:2,c2:2}, // D0
    {mn:"CMP",am:"(aa),y",nb:2,il:0,c1:5,c2:1}, // D1
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // D2
    {mn:"DCP",am:"(aa),y",nb:2,il:1,c1:8,c2:1}, // D3
    {mn:"NOP",am:"aa,x",nb:2,il:1,c1:4,c2:0},   // D4
    {mn:"CMP",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // D5
    {mn:"DEC",am:"aa,x",nb:2,il:0,c1:6,c2:0},   // D6
    {mn:"DCP",am:"aa,x",nb:2,il:1,c1:6,c2:1},   // D7
    {mn:"CLD",am:"",nb:1,il:0,c1:2,c2:0},       // D8
    {mn:"CMP",am:"AAAA,y",nb:3,il:0,c1:4,c2:1}, // D9
    {mn:"NOP",am:"",nb:1,il:1,c1:0,c2:0},       // DA
    {mn:"DCP",am:"AAAA,y",nb:3,il:1,c1:7,c2:1}, // DB
    {mn:"NOP",am:"AAAA,x",nb:3,il:1,c1:4,c2:1}, // DC
    {mn:"CMP",am:"AAAA,x",nb:3,il:0,c1:4,c2:1}, // DD
    {mn:"DEC",am:"AAAA,x",nb:3,il:0,c1:7,c2:0}, // DE
    {mn:"DCP",am:"AAAA,x",nb:3,il:1,c1:7,c2:1}, // DF
    {mn:"CPX",am:"#aa",nb:2,il:0,c1:2,c2:0},    // E0
    {mn:"SBC",am:"(aa,x)",nb:2,il:0,c1:6,c2:0}, // E1
    {mn:"NOP",am:"#aa",nb:2,il:1,c1:0,c2:0},    // E2
    {mn:"ISB",am:"(aa,x)",nb:2,il:1,c1:8,c2:1}, // E3
    {mn:"CPX",am:"aa",nb:2,il:0,c1:3,c2:0},     // E4
    {mn:"SBC",am:"aa",nb:2,il:0,c1:3,c2:0},     // E5
    {mn:"INC",am:"aa",nb:2,il:0,c1:5,c2:0},     // E6
    {mn:"ISB",am:"aa",nb:2,il:1,c1:5,c2:0},     // E7
    {mn:"INX",am:"",nb:1,il:0,c1:2,c2:0},       // E8
    {mn:"SBC",am:"#aa",nb:2,il:0,c1:2,c2:0},    // E9
    {mn:"NOP",am:"",nb:1,il:0,c1:2,c2:0},       // EA
    {mn:"SBC",am:"#aa",nb:2,il:1,c1:0,c2:0},    // EB
    {mn:"CPX",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // EC
    {mn:"SBC",am:"AAAA",nb:3,il:0,c1:4,c2:0},   // ED
    {mn:"INC",am:"AAAA",nb:3,il:0,c1:6,c2:0},   // EE
    {mn:"ISB",am:"AAAA",nb:3,il:1,c1:6,c2:0},   // EF
    {mn:"BEQ",am:"branch",nb:2,il:0,c1:2,c2:2}, // F0
    {mn:"SBC",am:"(aa),y",nb:2,il:0,c1:5,c2:1}, // F1
    {mn:"KIL",am:"",nb:1,il:1,c1:0,c2:0},       // F2
    {mn:"ISB",am:"(aa),y",nb:2,il:1,c1:8,c2:1}, // F3
    {mn:"NOP",am:"aa,x",nb:2,il:1,c1:4,c2:0},   // F4
    {mn:"SBC",am:"aa,x",nb:2,il:0,c1:4,c2:0},   // F5
    {mn:"INC",am:"aa,x",nb:2,il:0,c1:6,c2:0},   // F6
    {mn:"ISB",am:"aa,x",nb:2,il:1,c1:6,c2:1},   // F7
    {mn:"SED",am:"",nb:1,il:0,c1:2,c2:0},       // F8
    {mn:"SBC",am:"AAAA,y",nb:3,il:0,c1:4,c2:1}, // F9
    {mn:"NOP",am:"",nb:1,il:1,c1:0,c2:0},       // FA
    {mn:"ISB",am:"AAAA,y",nb:3,il:1,c1:7,c2:1}, // FB
    {mn:"NOP",am:"AAAA,x",nb:3,il:1,c1:4,c2:1}, // FC
    {mn:"SBC",am:"AAAA,x",nb:3,il:0,c1:4,c2:1}, // FD
    {mn:"INC",am:"AAAA,x",nb:3,il:0,c1:7,c2:0}, // FE
    {mn:"ISB",am:"AAAA,x",nb:3,il:1,c1:7,c2:1}  // FF
];
function createN6502(mio) {
    const cpu = new N6502(a => mio.rd(a), (a, v) => mio.wr(a, v));
    cpu.disassembleInstruction = function(addr) {
        const op = OPS_6502[mio.rd(addr)],
              b1 = mio.rd(addr + 1);
        let am = op.am;
        if (am == 'branch') {
            let offset = (b1 < 0x80) ? addr + 2 + b1 : addr + 2 - (256 - b1);
            offset &= 0xffff;
            am = '$' + offset.toString(16).padStart(4, '0');
        } else {
            const b2 = mio.rd(addr + 2);
            am = am.replace('aa', '$' + b1.toString(16).padStart(2, '0'));
            am = am.replace('AAAA', '$' + ((b2 << 8) | b1).toString(16).padStart(4, '0'));
        }
        return [addr + op.nb, op.mn + ' ' + am];
    };
    return cpu;
}
