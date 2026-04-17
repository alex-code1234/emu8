// js8080 original by Chris Double (http://www.bluishcoder.co.nz/js8080/)
//        modified by Stefan Tramm, 2010
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
// INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
// DEVELOPERS AND CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
// OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
// WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
// OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
// ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
var CARRY     = 0x01;
var UN1       = 0x02;
var PARITY    = 0x04;
var UN3       = 0x08;
var HALFCARRY = 0x10;
var UN5       = 0x20;
var ZERO      = 0x40;
var SIGN      = 0x80;

var PARITY_TABLE = [
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1
];
var HALF_CARRY_TABLE = [
    0, 0, 1, 0, 1, 0, 1, 1
];
var SUB_HALF_CARRY_TABLE = [
    0, 1, 1, 1, 0, 0, 0, 1
];

function Cpu(memio) {
    this.ie = 0;
    this.b = 0;
    this.c = 0;
    this.d = 0;
    this.e = 0;
    // UN1 is always 1, UN3 and UN5 is always 0
    this.f = UN1;
    this.h = 0;
    this.l = 0;
    this.a = 0;
    this.pc = 0;
    this.sp = 0x0000; // TBD
    this.memio = memio;
    this.lastInterrupt = 0;
    this.cycles = 0;
}

// Step through one instruction
Cpu.prototype.step = function() {
    var i = this.memio.rd(this.pc);
    this.pc++;
    this.pc &= 0xFFFF;
    this.ops[i].call(this);
    return this.processInterrupts(i);
};

// Request interrupt
Cpu.prototype.setInterrupt = function(level) {
    switch (level) {
        case 0:
            this.lastInterrupt = 0xC7;
            break;
        case 1:
            this.lastInterrupt = 0xCF;
            break;
        case 2:
            this.lastInterrupt = 0xD7;
            break;
        case 3:
            this.lastInterrupt = 0xDF;
            break;
        case 4:
            this.lastInterrupt = 0xE7;
            break;
        case 5:
            this.lastInterrupt = 0xEF;
            break;
        case 6:
            this.lastInterrupt = 0xF7;
            break;
        case 7:
            this.lastInterrupt = 0xFF;
            break;
        default:
            return false;
    }
    return true;
};

Cpu.prototype.processInterrupts = function(op) {
    if (this.lastInterrupt && this.ie) {
        if (op === 0x76) {
            op = 0;
            this.pc++;
            this.pc &= 0xFFFF;
        }
        var i = this.lastInterrupt;
        this.lastInterrupt = 0;
        this.ie = 0;
        this.ops[i].call(this);
    }
    return op !== 0x76 /*HALT*/;
};

Cpu.prototype.af = function() {
    return this.a << 8 | this.f;
};

Cpu.prototype.AF = function(n) {
    this.a = n >> 8 & 0xFF;
    // UN1 is always 1, UN3 and UN5 is always 0
    this.f = ((n & 0xFF) | UN1) & ~(UN3 | UN5);
};

Cpu.prototype.bc = function () {
    return this.b << 8 | this.c;
};

Cpu.prototype.BC = function(n) {
    this.b = n >> 8 & 0xFF;
    this.c = n & 0xFF;
};

Cpu.prototype.de = function () {
    return this.d << 8 | this.e;
};

Cpu.prototype.DE = function(n) {
    this.d = n >> 8 & 0xFF;
    this.e = n & 0xFF;
};

Cpu.prototype.hl = function () {
    return this.h << 8 | this.l;
};

Cpu.prototype.HL = function(n) {
    this.h = n >> 8 & 0xFF;
    this.l = n & 0xFF;
};

Cpu.prototype.writePort = function (port, v) {
    this.memio.output(port, v);
};

Cpu.prototype.readPort = function (port) {
    return this.memio.input(port);
};

Cpu.prototype.getByte = function (addr) {
    return this.memio.rd(addr);
};

Cpu.prototype.getWord = function (addr) {
    var l = this.memio.rd(addr);
    var h = this.memio.rd(addr+1);
    return h << 8 | l;
};

Cpu.prototype.nextByte = function() {
    var b = this.memio.rd(this.pc++);
    this.pc &= 0xFFFF;
    return b;
};

Cpu.prototype.nextWord = function() {
    var pc = this.pc;
    var l = this.memio.rd(pc++);
    var h = this.memio.rd(pc++);
    this.pc = pc & 0xFFFF;
    return h << 8 | l;
};

Cpu.prototype.writeByte = function(addr, value) {
    var v = value & 0xFF;
    this.memio.wr(addr, v);
};

Cpu.prototype.writeWord = function(addr, value) {
    var l = value;
    var h = value >> 8;
    this.writeByte(addr, l);
    this.writeByte(addr+1, h);
};

// set flags after arithmetic and logical ops
Cpu.prototype.calcFlags = function(v, lhs, rhs) {
    var x = v & 0xFF;
    if (PARITY_TABLE[x])
        this.f |= PARITY; // PE
    else
        this.f &= ~PARITY & 0xFF; // PO
    if (v & 0x80)
        this.f |= SIGN;
    else
        this.f &= ~SIGN & 0xFF;
    if (x)
        this.f &= ~ZERO & 0xFF;
    else
        this.f |= ZERO;
    return x;
};

Cpu.prototype.incrementByte = function(o) {
    // carry isnt affected
    var r = this.calcFlags(o+1, o, 1);
    if (r & 0x0F)
        this.f &= ~HALFCARRY & 0xFF;
    else
        this.f |= HALFCARRY;
    return r;
};

Cpu.prototype.decrementByte = function(o) {
    // carry isnt affected
    var r = this.calcFlags(o-1, o, 1);
    if ((r & 0x0F) == 0x0F)
        this.f &= ~HALFCARRY & 0xFF;
    else
        this.f |= HALFCARRY;
    return r;
};

Cpu.prototype.addByte = function(lhs, rhs, carry) {
    var temp = lhs + rhs;
    if (carry)
        temp++;
    var x = this.calcFlags(temp, lhs, rhs);
    var index = ((lhs & 0x88) >> 1) | ((rhs & 0x88) >> 2) | ((x & 0x88) >> 3);
    if (HALF_CARRY_TABLE[index & 0x7])
        this.f |= HALFCARRY;
    else
        this.f &= ~HALFCARRY & 0xFF;
    if (temp >= 0x100 || temp < 0)
        this.f |= CARRY;
    else
        this.f &= ~CARRY & 0xFF;
    return x;
};

Cpu.prototype.addByteWithCarry = function(lhs, rhs) {
    return this.addByte(lhs, rhs, this.f & CARRY);
};

Cpu.prototype.subtractByte = function(lhs, rhs, carry) {
    var temp = lhs - rhs;
    if (carry)
        temp--;
    temp &= 0xFFFF;
    var x = this.calcFlags(temp, lhs, rhs);
    var index = ((lhs & 0x88) >> 1) | ((rhs & 0x88) >> 2) | ((x & 0x88) >> 3);
    if (SUB_HALF_CARRY_TABLE[index & 0x7])
        this.f &= ~HALFCARRY & 0xFF;
    else
        this.f |= HALFCARRY;
    if (temp >= 0x100 || temp < 0)
        this.f |= CARRY;
    else
        this.f &= ~CARRY & 0xFF;
    return x;
};

Cpu.prototype.subtractByteWithCarry = function(lhs, rhs) {
    return this.subtractByte(lhs, rhs, this.f & CARRY);
};

Cpu.prototype.andByte = function(lhs, rhs) {
    var x = this.calcFlags(lhs & rhs, lhs, rhs);
    if (((lhs | rhs) & 0x08) != 0)
        this.f |= HALFCARRY;
    else
        this.f &= ~HALFCARRY & 0xFF;
    this.f &= ~CARRY & 0xFF;
    return x;
};

Cpu.prototype.xorByte = function(lhs, rhs) {
    var x = this.calcFlags(lhs ^ rhs, lhs, rhs);
    this.f &= ~HALFCARRY & 0xFF;
    this.f &= ~CARRY & 0xFF;
    return x;
};

Cpu.prototype.orByte = function(lhs, rhs) {
    var x = this.calcFlags(lhs | rhs, lhs, rhs);
    this.f &= ~HALFCARRY & 0xFF;
    this.f &= ~CARRY & 0xFF;
    return x;
};

Cpu.prototype.addWord = function(lhs, rhs) {
    var r = lhs + rhs;
    if (r > 0xFFFF)
        this.f |= CARRY;
    else
        this.f &= ~CARRY & 0xFF;
    return r & 0xFFFF;
};

Cpu.prototype.pop = function() {
    var pc = this.getWord(this.sp);
    this.sp = (this.sp + 2) & 0xFFFF;
    return pc;
};

Cpu.prototype.push = function(v) {
    this.sp = (this.sp - 2) & 0xFFFF;
    this.writeWord(this.sp, v);
};

Cpu.prototype.op0x00 = function() {
    // NOP
    this.cycles += 4;
};

Cpu.prototype.op0x01 = function() {
    // LD BC,nn
    this.BC(this.nextWord());
    this.cycles += 10;
};

Cpu.prototype.op0x02 = function() {
    // LD (BC),A
    this.writeByte(this.bc(), this.a);
    this.cycles += 7;
};

Cpu.prototype.op0x03 = function() {
    // INC BC
    this.BC((this.bc() + 1) & 0xFFFF);
    this.cycles += 6;
};

Cpu.prototype.op0x04 = function() {
    // INC  B
    this.b = this.incrementByte(this.b);
    this.cycles += 5 ;
};

Cpu.prototype.op0x05 = function() {
    // DEC  B
    this.b = this.decrementByte(this.b);
    this.cycles += 5;
};

Cpu.prototype.op0x06 = function() {
    // LD   B,n
    this.b = this.nextByte();
    this.cycles += 7;
};

Cpu.prototype.op0x07 = function() {
    // RLCA
    var l = (this.a & 0x80) >> 7;
    if (l)
        this.f |= CARRY;
    else
        this.f &= ~CARRY & 0xFF;
    this.a = ((this.a << 1) & 0xFE) | l;
    this.cycles += 4;
};

Cpu.prototype.op0x09 = function() {
    // ADD  HL,BC
    this.HL(this.addWord(this.hl(), this.bc()));
    this.cycles += 11;
};

Cpu.prototype.op0x0A = function() {
    // LD   A,(BC)
    this.a = this.memio.rd(this.bc());
    this.cycles += 7;
};

Cpu.prototype.op0x0B = function() {
    // DEC  BC
    this.BC(this.bc() - 1);
    this.cycles += 6;
};

Cpu.prototype.op0x0C = function() {
    // INC  C
    this.c = this.incrementByte(this.c);
    this.cycles += 5;
};

Cpu.prototype.op0x0D = function() {
    // DEC  C
    this.c = this.decrementByte(this.c);
    this.cycles += 5;
};

Cpu.prototype.op0x0E = function() {
    // LD   C,n
    this.c = this.nextByte();
    this.cycles += 7;
};

