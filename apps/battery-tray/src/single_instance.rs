use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError};
use windows_sys::Win32::System::Threading::CreateMutexW;

/// O mutex nomeado vive até o processo terminar; uma segunda instância encontra ele já criado.
pub fn acquire() -> bool {
    let name: Vec<u16> = "Local\\Cyclone2Battery\0".encode_utf16().collect();
    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        !handle.is_null() && GetLastError() != ERROR_ALREADY_EXISTS
    }
}
