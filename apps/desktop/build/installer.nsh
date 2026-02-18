!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var MomAIClearData
Var MomAIWelcomeDlg
Var MomAIClearDlg
Var MomAIFinishDlg
Var MomAIIcon
Var MomAICheckbox

!macro customHeader
  BrandingText "MomAI Installer"
  Caption "MomAI - Instalacao"
!macroend

Function MomAI_SetHeaderFont
  Exch $0
  CreateFont $1 "Segoe UI" 18 700
  SendMessage $0 ${WM_SETFONT} $1 0
FunctionEnd

Function MomAI_SetBodyFont
  Exch $0
  CreateFont $1 "Segoe UI" 10 400
  SendMessage $0 ${WM_SETFONT} $1 0
FunctionEnd

Function MomAIWelcomePage
  nsDialogs::Create 1018
  Pop $MomAIWelcomeDlg
  ${If} $MomAIWelcomeDlg == error
    Abort
  ${EndIf}

  InitPluginsDir
  File /oname=$PLUGINSDIR\momai.ico "${BUILD_RESOURCES_DIR}\icon.ico"

  ${NSD_CreateBitmap} 0 0 80u 80u ""
  Pop $MomAIIcon
  ${NSD_SetImage} $MomAIIcon "$PLUGINSDIR\momai.ico" $0

  ${NSD_CreateLabel} 90u 6u 210u 24u "Bem-vindo ao MomAI"
  Pop $0
  Push $0
  Call MomAI_SetHeaderFont

  ${NSD_CreateLabel} 90u 34u 210u 36u "Instalacao personalizada com opcao de manter ou recomecar dados locais."
  Pop $0
  Push $0
  Call MomAI_SetBodyFont

  nsDialogs::Show
FunctionEnd

Function MomAIClearDataPage
  nsDialogs::Create 1018
  Pop $MomAIClearDlg
  ${If} $MomAIClearDlg == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Deseja recomecar do zero?"
  Pop $0
  Push $0
  Call MomAI_SetHeaderFont

  ${NSD_CreateLabel} 0 22u 100% 24u "Isso apaga mensagens, lembretes, configuracoes e vetores locais."
  Pop $0
  Push $0
  Call MomAI_SetBodyFont

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
  Pop $MomAIFinishDlg
  ${If} $MomAIFinishDlg == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 10u 100% 22u "Instalacao concluida"
  Pop $0
  Push $0
  Call MomAI_SetHeaderFont

  ${NSD_CreateLabel} 0 34u 100% 30u "MomAI esta pronta para uso. Clique em Concluir para iniciar."
  Pop $0
  Push $0
  Call MomAI_SetBodyFont

  nsDialogs::Show
FunctionEnd

!macro customWelcomePage
  Page custom MomAIWelcomePage
!macroend

!macro customPageAfterChangeDir
  Page custom MomAIClearDataPage MomAIClearDataLeave
!macroend

!macro customFinishPage
  Page custom MomAIFinishPage
!macroend

!macro customInstall
  ${If} $MomAIClearData == ${BST_CHECKED}
    RMDir /r "$APPDATA\\${PRODUCT_NAME}\\data"
    RMDir /r "$APPDATA\\MomAI\\data"
  ${EndIf}

  # --- VC Redist Check and Install ---
  DetailPrint "Verificando Microsoft Visual C++ Redistributable..."
  
  # Check if VC++ 2015-2022 x64 is already installed using the registry
  # The Key {36f11681-4328-403d-8877-f273ed29c4dd} relates to 2015-2022 redist
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  
  ${If} $0 == "1"
    DetailPrint "Visual C++ Redistributable ja instalado."
  ${Else}
    DetailPrint "Visual C++ Redistributable nao encontrado. Instalando..."
    File "/oname=$PLUGINSDIR\vc_redist.x64.exe" "${BUILD_RESOURCES_DIR}\..\bin\vc_redist.x64.exe"
    
    # Run silently: /install /quiet /norestart
    ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $1
    DetailPrint "Instalacao do VC Redist concluida com codigo $1"
  ${EndIf}
!macroend
!endif
