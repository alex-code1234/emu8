

             / SNOWFLAKE FOR PDP-8 / VC8E
             / ADAPTED FROM PDP-1 CLASSIC

       0020  *20                     / SHARED VARIABLES

00020  0000  IO,      0              / PDP-1 IO REGISTER
00021  0400  CXY,     CXYL           / CXY SUB REF
00022  0000  T1,      0
00023  0000  T2,      0
00024  5432  X,       5432           / X0
00025  3567  Y,       3567           / Y0
00026  0600  P1,      T1A
00027  0670  P2,      T1E
00030  0000  T3,      0
00031  0000  T4,      0
00032  0000  Q1,      0
00033  0000  Q2,      0
00034  0534  DXY2,    DXYL           / DXY CONT. REF

00035  0000  DXY,     0              / REFLECTION
00036  7300           CLA CLL
00037  1023           TAD   T2
00040  3172           DCA   OPB
00041  1427           TAD I P2
00042  4104           JMS   ADSHOVF  / AC = (*P2 + T2) >> 1
00043  3023           DCA   T2
00044  1022           TAD   T1
00045  3172           DCA   OPB
00046  1426           TAD I P1
00047  4104           JMS   ADSHOVF  / AC = (*P1 + T1) >> 1
00050  3022           DCA   T1
00051  1022           TAD   T1
00052  7110           CLL RAR
00053  3030           DCA   T3       / T3 = T1 >> 1
00054  1023           TAD   T2
00055  7110           CLL RAR
00056  3031           DCA   T4       / T4 = T2 >> 1
00057  1030           TAD   T3       / T1 >> 1
00060  7110           CLL RAR        / T1 >> 2
00061  1030           TAD   T3       / T1 >> 1 + T1 >> 2
00062  1022           TAD   T1       / T1 + T1 >> 1 + T1 >> 2
00063  7110           CLL RAR        / (T1 + T1 >> 1 + T1 >> 2) >> 1
00064  3032           DCA   Q1
00065  1031           TAD   T4       / T2 >> 1
00066  7110           CLL RAR        / T2 >> 2
00067  1031           TAD   T4       / T2 >> 1 + T2 >> 2
00070  1023           TAD   T2       / T2 + T2 >> 1 + T2 >> 2
00071  7110           CLL RAR        / (T2 + T2 >> 1 + T2 >> 2) >> 1
00072  3033           DCA   Q2
00073  1032           TAD   Q1
00074  1031           TAD   T4
00075  3020           DCA   IO       / IO = Q1 + T4
00076  1030           TAD   T3
00077  7041           CIA            / -T3
00100  1033           TAD   Q2       / AC = Q2 - T3
00101  4151           JMS   DRAW     / DRAW INITIAL DOT
00102  4434           JMS I DXY2     / DRAW REFLECTED DOTS
00103  5435           JMP I DXY

00104  0000  ADSHOVF, 0              / AC = (AC + OPB) >> 1 OVF
00105  1172           TAD   OPB      / AC = AC + OPB
00106  3174           DCA   TMP      / SAVE SUM RESULT
00107  1174           TAD   TMP
00110  0173           AND   SGNM     / EXTRACT SIGN
00111  7440           SZA            / POSITIVE?
00112  5116           JMP   OVF      / NO, OVERFLOW
00113  1174           TAD   TMP      / YES, AC = SUM >> 1
00114  7110           CLL RAR
00115  5127           JMP   DONE
00116  7200  OVF,     CLA            / OVERFLOW, CLEAR AC
00117  1173           TAD   SGNM
00120  3172           DCA   OPB      / OPB = 4000
00121  1174           TAD   TMP      / SUM
00122  4130           JMS   XOROP    / AC = SUM XOR 4000
00123  3172           DCA   OPB      / OPB = SUM XOR 4000
00124  1174           TAD   TMP      / SUM
00125  7130           CLL CML RAR    / AC = SUM >> 1 WITH HIGH BIT
00126  4141           JMS   OROP     / AC = (SUM >> 1) OR OPB
00127  5504  DONE,    JMP I ADSHOVF