Cpu.prototype.op0x0F = function() {
    // RRCA
    var h = (this.a & 1) << 7;
    if (h)
        this.f |= CARRY;
    else
        this.f &= ~CARRY & 0xFF;
    this.a = ((this.a >> 1) & 0x7F) | h;
    this.cycles += 4;
};

Cpu.prototype.op0x11 = function() {
    // LD   DE,nn
    this.DE(this.nextWord());
    this.cycles += 10;
};

Cpu.prototype.op0x12 = function() {
    // LD   (DE),A
    this.writeByte(this.de(), this.a);
    this.cycles += 7;
};

Cpu.prototype.op0x13 = function() {
    // INC  DE
    this.DE(this.de() + 1);
    this.cycles += 6;
};

Cpu.prototype.op0x14 = function() {
    // INC  D
    this.d = this.incrementByte(this.d);
    this.cycles += 5;
};

Cpu.prototype.op0x15 = function() {
    // DEC  D
    this.d = this.decrementByte(this.d);
    this.cycles += 5;
};

Cpu.prototype.op0x16 = function() {
    // LD   D,n
    this.d = this.nextByte();
    this.cycles += 7;
};

Cpu.prototype.op0x17 = function() {
    // RLA
    var c = (this.f & CARRY) ? 1 : 0;
    if(this.a & 0x80)
        this.f |= CARRY;
    else
        this.f &= ~CARRY & 0xFF;
    this.a = ((this.a << 1) & 0xFE) | c;
    this.cycles += 4;
};

Cpu.prototype.op0x19 = function() {
    // ADD  HL,DE
    this.HL(this.addWord(this.hl(), this.de()));
    this.cycles += 11;
};

Cpu.prototype.op0x1A = function() {
    // LD   A,(DE)
    this.a = this.memio.rd(this.de());
    this.cycles += 7;
};

Cpu.prototype.op0x1B = function() {
    // DEC  DE
    this.DE(this.de() - 1);
    this.cycles += 6;
};

Cpu.prototype.op0x1C = function() {
    // INC  E
    this.e = this.incrementByte(this.e);
    this.cycles += 5;
};

Cpu.prototype.op0x1D = function() {
    // DEC  E
    this.e = this.decrementByte(this.e);
    this.cycles += 5;
};

Cpu.prototype.op0x1E = function() {
    // LD   E,n
    this.e = this.nextByte();
    this.cycles += 7;
};

Cpu.prototype.op0x1F = function() {
    // RRA
    var c = (this.f & CARRY) ? 0x80 : 0;
    if(this.a & 1)
        this.f |= CARRY;
    else
        this.f &= ~CARRY & 0xFF;
    this.a = ((this.a >> 1) & 0x7F) | c;
    this.cycles += 4;
};

Cpu.prototype.op0x21 = function() {
    // LD   HL,nn
    this.HL(this.nextWord());
    this.cycles += 10;
};

Cpu.prototype.op0x22 = function() {
    // LD   (nn),HL
    this.writeWord(this.nextWord(), this.hl());
    this.cycles += 16;
};

Cpu.prototype.op0x23 = function() {
    // INC  HL
    this.HL(this.hl() + 1);
    this.cycles += 6;
};

Cpu.prototype.op0x24 = function() {
    // INC  H
    this.h = this.incrementByte(this.h);
    this.cycles += 5;
};

Cpu.prototype.op0x25 = function() {
    // DEC  H
    this.h = this.decrementByte(this.h);
    this.cycles += 5;
};

Cpu.prototype.op0x26 = function() {
    // LD   H,n
    this.h = this.nextByte();
    this.cycles += 7;
};

Cpu.prototype.op0x27 = function() {
    // DAA
    var carry = this.f & CARRY;
    var set = false;
    var a = this.a;
    var p1 = ((this.f & HALFCARRY) || (a & 0x0F) > 9) ? 0x06 : 0;
    if (carry || (a >> 4) > 9 || ((a >> 4) >= 9 && (a & 0x0F) > 9)) {
        p1 |= 0x60;
        set = true;
    }
    this.a = this.calcFlags(a + p1, a, p1);
    var index = ((a & 0x88) >> 1) | ((p1 & 0x88) >> 2) | ((this.a & 0x88) >> 3);
    if (HALF_CARRY_TABLE[index & 0x7])
        this.f |= HALFCARRY;
    else
        this.f &= ~HALFCARRY & 0xFF;
    if (set && carry == 0)
        this.f |= CARRY;
    this.cycles += 4;
};

Cpu.prototype.op0x29 = function() {
    // ADD  HL,HL
    this.HL(this.addWord(this.hl(), this.hl()));
    this.cycles += 11;
};

Cpu.prototype.op0x2A = function() {
    // LD   HL,(nn)
    this.HL(this.getWord(this.nextWord()));
    this.cycles += 16;
};

Cpu.prototype.op0x2B = function() {
    // DEC  HL
    this.HL(this.hl() - 1);
    this.cycles += 6;
};

Cpu.prototype.op0x2C = function() {
    // INC  L
    this.l = this.incrementByte(this.l);
    this.cycles += 5;
};

Cpu.prototype.op0x2D = function() {
    // DEC  L
    this.l = this.decrementByte(this.l);
    this.cycles += 5;
};

Cpu.prototype.op0x2E = function() {
    // LD   L,n
    this.l = this.nextByte();
    this.cycles += 7;
};

Cpu.prototype.op0x2F = function() {
    // CPL
    this.a ^= 0xFF;
    this.cycles += 4;
};

Cpu.prototype.op0x31 = function() {
    // LD   SP,nn
    this.sp = this.nextWord();
    this.cycles += 10;
};

Cpu.prototype.op0x32 = function() {
    // LD   (nn),A
    this.writeByte(this.nextWord(), this.a);
    this.cycles += 13;
};

Cpu.prototype.op0x33 = function() {
    // INC  SP
    this.sp = (this.sp + 1) & 0xFFFF;
    this.cycles += 6;
};

Cpu.prototype.op0x34 = function() {
    // INC  (HL)
    var addr = this.hl();
    this.writeByte(addr, this.incrementByte(this.memio.rd(addr)));
    this.cycles += 10;
};

Cpu.prototype.op0x35 = function() {
    // DEC  (HL)
    var addr = this.hl();
    this.writeByte(addr, this.decrementByte(this.memio.rd(addr)));
    this.cycles += 10;
};

Cpu.prototype.op0x36 = function() {
    // LD   (HL),n
    this.writeByte(this.hl(), this.nextByte());
    this.cycles += 10;
};

Cpu.prototype.op0x37 = function() {
    // SCF
    this.f |= CARRY;
    this.cycles += 4;
};

Cpu.prototype.op0x39 = function() {
    // ADD  HL,SP
    this.HL(this.addWord(this.hl(), this.sp));
    this.cycles += 11;
};

Cpu.prototype.op0x3A = function() {
    // LD   A,(nn)
    this.a = this.memio.rd(this.nextWord());
    this.cycles += 13;
};

Cpu.prototype.op0x3B = function() {
    // DEC  SP
    this.sp = (this.sp - 1) & 0xFFFF;
    this.cycles += 6;
};

Cpu.prototype.op0x3C = function() {
    // INC  A
    this.a = this.incrementByte(this.a);
    this.cycles += 5;
};

Cpu.prototype.op0x3D = function() {
    // DEC  A
    this.a = this.decrementByte(this.a);
    this.cycles += 5;
};

Cpu.prototype.op0x3E = function() {
    // LD   A,n
    this.a = this.nextByte();
    this.cycles += 7;
};

Cpu.prototype.op0x3F = function() {
    // CCF
    if (this.f & CARRY)
        this.f &= ~CARRY & 0xFF;
    else
        this.f |= CARRY;
    this.cycles += 4;
};

Cpu.prototype.op0x40 = function() {
    // LD   B,B
    this.b = this.b;
    this.cycles += 5;
};

Cpu.prototype.op0x41 = function() {
    //LD   B,C
    this.b = this.c;
    this.cycles += 5;
};

Cpu.prototype.op0x42 = function() {
    // LD   B,D
    this.b = this.d;
    this.cycles += 5;
};

Cpu.prototype.op0x43 = function() {
    // LD   B,E
    this.b = this.e;
    this.cycles += 5;
};

Cpu.prototype.op0x44 = function() {
    // LD   B,H
    this.b = this.h;
    this.cycles += 5;
};

Cpu.prototype.op0x45 = function() {
    // LD   B,L
    this.b = this.l;
    this.cycles += 5;
};

Cpu.prototype.op0x46 = function() {
    // LD   B,(HL)
    this.b = this.memio.rd(this.hl());
    this.cycles += 7;
};

Cpu.prototype.op0x47 = function() {
    // LD   B,A
    this.b = this.a;
    this.cycles += 5;
};

Cpu.prototype.op0x48 = function() {
    // LD   C,B
    this.c = this.b;
    this.cycles += 5;
};

Cpu.prototype.op0x49 = function() {
    // LD   C,C
    this.c = this.c;
    this.cycles += 5;
};

Cpu.prototype.op0x4A = function() {
    // LD   C,D
    this.c = this.d;
    this.cycles += 5;
};

Cpu.prototype.op0x4B = function() {
    // LD   C,E
    this.c = this.e;
    this.cycles += 5;
};

Cpu.prototype.op0x4C = function() {
    // LD   C,H
    this.c = this.h;
    this.cycles += 5;
};

Cpu.prototype.op0x4D = function() {
    // LD   C,L
    this.c = this.l;
    this.cycles += 5;
};

Cpu.prototype.op0x4E = function() {
    // LD   C,(HL)
    this.c = this.memio.rd(this.hl());
    this.cycles += 7;
};

Cpu.prototype.op0x4F = function() {
    // LD   C,A
    this.c = this.a;
    this.cycles += 5;
};

Cpu.prototype.op0x50 = function() {
    // LD   D,B
    this.d = this.b;
    this.cycles += 5;
};

Cpu.prototype.op0x51 = function() {
    // LD   D,C
    this.d = this.c;
    this.cycles += 5;
};

Cpu.prototype.op0x52 = function() {
    // LD   D,D
    this.d = this.d;
    this.cycles += 5;
};

Cpu.prototype.op0x53 = function() {
    // LD   D,E
    this.d = this.e;
    this.cycles += 5;
};

Cpu.prototype.op0x54 = function() {
    // LD   D,H
    this.d = this.h;
    this.cycles += 5;
};

Cpu.prototype.op0x55 = function() {
    // LD   D,L
    this.d = this.l;
    this.cycles += 5;
};

Cpu.prototype.op0x56 = function() {
    // LD   D,(HL)
    this.d = this.memio.rd(this.hl());
    this.cycles += 7;
};

Cpu.prototype.op0x57 = function() {
    // LD   D,A
    this.d = this.a;
    this.cycles += 5;
};

