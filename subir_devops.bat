@echo off
SET SOURCE=C:\Users\mfloresn\mi-refugio
SET DEST=C:\Users\mfloresn\mi-refugio\mi-refugio-page
SET BRANCH=devops

echo Copiando proyecto Django al repositorio...
robocopy "%SOURCE%" "%DEST%" /E /XD mi-refugio-page .venv

cd "%DEST%"

echo Configurando .gitignore para excluir .venv y .env
echo .venv>> .gitignore
echo .env>> .gitignore

echo Verificando rama %BRANCH%
git rev-parse --verify %BRANCH% >nul 2>&1
IF ERRORLEVEL 1 (
    git checkout -b %BRANCH%
) ELSE (
    git checkout %BRANCH%
)

echo Agregando cambios y haciendo commit
git add .
git commit -m "Incluyendo proyecto Django en la rama %BRANCH%"

echo Subiendo cambios a GitHub
git push origin %BRANCH%

pause