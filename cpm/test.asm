; Threaded Code Interpreter for 8080
;         Richard Fritzson
; 29 January 1980        Version 1.0
;
; HL - free
; DE - free, only preserve between next and FNC words
; BC - top of data stack

bdos    EQU  0005
printc  EQU  02         ; BDOS print char
readst  EQU  0A         ; BDOS read line
exit    EQU  00         ; BDOS exit

        LXI  SP, stack  ; initialize parameter stack

        LXI  H, main - 1
        SHLD pc         ; set pc
        JMP  next       ; start interpreter

main:   DW   interp, os           ; exit to OS

_empy:  DB   00                   ; empty string
_prmt:  DB   03, 0D, 0A, "-"
_errm:  DB   0F, 0D, 0A, "not defined: "
_quit:  DB   4, "quit"
_crlf:  DB   02, 0D, 0A

interp: DW   tcall      ; none
        DW   tpush, _empy         ; empty string
        DW   _sbuff, pokew        ; initialize input buffer
_intp0: DW   tpush, _prmt, prints ; print prompt
_intp1: DW   getwrd               ; get next token
        DW   lookup               ; find in dictionary
        DW   ifz, _intp2 - 1      ; not found, try number
        DW   ifnz, _intp5 - 1     ; immediate word
        DW   cflag, peekw         ; check compile flag
        DW   ifz, _intp5 - 1      ; not compiling, execute
        DW   cmplw                ; compile word
        DW   jump, _intp1 - 1     ; and continue
_intp5: DW   exec                 ; execute word
        DW   dup, conbxa          ; copy and convert top of stack
        DW   tpush, _crlf
        DW   prints, prints       ; print it
        DW   jump, _intp0 - 1     ; and start from beginning
_intp2: DW   tpush, _quit, seq    ; quit?
        DW   ifnz, _intp4 - 1     ; yes, exit
        DW   tpop                 ; no, drop string
        DW   conaxb               ; convert to number
        DW   ifnz, _intp3 - 1     ; success, handle number
        DW   tpush, _errm         ; print
        DW   prints, prints       ; error message
        DW   jump, _intp0 - 1     ; and start from beginning
_intp3: DW   cflag, peekw         ; check compile flag
        DW   ifz, _intp1 - 1      ; interpreting, leave number on stack and continue
        DW   tpush, tpush, cmplw  ; compile lit
        DW   cmplw                ; compile number
        DW   jump, _intp1 - 1     ; and continue
_intp4: DW   tpop, tpop           ; drop number and string
        DW   tret       ; none

        DS   80         ; parameter stack data
stack   EQU  $          ; top of parameter stack
        DW   0000       ; buffer against one POP without PUSH

pc:     DW   0000       ; program counter, -> current word + 1
rstack: DW   $+2        ; return stack pointer -> next available position
        DS   80         ; return stack data

next:   LHLD pc         ; inner interpreter, pc -> word+1
        INX  H
        MOV  E, M
        INX  H
        MOV  D, M
        SHLD pc
        XCHG
        MOV  E, M
        INX  H
        MOV  D, M
        XCHG
        PCHL            ; jump to word, DE -> (word)+1

names:  DW   _d1        ; dictionary start, reference to next entry
        DB   8, "constant", 00
const:  PUSH B          ; CONSTANT word, DE -> (word)+1
        XCHG
        INX  H          ; HL -> constant
        MOV  C, M
        INX  H
        MOV  B, M
        JMP  next       ; back to inner interpreter

_d1:    DW   _d2
        DB   8, "variable", 00
var:    PUSH B          ; VARIABLE word, DE -> (word)+1
        XCHG
        INX  H          ; HL -> variable
        MOV  C, L
        MOV  B, H
        JMP  next       ; back to inner interpreter

_d2:    DW   _d3
        DB   5, "docol", 00
tcall:  LHLD pc         ; DOCOL word, DE -> (word)+1
        XCHG
        SHLD pc
        LHLD rstack
        MOV  M, E
        INX  H
        MOV  M, D
        INX  H
        SHLD rstack
        JMP  next       ; back to inner interpreter

_d3:    DW   _d4
        DB   3, "ret", 00