00130  0000  XOROP,   0              / AC = AC XOR OPB
00131  3174           DCA   TMP
00132  1174           TAD   TMP
00133  0172           AND   OPB
00134  7041           CIA
00135  7104           CLL RAL
00136  1174           TAD   TMP
00137  1172           TAD   OPB
00140  5530           JMP I XOROP

00141  0000  OROP,    0              / AC = AC OR OPB
00142  7040           CMA
00143  3174           DCA   TMP
00144  1172           TAD   OPB
00145  7040           CMA
00146  0174           AND   TMP
00147  7040           CMA
00150  5541           JMP I OROP

       6052  DISD=    6052
       6053  DILX=    6053
       6054  DILY=    6054
       6055  DIXY=    6055

00151  0000  DRAW,    0              / DISPLAY DOT
00152  3174           DCA   TMP      / SAVE AC
00153  1174           TAD   TMP
00154  7110           CLL RAR
00155  7110           CLL RAR
00156  6053           DILX           / X = AC >> 2
00157  7200           CLA
00160  1020           TAD   IO
00161  7110           CLL RAR
00162  7110           CLL RAR
00163  6054           DILY           / Y = IO >> 2
00164  7300           CLA CLL
00165  1174           TAD   TMP      / RESTORE AC
00166  6052           DISD           / READY?
00167  5166           JMP   .-1      / NO, WAIT
00170  6055           DIXY           / DISPLAY
00171  5551           JMP I DRAW

00172  0000  OPB,     0
00173  4000  SGNM,    4000
00174  0000  TMP,     0

       0200  *200                    / START AT OCTAL 200

00200  4421  START,   JMS I CXY      / INIT DATA
00201  3426           DCA I P1       / *P1 = AC
00202  1020           TAD   IO
00203  3427           DCA I P2       / *P2 = IO
00204  2026           ISZ   P1       / P1++
00205  2027           ISZ   P2       / P2++
00206  1027           TAD   P2
00207  7041           CIA            / -P2
00210  1314           TAD   T2EADR   / P2 == &T2E?
00211  7440           SZA            / YES, CLEAR LINK AND EXIT LOOP
00212  5200           JMP   START    / NO, CONTINUE
00213  1426  WORK,    TAD I P1       / MAIN LOOP
00214  3022           DCA   T1       / T1 = *P1
00215  1427           TAD I P2
00216  3023           DCA   T2       / T2 = *P2
00217  1026  PASS1,   TAD   P1       / P1--
00220  1316           TAD   M1
00221  3026           DCA   P1
00222  1027           TAD   P2       / P2--
00223  1316           TAD   M1
00224  3027           DCA   P2
00225  1027           TAD   P2
00226  7041           CIA            / -P2
00227  1317           TAD   T2AADR   / P2 == &T2A?
00230  7450           SNA            / NO, CONTINUE PASS1
00231  5237           JMP   CONT1    / YES, EXIT
00232  4035           JMS   DXY      / DRAW
00233  3426           DCA I P1       / *P1 = AC
00234  1020           TAD   IO
00235  3427           DCA I P2       / *P2 = IO
00236  5217           JMP   PASS1
00237  4327  CONT1,   JMS   DELAY    / PAUSE DRAWING
00240  1426           TAD I P1
00241  3022           DCA   T1       / T1 = *P1
00242  1427           TAD I P2
00243  3023           DCA   T2       / T2 = *P2
00244  2026  PASS2,   ISZ   P1       / P1++
00245  2027           ISZ   P2       / P2++
00246  1027           TAD   P2
00247  7041           CIA            / -P2
00250  1320           TAD   T2E1ADR  / P2 == &T2E - 1?
00251  7450           SNA            / NO, CONTINUE PASS2
00252  5260           JMP   CONT2    / YES, EXIT
00253  4035           JMS   DXY      / DRAW
00254  3426           DCA I P1       / *P1 = AC
00255  1020           TAD   IO
00256  3427           DCA I P2       / *P2 = IO
00257  5244           JMP   PASS2
00260  4327  CONT2,   JMS   DELAY    / PAUSE DRAWING
00261  2315           ISZ   C1       / ++C1 == 0?
00262  5307           JMP   CONT3    / NO, JUMP TO CONT3
00263  4421           JMS I CXY      / YES, INIT NEW LOOP
00264  3723           DCA I T1AADR   / *T1A = AC
00265  1020           TAD   IO
00266  3717           DCA I T2AADR   / *T2A = IO
00267  4421           JMS I CXY
00270  3724           DCA I T1E1ADR  / *(T1E - 1) = AC
00271  1020           TAD   IO
00272  3720           DCA I T2E1ADR  / *(T2E - 1) = IO
00273  4421           JMS I CXY
00274  3721           DCA I T1MADR   / *T1M = AC
00275  1020           TAD   IO
00276  3722           DCA I T2MADR   / *T2M = IO
00277  1721           TAD I T1MADR   / C1 = -(AC & 074)
00300  0325           AND   C1MASK
00301  7041           CIA            / -AC
00302  7440           SZA            / C1 == 0?
00303  5305           JMP   CONTFX   / NO, CONTINUE
00304  1326           TAD   C10      / YES, LOAD INITIAL C1
00305  3315  CONTFX,  DCA   C1
00306  5213           JMP   WORK
00307  1024  CONT3,   TAD   X
00310  3721           DCA I T1MADR   / *T1M = X
00311  1025           TAD   Y
00312  3722           DCA I T2MADR   / *T2M = Y
00313  5213           JMP   WORK

