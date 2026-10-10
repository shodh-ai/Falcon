-- Provision unique temporary passwords for the approved Pharmacy Semester-I student identities.
-- Student IDs remain the login identifiers. Plaintext passwords are emitted only to the
-- private credential handoff artifact and are never stored in this repository.
-- Source accounts and course/faculty mappings are created by 20261009120000_pharmacy_sem1_student_onboarding.sql.

BEGIN;

CREATE TEMP TABLE pharmacy_sem1_credentials (
  student_login_id VARCHAR(80) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL
) ON COMMIT DROP;

INSERT INTO pharmacy_sem1_credentials(student_login_id, password_hash)
VALUES
  ('2650799', '$2b$12$BjwCBbAjNn2c9WLCPpTkWurKhx8DJnPxJBOmjOa0ylGr3bw2pXZHO'),
  ('2650779', '$2b$12$Fi2ZBYcW7TEzOty6rjtboOxCKZrWIw1ZW.umYToYPwpGjcI3tY8j6'),
  ('2650768', '$2b$12$Aj5MnOkitfluWaxE4ljNKOnAWHlk/u8N2vHB.ZEqsz.IKsr22FB7q'),
  ('2650155', '$2b$12$7Obl87/wYhfpQU15bDyXUuCMhf/rxTc9Om3Nsx1Eu7g/utY/xXGhm'),
  ('2650047', '$2b$12$WagzHHkqa/CJI4xFy3ewnOdPK2gvbiZPpP6oFPsh5g14pOkiNUU7a'),
  ('2650001', '$2b$12$jTJ/vqHqI6r/f.p6Sme4teGwjp.gcjyo59N8//6HPhLK8yA5J.0Zu'),
  ('2649970', '$2b$12$nDtCWGluonshWWRvr0xrD.MsfWRJNdN7aD3aT7OUS2W2NZy0ZTddC'),
  ('2649505', '$2b$12$K7nwZChsbT5QG93ubZfb4.wgt41.bVIsgYwcXOzO6ilcznVMMVRSW'),
  ('2649248', '$2b$12$IazOes/yOWytsKT2gtvseugxpWghHjUEmHkNCefSfXpxFmd4yClAq'),
  ('2649247', '$2b$12$M80TtZEPwcUrvvsr45bbAuJHk4zeRyqaGJDEdYlFpbr4MqqqNZpq6'),
  ('2649242', '$2b$12$tC4yr9z9AGDr7yT//13HGeMpLZtWGLo82ZX/t8iKlDehfQP5EtpAO'),
  ('2649157', '$2b$12$91qbA5lfBGNIzzj37R8EhOTPaznaMewoibYOPTvsmeUZgoxdI7Axe'),
  ('2649125', '$2b$12$QYDMgrjdBA10W99QYbHjUuwCLMYz1osRtkfz/.9N6fF9xDwNqwwuG'),
  ('2648734', '$2b$12$3fJnjpWQaZmjib5evDcbbuWjxQd5LdU2YIY/NRNslRjabTPBgjrN.'),
  ('2648688', '$2b$12$riYUwfI/UA0Osnn3ZJuCje6mU1mDj/1bQTJQ/ZSXElJn491087G2W'),
  ('2648497', '$2b$12$5lCwvfDH1hhYRmqUmOtOUuS30TePJ/sjgMuqn4y8sDBhJW453et.i'),
  ('2648461', '$2b$12$QxdbgeodYPDMQzMLApiK3ebAlU8zEvajXHtTC.bOfX5sn.o5PMgI6'),
  ('2648386', '$2b$12$55T8KIRrcuW5fv50qLolH.T12Yebb8UQglzL0g8N6Ex03MQr8tH1G'),
  ('2648313', '$2b$12$iY798xj4FLw6KnQ9qSYgUeyMTiTy.JpQ8GGMR3vngssi.bMF9rBRO'),
  ('2648278', '$2b$12$Z0otzj2cW0Q702Eun1HOuOL6o6xv7DBWHJBgy9WBqsJbzt2GD1aZa'),
  ('2648276', '$2b$12$hiU3yWgypdD80g2CjAH5PeiF29DmVGgKCYbd00wospD5FTF3AnbmK'),
  ('2648273', '$2b$12$tVP7OhLIxya0vsxoFFpOiunh.UUijuiQwu/Z6MbUO2UeRIQAPCERi'),
  ('2648231', '$2b$12$xF4xAJaNHXBlEUwFuejEBuMfMiM7f0/mi95f6zPgery08XfUJO/Ga'),
  ('2648196', '$2b$12$1yN2k82Eby106BsVHht3NuMtZoQH8q1hkXZ6MnTpl1xgbXaRBW2Ha'),
  ('2648036', '$2b$12$XQrh2bsQEdvtLpQ1Tn6INOXkpO87pYmHeAHcchLDzw2j..PfSN4rG'),
  ('2648026', '$2b$12$eA/lu8ByoImMx4pxbdTZI.XR9dLtxp/K8dw2vUmbtYTDwc8MPlKz2'),
  ('2648002', '$2b$12$70MOfkQZLYWpw.UprbesV.6ZYbyD6dkOTovYnJjP7z15DTt4Mkd42'),
  ('2647985', '$2b$12$zze.KU3vHO/lo69X8t1u7ev/XKuDqbfotvfpmSeQRqLCj7TIIqkiq'),
  ('2647887', '$2b$12$oFlasGSa7Ks384WmMBfgzenxONG1Df2QUEMgaBflbRKLMHsuv30vO'),
  ('2647886', '$2b$12$wm4gN00ibNeivddEnYJ70uLXWJr1jrLM9CFQtT1DD3TyhCpQQEp3C'),
  ('2647876', '$2b$12$5XGnLl2alc4mny4MW6NiZOVV1nQZBRPZR3XqsxrSyb4k4ua6efwES'),
  ('2647854', '$2b$12$/tG.y.EysICWCs4XHgkVouq0BgcS0V./rseuIxqEQCKeUxfqcoaHG'),
  ('2647821', '$2b$12$lKpN6QjZZfUiNUOnx6qw1e/snNaFxAmUsCmfnqFvhTbJOgSGtPy9W'),
  ('2647810', '$2b$12$7nJ5/4mnkTmzxNlisvmtIuvCw3ZP2idwgqnHj/9PxukvP96mhDHIi'),
  ('2647806', '$2b$12$ri1hQPVkNulxVOjquekVPu61vPbFlA71BzRKXSVTm84EAafLLvYQu'),
  ('2647784', '$2b$12$LDu5VdtX/7NyrBUJ3o2sEeXdoviY9mj2XSOhRHljhYaoJfWU0N/cC'),
  ('2647765', '$2b$12$RSmz2HLtdnCAqDxC/2GX2e4LI57uKhKxWnuPaNhtxRzH.fIlDsQ9S'),
  ('2647747', '$2b$12$28WZP82FhvbyWnz1xuzq..47qNZVhVK0Rd3e5N107NdpnD.jACRpi'),
  ('2647736', '$2b$12$v3haPaTlTVYA8p6jLPWlKeGs92lQzhQYPUjvuh4WubElOHxBiCS0q'),
  ('2647697', '$2b$12$UFem64fR3GbI4LBqvKgi5eQnVbuWfy2MxqJ.vwoSbJ2gFisxoaIua'),
  ('2647690', '$2b$12$tluJrND11Q/9PSNRd5g4J.YG72dyLTok0MQ53fzB/a4pI6DrmkD/u'),
  ('2647653', '$2b$12$bQGssAymeiGdn1oSjSh6c.w7AgBRep/UiMiSe3/u/t36a0/3Cf07K'),
  ('2647635', '$2b$12$DIJpGf54J4VGoyrhFLQhPO8leMzMvR7zFLTYK4Y0mxGoZdeGrqsmG'),
  ('2647634', '$2b$12$HVIOmr8ak3RbCdjI.1R7IewC70MmYvoxOxxHI5lCE7RZKNMjnCA.C'),
  ('2647612', '$2b$12$bgbydhDmxsDivyLF0L0AyetDM8i75JgkDyx.W3HaQKXBP9D8aMNhe'),
  ('2647611', '$2b$12$2gNgLamdKp8560jox4.oqOUvuBX0QfxxIv5dCAyy4qZL9lGSXEnp6'),
  ('2647592', '$2b$12$JrLUswWw3XSCE4O1SWybqOcOTSbe/tprUxoSkWOgIFS/HqfVFxLA.'),
  ('2647589', '$2b$12$R.Jyus.xqzOrxR.HPclou./yqqvht0lIk38oOaPBiYrOx7ZYaAweG'),
  ('2647587', '$2b$12$eIHGB5pZpv2T5v3dhyXacOi6JoeOlOSarQxOu7wfeeRX4Vl9.KMK6'),
  ('2647586', '$2b$12$G4EojJODjvLsGNm1suMfdezWZJw51rNiZGYJl93CHIlEpsjSsdwha'),
  ('2647583', '$2b$12$FG7t6EJQ6bJLxWaGUV2LrezX80Sp1t2QnzZWaHhlQvfWUAdJD9in6'),
  ('2647581', '$2b$12$20d.YmzrPRUyGfjeOT074uf3U.1Bs2R4stMaM4Z5BeuEe23Yt/12W'),
  ('2647526', '$2b$12$Hm6w3RTqQ5xjsnpjZeWMM.DoFytQnfALjEg608Ut7zsXj/RsmzIuy'),
  ('2647475', '$2b$12$db0FrceYjj.N82/uCVA2H.mJFpp1FZP0Yytp/M2kHKFve6pmaYUQq'),
  ('2647460', '$2b$12$ePQoy8pLAgYRzo34v0hy1uz1aioibF9r64YES6wtc/jt19l/XeMny'),
  ('2647443', '$2b$12$TxGspDHIkzNFcg6Y/Nb2mulk3GaiQtm2EuI.XGZgYORTRNAxC/3pu'),
  ('2647364', '$2b$12$oFxE8a/dkv/KfFp.SZOsvuxUQxGJ3fzdGDars1VZNP2Ugk5rT//Ga'),
  ('2647363', '$2b$12$gJ7vNfGHJdAbd6/BaVS3tO5s6WA2oBQldy2IE/pO65rw44pFTN.HG'),
  ('2647338', '$2b$12$8ACtk5Bb2mL05NshUB2wX.B7UP1QhiqFX3hfRUCKa.Ytcsg896t6W'),
  ('2647327', '$2b$12$RrVEhxvmjk/DH4ruZL0G../GXseicyxUcez241BSok08h0NUApqJi'),
  ('2647302', '$2b$12$oGeenqACi4I0LOJ7S/uR1u5SVwDNy5jeoaJMc5WLh.xDBhn9SnaQ6'),
  ('2647298', '$2b$12$Mhgi7xIG33FlrrB0se6OZO6YLGGInXH69XE3rqclrY5X627k3FexS'),
  ('2647267', '$2b$12$JRCaapFN80mZfWSGzZFWoOwCtsOWTF7Rz5hXGqmn/.s4g3XczPpkO'),
  ('2647242', '$2b$12$aU6mRuogMQ6Sa6lPNFnjnubv2tf5MezWWk4Ji0.0r0PMht3wN6zB.'),
  ('2647219', '$2b$12$1J9bZBof4X.0n4Anc7aTDOXZdFe0dwhg8k9F93WDjz0Hg8BsJysvq'),
  ('2647216', '$2b$12$Z.3uuGqQdMgiqlXjXGtHMOL70GETAbBH.jerXGl5K1foFzq1NndKO'),
  ('2647191', '$2b$12$ckDUTZ1KRGZJKIMoq5944eYmPidCjWlD6OwSIGHlBTpTxOrbQzVqS'),
  ('2647189', '$2b$12$02HG4bkpOF80R2i9FA0GLOon1Nbg.FTTwMS7smxgSel5KWBh/ifpO'),
  ('2647186', '$2b$12$biz3nVzsATdKHQZXly.jCO2dGznacFnXtuVHGC7gyILwxcvZ1g87G'),
  ('2647184', '$2b$12$kYMtCcEg.a/CNuDFPZOu4ed03qcznfsqpqLJaapuseTdATgC9qab6'),
  ('2647182', '$2b$12$KCQ89bsM2z0ggVHW5LfprOg47lMgrkkn6W0OcqNFhXrQ0goC2FW4W'),
  ('2647175', '$2b$12$nletS/Azk4wyQSw8Dbdyx.hch18esjhuyMxRvT0.Yxtc3nXE/mOhq'),
  ('2647157', '$2b$12$BxIkzhRugzNCd0Gj1X6aVeCQ.ukbKxoQv3ZFYu1qjwTXWzHyPscj2'),
  ('2647156', '$2b$12$DyS8KuwD1Px4bp4q3vji2udsPM2q6dMJQ2a5U5W0IVfOyahvBQynq'),
  ('2647153', '$2b$12$HqiLVv.o7dDk0IYLXRRXLeH28PdP0K80zcUZv7aSmf8CjHBI6S476'),
  ('2647132', '$2b$12$uPar7t/EehhFkXGTScejO.Wg.BEZ4OKMbBv8nt/QCP.sCE0UyLpOy'),
  ('2647114', '$2b$12$Xq/Qsg8GCpK4qQ2nJDxfzO.xCo4JlDYqPw2IL41cnfgqAOjVwBOzq'),
  ('2647096', '$2b$12$9.Z6TWmaWdldML/g5fa0J.uwMIj4Wltf9m6m8YZQZ./c7wqd0jdOq'),
  ('2647088', '$2b$12$jmIvNJBv0VE42feR3h6XR.BQo6ya23qGxIZ2feXcD0wUgXFEv/1pi'),
  ('2647043', '$2b$12$eWUb.YXz2NdHZUvUReLuD.rSB9wYLR2xYczl7asJ.CBEkSklcvzI2'),
  ('2647028', '$2b$12$C.8FuLGOYXi6r5VuQi540u47Jv4nl2YXoVg7WNLjvjllUpuxzKZsu'),
  ('2647019', '$2b$12$Nxa/b0g/lnhSd8wKEFg5PeRMKrpEEl1IhazkdO5ydVyLWSbshF8z.'),
  ('2646977', '$2b$12$9m9MGHXsuOAOr4b9bzZMgeCAnh1fa/kt3ONOWuwc7NjIyEQFiHm1m'),
  ('2646950', '$2b$12$WgyQN7aW09wATJsXQUitm.0dBK95ohla.0Zem/eHz5ALKXdYk9syu'),
  ('2646935', '$2b$12$IaNlvQFgQiah0y1HQ8l6d.UCwLRDmJVv4bbmSDgNc8IdUksxppXey'),
  ('2646933', '$2b$12$tLvqzyh78BZqIwMncctHfe9KYKa9hfqi9uN7vU89D7y7.YoIgKVke'),
  ('2646932', '$2b$12$NFJjVDyiVNx.xWCQfM.L2OkUbn2WZw4OF1AYirG1Z51bNwGGua36e'),
  ('2646931', '$2b$12$VR0H7IzAzT3zbXDvYgD1MuR7N95QguWQd37ytVUcNhF1lqmM.wOlq'),
  ('2646885', '$2b$12$NMtLO65nQs2wQ2.PIRs1qeMNugxuCLuEwR/IJGtZWbSdeMN.eTR8O'),
  ('2646874', '$2b$12$egiuaGTS.qMLb5jcz9UH/u8Wl5qscjWUvhX5aTYXcl3n.JepxJT.a'),
  ('2646833', '$2b$12$ksNP8pXoVJ0ByAUHnLwtueZ/uj1Tltna9zHRsX5/e5nhKsioMP8Nm'),
  ('2646744', '$2b$12$0lk6v0y4orvBPBuFSCAz4eutYPq1sAHTI4TmqlgAJZa.Jv0lHiieu'),
  ('2646725', '$2b$12$lUO23ptJuG.BwKNs.KzP6Oah10LreJsS7J/PyB2G.ibsQ6d9E3trm'),
  ('2646724', '$2b$12$bljZYZP/Mu0TaAAxk8RWA.9y8DdjOiU4hDVRlyp7qwp8DoSX4AZy6'),
  ('2646723', '$2b$12$DeyCM6bqI9BqsuZ9keLUmeJdXUXLvINMsPkiQuIf4RiXhi/M8qL6m'),
  ('2646613', '$2b$12$Cmr7TneeYbZ6jsfnw3SWaO/ZZ0AyviBAc/4YZjzpQYdTzWkagfKcG'),
  ('2646612', '$2b$12$xf43xvSyFxpfC4Uh1mzlNujQbAtN.8lJIEYYb5/ggBaaOA2Lq3pj2'),
  ('2646584', '$2b$12$lwgpKnPZ2A.u2IFOEPfVoOCansVoPfljG3yiwiPkrn3u/eKw0yfFK'),
  ('2646578', '$2b$12$CmkSugJVJnFvWQorUW9c5u9rxi7ROajgQRyog6RhMcFvCAYHuyDEq'),
  ('2646547', '$2b$12$jbOfPmAXcXWXWA10gj0CyuM78NgoHLjuT.w2n3Rc.hMDva1mZ/uqu'),
  ('2646531', '$2b$12$8xk61ItBCLkejtRywLSegOF6RakgfMEibu4ZFNWI8Hq40pK9Uxhqm'),
  ('2646515', '$2b$12$YBAD8WT0sBofrEFBEzLTg.gdNMVUu7iIE4KcJRoMtvhmu8m.2vpwe'),
  ('2646514', '$2b$12$5QgKblaE42ciGUlPVBnEzutyZAzKiIk6VckImeN24rfEcXMMf4KGS'),
  ('2646501', '$2b$12$KOM5hqF7wp7pp36mSFwMbO/ermS9oWIkzmGUrd9J4wOEKtQdOS9/S'),
  ('2646454', '$2b$12$iWm5LPqZTpJTCkPA2OuuOuk4H1vvWj.OLBmxSEX082MlrRO/RftJS'),
  ('2646453', '$2b$12$oDaBsY/Ht3brCRWDgpG7p.ooWONPUFyD4vJsWX.qdPgmNw4LzO1ZK'),
  ('2646445', '$2b$12$ZHRXPZDsnKjStXY5raYqDuVd9s/pYCFvuio.Pk3Mcshws05akNLHe'),
  ('2646418', '$2b$12$cyI3xSGzxkDTCoyd2NxTtu0OSGWDl5WkHzZVsKaNZbj2qrOsIKyjS'),
  ('2646417', '$2b$12$/u7TBRvof1YrkxeLaZRLAe27uk8k262U9YGqFk//RFhrp12A0iNTS'),
  ('2646382', '$2b$12$rb.kIASrM9sar2fDh1ZLGuc3nSITz5iM1XOT9kVBbnwB7ba3zeRpy'),
  ('2646363', '$2b$12$CmPW3sc5Bt7TKjSRywvaaufLjau/17vY8hulgrYxSbHwmcfQmjqb.'),
  ('2646356', '$2b$12$3gJHPTX3VJYDuHKyVEgH.e7opsoVmquh9XXt4wcul6WQFeEnxSSzO'),
  ('2646355', '$2b$12$pyQTvEPqff/S6dv/sgk9Z.e0CnvJxf5J5lb.3EGaVThYFZG0TV1iK'),
  ('2646309', '$2b$12$wj48TclkbN2s.IY5rVfPVO0SHevZ/oUS.o290jEpLDO9fL/Pu.Csa'),
  ('2646303', '$2b$12$ojX.eUUtxu/e8oC6q0AdX.v08Rnq8lP.Qy4JRr5zMbQZ8k/zFkkbq'),
  ('2646270', '$2b$12$5zZat.W6mXtFaww3lk1qwOcaENdT904n8phO2tEHWAchZ71kY1yQm'),
  ('2646233', '$2b$12$tpDaYjEFYVmDKPaCJL10FeT6AC2DhMwn764tETnQCtqMM7/8Ept1i'),
  ('2646229', '$2b$12$/dKQpiV06L7Sf4w8E7/LOOAddj6qteixKpp6PUgmdM8p4eSGYqKQi'),
  ('2646218', '$2b$12$mlgLo36NbJH1UmZPDmMEkO5nWVtspLcsxwrj8RTlb726D7K1GrLK2'),
  ('2646217', '$2b$12$VpvwZ.F2z2wCUd3CNdi6U.FmWCQtvDIsuY94EJ/UprmLa8b9yP1YG'),
  ('2646216', '$2b$12$mAIDGWxlzYQW9nQj4EaFkufGQpTU3.JkZ8U.buBzQ9TbOBTd93I3u'),
  ('2646200', '$2b$12$HXGhZu1jeKuP1rPZGd5aruK0ueeIlb9l2ICDB8Apzn3DawICom0YK'),
  ('2646196', '$2b$12$y99LSq2z6/zuLvPow7Ybi.Q1t2zMQRjvi0a1bNHg7ngHS2x/AxkT.'),
  ('2646194', '$2b$12$XDoxO9ZHKwsJsZ1ERgwsOedozS3bJYlrHVSiVzvrUgNwoadwHdEIy'),
  ('2646188', '$2b$12$le6ravTUk3v6jHrKN8s.Aeboj3AT9ygL58d3BeKbprwmvoMFbYmhG'),
  ('2646123', '$2b$12$ZmQVD6/EMmDCtDDYwTntDuCM6b3c3VKHRPIqP3DXXU6OJATSFQRj2'),
  ('2646111', '$2b$12$ok8DYfMglofQF/WKEXp4vOZnCTsxSKzBxOlSfpyPnuidsDEh4VChG'),
  ('2646097', '$2b$12$COs4nSRMX75ZtRfUzwXS9uYMBPFxufe8c/pWrnYAo5Bq0T4QZF9mm'),
  ('2646065', '$2b$12$WF7.5bNVqHhkxoV2B8.WxeFinaN7QfZJ/7sTVojzb52qCI0q0tYtO'),
  ('2646043', '$2b$12$EZ1uzOfDQV4WWn.AVw9fZOTYXkcDRS0CO7ikxK1gpezAguRoM4plO'),
  ('2646039', '$2b$12$tS3lhgwpcpvGushAklOtxO7AGJoiXXlkbK/kziR53U5/SIJpj.iI.'),
  ('2646013', '$2b$12$LZ87RBousWw7IGiUXCmPPus6EQdx25N8Kokk2eDVdrZ2B1lL8ke2C'),
  ('2646007', '$2b$12$FB9TwGGPi3P3ps5qqA7MSud9ZcM1PafI1vVFqkEfRT8B3CeXlwfWe'),
  ('2645983', '$2b$12$VUAtCkBgg6ZPiw27L3C4KujxMNGOlsctDhiRkx7nuz7DAD7I0CxKu'),
  ('2645981', '$2b$12$o7CLkCIcIvxAIMUO8/nrw.atqdUYuyBm6BJB19cueYSJrGWM6DZ7e'),
  ('2645970', '$2b$12$6VYRjXdhbBYetOYd8Vhi6.Bo7qsFtbbdbAd.bOS6mC7Ex7U2xPLPq'),
  ('2645967', '$2b$12$C62dCPQ0h0leQqvs.rLRBORbvTA.LUEqksYE6cKOJnXg371qRtw36'),
  ('2645951', '$2b$12$R7aFvuqeV/E6IoZ95QlFmeq72vRxUlwHJ74ZtIHNczXR6KI2P5zXC'),
  ('2645915', '$2b$12$dceMuLefkz8RjGLxptFuw.nc3ghAsoklXi7BazrCP.pdi2jiE.Ggm'),
  ('2645836', '$2b$12$Fco8fDnGAavxw7CgZ4mGnO0llWgcYjrO9IHgXS6gueio735BTXQ7.'),
  ('2645800', '$2b$12$/piFkFMfN9XePabDmYFQU.3jbbCE7hcYJE2AKHIP0TBs18D5jc4Wm'),
  ('2645735', '$2b$12$GXXhJaNV1.Mg778J9/QuWew2UdaTa5QRi3LroDVETNbBfsgpvkC5S'),
  ('2645652', '$2b$12$OuYxf5tNEXWTTC8N1kts2eTUP/SZrTmkrrw6EJN/6mI8c4gaxAW1.'),
  ('2645630', '$2b$12$MLLn264TjClal8HVGt6n.OZ5dmB1Gqxj74v6OOFnwFCE2LqKZmmcm'),
  ('2645607', '$2b$12$/RH5CyydnikRq2nRezqU2uDPiu967efF4M8Cfx4C47NMCofSsyWK6'),
  ('2645538', '$2b$12$GKrk9K9itvvoY.alQiTR8.cLaAWpUKzPNXxTJHU8Fekrsjvdnsma6'),
  ('2645486', '$2b$12$v4Ov6gOmroefzdNz3Wz/7uXyw8iy3089tzTcLGZWTF9MdY7mvEv5i'),
  ('2645312', '$2b$12$QXrvskHPNlmlBH5gTVfOlOwvw9FCv9LYuTrCeWjV7NbV3OAjnYJ0m'),
  ('2645311', '$2b$12$.TbH6i4NWHsAwPZQApmTOe3TzXOujf5wec/XCu4L1wTDiAEZ.RaBW'),
  ('2645253', '$2b$12$9KJ1qEYWxel.bvbxGH9F7OtFp/deMx.FXYVgRC.jW1o7Wv53G4ZXy'),
  ('2645179', '$2b$12$KaVK81vpAlGhIz9vxHwDd.PUanXfXNoF0IDIhZojj0JujHJIOoAPe');

