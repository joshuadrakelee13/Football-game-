@echo off
rem ===========================================================================
rem  Gibraltar - build the C++ code and the level from the pipeline output.
rem
rem  Usage:   Scripts\BuildWorld.bat [gui] [nobuild]
rem     gui      run the import inside the normal editor window instead of the
rem              headless commandlet (use this if the headless run fails)
rem     nobuild  skip compiling the C++ editor module
rem
rem  Environment variables (optional):
rem     UE_ROOT              Unreal Engine folder, e.g. C:\Program Files\Epic Games\UE_5.5
rem     GIBRALTAR_BUILD_DIR  pipeline output (default ..\..\data\build next to the .uproject)
rem     GIBRALTAR_ONLY_TILES comma-separated tile ids for a quick test import
rem ===========================================================================
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_DIR=%%~fI"
set "UPROJECT=%PROJECT_DIR%\Gibraltar.uproject"
set "IMPORT_SCRIPT=%PROJECT_DIR%\Scripts\import_gibraltar.py"
set "STATUS_FILE=%PROJECT_DIR%\Saved\GibraltarImport\status.txt"

set "MODE=cmd"
set "DO_BUILD=1"
:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="gui" set "MODE=gui"
if /I "%~1"=="nobuild" set "DO_BUILD=0"
shift
goto parse_args
:args_done

if not exist "%UPROJECT%" (
    echo [Gibraltar] ERROR: cannot find "!UPROJECT!".
    goto fail
)

rem --- 1. Find the engine ------------------------------------------------------
set "ENGINE_DIR="
if defined UE_ROOT set "ENGINE_DIR=%UE_ROOT%"
if defined ENGINE_DIR goto check_engine

for %%V in (5.5 5.6 5.4) do (
    if not defined ENGINE_DIR (
        for /f "skip=2 tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\EpicGames\Unreal Engine\%%V" /v InstalledDirectory 2^>nul') do (
            if not defined ENGINE_DIR (
                set "ENGINE_DIR=%%B"
                set "ENGINE_VERSION=%%V"
            )
        )
    )
)
if defined ENGINE_DIR goto check_engine

for %%V in (5.5 5.6 5.4) do (
    if not defined ENGINE_DIR (
        if exist "C:\Program Files\Epic Games\UE_%%V\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" (
            set "ENGINE_DIR=C:\Program Files\Epic Games\UE_%%V"
            set "ENGINE_VERSION=%%V"
        )
    )
)

:check_engine
if not defined ENGINE_DIR (
    echo [Gibraltar] ERROR: Unreal Engine 5.5 was not found.
    echo             Install it with the Epic Games Launcher, or set UE_ROOT, e.g.
    echo             set UE_ROOT=C:\Program Files\Epic Games\UE_5.5
    goto fail
)
rem Accept UE_ROOT pointing either at UE_5.x or at UE_5.x\Engine.
if exist "%ENGINE_DIR%\Binaries\Win64\UnrealEditor-Cmd.exe" (
    for %%I in ("!ENGINE_DIR!\..") do set "ENGINE_DIR=%%~fI"
)
set "EDITOR_CMD=%ENGINE_DIR%\Engine\Binaries\Win64\UnrealEditor-Cmd.exe"
set "EDITOR_GUI=%ENGINE_DIR%\Engine\Binaries\Win64\UnrealEditor.exe"
set "BUILD_BAT=%ENGINE_DIR%\Engine\Build\BatchFiles\Build.bat"
if not exist "%EDITOR_CMD%" (
    echo [Gibraltar] ERROR: "!EDITOR_CMD!" does not exist. Check UE_ROOT.
    goto fail
)
echo [Gibraltar] Engine:  %ENGINE_DIR%
if defined ENGINE_VERSION if not "%ENGINE_VERSION%"=="5.5" (
    echo [Gibraltar] WARNING: using UE !ENGINE_VERSION!; the project targets 5.5. Right-click Gibraltar.uproject ^> Switch Unreal Engine version if prompted.
)
echo [Gibraltar] Project: %UPROJECT%

rem --- 2. Pipeline output ---------------------------------------------------------
if not defined GIBRALTAR_BUILD_DIR set "GIBRALTAR_BUILD_DIR=%PROJECT_DIR%\..\..\data\build"
for %%I in ("%GIBRALTAR_BUILD_DIR%") do set "GIBRALTAR_BUILD_DIR=%%~fI"
if not exist "%GIBRALTAR_BUILD_DIR%\manifest.json" (
    echo [Gibraltar] ERROR: "!GIBRALTAR_BUILD_DIR!\manifest.json" not found.
    echo             Run the GIS pipeline first ^(it writes gibraltar\data\build^), or set GIBRALTAR_BUILD_DIR.
    goto fail
)
echo [Gibraltar] Data:    %GIBRALTAR_BUILD_DIR%

rem --- 3. Compile the editor module --------------------------------------------------
if "%DO_BUILD%"=="1" (
    echo [Gibraltar] Compiling GibraltarEditor ^(Development, Win64^) ...
    call "!BUILD_BAT!" GibraltarEditor Win64 Development -Project="!UPROJECT!" -WaitMutex
    if errorlevel 1 (
        echo [Gibraltar] ERROR: the C++ build failed. Open the project in Visual Studio to see the errors.
        goto fail
    )
)

rem --- 4. Run the import ---------------------------------------------------------------
if exist "%STATUS_FILE%" del /q "%STATUS_FILE%"

if /I "%MODE%"=="gui" (
    echo [Gibraltar] Opening the editor and running the import script ...
    "!EDITOR_GUI!" "!UPROJECT!" -ExecutePythonScript="!IMPORT_SCRIPT!"
) else (
    echo [Gibraltar] Running the import headless ^(this can take a while: Nanite and shaders^) ...
    "!EDITOR_CMD!" "!UPROJECT!" -run=pythonscript -script="!IMPORT_SCRIPT!" -unattended -nopause -nosplash -stdout -FullStdOutLogOutput
)

if /I "%MODE%"=="gui" (
    echo [Gibraltar] The editor was started; check its Output Log for the "Gibraltar import summary".
    goto done
)

if not exist "%STATUS_FILE%" (
    echo [Gibraltar] ERROR: the import did not finish ^(no status file^). See Saved\Logs\Gibraltar.log.
    echo             Try:  Scripts\BuildWorld.bat gui nobuild
    goto fail
)
set /p IMPORT_STATUS=<"%STATUS_FILE%"
if /I not "%IMPORT_STATUS%"=="OK" (
    echo [Gibraltar] ERROR: the import reported problems. See Saved\GibraltarImport\report.json.
    goto fail
)

echo.
echo [Gibraltar] Done. Open Gibraltar.uproject and press Play.
goto done

:fail
echo.
echo [Gibraltar] FAILED.
endlocal
pause
exit /b 1

:done
endlocal
exit /b 0