Cpu.prototype.op0x58 = function() {
    // LD   E,B
    this.e = this.b;
    this.cycles += 5;
};

Cpu.prototype.op0x59 = function() {
    // LD   E,C
    this.e = this.c;
    this.cycles += 5;
};

Cpu.prototype.op0x5A = function() {
    // LD   E,D
    this.e = this.d;
    this.cycles += 5;
};

Cpu.prototype.op0x5B = function() {
    // LD   E,E
    this.e = this.e;
    this.cycles += 5;
};

Cpu.prototype.op0x5C = function() {
    // LD   E,H
    this.e = this.h;
    this.cycles += 5;
};

Cpu.prototype.op0x5D = function() {
    // LD   E,L
    this.e = this.l;
    this.cycles += 5;
};

Cpu.prototype.op0x5E = function() {
    // LD   E,(HL)
    this.e = this.memio.rd(this.hl());
    this.cycles += 7;
};

Cpu.prototype.op0x5F = function() {
    // LD   E,A
    this.e = this.a;
    this.cycles += 5;
};

Cpu.prototype.op0x60 = function() {
    // LD   H,B
    this.h = this.b;
    this.cycles += 5;
};

Cpu.prototype.op0x61 = function() {
    // LD   H,C
    this.h = this.c;
    this.cycles += 5;
};

Cpu.prototype.op0x62 = function() {
    // LD   H,D
    this.h = this.d;
    this.cycles += 5;
};

Cpu.prototype.op0x63 = function() {
    // LD   H,E
    this.h = this.e;
    this.cycles += 5;
};

Cpu.prototype.op0x64 = function() {
    // LD   H,H
    this.h = this.h;
    this.cycles += 5;
};

Cpu.prototype.op0x65 = function() {
    // LD   H,L
    this.h = this.l;
    this.cycles += 5;
};

Cpu.prototype.op0x66 = function() {
    // LD   H,(HL)
    this.h = this.memio.rd(this.hl());
    this.cycles += 7;
};

Cpu.prototype.op0x67 = function() {
    // LD   H,A
    this.h = this.a;
    this.cycles += 5;
};

Cpu.prototype.op0x68 = function() {
    // LD   L,B
    this.l = this.b;
    this.cycles += 5;
};

Cpu.prototype.op0x69 = function() {
    // LD   L,C
    this.l = this.c;
    this.cycles += 5;
};

Cpu.prototype.op0x6A = function() {
    // LD   L,D
    this.l = this.d;
    this.cycles += 5;
};

Cpu.prototype.op0x6B = function() {
    // LD   L,E
    this.l = this.e;
    this.cycles += 5;
};

Cpu.prototype.op0x6C = function() {
    // LD   L,H
    this.l = this.h;
    this.cycles += 5;
};

Cpu.prototype.op0x6D = function() {
    // LD   L,L
    this.l = this.l;
    this.cycles += 5;
};

Cpu.prototype.op0x6E = function() {
    // LD   L,(HL)
    this.l = this.memio.rd(this.hl());
    this.cycles += 7;
};

Cpu.prototype.op0x6F = function() {
    // LD   L,A
    this.l = this.a;
    this.cycles += 5;
};

Cpu.prototype.op0x70 = function() {
    // LD   (HL),B
    this.writeByte(this.hl(), this.b);
    this.cycles += 7;
};

Cpu.prototype.op0x71 = function() {
    // LD   (HL),C
    this.writeByte(this.hl(), this.c);
    this.cycles += 7;
};

Cpu.prototype.op0x72 = function() {
    // LD   (HL),D
    this.writeByte(this.hl(), this.d);
    this.cycles += 7;
};

Cpu.prototype.op0x73 = function() {
    // LD   (HL),E
    this.writeByte(this.hl(), this.e);
    this.cycles += 7;
};

Cpu.prototype.op0x74 = function() {
    // LD   (HL),H
    this.writeByte(this.hl(), this.h);
    this.cycles += 7;
};

Cpu.prototype.op0x75 = function() {
    // LD   (HL),L
    this.writeByte(this.hl(), this.l);
    this.cycles += 7;
};

Cpu.prototype.op0x76 = function() {
    // HALT
    this.pc--;
    this.pc &= 0xFFFF;
    this.cycles += 7;
};

Cpu.prototype.op0x77 = function() {
    // LD   (HL),A
    this.writeByte(this.hl(), this.a);
    this.cycles += 7;
};

Cpu.prototype.op0x78 = function() {
    // LD   A,B
    this.a = this.b;
    this.cycles += 5;
};

Cpu.prototype.op0x79 = function() {
    // LD   A,C
    this.a = this.c;
    this.cycles += 5;
};

Cpu.prototype.op0x7A = function() {
    // LD   A,D
    this.a = this.d;
    this.cycles += 5;
};

Cpu.prototype.op0x7B = function() {
    // LD   A,E
    this.a = this.e;
    this.cycles += 5;
};

Cpu.prototype.op0x7C = function() {
    // LD   A,H
    this.a = this.h;
    this.cycles += 5;
};

Cpu.prototype.op0x7D = function() {
    // LD   A,L
    this.a = this.l;
    this.cycles += 5;
};

Cpu.prototype.op0x7E = function() {
    // LD   A,(HL)
    this.a = this.memio.rd(this.hl());
    this.cycles += 7;
};

Cpu.prototype.op0x7F = function() {
    // LD   A,A
    this.a = this.a;
    this.cycles += 5;
};

Cpu.prototype.op0x80 = function() {
    // ADD  A,B
    this.a = this.addByte(this.a, this.b);
    this.cycles += 4;
};

Cpu.prototype.op0x81 = function() {
    // ADD  A,C
    this.a = this.addByte(this.a, this.c);
    this.cycles += 4;
};

Cpu.prototype.op0x82 = function() {
    // ADD  A,D
    this.a = this.addByte(this.a, this.d);
    this.cycles += 4;
};

Cpu.prototype.op0x83 = function() {
    // ADD  A,E
    this.a = this.addByte(this.a, this.e);
    this.cycles += 4;
};

Cpu.prototype.op0x84 = function() {
    // ADD  A,H
    this.a = this.addByte(this.a, this.h);
    this.cycles += 4;
};

Cpu.prototype.op0x85 = function() {
    // ADD  A,L
    this.a = this.addByte(this.a, this.l);
    this.cycles += 4;
};

Cpu.prototype.op0x86 = function() {
    // ADD  A,(HL)
    this.a = this.addByte(this.a, this.memio.rd(this.hl()));
    this.cycles += 7;
};

Cpu.prototype.op0x87 = function() {
    // ADD  A,A
    this.a = this.addByte(this.a, this.a);
    this.cycles += 4;
};

Cpu.prototype.op0x88 = function() {
    // ADC  A,B
    this.a = this.addByteWithCarry(this.a, this.b);
    this.cycles += 4;
};

Cpu.prototype.op0x89 = function() {
    // ADC  A,C
    this.a = this.addByteWithCarry(this.a, this.c);
    this.cycles += 4;
};

Cpu.prototype.op0x8A = function() {
    // ADC  A,D
    this.a = this.addByteWithCarry(this.a, this.d);
    this.cycles += 4;
};

Cpu.prototype.op0x8B = function() {
    // ADC  A,E
    this.a = this.addByteWithCarry(this.a, this.e);
    this.cycles += 4;
};

Cpu.prototype.op0x8C = function() {
    // ADC  A,H
    this.a = this.addByteWithCarry(this.a, this.h);
    this.cycles += 4;
};

Cpu.prototype.op0x8D = function() {
    // ADC  A,L
    this.a = this.addByteWithCarry(this.a, this.l);
    this.cycles += 4;
};

Cpu.prototype.op0x8E = function() {
    // ADC  A,(HL)
    this.a = this.addByteWithCarry(this.a, this.memio.rd(this.hl()));
    this.cycles += 7;
};

Cpu.prototype.op0x8F = function() {
    // ADC  A,A
    this.a = this.addByteWithCarry(this.a, this.a);
    this.cycles += 4;
};

Cpu.prototype.op0x90 = function() {
    // SUB  B
    this.a = this.subtractByte(this.a, this.b);
    this.cycles += 4;
};

Cpu.prototype.op0x91 = function() {
    // SUB  C
    this.a = this.subtractByte(this.a, this.c);
    this.cycles += 4;
};

Cpu.prototype.op0x92 = function() {
    // SUB  D
    this.a = this.subtractByte(this.a, this.d);
    this.cycles += 4;
};

Cpu.prototype.op0x93 = function() {
    // SUB  E
    this.a = this.subtractByte(this.a, this.e);
    this.cycles += 4;
};

Cpu.prototype.op0x94 = function() {
    // SUB  H
    this.a = this.subtractByte(this.a, this.h);
    this.cycles += 4;
};

Cpu.prototype.op0x95 = function() {
    // SUB  L
    this.a = this.subtractByte(this.a, this.l);
    this.cycles += 4;
};

Cpu.prototype.op0x96 = function() {
    // SUB  (HL)
    this.a = this.subtractByte(this.a, this.memio.rd(this.hl()));
    this.cycles += 7;
};

Cpu.prototype.op0x97 = function() {
    // SUB  A
    this.a = this.subtractByte(this.a, this.a);
    this.cycles += 4;
};

Cpu.prototype.op0x98 = function() {
    // SBC  A,B
    this.a = this.subtractByteWithCarry(this.a, this.b);
    this.cycles += 4;
};

Cpu.prototype.op0x99 = function() {
    // SBC  A,C
    this.a = this.subtractByteWithCarry(this.a, this.c);
    this.cycles += 4;
};

Cpu.prototype.op0x9A = function() {
    // SBC  A,D
    this.a = this.subtractByteWithCarry(this.a, this.d);
    this.cycles += 4;
};

Cpu.prototype.op0x9B = function() {
    // SBC  A,E
    this.a = this.subtractByteWithCarry(this.a, this.e);
    this.cycles += 4;
};

Cpu.prototype.op0x9C = function() {
    // SBC  A,H
    this.a = this.subtractByteWithCarry(this.a, this.h);
    this.cycles += 4;
};

Cpu.prototype.op0x9D = function() {
    // SBC  A,L
    this.a = this.subtractByteWithCarry(this.a, this.l);
    this.cycles += 4;
};

Cpu.prototype.op0x9E = function() {
    // SBC  A,(HL)
    this.a = this.subtractByteWithCarry(this.a, this.memio.rd(this.hl()));
    this.cycles += 7;
};

Cpu.prototype.op0x9F = function() {
    // SBC  A,A
    this.a = this.subtractByteWithCarry(this.a, this.a);
    this.cycles += 4;
};

Cpu.prototype.op0xA0 = function() {
    // AND  B
    this.a = this.andByte(this.a, this.b);
    this.cycles += 4;
};

Cpu.prototype.op0xA1 = function() {
    // AND  C
    this.a = this.andByte(this.a, this.c);
    this.cycles += 4;
};