DO $$
DECLARE
  v_tenant UUID;
  v_student_role INTEGER;
  v_expected INTEGER;
  v_updated INTEGER;
  v_ready INTEGER;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.tenants
  WHERE subdomain = 'sgvu' AND is_active = true
  LIMIT 1;

  SELECT role_id INTO v_student_role FROM roles WHERE role_name = 'Student' LIMIT 1;

  SELECT COUNT(*) INTO v_expected FROM pharmacy_sem1_credentials;

  UPDATE users u
  SET password_hash = c.password_hash,
      onboarding_status = 'PENDING_PASSWORD_RESET',
      account_status = 'PASSWORD_RESET_REQUIRED',
      is_active = true,
      deleted_at = NULL,
      onboarding_profile = COALESCE(u.onboarding_profile, '{}'::jsonb)
        || jsonb_build_object(
          'student_login_id', sp.student_login_id,
          'credential_source', 'pharmacy_sem1_student_credentials',
          'credential_provisioned_at', NOW()
        ),
      updated_at = NOW()
  FROM student_profiles sp
  JOIN pharmacy_sem1_credentials c ON c.student_login_id = sp.student_login_id
  WHERE u.user_id = sp.user_id
    AND u.tenant_id = v_tenant
    AND sp.tenant_id = v_tenant
    AND u.role_id = v_student_role
    AND sp.status = 'ACTIVE'
    AND (
      u.password_hash IS NULL
      OR u.onboarding_status = 'PENDING_PASSWORD_RESET'
      OR u.account_status = 'PASSWORD_RESET_REQUIRED'
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT COUNT(*) INTO v_ready
  FROM student_profiles sp
  JOIN users u ON u.user_id = sp.user_id AND u.tenant_id = sp.tenant_id
  JOIN pharmacy_sem1_credentials c ON c.student_login_id = sp.student_login_id
  WHERE sp.tenant_id = v_tenant
    AND sp.status = 'ACTIVE'
    AND u.role_id = v_student_role
    AND u.is_active = true
    AND u.password_hash IS NOT NULL;

  IF v_expected <> 151 OR v_ready <> v_expected THEN
    RAISE EXCEPTION 'Pharmacy student credential reconciliation failed: expected %, ready %, updated %', v_expected, v_ready, v_updated;
  END IF;
END $$;

COMMIT;

