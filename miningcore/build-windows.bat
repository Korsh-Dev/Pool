@echo off
echo ===================================================
echo Building Miningcore for Windows (.NET 9)
echo ===================================================

cd src
dotnet build -c Release -o ../build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Dotnet build failed.
    exit /b %ERRORLEVEL%
)

cd ..
echo.
if not exist "build\libmultihash.dll" (
    echo [WARNING] 'libmultihash.dll' was not found in the build folder.
    echo In order to run Miningcore on Windows, you must compile 'src\Native\libmultihash'
    echo using CMake and Visual Studio C++ build tools, and copy 'libmultihash.dll' to 'build\'.
) else (
    echo [OK] Native library libmultihash.dll detected in build directory.
)
echo.
echo Build complete.