Cpu.prototype.op0xA2 = function() {
    // AND  D
    this.a = this.andByte(this.a, this.d);
    this.cycles += 4;
};

Cpu.prototype.op0xA3 = function() {
    // AND  E
    this.a = this.andByte(this.a, this.e);
    this.cycles += 4;
};

Cpu.prototype.op0xA4 = function() {
    // AND  H
    this.a = this.andByte(this.a, this.h);
    this.cycles += 4;
};

Cpu.prototype.op0xA5 = function() {
    // AND  L
    this.a = this.andByte(this.a, this.l);
    this.cycles += 4;
};

Cpu.prototype.op0xA6 = function() {
    // AND  (HL)
    this.a = this.andByte(this.a, this.memio.rd(this.hl()));
    this.cycles += 7;
};

Cpu.prototype.op0xA7 = function() {
    // AND  A
    this.a = this.andByte(this.a, this.a);
    this.cycles += 4;
};

Cpu.prototype.op0xA8 = function() {
    // XOR  B
    this.a = this.xorByte(this.a, this.b);
    this.cycles += 4;
};

Cpu.prototype.op0xA9 = function() {
    // XOR  C
    this.a = this.xorByte(this.a, this.c);
    this.cycles += 4;
};

Cpu.prototype.op0xAA = function() {
    // XOR  D
    this.a = this.xorByte(this.a, this.d);
    this.cycles += 4;
};

Cpu.prototype.op0xAB = function() {
    // XOR  E
    this.a = this.xorByte(this.a, this.e);
    this.cycles += 4;
};

Cpu.prototype.op0xAC = function() {
    // XOR  H
    this.a = this.xorByte(this.a, this.h);
    this.cycles += 4;
};

Cpu.prototype.op0xAD = function() {
    // XOR  L
    this.a = this.xorByte(this.a, this.l);
    this.cycles += 4;
};

Cpu.prototype.op0xAE = function() {
    // XOR  (HL)
    this.a = this.xorByte(this.a, this.memio.rd(this.hl()));
    this.cycles += 7;
};

Cpu.prototype.op0xAF = function() {
    // XOR  A
    this.a = this.xorByte(this.a, this.a);
    this.cycles += 4;
};

Cpu.prototype.op0xB0 = function() {
    // OR  B
    this.a = this.orByte(this.a, this.b);
    this.cycles += 4;
};

Cpu.prototype.op0xB1 = function() {
    // OR  C
    this.a = this.orByte(this.a, this.c);
    this.cycles += 4;
};

Cpu.prototype.op0xB2 = function() {
    // OR  D
    this.a = this.orByte(this.a, this.d);
    this.cycles += 4;
};

Cpu.prototype.op0xB3 = function() {
    // OR  E
    this.a = this.orByte(this.a, this.e);
    this.cycles += 4;
};

Cpu.prototype.op0xB4 = function() {
    // OR  H
    this.a = this.orByte(this.a, this.h);
    this.cycles += 4;
};

Cpu.prototype.op0xB5 = function() {
    // OR  L
    this.a = this.orByte(this.a, this.l);
    this.cycles += 4;
};

Cpu.prototype.op0xB6 = function() {
    // OR  (HL)
    this.a = this.orByte(this.a, this.memio.rd(this.hl()));
    this.cycles += 7;
};

Cpu.prototype.op0xB7 = function() {
    // OR  A
    this.a = this.orByte(this.a, this.a);
    this.cycles += 4;
};

Cpu.prototype.op0xB8 = function() {
    // CP  B
    this.subtractByte(this.a, this.b);
    this.cycles += 4;
};

Cpu.prototype.op0xB9 = function() {
    // CP  C
    this.subtractByte(this.a, this.c);
    this.cycles += 4;
};

Cpu.prototype.op0xBA = function() {
    // CP  D
    this.subtractByte(this.a, this.d);
    this.cycles += 4;
};

Cpu.prototype.op0xBB = function() {
    // CP   E
    this.subtractByte(this.a, this.e);
    this.cycles += 4;
};

Cpu.prototype.op0xBC = function() {
    // CP   H
    this.subtractByte(this.a, this.h);
    this.cycles += 4;
};

Cpu.prototype.op0xBD = function() {
    // CP   L
    this.subtractByte(this.a, this.l);
    this.cycles += 4;
};

Cpu.prototype.op0xBE = function() {
    // CP   (HL)
    this.subtractByte(this.a, this.memio.rd(this.hl()));
    this.cycles += 7;
};

Cpu.prototype.op0xBF = function() {
    // CP   A
    this.subtractByte(this.a, this.a);
    this.cycles += 4;
};

Cpu.prototype.op0xC0 = function() {
    // RET  NZ
    if (this.f & ZERO)
        this.cycles += 5;
    else {
        this.pc = this.pop();
        this.cycles += 11;
    }
};

Cpu.prototype.op0xC1 = function() {
    // POP  BC
    this.BC(this.pop());
    this.cycles += 10;
};

Cpu.prototype.op0xC2 = function() {
    // JP   NZ,nn
    if (this.f & ZERO)
        this.pc = (this.pc + 2) & 0xFFFF;
    else
        this.pc = this.nextWord();
    this.cycles += 10;
};

Cpu.prototype.op0xC3 = function() {
    // JP   nn
    this.pc = this.getWord(this.pc);
    this.cycles += 10;
};

Cpu.prototype.op0xC4 = function() {
    // CALL NZ,nn
    if (this.f & ZERO) {
        this.pc = (this.pc + 2) & 0xFFFF;
        this.cycles += 11;
    } else {
        var w = this.nextWord();
        this.push(this.pc);
        this.pc = w;
        this.cycles += 17;
    }
};

Cpu.prototype.op0xC5 = function() {
    // PUSH BC
    this.push(this.bc());
    this.cycles += 11;
};

Cpu.prototype.op0xC6 = function() {
    // ADD  A,n
    this.a = this.addByte(this.a, this.nextByte());
    this.cycles += 7;
};

Cpu.prototype.op0xC7 = function() {
    // RST  0
    this.push(this.pc);
    this.pc = 0;
    this.cycles += 11;
};

Cpu.prototype.op0xC8 = function() {
    // RET Z
    if (this.f & ZERO) {
        this.pc = this.pop();
        this.cycles += 11;
    }
    else
        this.cycles += 5;
};

Cpu.prototype.op0xC9 = function() {
    // RET  nn
    this.pc = this.pop();
    this.cycles += 10;
};

Cpu.prototype.op0xCA = function() {
    // JP   Z,nn
    if (this.f & ZERO)
        this.pc = this.nextWord();
    else
        this.pc = (this.pc + 2) & 0xFFFF;
    this.cycles += 10;
};

Cpu.prototype.op0xCC = function() {
    // CALL Z,nn
    if (this.f & ZERO) {
        var w = this.nextWord();
        this.push(this.pc);
        this.pc = w;
        this.cycles += 17;
    } else {
        this.pc = (this.pc + 2) & 0xFFFF;
        this.cycles += 11;
    }
};

Cpu.prototype.op0xCD = function() {
    // CALL nn
    var w = this.nextWord();
    this.push(this.pc);
    this.pc = w;
    this.cycles += 17;
};

Cpu.prototype.op0xCE = function() {
    // ADC  A,n
    this.a = this.addByteWithCarry(this.a, this.nextByte());
    this.cycles += 7;
};

Cpu.prototype.op0xCF = function() {
    // RST  8
    this.push(this.pc);
    this.pc = 0x08;
    this.cycles += 11;
};

Cpu.prototype.op0xD0 = function() {
    // RET NC
    if (this.f & CARRY)
        this.cycles += 5;
    else {
        this.pc = this.pop();
        this.cycles += 11;
    }
};

Cpu.prototype.op0xD1 = function() {
    // POP DE
    this.DE(this.pop());
    this.cycles += 10;
};

Cpu.prototype.op0xD2 = function() {
    // JP   NC,nn
    if (this.f & CARRY)
        this.pc = (this.pc + 2) & 0xFFFF;
    else
        this.pc = this.nextWord();
    this.cycles += 10;
};

Cpu.prototype.op0xD3 = function() {
    // OUT  (n),A
    this.writePort(this.nextByte(), this.a);
    this.cycles += 10;
};

Cpu.prototype.op0xD4 = function() {
    // CALL NC,nn
    if (this.f & CARRY) {
        this.pc = (this.pc + 2) & 0xFFFF;
        this.cycles += 11;
    } else {
        var w = this.nextWord();
        this.push(this.pc);
        this.pc = w;
        this.cycles += 17;
    }
};

Cpu.prototype.op0xD5 = function() {
    // PUSH DE
    this.push(this.de());
    this.cycles += 11;
};

Cpu.prototype.op0xD6 = function() {
    // SUB  n
    this.a = this.subtractByte(this.a, this.nextByte());
    this.cycles += 7;
};

Cpu.prototype.op0xD7 = function() {
    // RST  10H
    this.push(this.pc);
    this.pc = 0x10;
    this.cycles += 11;
};

Cpu.prototype.op0xD8 = function() {
    // RET C
    if (this.f & CARRY) {
        this.pc = this.pop();
        this.cycles += 11;
    }
    else
        this.cycles += 5;
};

Cpu.prototype.op0xDA = function() {
    // JP   C,nn
    if (this.f & CARRY)
        this.pc = this.nextWord();
    else
        this.pc = (this.pc + 2) & 0xFFFF;
    this.cycles += 10;
};

Cpu.prototype.op0xDB = function() {
    // IN   A,(n)
    this.a = this.readPort(this.nextByte());
    this.cycles += 10;
};

Cpu.prototype.op0xDC = function() {
    // CALL C,nn
    if (this.f & CARRY) {
        var w = this.nextWord();
        this.push(this.pc);
        this.pc = w;
        this.cycles += 17;
    } else {
        this.pc = (this.pc + 2) & 0xFFFF;
        this.cycles += 11;
    }
};

Cpu.prototype.op0xDE = function() {
    // SBC  A,n
    this.a = this.subtractByteWithCarry(this.a, this.nextByte());
    this.cycles += 7;
};

Cpu.prototype.op0xDF = function() {
    // RST  18H
    this.push(this.pc);
    this.pc = 0x18;
    this.cycles += 11;
};

Cpu.prototype.op0xE0 = function() {
    // RET PO
    if (this.f & PARITY)
        this.cycles += 5;
    else {
        this.pc = this.pop();
        this.cycles += 11;
    }
};

Cpu.prototype.op0xE1 = function() {
    // POP HL
    this.HL(this.pop());
    this.cycles += 10;
};

Cpu.prototype.op0xE2 = function() {
    // JP   PO,nn
    if (this.f & PARITY)
        this.pc = (this.pc + 2) & 0xFFFF;
    else
        this.pc = this.nextWord();
    this.cycles += 10;
};

