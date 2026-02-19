!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var MomAIClearData
Var MomAICheckbox
Var MomAIStartCheckbox
Var MomAIStartApp

!macro customHeader
  BrandingText "MomAI Installer"
  Caption "MomAI - Instalacao"
!macroend

!macro customInit
  InitPluginsDir
  ; Verify icon file exists before copying
  IfFileExists "${BUILD_RESOURCES_DIR}\icon.ico" 0 icon_missing
    File /oname=$PLUGINSDIR\momai.ico "${BUILD_RESOURCES_DIR}\icon.ico"
    Goto icon_done
  icon_missing:
    DetailPrint "AVISO: icon.ico nao encontrado em ${BUILD_RESOURCES_DIR}"
  icon_done:
!macroend

Function MomAI_SetFont
  ; Stack: [HWND, size, weight]
  Exch $2        ; $2 = weight
  Exch 1
  Exch $1        ; $1 = size  
  Exch 2
  Exch $0        ; $0 = HWND
  Push $3
  CreateFont $3 "Segoe UI" $1 $2
  SendMessage $0 ${WM_SETFONT} $3 0
  Pop $3
  Pop $0
  Pop $2
  Pop $1
FunctionEnd

Function MomAIWelcomePage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateIcon} 0 0 80u 80u ""
  Pop $0
  ${NSD_SetIcon} $0 "$PLUGINSDIR\momai.ico"

  ${NSD_CreateLabel} 90u 6u 210u 24u "Bem-vindo ao MomAI"
  Pop $0
  Push $0
  Push 18
  Push 700
  Call MomAI_SetFont

  ${NSD_CreateLabel} 90u 34u 210u 36u "Instalacao personalizada com opcao de manter ou recomecar dados locais."
  Pop $0
  Push $0
  Push 10
  Push 400
  Call MomAI_SetFont

  nsDialogs::Show
FunctionEnd

Function MomAIClearDataPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Deseja recomecar do zero?"
  Pop $0
  Push $0
  Push 18
  Push 700
  Call MomAI_SetFont

  ${NSD_CreateLabel} 0 22u 100% 24u "Isso apaga mensagens, lembretes, configuracoes e vetores locais."
  Pop $0
  Push $0
  Push 10
  Push 400
  Call MomAI_SetFont

  ${NSD_CreateCheckbox} 0 54u 100% 14u "Apagar dados locais"
  Pop $MomAICheckbox
  ${NSD_SetState} $MomAICheckbox ${BST_UNCHECKED}

  nsDialogs::Show
FunctionEnd

Function MomAIClearDataLeave
  ${NSD_GetState} $MomAICheckbox $MomAIClearData
FunctionEnd

Function MomAIFinishPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 10u 100% 22u "Instalacao concluida"
  Pop $0
  Push $0
  Push 18
  Push 700
  Call MomAI_SetFont

  ${NSD_CreateLabel} 0 34u 100% 30u "MomAI esta pronta para uso. Clique em Concluir para iniciar."
  Pop $0
  Push $0
  Push 10
  Push 400
  Call MomAI_SetFont

  ${NSD_CreateCheckbox} 0 70u 100% 14u "Iniciar MomAI ao concluir"
  Pop $MomAIStartCheckbox
  ${NSD_SetState} $MomAIStartCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function MomAIFinishPageLeave
  ${NSD_GetState} $MomAIStartCheckbox $MomAIStartApp
  ${If} $MomAIStartApp == ${BST_CHECKED}
    ExecShell "open" '"$INSTDIR\${PRODUCT_NAME}.exe"'
  ${EndIf}
FunctionEnd

!macro customWelcomePage
  Page custom MomAIWelcomePage
!macroend

!macro customPageAfterChangeDir
  Page custom MomAIClearDataPage MomAIClearDataLeave
!macroend

!macro customFinishPage
  Page custom MomAIFinishPage MomAIFinishPageLeave
!macroend

!macro customInstall
  ${If} $MomAIClearData == ${BST_CHECKED}
    RMDir /r "$APPDATA\${PRODUCT_NAME}\data"
  ${EndIf}

  # --- VC Redist Check and Install ---
  DetailPrint "Verificando Microsoft Visual C++ Redistributable..."
  
  # Check if VC++ 2015-2022 x64 is already installed using the registry
  StrCpy $0 "0"
  
  # Check 64-bit registry (Machine)
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  
  # If not found in 64-bit, check 32-bit registry (WOW6432Node)
  ${If} $0 != "1"
    ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}
  
  # If still not found, check Current User registry
  ${If} $0 != "1"
    ReadRegStr $0 HKCU "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}
  
  # Check also in WOW6432Node under HKCU
  ${If} $0 != "1"
    ReadRegStr $0 HKCU "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}
  
  ${If} $0 == "1"
    DetailPrint "Visual C++ Redistributable ja instalado."
  ${Else}
    DetailPrint "Visual C++ Redistributable nao encontrado. Instalando..."
    
    # Check if VC++ installer file exists
    IfFileExists "${BUILD_RESOURCES_DIR}\..\..\bin\vc_redist.x64.exe" 0 vc_redist_skip
      
      File "/oname=$PLUGINSDIR\vc_redist.x64.exe" "${BUILD_RESOURCES_DIR}\..\..\bin\vc_redist.x64.exe"
      
      # Run silently: /install /quiet /norestart
      ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $1
      
      # Check if installation was successful
      # 0 = success, 3010 = success but reboot required
      ${If} $1 == 0
        DetailPrint "Visual C++ Redistributable instalado com sucesso."
      ${ElseIf} $1 == 3010
        DetailPrint "Visual C++ Redistributable instalado. Reinicializacao recomendada."
      ${Else}
        DetailPrint "Aviso: Instalacao do VC Redist retornou codigo $1"
      ${EndIf}
      
      Goto vc_redist_done
    
    vc_redist_skip:
    DetailPrint "Arquivo vc_redist.x64.exe nao encontrado. Pulando instalacao do VC++."
    
    vc_redist_done:
  ${EndIf}
!macroend

!macro customInstallEnd
  ; Launch handled in MomAIFinishPageLeave
!macroend
!endif
