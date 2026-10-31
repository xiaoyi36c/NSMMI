@echo off
set RUSTUP_HOME=F:\Rust\.rustup
set CARGO_HOME=F:\Rust\.cargo
set PATH=%PATH%;F:\Rust\.cargo\bin
cd /d "%~dp0"
call npm run tauri dev