Cpu.prototype.op0xE3 = function() {
    // EX   (SP), HL
    var a = this.getWord(this.sp);
    this.writeWord(this.sp, this.hl());
    this.HL(a);
    this.cycles += 18;
};

Cpu.prototype.op0xE4 = function() {
    // CALL PO,nn
    if (this.f & PARITY) {
        this.pc = (this.pc + 2) & 0xFFFF;
        this.cycles += 11;
    } else {
        var w = this.nextWord();
        this.push(this.pc);
        this.pc = w;
        this.cycles += 17;
    }
};

Cpu.prototype.op0xE5 = function() {
    // PUSH HL
    this.push(this.hl());
    this.cycles += 11;
};

Cpu.prototype.op0xE6 = function() {
    // AND  n
    this.a = this.andByte(this.a, this.nextByte());
    this.cycles += 7;
};

Cpu.prototype.op0xE7 = function() {
    // RST  20H
    this.push(this.pc);
    this.pc = 0x20;
    this.cycles += 11;
};

Cpu.prototype.op0xE8 = function() {
    // RET PE
    if (this.f & PARITY) {
        this.pc = this.pop();
        this.cycles += 11;
    }
    else
        this.cycles += 5;
};

Cpu.prototype.op0xE9 = function() {
    // JP   (HL)
    this.pc = this.hl();
    this.cycles += 4;
};

Cpu.prototype.op0xEA = function() {
    // JP   PE,nn
    if (this.f & PARITY)
        this.pc = this.nextWord();
    else
        this.pc = (this.pc + 2) & 0xFFFF;
    this.cycles += 10;
};

Cpu.prototype.op0xEB = function() {
    // EX   DE,HL
    var a = this.de();
    this.DE(this.hl());
    this.HL(a);
    this.cycles += 4;
};

Cpu.prototype.op0xEC = function() {
    // CALL PE,nn
    if (this.f & PARITY) {
        var w = this.nextWord();
        this.push(this.pc);
        this.pc = w;
        this.cycles += 17;
    } else {
        this.pc = (this.pc + 2) & 0xFFFF;
        this.cycles += 11;
    }
};

Cpu.prototype.op0xEE = function() {
    // XOR  n
    this.a = this.xorByte(this.a, this.nextByte());
    this.cycles += 7;
};

Cpu.prototype.op0xEF = function() {
    // RST  28H
    this.push(this.pc);
    this.pc = 0x28;
    this.cycles += 11;
};

Cpu.prototype.op0xF0 = function() {
    // RET P
    if (this.f & SIGN)
        this.cycles += 5;
    else {
        this.pc = this.pop();
        this.cycles += 11;
    }
};

Cpu.prototype.op0xF1 = function() {
    // POP AF
    this.AF(this.pop());
    this.cycles += 10;
};

Cpu.prototype.op0xF2 = function() {
    // JP   P,nn
    if (this.f & SIGN)
        this.pc = (this.pc + 2) & 0xFFFF;
    else
        this.pc = this.nextWord();
    this.cycles += 10;
};

Cpu.prototype.op0xF3 = function() {
    // DI
    this.ie = 0;
    this.cycles += 4;
};

Cpu.prototype.op0xF4 = function() {
    // CALL P,nn
    if (this.f & SIGN) {
        this.pc = (this.pc + 2) & 0xFFFF;
        this.cycles += 11;
    } else {
        var w = this.nextWord();
        this.push(this.pc);
        this.pc = w;
        this.cycles += 17;
    }
};

Cpu.prototype.op0xF5 = function() {
    // PUSH AF
    this.push(this.af());
    this.cycles += 11;
};

Cpu.prototype.op0xF6 = function() {
    // OR   n
    this.a = this.orByte(this.a, this.nextByte());
    this.cycles += 7;
};

Cpu.prototype.op0xF7 = function() {
    // RST  30H
    this.push(this.pc);
    this.pc = 0x30;
    this.cycles += 11;
};

Cpu.prototype.op0xF8 = function() {
    // RET M
    if (this.f & SIGN) {
        this.pc = this.pop();
        this.cycles += 11;
    }
    else
        this.cycles += 5;
};

Cpu.prototype.op0xF9 = function() {
    // LD   SP,HL
    this.sp = this.hl();
    this.cycles += 6;
};

Cpu.prototype.op0xFA = function() {
    // JP   M,nn
    if (this.f & SIGN)
        this.pc = this.nextWord();
    else
        this.pc = (this.pc + 2) & 0xFFFF;
    this.cycles += 10;
};

Cpu.prototype.op0xFB = function() {
    // EI
    this.ie = 1;
    this.cycles += 4;
};

Cpu.prototype.op0xFC = function() {
    // CALL M,nn
    if (this.f & SIGN) {
        var w = this.nextWord();
        this.push(this.pc);
        this.pc = w;
        this.cycles += 17;
    } else {
        this.pc = (this.pc + 2) & 0xFFFF;
        this.cycles += 11;
    }
};

Cpu.prototype.op0xFE = function() {
    // CP   n
    this.subtractByte(this.a, this.nextByte());
    this.cycles += 7;
};

Cpu.prototype.op0xFF = function() {
    // RST  38H
    this.push(this.pc);
    this.pc = 0x38;
    this.cycles += 11;
};

Cpu.prototype.ops = [
    Cpu.prototype.op0x00, Cpu.prototype.op0x01, Cpu.prototype.op0x02, Cpu.prototype.op0x03, 
    Cpu.prototype.op0x04, Cpu.prototype.op0x05, Cpu.prototype.op0x06, Cpu.prototype.op0x07, 
    Cpu.prototype.op0x00, Cpu.prototype.op0x09, Cpu.prototype.op0x0A, Cpu.prototype.op0x0B, 
    Cpu.prototype.op0x0C, Cpu.prototype.op0x0D, Cpu.prototype.op0x0E, Cpu.prototype.op0x0F, 
    Cpu.prototype.op0x00, Cpu.prototype.op0x11, Cpu.prototype.op0x12, Cpu.prototype.op0x13, 
    Cpu.prototype.op0x14, Cpu.prototype.op0x15, Cpu.prototype.op0x16, Cpu.prototype.op0x17, 
    Cpu.prototype.op0x00, Cpu.prototype.op0x19, Cpu.prototype.op0x1A, Cpu.prototype.op0x1B, 
    Cpu.prototype.op0x1C, Cpu.prototype.op0x1D, Cpu.prototype.op0x1E, Cpu.prototype.op0x1F, 
    Cpu.prototype.op0x00, Cpu.prototype.op0x21, Cpu.prototype.op0x22, Cpu.prototype.op0x23, 
    Cpu.prototype.op0x24, Cpu.prototype.op0x25, Cpu.prototype.op0x26, Cpu.prototype.op0x27, 
    Cpu.prototype.op0x00, Cpu.prototype.op0x29, Cpu.prototype.op0x2A, Cpu.prototype.op0x2B, 
    Cpu.prototype.op0x2C, Cpu.prototype.op0x2D, Cpu.prototype.op0x2E, Cpu.prototype.op0x2F, 
    Cpu.prototype.op0x00, Cpu.prototype.op0x31, Cpu.prototype.op0x32, Cpu.prototype.op0x33, 
    Cpu.prototype.op0x34, Cpu.prototype.op0x35, Cpu.prototype.op0x36, Cpu.prototype.op0x37, 
    Cpu.prototype.op0x00, Cpu.prototype.op0x39, Cpu.prototype.op0x3A, Cpu.prototype.op0x3B, 
    Cpu.prototype.op0x3C, Cpu.prototype.op0x3D, Cpu.prototype.op0x3E, Cpu.prototype.op0x3F, 
    Cpu.prototype.op0x40, Cpu.prototype.op0x41, Cpu.prototype.op0x42, Cpu.prototype.op0x43, 
    Cpu.prototype.op0x44, Cpu.prototype.op0x45, Cpu.prototype.op0x46, Cpu.prototype.op0x47, 
    Cpu.prototype.op0x48, Cpu.prototype.op0x49, Cpu.prototype.op0x4A, Cpu.prototype.op0x4B, 
    Cpu.prototype.op0x4C, Cpu.prototype.op0x4D, Cpu.prototype.op0x4E, Cpu.prototype.op0x4F, 
    Cpu.prototype.op0x50, Cpu.prototype.op0x51, Cpu.prototype.op0x52, Cpu.prototype.op0x53, 
    Cpu.prototype.op0x54, Cpu.prototype.op0x55, Cpu.prototype.op0x56, Cpu.prototype.op0x57, 
    Cpu.prototype.op0x58, Cpu.prototype.op0x59, Cpu.prototype.op0x5A, Cpu.prototype.op0x5B, 
    Cpu.prototype.op0x5C, Cpu.prototype.op0x5D, Cpu.prototype.op0x5E, Cpu.prototype.op0x5F, 
    Cpu.prototype.op0x60, Cpu.prototype.op0x61, Cpu.prototype.op0x62, Cpu.prototype.op0x63, 
    Cpu.prototype.op0x64, Cpu.prototype.op0x65, Cpu.prototype.op0x66, Cpu.prototype.op0x67, 
    Cpu.prototype.op0x68, Cpu.prototype.op0x69, Cpu.prototype.op0x6A, Cpu.prototype.op0x6B, 
    Cpu.prototype.op0x6C, Cpu.prototype.op0x6D, Cpu.prototype.op0x6E, Cpu.prototype.op0x6F, 
    Cpu.prototype.op0x70, Cpu.prototype.op0x71, Cpu.prototype.op0x72, Cpu.prototype.op0x73, 
    Cpu.prototype.op0x74, Cpu.prototype.op0x75, Cpu.prototype.op0x76, Cpu.prototype.op0x77, 
    Cpu.prototype.op0x78, Cpu.prototype.op0x79, Cpu.prototype.op0x7A, Cpu.prototype.op0x7B, 
    Cpu.prototype.op0x7C, Cpu.prototype.op0x7D, Cpu.prototype.op0x7E, Cpu.prototype.op0x7F, 
    Cpu.prototype.op0x80, Cpu.prototype.op0x81, Cpu.prototype.op0x82, Cpu.prototype.op0x83, 
    Cpu.prototype.op0x84, Cpu.prototype.op0x85, Cpu.prototype.op0x86, Cpu.prototype.op0x87, 
    Cpu.prototype.op0x88, Cpu.prototype.op0x89, Cpu.prototype.op0x8A, Cpu.prototype.op0x8B, 
    Cpu.prototype.op0x8C, Cpu.prototype.op0x8D, Cpu.prototype.op0x8E, Cpu.prototype.op0x8F, 
    Cpu.prototype.op0x90, Cpu.prototype.op0x91, Cpu.prototype.op0x92, Cpu.prototype.op0x93, 
    Cpu.prototype.op0x94, Cpu.prototype.op0x95, Cpu.prototype.op0x96, Cpu.prototype.op0x97, 
    Cpu.prototype.op0x98, Cpu.prototype.op0x99, Cpu.prototype.op0x9A, Cpu.prototype.op0x9B, 
    Cpu.prototype.op0x9C, Cpu.prototype.op0x9D, Cpu.prototype.op0x9E, Cpu.prototype.op0x9F, 
    Cpu.prototype.op0xA0, Cpu.prototype.op0xA1, Cpu.prototype.op0xA2, Cpu.prototype.op0xA3, 
    Cpu.prototype.op0xA4, Cpu.prototype.op0xA5, Cpu.prototype.op0xA6, Cpu.prototype.op0xA7, 
    Cpu.prototype.op0xA8, Cpu.prototype.op0xA9, Cpu.prototype.op0xAA, Cpu.prototype.op0xAB, 
    Cpu.prototype.op0xAC, Cpu.prototype.op0xAD, Cpu.prototype.op0xAE, Cpu.prototype.op0xAF, 
    Cpu.prototype.op0xB0, Cpu.prototype.op0xB1, Cpu.prototype.op0xB2, Cpu.prototype.op0xB3, 
    Cpu.prototype.op0xB4, Cpu.prototype.op0xB5, Cpu.prototype.op0xB6, Cpu.prototype.op0xB7, 
    Cpu.prototype.op0xB8, Cpu.prototype.op0xB9, Cpu.prototype.op0xBA, Cpu.prototype.op0xBB, 
    Cpu.prototype.op0xBC, Cpu.prototype.op0xBD, Cpu.prototype.op0xBE, Cpu.prototype.op0xBF, 
    Cpu.prototype.op0xC0, Cpu.prototype.op0xC1, Cpu.prototype.op0xC2, Cpu.prototype.op0xC3, 
    Cpu.prototype.op0xC4, Cpu.prototype.op0xC5, Cpu.prototype.op0xC6, Cpu.prototype.op0xC7, 
    Cpu.prototype.op0xC8, Cpu.prototype.op0xC9, Cpu.prototype.op0xCA, Cpu.prototype.op0xC3, 
    Cpu.prototype.op0xCC, Cpu.prototype.op0xCD, Cpu.prototype.op0xCE, Cpu.prototype.op0xCF, 
    Cpu.prototype.op0xD0, Cpu.prototype.op0xD1, Cpu.prototype.op0xD2, Cpu.prototype.op0xD3, 
    Cpu.prototype.op0xD4, Cpu.prototype.op0xD5, Cpu.prototype.op0xD6, Cpu.prototype.op0xD7, 
    Cpu.prototype.op0xD8, Cpu.prototype.op0xC9, Cpu.prototype.op0xDA, Cpu.prototype.op0xDB, 
    Cpu.prototype.op0xDC, Cpu.prototype.op0xCD, Cpu.prototype.op0xDE, Cpu.prototype.op0xDF, 
    Cpu.prototype.op0xE0, Cpu.prototype.op0xE1, Cpu.prototype.op0xE2, Cpu.prototype.op0xE3, 
    Cpu.prototype.op0xE4, Cpu.prototype.op0xE5, Cpu.prototype.op0xE6, Cpu.prototype.op0xE7, 
    Cpu.prototype.op0xE8, Cpu.prototype.op0xE9, Cpu.prototype.op0xEA, Cpu.prototype.op0xEB, 
    Cpu.prototype.op0xEC, Cpu.prototype.op0xCD, Cpu.prototype.op0xEE, Cpu.prototype.op0xEF, 
    Cpu.prototype.op0xF0, Cpu.prototype.op0xF1, Cpu.prototype.op0xF2, Cpu.prototype.op0xF3, 
    Cpu.prototype.op0xF4, Cpu.prototype.op0xF5, Cpu.prototype.op0xF6, Cpu.prototype.op0xF7, 
    Cpu.prototype.op0xF8, Cpu.prototype.op0xF9, Cpu.prototype.op0xFA, Cpu.prototype.op0xFB, 
    Cpu.prototype.op0xFC, Cpu.prototype.op0xCD, Cpu.prototype.op0xFE, Cpu.prototype.op0xFF
];