tret:   DW   $+2        ; CODE word, DE -> (word)+1
        LHLD rstack
        DCX  H
        MOV  D, M
        DCX  H
        MOV  E, M
        SHLD rstack
        XCHG
        SHLD pc
        JMP  next       ; back to inner interpreter

_d4:    DW   _d5
        DB   2, "+1", 00
inc:    DW   $+2
        INX  B
        JMP  next

_d5:    DW   _d6
        DB   2, "-1", 00
tdec:   DW   $+2
        DCX  B
        JMP  next

_d6:    DW   _d7
        DB   1, "+", 00
tadd:   DW   $+2
        POP  H
        DAD  B
        MOV  C, L
        MOV  B, H
        JMP  next

_neg:   DCX  B
        MOV  A, B
        CMA
        MOV  B, A
        MOV  A, C
        CMA
        MOV  C, A
        RET

_d7:    DW   _d8
        DB   3, "neg", 00
neg:    DW   $+2
        CALL _neg
        JMP  next

_d8:    DW   _d9
        DB   5, "peekb", 00
peekb:  DW   $+2
        LDAX B
        MOV  C, A
        MVI  B, 00
        JMP  next

_d9:    DW   _d10
        DB   5, "peekw", 00
peekw:  DW   $+2
        LDAX B
        MOV  L, A
        INX  B
        LDAX B
        MOV  B, A
        MOV  C, L
        JMP  next

_d10:   DW   _d11
        DB   5, "pokeb", 00
pokeb:  DW   $+2
        POP  H
        MOV  A, L
        STAX B
        POP  B
        JMP  next

_d11:   DW   _d12
        DB   5, "pokew", 00
pokew:  DW   $+2
        POP  H
        MOV  A, L
        STAX B
        INX  B
        MOV  A, H
        STAX B
        POP  B
        JMP  next

_d12:   DW   _d13
        DB   3, "lit", 00
tpush:  DW   $+2
        PUSH B
        LHLD pc
        INX  H
        MOV  C, M
        INX  H
        MOV  B, M
        SHLD pc
        JMP  next

_d13:   DW   _d14
        DB   4, "drop", 00
tpop:   DW   $+2
        POP  B
        JMP  next

_d14:   DW   _d15
        DB   4, "swap", 00
swap:   DW   $+2
        POP  H
        PUSH B
        MOV  C, L
        MOV  B, H
        JMP  next

_d15:   DW   _d16
        DB   3, "dup", 00
dup:    DW   $+2
        PUSH B
        JMP  next

_d16:   DW   _d17
        DB   5, "clear", 00
clear:  DW   $+2
        LXI  SP, stack
        JMP  next

_d17:   DW   _d18
        DB   4, "jump", 00
jump:   DW   $+2
_jump:  LHLD pc
        INX  H
        MOV  E, M
        INX  H
        MOV  D, M
        XCHG
        SHLD pc
        JMP  next

_d18:   DW   _d19
        DB   3, "ifz", 00
ifz:    DW   $+2
        MOV  A, B
        ORA  C
        POP  B
        JZ   _jump
_skip:  LHLD pc
        INX  H
        INX  H
        SHLD pc
        JMP  next

_d19:   DW   _d20
        DB   4, "ifnz", 00
ifnz:   DW   $+2
        MOV  A, B
        ORA  C
        POP  B
        JNZ  _jump
        JMP  _skip

_d20:   DW   _d21
        DB   4, "ifeq", 00
ifeq:   DW   $+2
        CALL _neg
        POP  H
        DAD  B
        MOV  A, H
        ORA  L
        POP  B
        JZ   _jump
        JMP  _skip

_d21:   DW   _d22
        DB   3, "eq$", 00
seq:    DW   $+2        ; strings equ
        POP  H          ; second string
        PUSH H          ; leave second
        PUSH B          ; and first strings on stack
        LDAX B          ; get first count
        CMP  M          ; compare with second
        JNZ  _seqf
        MOV  E, A       ; byte count
_seqlp: INX  B          ; next char
        INX  H
        LDAX B          ; compare
        CMP  M
        JNZ  _seqf      ; no match
        DCR  E          ; count--
        JNZ  _seqlp     ; continue