00314  0760  T2EADR,  T2E            / &T2E
00315  7740  C1,      7740           / -040
00316  7777  M1,      7777           / -1
00317  0670  T2AADR,  T1E            / &T2A, SAME AS &T1E
00320  0757  T2E1ADR, T2E-1          / &T2E - 1
00321  0623  T1MADR,  T1M            / &T1M
00322  0723  T2MADR,  T2M            / &T2M
00323  0600  T1AADR,  T1A            / &T1A
00324  0667  T1E1ADR, T1E-1          / &T1E - 1
00325  0074  C1MASK,  0074
00326  7740  C10,     7740           / INITIAL C1 VALUE

00327  0000  DELAY,   0              / DELAY PROCESSING
00330  7200           CLA
00331  1343           TAD   DOUTV
00332  3345           DCA   DOUT
00333  1342  DL1,     TAD   DINNV
00334  3344           DCA   DINN
00335  2344  DL2,     ISZ   DINN
00336  5335           JMP   DL2
00337  2345           ISZ   DOUT
00340  5333           JMP   DL1
00341  5727           JMP I DELAY

00342  7000  DINNV,   7000
00343  7766  DOUTV,   7766
00344  0000  DINN,    0
00345  0000  DOUT,    0

00346  0000  DXYL2,   0              / DXY PART 3
00347  7200           CLA
00350  1023           TAD   T2
00351  7041           CIA
00352  3020           DCA   IO       / IO = -T2
00353  1022           TAD   T1       / AC = T1
00354  4151           JMS   DRAW
00355  7041           CIA            / AC = -AC
00356  4151           JMS   DRAW
00357  3174           DCA   TMP
00360  1023           TAD   T2
00361  3020           DCA   IO       / IO = T2
00362  1174           TAD   TMP
00363  4151           JMS   DRAW
00364  7041           CIA            / AC = -AC
00365  4151           JMS   DRAW
00366  5746           JMP I DXYL2

       0400  *400                    / MATH SUBS

00400  0000  CXYL,    0              / CONVOLUTION
00401  7300           CLA CLL
00402  1024           TAD   X
00403  4255           JMS   MULTL
00404  3643           3643
00405  7300           CLA CLL
00406  1020           TAD   IO
00407  3024           DCA   X        / X = IO
00410  1025           TAD   Y
00411  4255           JMS   MULTL
00412  3643           3643
00413  3327           DCA   TEMP1    / SAVE AC
00414  1327           TAD   TEMP1
00415  1024           TAD   X
00416  3024           DCA   X        / X = X + AC
00417  1020           TAD   IO
00420  3025           DCA   Y        / Y = IO
00421  1327           TAD   TEMP1    / RESTORE AC
00422  4224           JMS   RCL4SL
00423  5600           JMP I CXYL