// disassembler accesses RAM directly
// just for the case of memory mapped IO, not to trigger IO!
Cpu.prototype.disassembleInstruction = function(addr) {
    var i = this.memio.rd(addr);
    switch(i) {
        case 0x00:
            // NOP
            var r = 'NOP';
            return [addr + 1, r];
        case 0x01:
            // LD BC,nn
            var r = 'LXI  B, ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0x02:
            // LD (BC),A
            var r = 'STAX B';
            return [addr + 1, r];
        case 0x03:
            // INC BC
            var r = 'INX  B';
            return [addr + 1, r];
        case 0x04:
            // INC  B
            var r = 'INR  B';
            return [addr + 1, r];
        case 0x05:
            // DEC  B
            var r = 'DCR  B';
            return [addr + 1, r];
        case 0x06:
            // LD   B,n
            var r = 'MVI  B, ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0x07:
            // RLCA
            var r = 'RLC';
            return [addr + 1, r];
        case 0x08:
            // NOP?
            return [addr + 1, 'NOP?'];
        case 0x09:
            // ADD  HL,BC
            var r = 'DAD  B';
            return [addr + 1, r];
        case 0x0A:
            // LD   A,(BC)
            var r = 'LDAX B';
            return [addr + 1, r];
        case 0x0B:
            // DEC  BC
            var r = 'DCX  B';
            return [addr + 1, r];
        case 0x0C:
            // INC  C
            var r = 'INR  C';
            return [addr + 1, r];
        case 0x0D:
            // DEC  C
            var r = 'DCR  C';
            return [addr + 1, r];
        case 0x0E:
            // LD   C,n
            var r = 'MVI  C, ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0x0F:
            // RRCA
            var r = 'RRC';
            return [addr + 1, r];
        case 0x10:
            // NOP?
            return [addr + 1, 'NOP?'];
        case 0x11:
            // LD   DE,nn
            var r = 'LXI  D, ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0x12:
            // LD   (DE),A
            var r = 'STAX D';
            return [addr + 1, r];
        case 0x13:
            // INC  DE
            var r = 'INX  D';
            return [addr + 1, r];
        case 0x14:
            // INC  D
            var r = 'INR  D';
            return [addr + 1, r];
        case 0x15:
            // DEC  D
            var r = 'DCR  D';
            return [addr + 1, r];
        case 0x16:
            // LD   D,n
            var r = 'MVI  D, ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0x17:
            // RLA
            var r = 'RAL';
            return [addr + 1, r];
        case 0x18:
            // NOP?
            return [addr + 1, 'NOP?'];
        case 0x19:
            // ADD  HL,DE
            var r = 'DAD  D';
            return [addr + 1, r];
        case 0x1A:
            // LD   A,(DE)
            var r = 'LDAX D';
            return [addr + 1, r];
        case 0x1B:
            // DEC  DE
            var r = 'DCX  D';
            return [addr + 1, r];
        case 0x1C:
            // INC  E
            var r = 'INR  E';
            return [addr + 1, r];
        case 0x1D:
            // DEC  E
            var r = 'DCR  E';
            return [addr + 1, r];
        case 0x1E:
            // LD   E,n
            var r = 'MVI  E, ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0x1F:
            // RRA
            var r = 'RAR';
            return [addr + 1, r];
        case 0x20:
            // NOP?
            return [addr + 1, 'NOP?'];
        case 0x21:
            // LD   HL,nn
            var r = 'LXI  H, ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0x22:
            // LD   (nn),HL
            var r = 'SHLD ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0x23:
            // INC  HL
            var r = 'INX  H';
            return [addr + 1, r];
        case 0x24:
            // INC  H
            var r = 'INR  H';
            return [addr + 1, r];
        case 0x25:
            // DEC  H
            var r = 'DCR  H';
            return [addr + 1, r];
        case 0x26:
            // LD   H,n
            var r = 'MVI  H, ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0x27:
            // DAA
            var r = 'DAA';
            return [addr + 1, r];
        case 0x28:
            // NOP?
            return [addr + 1, 'NOP?'];
        case 0x29:
            // ADD  HL,HL
            var r = 'DAD  H';
            return [addr + 1, r];
        case 0x2A:
            // LD   HL,(nn)
            var r = 'LHLD ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0x2B:
            // DEC  HL
            var r = 'DCX  H';
            return [addr + 1, r];
        case 0x2C:
            // INC  L
            var r = 'INR  L';
            return [addr + 1, r];
        case 0x2D:
            // DEC  L
            var r = 'DCR  L';
            return [addr + 1, r];
        case 0x2E:
            // LD   L,n
            var r = 'MVI  L, ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0x2F:
            // CPL
            var r = 'CMA';
            return [addr + 1, r];
        case 0x30:
            // NOP?
            return [addr + 1, 'NOP?'];
        case 0x31:
            // LD   SP,nn
            var r = 'LXI  SP, ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0x32:
            // LD   (nn),A
            var r = 'STA  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0x33:
            // INC  SP
            var r = 'INX  SP';
            return [addr + 1, r];
        case 0x34:
            // INC  (HL)
            var r = 'INR  M';
            return [addr + 1, r];
        case 0x35:
            // DEC  (HL)
            var r = 'DCR  M';
            return [addr + 1, r];
        case 0x36:
            // LD   (HL),n
            var r = 'MVI  M, ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0x37:
            // SCF
            var r = 'STC';
            return [addr + 1, r];
        case 0x38:
            // NOP?
            return [addr + 1, 'NOP?'];
        case 0x39:
            // ADD  HL,SP
            var r = 'DAD  SP';
            return [addr + 1, r];
        case 0x3A:
            // LD   A,(nn)
            var r = 'LDA  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0x3B:
            // DEC  SP
            var r = 'DCX  SP';
            return [addr + 1, r];
        case 0x3C:
            // INC  A
            var r = 'INR  A';
            return [addr + 1, r];
        case 0x3D:
            // DEC  A
            var r = 'DCR  A';
            return [addr + 1, r];
        case 0x3E:
            // LD   A,n
            var r = 'MVI  A, ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0x3F:
            // CCF
            var r = 'CMC';
            return [addr + 1, r];
        case 0x40:
            // LD   B,B
            var r = 'MOV  B, B';
            return [addr + 1, r];
        case 0x41:
            //LD   B,C
            var r = 'MOV  B, C';
            return [addr + 1, r];
        case 0x42:
            // LD   B,D
            var r = 'MOV  B, D';
            return [addr + 1, r];
        case 0x43:
            // LD   B,E
            var r = 'MOV  B, E';
            return [addr + 1, r];
        case 0x44:
            // LD   B,H
            var r = 'MOV  B, H';
            return [addr + 1, r];
        case 0x45:
            // LD   B,L
            var r = 'MOV  B, L';
            return [addr + 1, r];
        case 0x46:
            // LD   B,(HL)
            var r = 'MOV  B, M';
            return [addr + 1, r];
        case 0x47:
            // LD   B,A
            var r = 'MOV  B, A';
            return [addr + 1, r];
        case 0x48:
            // LD   C,B
            var r = 'MOV  C, B';
            return [addr + 1, r];
        case 0x49:
            // LD   C,C
            var r = 'MOV  C, C';
            return [addr + 1, r];
        case 0x4A:
            // LD   C,D
            var r = 'MOV  C, D';
            return [addr + 1, r];
        case 0x4B:
            // LD   C,E
            var r = 'MOV  C, E';
            return [addr + 1, r];
        case 0x4C:
            // LD   C,H
            var r = 'MOV  C, H';
            return [addr + 1, r];
        case 0x4D:
            // LD   C,L
            var r = 'MOV  C, L';
            return [addr + 1, r];
        case 0x4E:
            // LD   C,(HL)
            var r = 'MOV  C, M';
            return [addr + 1, r];
        case 0x4F:
            // LD   C,A
            var r = 'MOV  C, A';
            return [addr + 1, r];
        case 0x50:
            // LD   D,B
            var r = 'MOV  D, B';
            return [addr + 1, r];
        case 0x51:
            // LD   D,C
            var r = 'MOV  D, C';
            return [addr + 1, r];
        case 0x52:
            // LD   D,D
            var r = 'MOV  D, D';
            return [addr + 1, r];
        case 0x53:
            // LD   D,E
            var r = 'MOV  D, E';
            return [addr + 1, r];
        case 0x54:
            // LD   D,H
            var r = 'MOV  D, H';
            return [addr + 1, r];
        case 0x55:
            // LD   D,L
            var r = 'MOV  D, L';
            return [addr + 1, r];
        case 0x56:
            // LD   D,(HL)
            var r = 'MOV  D, M';
            return [addr + 1, r];
        case 0x57:
            // LD   D,A
            var r = 'MOV  D, A';
            return [addr + 1, r];
        case 0x58:
            // LD   E,B
            var r = 'MOV  E, B';
            return [addr + 1, r];
        case 0x59:
            // LD   E,C
            var r = 'MOV  E, C';
            return [addr + 1, r];
        case 0x5A:
            // LD   E,D
            var r = 'MOV  E, D';
            return [addr + 1, r];
        case 0x5B:
            // LD   E,E
            var r = 'MOV  E, E';
            return [addr + 1, r];
        case 0x5C:
            // LD   E,H
            var r = 'MOV  E, H';
            return [addr + 1, r];
        case 0x5D:
            // LD   E,L
            var r = 'MOV  E, L';
            return [addr + 1, r];
        case 0x5E:
            // LD   E,(HL)
            var r = 'MOV  E, M';
            return [addr + 1, r];
        case 0x5F:
            // LD   E,A
            var r = 'MOV  E, A';
            return [addr + 1, r];
        case 0x60:
            // LD   H,B
            var r = 'MOV  H, B';
            return [addr + 1, r];
        case 0x61:
            // LD   H,C
            var r = 'MOV  H, C';
            return [addr + 1, r];
        case 0x62:
            // LD   H,D
            var r = 'MOV  H, D';
            return [addr + 1, r];
        case 0x63:
            // LD   H,E
            var r = 'MOV  H, E';
            return [addr + 1, r];
        case 0x64:
            // LD   H,H
            var r = 'MOV  H, H';
            return [addr + 1, r];
        case 0x65:
            // LD   H,L
            var r = 'MOV  H, L';
            return [addr + 1, r];
        case 0x66:
            // LD   H,(HL)
            var r = 'MOV  H, M';
            return [addr + 1, r];
        case 0x67:
            // LD   H,A
            var r = 'MOV  H, A';
            return [addr + 1, r];
        case 0x68:
            // LD   L,B
            var r = 'MOV  L, B';
            return [addr + 1, r];
        case 0x69:
            // LD   L,C
            var r = 'MOV  L, C';
            return [addr + 1, r];
        case 0x6A:
            // LD   L,D
            var r = 'MOV  L, D';
            return [addr + 1, r];
        case 0x6B:
            // LD   L,E
            var r = 'MOV  L, E';
            return [addr + 1, r];
        case 0x6C:
            // LD   L,H
            var r = 'MOV  L, H';
            return [addr + 1, r];
        case 0x6D:
            // LD   L,L
            var r = 'MOV  L, L';
            return [addr + 1, r];
        case 0x6E:
            // LD   L,(HL)
            var r = 'MOV  L, M';
            return [addr + 1, r];
        case 0x6F:
            // LD   L,A
            var r = 'MOV  L, A';
            return [addr + 1, r];
        case 0x70:
            // LD   (HL),B
            var r = 'MOV  M, B';
            return [addr + 1, r];
        case 0x71:
            // LD   (HL),C
            var r = 'MOV  M, C';
            return [addr + 1, r];
        case 0x72:
            // LD   (HL),D
            var r = 'MOV  M, D';
            return [addr + 1, r];
        case 0x73:
            // LD   (HL),E
            var r = 'MOV  M, E';
            return [addr + 1, r];
        case 0x74:
            // LD   (HL),H
            var r = 'MOV  M, H';
            return [addr + 1, r];
        case 0x75:
            // LD   (HL),L
            var r = 'MOV  M, L';
            return [addr + 1, r];
        case 0x76:
            // HALT
            var r = 'HLT';
            return [addr + 1, r];
        case 0x77:
            // LD   (HL),A
            var r = 'MOV  M, A';
            return [addr + 1, r];
        case 0x78:
            // LD   A,B
            var r = 'MOV  A, B';
            return [addr + 1, r];
        case 0x79:
            // LD   A,C
            var r = 'MOV  A, C';
            return [addr + 1, r];
        case 0x7A:
            // LD   A,D
            var r = 'MOV  A, D';
            return [addr + 1, r];
        case 0x7B:
            // LD   A,E
            var r = 'MOV  A, E';
            return [addr + 1, r];
        case 0x7C:
            // LD   A,H
            var r = 'MOV  A, H';
            return [addr + 1, r];
        case 0x7D:
            // LD   A,L
            var r = 'MOV  A, L';
            return [addr + 1, r];
        case 0x7E:
            // LD   A,(HL)
            var r = 'MOV  A, M';
            return [addr + 1, r];
        case 0x7F:
            // LD   A,A
            var r = 'MOV  A, A';
            return [addr + 1, r];
        case 0x80:
            // ADD  A,B
            var r = 'ADD  B';
            return [addr + 1, r];
        case 0x81:
            // ADD  A,C
            var r = 'ADD  C';
            return [addr + 1, r];
        case 0x82:
            // ADD  A,D
            var r = 'ADD  D';
            return [addr + 1, r];
        case 0x83:
            // ADD  A,E
            var r = 'ADD  E';
            return [addr + 1, r];
        case 0x84:
            // ADD  A,H
            var r = 'ADD  H';
            return [addr + 1, r];
        case 0x85:
            // ADD  A,L
            var r = 'ADD  L';
            return [addr + 1, r];
        case 0x86:
            // ADD  A,(HL)
            var r = 'ADD  M';
            return [addr + 1, r];
        case 0x87:
            // ADD  A,A
            var r = 'ADD  A';
            return [addr + 1, r];
        case 0x88:
            // ADC  A,B
            var r = 'ADC  B';
            return [addr + 1, r];
        case 0x89:
            // ADC  A,C
            var r = 'ADC  C';
            return [addr + 1, r];
        case 0x8A:
            // ADC  A,D
            var r = 'ADC  D';
            return [addr + 1, r];
        case 0x8B:
            // ADC  A,E
            var r = 'ADC  E';
            return [addr + 1, r];
        case 0x8C:
            // ADC  A,H
            var r = 'ADC  H';
            return [addr + 1, r];
        case 0x8D:
            // ADC  A,L
            var r = 'ADC  L';
            return [addr + 1, r];
        case 0x8E:
            // ADC  A,(HL)
            var r = 'ADC  M';
            return [addr + 1, r];
        case 0x8F:
            // ADC  A,A
            var r = 'ADC  A';
            return [addr + 1, r];
        case 0x90:
            // SUB  B
            var r = 'SUB  B';
            return [addr + 1, r];
        case 0x91:
            // SUB  C
            var r = 'SUB  C';
            return [addr + 1, r];
        case 0x92:
            // SUB  D
            var r = 'SUB  D';
            return [addr + 1, r];
        case 0x93:
            // SUB  E
            var r = 'SUB  E';
            return [addr + 1, r];
        case 0x94:
            // SUB  H
            var r = 'SUB  H';
            return [addr + 1, r];
        case 0x95:
            // SUB  L
            var r = 'SUB  L';
            return [addr + 1, r];
        case 0x96:
            // SUB  (HL)
            var r = 'SUB  M';
            return [addr + 1, r];
        case 0x97:
            // SUB  A
            var r = 'SUB  A';
            return [addr + 1, r];
        case 0x98:
            // SBC  A,B
            var r = 'SBB  B';
            return [addr + 1, r];
        case 0x99:
            // SBC  A,C
            var r = 'SBB  C';
            return [addr + 1, r];
        case 0x9A:
            // SBC  A,D
            var r = 'SBB  D';
            return [addr + 1, r];
        case 0x9B:
            // SBC  A,E
            var r = 'SBB  E';
            return [addr + 1, r];
        case 0x9C:
            // SBC  A,H
            var r = 'SBB  H';
            return [addr + 1, r];
        case 0x9D:
            // SBC  A,L
            var r = 'SBB  L';
            return [addr + 1, r];
        case 0x9E:
            //  SBC  A,(HL)
            var r = 'SBB  M';
            return [addr + 1, r];
        case 0x9F:
            // SBC  A,A
            var r = 'SBB  A';
            return [addr + 1, r];
        case 0xA0:
            // AND  B
            var r = 'ANA  B';
            return [addr + 1, r];
        case 0xA1:
            // AND  C
            var r = 'ANA  C';
            return [addr + 1, r];
        case 0xA2:
            // AND  D
            var r = 'ANA  D';
            return [addr + 1, r];
        case 0xA3:
            // AND  E
            var r = 'ANA  E';
            return [addr + 1, r];
        case 0xA4:
            // AND  H
            var r = 'ANA  H';
            return [addr + 1, r];
        case 0xA5:
            // AND  L
            var r = 'ANA  L';
            return [addr + 1, r];
        case 0xA6:
            // AND  (HL)
            var r = 'ANA  M';
            return [addr + 1, r];
        case 0xA7:
            // AND  A
            var r = 'ANA  A';
            return [addr + 1, r];
        case 0xA8:
            // XOR  B
            var r = 'XRA  B';
            return [addr + 1, r];
        case 0xA9:
            // XOR  C
            var r = 'XRA  C';
            return [addr + 1, r];
        case 0xAA:
            // XOR  D
            var r = 'XRA  D';
            return [addr + 1, r];
        case 0xAB:
            // XOR  E
            var r = 'XRA  E';
            return [addr + 1, r];
        case 0xAC:
            // XOR  H
            var r = 'XRA  H';
            return [addr + 1, r];
        case 0xAD:
            // XOR  L
            var r = 'XRA  L';
            return [addr + 1, r];
        case 0xAE:
            // XOR  (HL)
            var r = 'XRA  M';
            return [addr + 1, r];
        case 0xAF:
            // XOR  A
            var r = 'XRA  A';
            return [addr + 1, r];
        case 0xB0:
            // OR  B
            var r = 'ORA  B';
            return [addr + 1, r];
        case 0xB1:
            // OR  C
            var r = 'ORA  C';
            return [addr + 1, r];
        case 0xB2:
            // OR  D
            var r = 'ORA  D';
            return [addr + 1, r];
        case 0xB3:
            // OR  E
            var r = 'ORA  E';
            return [addr + 1, r];
        case 0xB4:
            // OR  H
            var r = 'ORA  H';
            return [addr + 1, r];
        case 0xB5:
            // OR  L
            var r = 'ORA  L';
            return [addr + 1, r];
        case 0xB6:
            //  OR   (HL)
            var r = 'ORA  M';
            return [addr + 1, r];
        case 0xB7:
            // OR  A
            var r = 'ORA  A';
            return [addr + 1, r];
        case 0xB8:
            //  CP   B
            var r = 'CMP  B';
            return [addr + 1, r];
        case 0xB9:
            //  CP   C
            var r = 'CMP  C';
            return [addr + 1, r];
        case 0xBA:
            //  CP   D
            var r = 'CMP  D';
            return [addr + 1, r];
        case 0xBB:
            //  CP   E
            var r = 'CMP  E';
            return [addr + 1, r];
        case 0xBC:
            //  CP   H
            var r = 'CMP  H';
            return [addr + 1, r];
        case 0xBD:
            //  CP   L
            var r = 'CMP  L';
            return [addr + 1, r];
        case 0xBE:
            // CP   (HL)
            var r = 'CMP  M';
            return [addr + 1, r];
        case 0xBF:
            //  CP   A
            var r = 'CMP  A';
            return [addr + 1, r];
        case 0xC0:
            //  RET  NZ
            var r = 'RNZ';
            return [addr + 1, r];
        case 0xC1:
            //  POP  BC
            var r = 'POP  B';
            return [addr + 1, r];
        case 0xC2:
            // JP   NZ,nn
            var r = 'JNZ  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xC3:
            //  JP   nn
            var r = 'JMP  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xC4:
            //  CALL NZ,nn
            var r = 'CNZ  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xC5:
            //  PUSH BC
            var r = 'PUSH B';
            return [addr + 1, r];
        case 0xC6:
            //  ADD  A,n
            var r = 'ADI  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xC7:
            // RST  0
            var r = 'RST  0';
            return [addr + 1, r];
        case 0xC8:
            // RET Z
            var r = 'RZ';
            return [addr + 1, r];
        case 0xC9:
            // RET
            var r = 'RET';
            return [addr + 1, r];
        case 0xCA:
            // JP   Z,nn
            var r = 'JZ   ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xCB:
            //  JP?   nn
            var r = 'JMP? ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xCC:
            //  CALL Z,nn
            var r = 'CZ   ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xCD:
            // CALL nn
            var r = 'CALL ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xCE:
            // ADC  A,n
            var r = 'ACI  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xCF:
            // RST  8
            var r = 'RST  1';
            return [addr + 1, r];
        case 0xD0:
            // RET NC
            var r = 'RNC';
            return [addr + 1, r];
        case 0xD1:
            // POP DE
            var r = 'POP  D';
            return [addr + 1, r];
        case 0xD2:
            // JP   NC,nn
            var r = 'JNC  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xD3:
            // OUT  (n),A
            var r = 'OUT  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xD4:
            //  CALL NC,nn
            var r = 'CNC  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xD5:
            //  PUSH DE
            var r = 'PUSH D';
            return [addr + 1, r];
        case 0xD6:
            // SUB  n
            var r = 'SUI  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xD7:
            // RST  10H
            var r = 'RST  2';
            return [addr + 1, r];
        case 0xD8:
            // RET C
            var r = 'RC';
            return [addr + 1, r];
        case 0xD9:
            // RET?
            var r = 'RET?';
            return [addr + 1, r];
        case 0xDA:
            // JP   C,nn
            var r = 'JC   ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xDB:
            // IN   A,(n)
            var r = 'IN   ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xDC:
            //  CALL C,nn
            var r = 'CC   ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xDD:
            // CALL? nn
            var r = 'CALL? ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xDE:
            // SBC  A,n
            var r = 'SBI  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xDF:
            // RST  18H
            var r = 'RST  3';
            return [addr + 1, r];
        case 0xE0:
            // RET PO
            var r = 'RPO';
            return [addr + 1, r];
        case 0xE1:
            // POP HL
            var r = 'POP  H';
            return [addr + 1, r];
        case 0xE2:
            // JP   PO,nn
            var r = 'JPO  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xE3:
            // EX   (SP),HL ;
            var r = 'XTHL';
            return [addr + 1, r];
        case 0xE4:
            //  CALL PO,nn
            var r = 'CPO  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xE5:
            //  PUSH HL
            var r = 'PUSH H';
            return [addr + 1, r];
        case 0xE6:
            // AND  n
            var r = 'ANI  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xE7:
            // RST  20H
            var r = 'RST  4';
            return [addr + 1, r];
        case 0xE8:
            // RET PE
            var r = 'RPE';
            return [addr + 1, r];
        case 0xE9:
            // JP   (HL)
            var r = 'PCHL';
            return [addr + 1, r];
        case 0xEA:
            // JP   PE,nn
            var r = 'JPE  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xEB:
            // EX   DE,HL
            var r = 'XCHG';
            return [addr + 1, r];
        case 0xEC:
            //  CALL PE,nn
            var r = 'CPE  ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xED:
            // CALL? nn
            var r = 'CALL? ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xEE:
            // XOR  n
            var r = 'XRI  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xEF:
            // RST  28H
            var r = 'RST  5';
            return [addr + 1, r];
        case 0xF0:
            // RET P
            var r = 'RP';
            return [addr + 1, r];
        case 0xF1:
            // POP AF
            var r = 'POP  PSW';
            return [addr + 1, r];
        case 0xF2:
            // JP   P,nn
            var r = 'JP   ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xF3:
            // DI
            var r = 'DI';
            return [addr + 1, r];
        case 0xF4:
            //  CALL P,nn
            var r = 'CP   ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xF5:
            //  PUSH AF
            var r = 'PUSH PSW';
            return [addr + 1, r];
        case 0xF6:
            // OR   n
            var r = 'ORI  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        case 0xF7:
            // RST  30H
            var r = 'RST  6';
            return [addr + 1, r];
        case 0xF8:
            // RET M
            var r = 'RM';
            return [addr + 1, r];
        case 0xF9:
            // LD   SP,HL
            var r = 'SPHL';
            return [addr + 1, r];
        case 0xFA:
            // JP   M,nn
            var r = 'JM   ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xFB:
            // EI
            var r = 'EI';
            return [addr + 1, r];
        case 0xFC:
            //  CALL M,nn
            var r = 'CM   ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xFD:
            // CALL? nn
            var r = 'CALL? ' + this.getWord(addr + 1).toString(16).padStart(4, '0');
            return [addr + 3, r];
        case 0xFE:
            // CP   n
            var r = 'CPI  ' + this.memio.rd(addr + 1).toString(16).padStart(2, '0');
            return [addr + 2, r];
        default: // case 0xFF:
            // RST  38H
            var r = 'RST  7';
            return [addr + 1, r];
    }
};

