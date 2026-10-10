; Extras do instalador (electron-builder inclui este arquivo sozinho).
; Ao desinstalar, tira o "Abrir com o Windows" (se tiver sido ligado na bandeja).
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.vulpi.app"
!macroend