00424  0000  RCL4SL,  0              / PDP-1 RCL 4S; IN: AC+IO, OUT: AC+IO
00425  7100           CLL
00426  3327           DCA   TEMP1    / SAVE HIGH
00427  1327           TAD   TEMP1
00430  0325           AND   RCLMSK   / KEEP TOP 4 BITS
00431  7002           BSW            / SWAP 6 BITS
00432  7012           RTR            / MOVE TO BOTTOM
00433  3330           DCA   TEMP2    / HIGH BITS TO WRAP TO LOW
00434  1020           TAD   IO
00435  0325           AND   RCLMSK   / KEEP TOP 4 BITS
00436  7002           BSW
00437  7012           RTR
00440  3331           DCA   TEMP3    / WRAP AROUND BITS FOR HIGH
00441  1020           TAD   IO       / 4 BIT LEFT SHIFT ON LOW
00442  0326           AND   RCLLSK   / CLEAR TOP 4 BITS
00443  7006           RTL
00444  7006           RTL
00445  1330           TAD   TEMP2
00446  3020           DCA   IO
00447  1327           TAD   TEMP1    / 4 BIT LEFT SHIFT ON HIGH
00450  0326           AND   RCLLSK
00451  7006           RTL
00452  7006           RTL
00453  1331           TAD   TEMP3
00454  5624           JMP I RCL4SL

00455  0000  MULTL,   0              / MULTIPLY; IN: AC+INLINE, OUT: AC+IO
00456  7100           CLL
00457  7510           SPA            / TEST FOR NEGATIVE MULTIPLIER
00460  7061           CMA CML IAC
00461  3020           DCA   IO       / STORE MULTIPLIER
00462  3327           DCA   TEMP1
00463  1655           TAD I MULTL
00464  7450           SNA            / TEST FOR ZERO MULTIPLICAND
00465  5312           JMP   MPSN+2
00466  7510           SPA            / TEST FOR NEGATIVE MULTIPLICAND
00467  7061           CMA CML IAC
00470  3330           DCA   TEMP2    / STORE MULTIPLICAND
00471  1332           TAD   THIR
00472  3331           DCA   TEMP3
00473  1020  MP4,     TAD   IO       / MULTIPLY LOOP PROPER
00474  7010           RAR
00475  3020           DCA   IO
00476  1327           TAD   TEMP1
00477  7430           SZL            / TEST IF MULTIPLICAND SHOULD BE ADDED
00500  1330           TAD   TEMP2
00501  7110           CLL RAR
00502  3327           DCA   TEMP1
00503  2331           ISZ   TEMP3    / TEST FOR END OF LOOP
00504  5273           JMP   MP4
00505  1020           TAD   IO
00506  7100      CLL / TO MAKE EXACT COPY OF JS CODE (WRONG)
00507  7010           RAR
00510  7430  MPSN,    SZL
00511  5316           JMP   COMP
00512  3020           DCA   IO
00513  1327           TAD   TEMP1
00514  2255  MPZ,     ISZ   MULTL    / EXIT
00515  5655           JMP I MULTL
00516  7141  COMP,    CMA CLL IAC    / COMPLEMENT PRODUCT
00517  3020           DCA   IO
00520  1327           TAD   TEMP1
00521  7040           CMA
00522  7430           SZL
00523  7001           IAC
00524  5314           JMP   MPZ

00525  7400  RCLMSK,  7400           / HIGH 4 BITS MASK
00526  0377  RCLLSK,  0377           / LOW 8 BITS MASK
00527  0000  TEMP1,   0
00530  0000  TEMP2,   0
00531  0000  TEMP3,   0
00532  7764  THIR,    7764           / ELEVEN IN DECIMAL
00533  0346  DXY3,    DXYL2          / DXY CONT. 2 REF

00534  0000  DXYL,    0              / DXY PART 2
00535  7041           CIA            / AC = -AC
00536  4151           JMS   DRAW
00537  7041           CIA            / AC = -AC
00540  3327           DCA   TEMP1
00541  1020           TAD   IO
00542  7041           CIA
00543  3020           DCA   IO       / IO = -IO
00544  1327           TAD   TEMP1
00545  4151           JMS   DRAW
00546  7041           CIA            / AC = -AC
00547  4151           JMS   DRAW
00550  7200           CLA
00551  1031           TAD   T4
00552  7041           CIA
00553  1032           TAD   Q1
00554  3020           DCA   IO       / IO = Q1 - T4
00555  1033           TAD   Q2
00556  1030           TAD   T3       / AC = Q2 + T3
00557  4151           JMS   DRAW
00560  7041           CIA            / AC = -AC
00561  4151           JMS   DRAW
00562  3327           DCA   TEMP1
00563  1020           TAD   IO
00564  7041           CIA
00565  3020           DCA   IO       / IO = -IO
00566  1327           TAD   TEMP1
00567  4151           JMS   DRAW
00570  7041           CIA            / AC = -AC
00571  4151           JMS   DRAW
00572  4733           JMS I DXY3     / FINISH DRAWING
00573  5734           JMP I DXYL

       0600  *600                    / DATA AREA