_seqt:  LXI  B, 0001    ; success
        JMP  next
_seqf:  LXI  B, 0000    ; failure
        JMP  next

_d22:   DW   _d23
        DB   7, "execute", 00
exec:   DW   $+2        ; execute word
        LDAX B          ; get address
        MOV  L, A
        INX  B
        LDAX B
        MOV  H, A
        MOV  E, C       ; copy to DE
        MOV  D, B       ; as needed for FNC words (emulate NEXT)
        POP  B          ; remove from stack
        PCHL            ; jump to address, DE as in next

_d23:   DW   _d24
        DB   4, "chr$", 00
first:  DW   $+2        ; load first byte of string to stack
        LDAX B          ; get first byte
        INX  B          ; increment string pointer
        PUSH B          ; update string
        MOV  C, A       ; first byte on top of stack
        MVI  B, 00
        JMP  next

_d24:   DW   _d25
        DB   4, "out$", 00
cout:   DW   $+2
        MOV  E, C
        MVI  C, printc
        CALL bdos
        POP  B
        JMP  next

sub16:  MOV  A, L       ; HL = HL - BC
        SUB  C
        MOV  L, A
        MOV  A, H
        SBB  B
        MOV  H, A
        RET

_d25:   DW   _d26
        DB   4, "ifge", 00
ifge:   DW   $+2
        POP  H
        CALL sub16
        POP  B
        JNC  _jump
        JMP  _skip

_d26:   DW   _d27
        DB   2, "eq", 00
eq:     DW   $+2
        POP  H
        CALL sub16
        JNZ  _seqf
        JMP  _seqt

_d27:   DW   _d28
        DB   3, "eqz", 00
eqz:    DW   $+2
        MOV  A, B
        ORA  C
        JNZ  _seqf
        JMP  _seqt

_d28:   DW   _d38
        DB   4, "over", 00
over:   DW   $+2        ; n1 BC --- n1 (n2 = BC) (BC = n1)
        POP  H          ; HL = n1
        PUSH H
        PUSH B          ; n2 = BC
        MOV  C, L       ; BC = n1
        MOV  B, H
        JMP  next

_d38:   DW   _d29
        DB   3, "rot", 00
rot:    DW   $+2        ; n1 n2 BC --- n2 (n3 = BC) (BC = n1)
        POP  D          ; DE = n2
        POP  H          ; HL = n1
        PUSH D          ; n2
        PUSH B          ; n2 (n3 = BC)
        MOV  C, L       ; BC = n1
        MOV  B, H
        JMP  next

_d29:   DW   _d39
        DB   4, "stop", 00
stop:   DW   $+2
        HLT
        JMP  next

_d39:   DW   _d46
        DB   4, "/mod", 00
div16:  DW   $+2
        POP  D          ; BC - divisor, HLDE - dividend
        LXI  H, 0000
        CALL _div1
        PUSH D          ; top-1 - quotient
        MOV  C, L       ; BC - remainder
        MOV  B, H
        JMP  next

_div1:  CALL _neg       ; negate BC
        MVI  A, 10      ; count 16 iterations
_div2:  DAD  H          ; shift HLDE
        PUSH PSW        ; save overflow
        XCHG
        DAD  H
        XCHG
        JNC  _div3
        INR  L
_div3:  POP  PSW        ; get overflow
        JC   _div5      ; if overflow, force subtraction
        PUSH H          ; else save dividend
        DAD  B          ; attempt subtraction
        JC   _div4      ; if it goes
        POP  H          ; else restore dividend
        JMP  _div6
_div4:  INR  E          ; increment quotient
        INX  SP         ; drop old dividend
        INX  SP
        JMP  _div6
_div5:  DAD  B          ; force subtraction
        INR  E          ; increment quotient
_div6:  DCR  A          ; decrement count
        JNZ  _div2      ; repeat
        RET

_d46:   DW   _d49
        DB   4, "move", 00
move:   DW   $+2
        POP  H          ; top-1 source
        POP  D          ; top-2 destination
_move:  MOV  A, M
        STAX D
        INX  H          ; next byte
        INX  D
        DCX  B          ; counter--
        MOV  A, C       ; check
        ORA  B          ; for 0
        JNZ  _move      ; repeat if not 0
        POP  B          ; drop counter
        JMP  next

