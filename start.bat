@echo off
cd /d "%~dp0"
echo poke-pack.rip running at http://127.0.0.1:5173
py -m http.server 5173