00600  0000  T1A,     0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;
00601  0000
00602  0000
00603  0000
00604  0000
00605  0000
00606  0000
00607  0000
00610  0000
00611  0000
00612  0000
00613  0000
00614  0000
00615  0000
00616  0000
00617  0000
00620  0000
00621  0000
00622  0000
00623  0000  T1M,     0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;
00624  0000
00625  0000
00626  0000
00627  0000
00630  0000
00631  0000
00632  0000
00633  0000
00634  0000
00635  0000
00636  0000
00637  0000
00640  0000
00641  0000
00642  0000
00643  0000
00644  0000
00645  0000
00646  0000
00647  0000           0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;
00650  0000
00651  0000
00652  0000
00653  0000
00654  0000
00655  0000
00656  0000
00657  0000
00660  0000
00661  0000
00662  0000
00663  0000
00664  0000
00665  0000
00666  0000
00667  0000
00670  0000  T1E,     0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;
00671  0000
00672  0000
00673  0000
00674  0000
00675  0000
00676  0000
00677  0000
00700  0000
00701  0000
00702  0000
00703  0000
00704  0000
00705  0000
00706  0000
00707  0000
00710  0000
00711  0000
00712  0000
00713  0000
00714  0000           0;0;0;0;0;0;0;
00715  0000
00716  0000
00717  0000
00720  0000
00721  0000
00722  0000
00723  0000  T2M,     0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;
00724  0000
00725  0000
00726  0000
00727  0000
00730  0000
00731  0000
00732  0000
00733  0000
00734  0000
00735  0000
00736  0000
00737  0000
00740  0000
00741  0000
00742  0000
00743  0000
00744  0000
00745  0000
00746  0000
00747  0000           0;0;0;0;0;0;0;0;0;
00750  0000
00751  0000
00752  0000
00753  0000
00754  0000
00755  0000
00756  0000
00757  0000
00760  0000  T2E,     0

             $                       / END OF PROGRAM


ADSHOV 0104      T1A    0600      
COMP   0516      T1AADR 0323      
CONTFX 0305      T1E    0670      
CONT1  0237      T1E1AD 0324      
CONT2  0260      T1M    0623      
CONT3  0307      T1MADR 0321      
CXY    0021      T2     0023      
CXYL   0400      T2AADR 0317      
C1     0315      T2E    0760      
C1MASK 0325      T2EADR 0314      
C10    0326      T2E1AD 0320      
DELAY  0327      T2M    0723      
DILX   6053      T2MADR 0322      
DILY   6054      T3     0030      
DINN   0344      T4     0031      
DINNV  0342      WORK   0213      
DISD   6052      X      0024      
DIXY   6055      XOROP  0130      
DL1    0333      Y      0025      
DL2    0335      
DONE   0127      
DOUT   0345      
DOUTV  0343      
DRAW   0151      
DXY    0035      
DXYL   0534      
DXYL2  0346      
DXY2   0034      
DXY3   0533      
IO     0020      
MPSN   0510      
MPZ    0514      
MP4    0473      
MULTL  0455      
M1     0316      
OPB    0172      
OROP   0141      
OVF    0116      
PASS1  0217      
PASS2  0244      
P1     0026      
P2     0027      
Q1     0032      
Q2     0033      
RCLLSK 0526      
RCLMSK 0525      
RCL4SL 0424      
SGNM   0173      
START  0200      
TEMP1  0527      
TEMP2  0530      
TEMP3  0531      
THIR   0532      
TMP    0174      
T1     0022      




ERRORS DETECTED: 0
LINKS GENERATED: 0


