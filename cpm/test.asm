bdos    EQU  0005
print   EQU  09
exit    EQU  00
read    EQU  0a

        LXI  SP, 1000

        LXI  D, hello
        MVI  C, print
        CALL bdos

        LXI  D, buffer
        MVI  C, read
        CALL bdos

        MOV  L, E
        MOV  H, D
        MVI  M, 0d
        INX  H
        MOV  A, M
        MVI  M, 0a
        INX  H
        ADD  L
        MOV  L, A
        JNC  cont
        INR  H
cont:   MVI  M, "$"

        MVI  C, print
        CALL bdos

        MVI  C, exit
        CALL bdos

hello:  DB   "Enter name: $"

buffer: DB   20
        DS   21