Cpu.prototype.setRegisters = function(r) {
    var s = '';
    for (var i = 1; i < r.length; i += 2) {
        var reg = r[i].toLowerCase();
        var n = parseInt(r[i + 1], 16);
        switch (reg) {
            case 'a':
                this.a = n & 0xFF;
                break;
            case 'b':
                this.b = n & 0xFF;
                break;
            case 'c':
                this.c = n & 0xFF;
                break;
            case 'd':
                this.d = n & 0xFF;
                break;
            case 'e':
                this.e = n & 0xFF;
                break;
            case 'h':
                this.h = n & 0xFF;
                break;
            case 'l':
                this.l = n & 0xFF;
                break;
            case 'f':
                this.f = n & 0xFF;
                break;
            case 'fc':
                if (n & 1) this.f |= CARRY; else this.f &= ~CARRY & 0xFF;
                break;
            case 'fp':
                if (n & 1) this.f |= PARITY; else this.f &= ~PARITY & 0xFF;
                break;
            case 'fh':
                if (n & 1) this.f |= HALFCARRY; else this.f &= ~HALFCARRY & 0xFF;
                break;
            case 'fi':
                if (n & 1) this.ie = 1; else this.ie = 0;
                break;
            case 'fz':
                if (n & 1) this.f |= ZERO; else this.f &= ~ZERO & 0xFF;
                break;
            case 'fs':
                if (n & 1) this.f |= SIGN; else this.f &= ~SIGN & 0xFF;
                break;
            case 'af':
                this.AF(n);
                break;
            case 'bc':
                this.BC(n);
                break;
            case 'de':
                this.DE(n);
                break;
            case 'hl':
                this.HL(n);
                break;
            case 'sp':
                this.sp = n & 0xFFFF;
                break;
            case 'pc':
                this.pc = n & 0xFFFF;
                break;
            default:
                s += ' ' + reg;
                break;
        }
    }
    return (s.length > 0) ? 'unknown register(s): ' + s : s;
};

