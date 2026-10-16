#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
fn main() {
    cyclone2_battery::app::run();
}

#[cfg(not(windows))]
fn main() {
    eprintln!("cyclone2-battery roda só no Windows");
    std::process::exit(1);
}
