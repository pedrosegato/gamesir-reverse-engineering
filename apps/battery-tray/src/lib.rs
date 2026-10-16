pub mod battery;
pub mod icon;
pub mod indicator;
pub mod protocol;

#[cfg(windows)]
pub mod app;
#[cfg(windows)]
mod autostart;
#[cfg(windows)]
mod controller;
#[cfg(windows)]
mod single_instance;
#[cfg(windows)]
mod worker;