Cpu.prototype.cpuStatus = function() {
    var s = '';
    s += 'AF:' + this.af().toString(16).padStart(4, '0');
    s += ' ' +
        (this.f & SIGN ? 's' : '.') +
        (this.f & ZERO ? 'z' : '.') +
        (this.f & HALFCARRY ? 'h' : '.') +
        (this.f & PARITY ? 'p' : '.') +
        (this.f & CARRY ? 'c' : '.') +
        (this.ie ? 'I' : '.');
    s += '|';
    s += 'BC:' + this.bc().toString(16).padStart(4, '0');
    s += ' DE:' + this.de().toString(16).padStart(4, '0');
    s += '|';
    s += 'HL:' + this.hl().toString(16).padStart(4, '0');
    s += ' (HL):' + this.memio.rd(this.hl()).toString(16).padStart(2, '0');
    s += ' SP:' + this.sp.toString(16).padStart(4, '0');
    return s;
};

Cpu.prototype.reset = function() {
    this.ie = 0; this.b = 0; this.c = 0; this.d = 0; this.e = 0;
    this.f = UN1; this.h = 0; this.l = 0; this.a = 0;
    this.pc = 0; this.sp = 0x0000;
    this.lastInterrupt = 0; this.cycles = 0;
};

Cpu.prototype.getPC = function() {
    return this.pc;
};

Cpu.prototype.setPC = function(v) {
    this.pc = v & 0xFFFF;
};

Cpu.prototype.getSP = function() {
    return this.sp;
};