_d49:   DW   _d30
        DB   2, "os", 00
os:     DW   $+2
        MVI  C, exit
        CALL bdos

_d30:   DW   _d31
        DB   5, "read$", 00
readln: DW   $+2
        PUSH B
        LXI  D, _lbuff - 1
        MVI  C, readst
        CALL bdos
        LXI  B, _lbuff
        JMP  next

        DB   80         ; line buffer max length
_lbuff: DB   00         ; line buffer length
        DS   80         ; line buffer data

_d31:   DW   _d32
        DB   4, "zero", 00
zero:   DW   const
        DW   0000

_d32:   DW   _d33
        DB   3, "one", 00
one:    DW   const
        DW   0001

_d33:   DW   _d34
        DB   3, "two", 00
two:    DW   const
        DW   0002

_d34:   DW   _d35
        DB   1, "-", 00
tsub:   DW   tcall      ; top = top-1 - top
        DW   neg, tadd
        DW   tret       ; return

_d35:   DW   _d36
        DB   6, "print$", 00
prints: DW   tcall      ; print string (first byte - length)
        DW   first                ; get count3
print1: DW   dup, ifz, printx - 1 ; if done return
        DW   swap, first          ; else get next char
        DW   cout                 ; print
        DW   swap, tdec           ; decrement count
        DW   jump, print1 - 1     ; and keep looping
printx: DW   tpop, tpop           ; drop count and pointer
        DW   tret       ; return

_d36:   DW   _d37
        DB   6, "lookup", 00
lookup: DW   tcall      ; top = name to find
        DW   tpush, names         ; name, d_ref
_look:  DW   swap, over           ; d_ref, name, d_ref
        DW   two, tadd            ; d_ref, name, str = d_ref + 2
        DW   seq                  ; compare
        DW   ifnz, _loot - 1      ; found, exit
        DW   tpop, swap, peekw    ; name, d_ref_next
        DW   dup, ifnz, _look - 1 ; try next d_ref
        DW   tpop                 ; name
        DW   zero
        DW   tret       ; top = 0, top-1 = name
_loot:  DW   swap, tpop           ; d_ref, str
        DW   first                ; d_ref, str+1, length
        DW   tadd, swap, tpop     ; word = str+1 + length
        DW   dup, peekb, swap     ; peek immediate flag
        DW   inc, swap            ; adjust word
        DW   one
        DW   tret       ; top = 1, top-1 = immediate flag, top-2 = word

_d37:   DW   _d40
        DB   7, "getword", 00
getwrd: DW   tcall      ; none
_getw1: DW   scan
        DW   ifnz, _getw2 - 1
        DW   readln               ; str
        DW   dup, dup, peekb      ; str, str, chr
        DW   tadd, inc            ; str, last_pos
        DW   zero, swap, pokeb    ; str with ending 0
        DW   _sbuff, pokew        ; save to buffer variable
        DW   jump, _getw1 - 1     ; and try again
_getw2: DW   tret       ; str

_sbuff: DW   var, 0000  ; scan buffer, str ending with 0

_d40:   DW   _d41
        DB   4, "scan", 00
scan:   DW   tcall      ; none
        DW   _sbuff, peekw, dup   ; str, str
        DW   first                ; str, str+1, length
        DW   ifz, _scanf - 1      ; empty string, exit
_scanc: DW   first, dup           ; str, str++, chr, chr
        DW   ifz, _scant - 1      ; end of string, finish processing
        DW   tpush, 0020, tsub    ; compare with ' '
        DW   ifnz, _scanc - 1     ; continue
        DW   jump, _scan2 - 1     ; skip tpop
_scant: DW   tpop                 ; str, str++
_scan2: DW   tdec                 ; adjust for length byte
        DW   dup, _sbuff, pokew   ; str, str++
        DW   over, tsub, tdec     ; str, length
        DW   dup, ifz, _scanf - 1 ; zero length, exit
        DW   over, pokeb, one     ; set string length and push 1
        DW   tret       ; str, 1
_scanf: DW   tpop, tpop, zero
        DW   tret       ; 0

