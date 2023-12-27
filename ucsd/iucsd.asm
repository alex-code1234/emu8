       ORG  0FF00H

CRT    EQU  0FFF0H     ; CRT IO base  (2 ports)
DSK    EQU  0FFF4H     ; disk IO base (6 ports)

       JMP  SYSINI     ; initialize machine
       JMP  SYSHLT     ; exit UCSD pascal
       JMP  CONINI     ; console initialize
       JMP  CONSTA     ; console status
       JMP  CONRD      ; console input
       JMP  CONWR      ; console output
       JMP  SETDSK     ; set disk number
       JMP  SETTRK     ; set track number
       JMP  SETSEC     ; set sector number
       JMP  SETDMA     ; set buffer address
       JMP  DSKRD      ; read sector from disk
       JMP  DSKWR      ; write sector to disk
       JMP  DSKINI     ; reset disk
       JMP  DSKSTR     ; activate disk
       JMP  DSKSTP     ; de-activate disk

SYSINI RET
SYSHLT HLT
CONINI MVI  A,00H
       RET
CONSTA LXI  H, CRT+1
       MOV  C, M
       JMP  CONINI
CONRD  LXI  H, CRT+1
       MOV  A, M
       CPI  0FFH
       JNZ  CONRD
       DCX  H
       MOV  C, M
       JMP  CONINI
CONWR  LXI  H, CRT
       MOV  M, C
       JMP  CONINI
SETDSK LXI  H, DSK+1
       MOV  M, C
       RET
SETTRK LXI  H, DSK+2
       MOV  M, C
       RET
SETSEC LXI  H, DSK+3
       MOV  M, C
       RET
SETDMA LXI  H, DSK+4
       MOV  M, B
       INX  H
       MOV  M, C
       RET
DSKRD  MVI  A, 00H
       JMP  AADSK
DSKWR  MVI  A, 01H
AADSK  LXI  H, DSK
       MOV  M, A
       MOV  A, M
       RET

DSKINI EQU  CONINI
DSKSTR EQU  SYSINI
DSKSTP EQU  SYSINI