_nbufr: DW   var        ; string of 10 chars for num -> str conversion
        DS   10
_temp:  DW   var, 0000  ; temporary word variable, used by str -> num conversion

_d41:   DW   _d42
        DB   3, "bxa", 00
conbxa: DW   tcall      ; word
        DW   tpush, ffff, swap
_conb1: DW   tpush, 0a, div16
        DW   swap, dup
        DW   ifnz, _conb1 - 1
        DW   tpop, zero, _nbufr, pokeb
_conb2: DW   dup, tpush, ffff
        DW   ifeq, _conb3 - 1
        DW   _nbufr, peekb
        DW   inc
        DW   _nbufr, pokeb
        DW   tpush, "0", tadd
        DW   _nbufr
        DW   _nbufr, peekb, tadd
        DW   pokeb
        DW   jump, _conb2 - 1
_conb3: DW   tpop
        DW   _nbufr
        DW   tret       ; str

_d42:   DW   _d43
        DB   3, "axb", 00
conaxb: DW   tcall      ; str
        DW   dup, first           ; get str length
        DW   zero, _temp, pokew   ; value = 0
_caxb1: DW   dup, ifz, _caxb2 - 1 ; exit if length 0
        DW   swap, first          ; convers chr to 0..9
        DW   tpush, "0", tsub
        DW   dup, tpush, 000A
        DW   ifge, _caxb3 - 1     ; < 0 or > 9, exit
        DW   _temp, peekw, dup    ; get value
        DW   dup, tadd            ; value = value * 10
        DW   dup, tadd
        DW   dup, tadd
        DW   over, tadd
        DW   over, tadd
        DW   swap, tpop, tadd     ; value += digit
        DW   _temp, pokew
        DW   swap, tdec           ; length--
        DW   jump, _caxb1 - 1     ; repeat
_caxb2: DW   tpop, tpop, tpop     ; drop length, str pointer and str
        DW   _temp, peekw, one
        DW   tret       ; word, 1
_caxb3: DW   tpop, tpop, tpop     ; drop length, str pointer and digit
        DW   zero
        DW   tret       ; str, 0

cflag:  DW   var, 0000            ; compile flag
phere:  DW   var, 0000            ; saved here pointer
conadd: DW   const, const         ; constant reference
varadd: DW   const, var           ; variable reference

_d43:   DW   _d44
        DB   1, ",", 00
cmplw:  DW   tcall      ; word
        DW   here, peekw          ; get top address
        DW   dup, inc, inc        ; add two to here
        DW   here, pokew          ; store new here pointer
        DW   pokew                ; and compile word
        DW   tret       ; none

_d44:   DW   _d45
        DB   5, "enter", 00
enter:  DW   tcall      ; str
        DW   here, peekw, dup     ; get current here pointer
        DW   phere, pokew         ; save it in phere
        DW   inc, inc             ; skip 0000 word
        DW   swap, over, over     ; preserve new address and parameter
        DW   dup, peekb, inc      ; length + 1 to include length byte
        DW   move                 ; copy str to new code area
        DW   peekb, inc, tadd     ; add string length + 1
        DW   dup, zero, swap      ; store 00
        DW   pokeb                ; to immediate flag
        DW   inc, here, pokew     ; and save new pointer to here
        DW   tret       ; none

_d45:   DW   _d47
        DB   1, ";", 01           ; immediate
semi:   DW   tcall      ; none
        DW   tpush, tret, cmplw   ; compile ret
        DW   here, peekw, dup     ; load here location
        DW   zero, cflag, pokew   ; store 0000 to compile flag
        DW   zero, swap, pokew    ; and to location of here
        DW   phere, peekw, pokew  ; store location of here to previous link in dictionary
        DW   tret       ; none

_d47:   DW   _d48
        DB   1, ":", 00
colon:  DW   tcall      ; none
        DW   one, cflag, pokew    ; store 0001 to compile flag
        DW   getwrd, enter        ; get and store name
        DW   tpush, tcall, cmplw  ; compile docol
        DW   tret       ; none

_d48:   DW   _d50
        DB   4, "here", 00
here:   DW   var, _d50  ; top of memory variable
_d50:   DW   0000       ; _d51 next
